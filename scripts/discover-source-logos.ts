/**
 * Discovery harness: finds and validates a publisher logo for each configured source,
 * so an article with no image of its own can fall back to its publisher's mark instead
 * of the generic placeholder.
 *
 * Nearly half the articles in a published run carry no `imageUrl` — some feeds simply
 * never include one — which leaves the dashboard grid showing the same grey placeholder
 * over and over. A publisher logo is the one image that is always editorially correct
 * for an article, and unlike the article image it can be resolved once per source
 * rather than per item.
 *
 * Candidates are tried in descending order of how well they render at card size:
 * JSON-LD `Organization.logo` (an explicit brand asset), `apple-touch-icon` (usually
 * 180px), the homepage's `og:image`, a sized `<link rel="icon">`, then `/favicon.ico`
 * as a last resort. Each candidate is fetched and kept only if it really answers with
 * an image — AGENTS.md #9 forbids writing a URL into config that was never confirmed.
 *
 * Read-only and not part of CI: it hits live publishers. Run manually with
 *   npx tsx scripts/discover-source-logos.ts [--source-id=<id>] [--json=<path>]
 * or through the `Discover source logos` workflow_dispatch job. Paste the emitted
 * `logoUrl:` lines into config/sources.yml; nothing is written automatically.
 */
import { writeFile, appendFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { USER_AGENT_BASE, REQUEST_TIMEOUT_MS, fetchWithPolicy } from './http.ts';
import { loadSourcesConfig } from './config-loader.ts';
import { isSafeUrl } from './normalize.ts';
import { resolveRepositoryUrl } from './repository-url.ts';
import type { SourceConfig } from './schemas.ts';

const SOURCE_CONCURRENCY = 5;
/** A logo below this is a favicon fragment, too small to fill a card slot. */
const MIN_LOGO_BYTES = 400;
/** Guards against a publisher serving a huge hero image where a logo was expected. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const repositoryUrl = resolveRepositoryUrl();
const userAgent = repositoryUrl ? `${USER_AGENT_BASE} (+${repositoryUrl})` : USER_AGENT_BASE;

type LogoChannel =
  'jsonld:organization' | 'link:apple-touch-icon' | 'meta:og:image' | 'link:icon' | 'favicon.ico';

interface Candidate {
  url: string;
  channel: LogoChannel;
}

interface SourceLogoReport {
  sourceId: string;
  company: string;
  homepageUrl: string;
  candidates: number;
  logoUrl?: string;
  channel?: LogoChannel;
  contentType?: string;
  bytes?: number;
  error?: string;
}

interface JsonLdNode {
  '@type'?: string | string[];
  '@graph'?: JsonLdNode[];
  logo?: string | { url?: string };
  publisher?: JsonLdNode;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function flatten(nodes: unknown): JsonLdNode[] {
  const flat: JsonLdNode[] = [];
  for (const node of toArray(nodes as JsonLdNode | JsonLdNode[])) {
    if (!node || typeof node !== 'object') continue;
    flat.push(node);
    if (node['@graph']) flat.push(...flatten(node['@graph']));
    if (node.publisher) flat.push(...flatten(node.publisher));
  }
  return flat;
}

function readLogoValue(logo: JsonLdNode['logo']): string | undefined {
  if (typeof logo === 'string') return logo;
  return logo?.url;
}

/** `sizes="180x180"` → 180; an unparseable or absent value sorts last. */
function parseSize(sizes: string | undefined): number {
  const match = /(\d+)\s*x\s*(\d+)/i.exec(sizes ?? '');
  return match ? Number(match[1]) : 0;
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href?.trim()) return undefined;
  try {
    const url = new URL(href.trim(), base).toString();
    return isSafeUrl(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

function collectCandidates($: cheerio.CheerioAPI, baseUrl: string): Candidate[] {
  const candidates: Candidate[] = [];
  const push = (url: string | undefined, channel: LogoChannel) => {
    if (url && !candidates.some((c) => c.url === url)) candidates.push({ url, channel });
  };

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    try {
      for (const node of flatten(JSON.parse(raw))) {
        push(absolute(readLogoValue(node.logo), baseUrl), 'jsonld:organization');
      }
    } catch {
      // Malformed JSON-LD is common and not this harness's problem.
    }
  });

  const bySize = (selector: string): (string | undefined)[] =>
    $(selector)
      .toArray()
      .map((el) => ({ href: $(el).attr('href'), size: parseSize($(el).attr('sizes')) }))
      .sort((a, b) => b.size - a.size)
      .map((entry) => entry.href);

  for (const href of bySize('link[rel~="apple-touch-icon"]')) {
    push(absolute(href, baseUrl), 'link:apple-touch-icon');
  }
  push(absolute($('meta[property="og:image"]').attr('content'), baseUrl), 'meta:og:image');
  for (const href of bySize('link[rel~="icon"]')) {
    push(absolute(href, baseUrl), 'link:icon');
  }
  push(absolute('/favicon.ico', baseUrl), 'favicon.ico');

  return candidates;
}

/**
 * A candidate counts only when the response is genuinely an image of usable size.
 * Publishers routinely answer 200 with an HTML error page for a missing icon, which a
 * status check alone would happily accept.
 */
async function validateImage(
  url: string,
): Promise<{ ok: boolean; contentType?: string; bytes?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false };

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) return { ok: false, contentType };

    const bytes = (await response.arrayBuffer()).byteLength;
    return { ok: bytes >= MIN_LOGO_BYTES && bytes <= MAX_LOGO_BYTES, contentType, bytes };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverForSource(source: SourceConfig): Promise<SourceLogoReport> {
  const base: SourceLogoReport = {
    sourceId: source.id,
    company: source.company,
    homepageUrl: source.homepageUrl,
    candidates: 0,
  };

  let candidates: Candidate[];
  try {
    const page = await fetchWithPolicy(source.homepageUrl, undefined, repositoryUrl);
    candidates = collectCandidates(cheerio.load(page.body), source.homepageUrl);
  } catch (error) {
    // The homepage may be unreachable even when the feed is fine; /favicon.ico is still
    // worth a try since it needs no markup to discover.
    const fallback = absolute('/favicon.ico', source.homepageUrl);
    candidates = fallback ? [{ url: fallback, channel: 'favicon.ico' }] : [];
    base.error = error instanceof Error ? error.message : String(error);
  }

  base.candidates = candidates.length;

  for (const candidate of candidates) {
    const result = await validateImage(candidate.url);
    if (!result.ok) continue;
    return {
      ...base,
      logoUrl: candidate.url,
      channel: candidate.channel,
      contentType: result.contentType,
      bytes: result.bytes,
    };
  }
  return base;
}

function renderReport(reports: SourceLogoReport[]): string {
  const found = reports.filter((r) => r.logoUrl);
  const lines: string[] = [
    '## Source logo discovery',
    '',
    `**${found.length}/${reports.length} sources have a validated logo.**`,
    '',
    '| Source | Channel | Type | KB | Logo |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const r of reports) {
    lines.push(
      `| ${r.company} | ${r.channel ?? '—'} | ${r.contentType ?? '—'} | ${
        r.bytes ? Math.round(r.bytes / 102.4) / 10 : '—'
      } | ${r.logoUrl ?? `none (${r.candidates} candidates${r.error ? `, ${r.error}` : ''})`} |`,
    );
  }

  lines.push('', '### Paste into config/sources.yml', '', '```yaml');
  for (const r of found) {
    lines.push(`# ${r.sourceId}`);
    lines.push(`logoUrl: ${r.logoUrl}`);
  }
  lines.push('```');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceId = args.find((a) => a.startsWith('--source-id='))?.split('=')[1];
  const jsonPath = args.find((a) => a.startsWith('--json='))?.split('=')[1];

  const sources = loadSourcesConfig().filter((s) => s.enabled && (!sourceId || s.id === sourceId));
  if (sources.length === 0) throw new Error(`No enabled source matches ${sourceId ?? '(all)'}`);

  const limit = pLimit(SOURCE_CONCURRENCY);
  const reports = await Promise.all(sources.map((s) => limit(() => discoverForSource(s))));
  reports.sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  const markdown = renderReport(reports);
  console.log(markdown);

  if (jsonPath) await writeFile(jsonPath, JSON.stringify(reports, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
