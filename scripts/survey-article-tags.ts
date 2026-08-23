/**
 * Diagnostic harness: measures how much tag metadata the configured sources actually
 * expose, and collects the real vocabulary they use.
 *
 * The keyword taxonomy in `config/keywords.yml` is entirely hand-written, so it can only
 * ever find topics someone already thought of. Publishers, meanwhile, tag their own
 * articles — RSS `<category>`, JSON-LD `keywords`/`about`/`articleSection`,
 * `article:tag`, `news_keywords`. This reports, per source, how many items carry tags
 * and through which channel, then aggregates the tag values themselves into a frequency
 * table. That table is the input for deciding which tags deserve to become keywords and
 * how they group into themes.
 *
 * Read-only and not part of CI: it hits live publishers. Run manually with
 *   npx tsx scripts/survey-article-tags.ts [--source-id=<id>] [--json=<path>] [--top=<n>]
 * or through the `Survey article tags` workflow_dispatch job.
 */
import { writeFile, appendFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import pLimit from 'p-limit';
import { fetchWithPolicy } from './http.ts';
import { collectFromSitemap } from './adapters/sitemap.ts';
import { loadSourcesConfig } from './config-loader.ts';
import { resolveRepositoryUrl } from './repository-url.ts';
import type { SourceConfig } from './schemas.ts';

const SOURCE_CONCURRENCY = 5;
const PAGE_FETCH_CONCURRENCY = 3;
/** Article pages fetched per sitemap source — each one is a full HTML download. */
const SAMPLE_PAGES_PER_SITEMAP_SOURCE = 8;
/** Tag values longer than this are prose, not a tag (some publishers put a sentence in `keywords`). */
const MAX_TAG_LENGTH = 60;
const DEFAULT_TOP_TAGS = 80;

const repositoryUrl = resolveRepositoryUrl();

/** `categories` is built into rss-parser; dc:subject is the Dublin Core equivalent some feeds use. */
const parser = new Parser({
  customFields: { item: [['dc:subject', 'dcSubject', { keepArray: true }]] },
});

type TagChannel =
  | 'rss:category'
  | 'dc:subject'
  | 'jsonld:keywords'
  | 'jsonld:about'
  | 'jsonld:articleSection'
  | 'meta:article:tag'
  | 'meta:news_keywords'
  | 'meta:keywords';

interface ItemTags {
  /** Tag values by the channel they came from; a value can legitimately appear in several. */
  byChannel: Partial<Record<TagChannel, string[]>>;
}

interface SourceReport {
  sourceId: string;
  company: string;
  mode: SourceConfig['collectionMode'];
  itemsSampled: number;
  itemsWithTags: number;
  totalTags: number;
  channelCounts: Partial<Record<TagChannel, number>>;
  sampleTags: string[];
  error?: string;
}

/**
 * Tag values arrive with wildly inconsistent shape — leading hashes, wrapping quotes,
 * comma-joined strings, sentence case. Normalizing here keeps the frequency table from
 * splitting the same concept across several near-identical rows.
 */
function cleanTagValue(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((part) =>
      part
        .replace(/^#/, '')
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((part) => part.length > 1 && part.length <= MAX_TAG_LENGTH);
}

function addTags(tags: ItemTags, channel: TagChannel, values: (string | undefined)[]): void {
  const cleaned = values.filter((v): v is string => Boolean(v)).flatMap(cleanTagValue);
  if (cleaned.length === 0) return;
  tags.byChannel[channel] = [...(tags.byChannel[channel] ?? []), ...cleaned];
}

interface JsonLdNode {
  '@type'?: string | string[];
  keywords?: string | string[];
  articleSection?: string | string[];
  about?: unknown;
  '@graph'?: JsonLdNode[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** `about` is the loosest of the three — it can be a string, a Thing, or a list of either. */
function readAboutNames(about: unknown): string[] {
  return toArray(about as unknown[]).flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry === 'object' && 'name' in entry) {
      const name = (entry as { name?: unknown }).name;
      return typeof name === 'string' ? [name] : [];
    }
    return [];
  });
}

function extractHtmlTags($: cheerio.CheerioAPI): ItemTags {
  const tags: ItemTags = { byChannel: {} };

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // A publisher shipping invalid JSON-LD is not this survey's problem.
    }
    const nodes: JsonLdNode[] = [];
    const queue = toArray(parsed as JsonLdNode | JsonLdNode[]);
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      nodes.push(node);
      queue.push(...toArray(node['@graph']));
    }
    for (const node of nodes) {
      addTags(tags, 'jsonld:keywords', toArray(node.keywords));
      addTags(tags, 'jsonld:articleSection', toArray(node.articleSection));
      addTags(tags, 'jsonld:about', readAboutNames(node.about));
    }
  });

  addTags(
    tags,
    'meta:article:tag',
    $('meta[property="article:tag"]')
      .map((_, el) => $(el).attr('content'))
      .get(),
  );
  addTags(tags, 'meta:news_keywords', [$('meta[name="news_keywords"]').attr('content')]);
  addTags(tags, 'meta:keywords', [$('meta[name="keywords"]').attr('content')]);

  return tags;
}

async function surveyRssSource(source: SourceConfig): Promise<ItemTags[]> {
  const response = await fetchWithPolicy(source.feedUrl, undefined, repositoryUrl);
  const feed = await parser.parseString(response.body);
  type FeedItem = (typeof feed.items)[number] & { dcSubject?: string[] };

  return (feed.items as FeedItem[]).slice(0, source.maxItemsPerRun).map((item) => {
    const tags: ItemTags = { byChannel: {} };
    addTags(tags, 'rss:category', item.categories ?? []);
    addTags(tags, 'dc:subject', item.dcSubject ?? []);
    return tags;
  });
}

/**
 * Sitemap sources have no feed-level tags, so the only place a tag can live is the
 * article page — the same pages the sitemap adapter already selects.
 */
async function surveySitemapSource(source: SourceConfig): Promise<ItemTags[]> {
  const result = await collectFromSitemap(source, undefined, repositoryUrl);
  const urls = result.candidates.slice(0, SAMPLE_PAGES_PER_SITEMAP_SOURCE).map((c) => c.url);
  const limit = pLimit(PAGE_FETCH_CONCURRENCY);

  const pages = await Promise.all(
    urls.map((url) =>
      limit(async (): Promise<ItemTags | null> => {
        try {
          const page = await fetchWithPolicy(url, undefined, repositoryUrl);
          return extractHtmlTags(cheerio.load(page.body));
        } catch {
          return null;
        }
      }),
    ),
  );
  return pages.filter((p): p is ItemTags => p !== null);
}

function summarize(source: SourceConfig, items: ItemTags[]): SourceReport {
  const channelCounts: Partial<Record<TagChannel, number>> = {};
  const sampleTags = new Set<string>();
  let itemsWithTags = 0;
  let totalTags = 0;

  for (const item of items) {
    const channels = Object.entries(item.byChannel) as [TagChannel, string[]][];
    if (channels.length > 0) itemsWithTags += 1;
    for (const [channel, values] of channels) {
      channelCounts[channel] = (channelCounts[channel] ?? 0) + values.length;
      totalTags += values.length;
      for (const value of values) if (sampleTags.size < 8) sampleTags.add(value);
    }
  }

  return {
    sourceId: source.id,
    company: source.company,
    mode: source.collectionMode,
    itemsSampled: items.length,
    itemsWithTags,
    totalTags,
    channelCounts,
    sampleTags: [...sampleTags],
  };
}

function renderReport(
  reports: SourceReport[],
  vocabulary: [string, { count: number; sources: Set<string> }][],
  topN: number,
): string {
  const withTags = reports.filter((r) => r.itemsWithTags > 0);
  const sampled = reports.reduce((sum, r) => sum + r.itemsSampled, 0);
  const tagged = reports.reduce((sum, r) => sum + r.itemsWithTags, 0);

  const lines: string[] = [
    '## Article tag survey',
    '',
    `**${withTags.length}/${reports.length} sources expose tags.** ` +
      `${tagged}/${sampled} sampled items carry at least one (${Math.round((tagged / Math.max(1, sampled)) * 100)}%).`,
    '',
    '| Source | Mode | Items | Tagged | Tags | Channels | Examples |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const r of [...reports].sort((a, b) => b.itemsWithTags - a.itemsWithTags)) {
    const channels =
      Object.entries(r.channelCounts)
        .map(([c, n]) => `${c}(${n})`)
        .join(' ') || '—';
    lines.push(
      `| ${r.company} | ${r.mode} | ${r.itemsSampled} | ${r.itemsWithTags} | ${r.totalTags} | ${channels} | ${r.sampleTags.slice(0, 3).join(', ') || (r.error ?? '—')} |`,
    );
  }

  lines.push('', `### Tag vocabulary (top ${topN} by article count)`, '');
  lines.push('| Tag | Articles | Sources |', '| --- | --- | --- |');
  for (const [tag, stat] of vocabulary.slice(0, topN)) {
    lines.push(`| ${tag} | ${stat.count} | ${stat.sources.size} |`);
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceId = args.find((a) => a.startsWith('--source-id='))?.split('=')[1];
  const jsonPath = args.find((a) => a.startsWith('--json='))?.split('=')[1];
  const topN = Number(args.find((a) => a.startsWith('--top='))?.split('=')[1] ?? DEFAULT_TOP_TAGS);

  const sources = loadSourcesConfig().filter((s) => s.enabled && (!sourceId || s.id === sourceId));
  if (sources.length === 0) throw new Error(`No enabled source matches ${sourceId ?? '(all)'}`);

  const limit = pLimit(SOURCE_CONCURRENCY);
  const vocabulary = new Map<string, { count: number; sources: Set<string> }>();

  const reports = await Promise.all(
    sources.map((source) =>
      limit(async (): Promise<SourceReport> => {
        try {
          const items =
            source.collectionMode === 'sitemap' || source.collectionMode === 'html'
              ? await surveySitemapSource(source)
              : await surveyRssSource(source);

          for (const item of items) {
            // Count a tag once per article even when several channels repeat it.
            const distinct = new Set(Object.values(item.byChannel).flat());
            for (const tag of distinct) {
              const key = tag.toLocaleLowerCase();
              const stat = vocabulary.get(key) ?? { count: 0, sources: new Set<string>() };
              stat.count += 1;
              stat.sources.add(source.id);
              vocabulary.set(key, stat);
            }
          }
          return summarize(source, items);
        } catch (error) {
          return {
            sourceId: source.id,
            company: source.company,
            mode: source.collectionMode,
            itemsSampled: 0,
            itemsWithTags: 0,
            totalTags: 0,
            channelCounts: {},
            sampleTags: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    ),
  );

  const ranked = [...vocabulary.entries()].sort(
    (a, b) => b[1].count - a[1].count || b[1].sources.size - a[1].sources.size,
  );

  const markdown = renderReport(reports, ranked, topN);
  console.log(markdown);

  if (jsonPath) {
    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          reports,
          vocabulary: ranked.map(([tag, s]) => ({
            tag,
            articles: s.count,
            sources: [...s.sources],
          })),
        },
        null,
        2,
      ),
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
