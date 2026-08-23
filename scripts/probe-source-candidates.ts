/**
 * Discovery harness: probes candidate publishers for a collection endpoint that
 * actually exists, so `config/sources.yml` entries can be written from observed
 * responses instead of plausible-looking guesses.
 *
 * AGENTS.md #9 forbids enabling a source whose `feedUrl` has not been fetched
 * live, and `docs/adding-a-source.md` spells out the manual curl equivalent of
 * what this script automates: resolve the feeds a publisher declares, try the
 * conventional paths, fall back to the sitemaps in robots.txt, then confirm the
 * body is the document kind a `collectionMode` expects. For sitemap hits it also
 * samples real article pages through the production metadata extractor, because
 * a reachable sitemap is worthless if its pages carry no usable title/date.
 *
 * Requests go through `fetchWithPolicy`, so the User-Agent, timeout, redirect and
 * retry behaviour are byte-for-byte what the collector will send — a publisher
 * that answers 403 here will answer 403 in the workflow.
 *
 * Not part of the build or CI gating: it hits live publishers. Run manually with
 *   npx tsx scripts/probe-source-candidates.ts [--candidate-id=<id>] [--json=<path>]
 * or through the `Probe source candidates` workflow_dispatch job, whose runner has
 * the unrestricted egress a sandboxed environment usually lacks.
 */
import { writeFile, appendFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { fetchWithPolicy, HttpFetchError } from './http.ts';
import { extractArticleMetadata } from './adapters/html-metadata.ts';
import { isSafeUrl } from './normalize.ts';
import { resolveRepositoryUrl } from './repository-url.ts';

/** Publishers are probed in parallel, but each host is hit serially (see hostLimiter). */
const CANDIDATE_CONCURRENCY = 5;
/** Guessed paths are cheap individually but multiply fast; keep a per-candidate ceiling. */
const MAX_PROBES_PER_CANDIDATE = 18;
/** Sitemaps declared in robots.txt: take the first few, they are ordered by relevance. */
const MAX_ROBOTS_SITEMAPS = 4;
/** Child sitemaps followed from a <sitemapindex> before sampling article pages. */
const MAX_CHILD_SITEMAPS = 2;
/** Article pages fetched per sitemap hit to verify extractable metadata. */
const METADATA_SAMPLE_SIZE = 3;

const repositoryUrl = resolveRepositoryUrl();

interface Candidate {
  id: string;
  name: string;
  company: string;
  homepageUrl: string;
}

/**
 * The 15 firms requested for the `consulting` category. Only the homepage is
 * asserted here — every collection endpoint below is discovered or tested, never
 * assumed.
 */
const CANDIDATES: Candidate[] = [
  {
    id: 'oliver-wyman',
    name: 'Oliver Wyman Insights',
    company: 'Oliver Wyman',
    homepageUrl: 'https://www.oliverwyman.com/',
  },
  {
    id: 'kearney',
    name: 'Kearney Insights',
    company: 'Kearney',
    homepageUrl: 'https://www.kearney.com/',
  },
  {
    id: 'roland-berger',
    name: 'Roland Berger Insights',
    company: 'Roland Berger',
    homepageUrl: 'https://www.rolandberger.com/',
  },
  {
    id: 'arthur-d-little',
    name: 'Arthur D. Little Insights',
    company: 'Arthur D. Little',
    homepageUrl: 'https://www.adlittle.com/',
  },
  {
    id: 'lek-consulting',
    name: 'L.E.K. Insights',
    company: 'L.E.K. Consulting',
    homepageUrl: 'https://www.lek.com/',
  },
  {
    id: 'alvarez-marsal',
    name: 'Alvarez & Marsal Insights',
    company: 'Alvarez & Marsal',
    homepageUrl: 'https://www.alvarezandmarsal.com/',
  },
  {
    id: 'simon-kucher',
    name: 'Simon-Kucher Insights',
    company: 'Simon-Kucher',
    homepageUrl: 'https://www.simon-kucher.com/',
  },
  {
    id: 'pa-consulting',
    name: 'PA Consulting Insights',
    company: 'PA Consulting',
    homepageUrl: 'https://www.paconsulting.com/',
  },
  {
    id: 'bearingpoint',
    name: 'BearingPoint Insights',
    company: 'BearingPoint',
    homepageUrl: 'https://www.bearingpoint.com/',
  },
  {
    id: 'occ-strategy',
    name: 'OC&C Insights',
    company: 'OC&C Strategy Consultants',
    homepageUrl: 'https://www.occstrategy.com/',
  },
  {
    id: 'fti-consulting',
    name: 'FTI Consulting Insights',
    company: 'FTI Consulting',
    homepageUrl: 'https://www.fticonsulting.com/',
  },
  {
    id: 'protiviti',
    name: 'Protiviti Insights',
    company: 'Protiviti',
    homepageUrl: 'https://www.protiviti.com/',
  },
  {
    id: 'mercer',
    name: 'Mercer Insights',
    company: 'Mercer',
    homepageUrl: 'https://www.mercer.com/',
  },
  {
    id: 'korn-ferry',
    name: 'Korn Ferry Insights',
    company: 'Korn Ferry',
    homepageUrl: 'https://www.kornferry.com/',
  },
  {
    id: 'gartner',
    name: 'Gartner Newsroom',
    company: 'Gartner',
    homepageUrl: 'https://www.gartner.com/',
  },
];

/** Conventional endpoints, tried against the origin when discovery finds nothing better. */
const COMMON_PATHS = [
  '/feed',
  '/feed/',
  '/rss',
  '/rss.xml',
  '/index.xml',
  '/atom.xml',
  '/en/feed',
  '/en/rss.xml',
  '/blog/feed/',
  '/insights/feed/',
  '/sitemap.xml',
  '/sitemap_index.xml',
];

type EndpointKind = 'rss' | 'atom' | 'sitemap' | 'sitemap-index' | 'html' | 'other';

/** Collection modes ranked by how reliable the corresponding adapter is. */
const KIND_RANK: Record<EndpointKind, number> = {
  rss: 5,
  atom: 4,
  'sitemap-index': 3,
  sitemap: 3,
  html: 1,
  other: 0,
};

interface ProbeResult {
  url: string;
  ok: boolean;
  status?: number;
  kind?: EndpointKind;
  /** Feed items, or sitemap <loc> entries. */
  entryCount?: number;
  newestLastmod?: string;
  error?: string;
}

interface CandidateReport {
  id: string;
  name: string;
  company: string;
  homepageUrl: string;
  probes: ProbeResult[];
  best?: ProbeResult;
  suggestedCollectionMode?: 'rss' | 'atom' | 'sitemap';
  metadataSample?: { probed: number; extracted: number; examples: string[] };
  verdict: 'feed' | 'sitemap' | 'blocked' | 'none';
}

function sniff(body: string): EndpointKind {
  const head = body.slice(0, 4000).toLowerCase();
  if (head.includes('<sitemapindex')) return 'sitemap-index';
  if (head.includes('<urlset')) return 'sitemap';
  if (head.includes('<rss') || head.includes('<rdf:rdf')) return 'rss';
  if (head.includes('<feed')) return 'atom';
  if (head.includes('<!doctype html') || head.includes('<html')) return 'html';
  return 'other';
}

function countMatches(body: string, pattern: RegExp): number {
  return body.match(pattern)?.length ?? 0;
}

function countEntries(body: string, kind: EndpointKind): number {
  if (kind === 'rss') return countMatches(body, /<item[\s>]/gi);
  if (kind === 'atom') return countMatches(body, /<entry[\s>]/gi);
  if (kind === 'sitemap' || kind === 'sitemap-index') return countMatches(body, /<loc>/gi);
  return 0;
}

function extractLocs(body: string): string[] {
  return [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).filter(isSafeUrl);
}

function newestLastmod(body: string): string | undefined {
  const values = [...body.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)].map((m) => m[1]);
  return values.sort().at(-1);
}

async function probe(url: string): Promise<{ result: ProbeResult; body?: string }> {
  try {
    const response = await fetchWithPolicy(url, undefined, repositoryUrl);
    const kind = sniff(response.body);
    return {
      body: response.body,
      result: {
        url,
        ok: true,
        status: response.status,
        kind,
        entryCount: countEntries(response.body, kind),
        newestLastmod: newestLastmod(response.body),
      },
    };
  } catch (error) {
    const status = error instanceof HttpFetchError ? error.status : undefined;
    return {
      result: {
        url,
        ok: false,
        status,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/** Feeds the publisher itself declares in <head>, which beat any guessed path. */
function declaredFeeds(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $('link[rel="alternate"]').each((_, element) => {
    const type = ($(element).attr('type') ?? '').toLowerCase();
    const href = $(element).attr('href');
    if (!href) return;
    if (!type.includes('rss') && !type.includes('atom')) return;
    try {
      const absolute = new URL(href, baseUrl).toString();
      if (isSafeUrl(absolute)) urls.push(absolute);
    } catch {
      /* a malformed href is simply not a candidate */
    }
  });
  return urls;
}

function robotsSitemaps(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith('sitemap:'))
    .map((line) => line.slice('sitemap:'.length).trim())
    .filter(isSafeUrl)
    .slice(0, MAX_ROBOTS_SITEMAPS);
}

/**
 * Runs sampled article pages through the production extractor. A sitemap whose
 * pages yield no title/date is a source that would collect zero articles while
 * reporting itself healthy — exactly the failure `audit-sources.ts` exists to catch.
 */
async function sampleMetadata(
  body: string,
  kind: EndpointKind,
): Promise<CandidateReport['metadataSample']> {
  let locs = extractLocs(body);

  if (kind === 'sitemap-index') {
    const children = locs.slice(0, MAX_CHILD_SITEMAPS);
    locs = [];
    for (const child of children) {
      const { result, body: childBody } = await probe(child);
      if (result.ok && childBody) locs.push(...extractLocs(childBody));
    }
  }

  // Sitemaps are usually oldest-first, so the tail is the freshest content.
  const sample = locs.slice(-METADATA_SAMPLE_SIZE);
  const examples: string[] = [];
  let extracted = 0;

  for (const pageUrl of sample) {
    const { result, body: pageBody } = await probe(pageUrl);
    if (!result.ok || !pageBody) {
      examples.push(`${pageUrl} → ${result.status ?? 'error'}`);
      continue;
    }
    const metadata = extractArticleMetadata(pageBody, pageUrl);
    if (metadata) {
      extracted += 1;
      examples.push(`${pageUrl} → "${metadata.title.slice(0, 60)}" (${metadata.publishedAt})`);
    } else {
      examples.push(`${pageUrl} → no extractable title/date`);
    }
  }

  return { probed: sample.length, extracted, examples };
}

async function probeCandidate(candidate: Candidate): Promise<CandidateReport> {
  const origin = new URL(candidate.homepageUrl).origin;
  const probes: ProbeResult[] = [];
  const bodies = new Map<string, string>();
  const seen = new Set<string>();

  async function run(url: string): Promise<void> {
    if (seen.has(url) || probes.length >= MAX_PROBES_PER_CANDIDATE) return;
    seen.add(url);
    const { result, body } = await probe(url);
    probes.push(result);
    if (body) bodies.set(url, body);
  }

  // 1. What the publisher declares about itself.
  const robots = await probe(`${origin}/robots.txt`);
  const homepage = await probe(candidate.homepageUrl);
  seen.add(`${origin}/robots.txt`);
  seen.add(candidate.homepageUrl);

  for (const url of homepage.body ? declaredFeeds(homepage.body, candidate.homepageUrl) : []) {
    await run(url);
  }
  // 2. Conventional paths.
  for (const path of COMMON_PATHS) await run(`${origin}${path}`);
  // 3. Sitemaps robots.txt points at, last because they are the coarsest option.
  for (const url of robots.body ? robotsSitemaps(robots.body) : []) await run(url);

  const usable = probes.filter(
    (p) => p.ok && p.kind && p.kind !== 'html' && p.kind !== 'other' && (p.entryCount ?? 0) > 0,
  );
  const best = usable.sort(
    (a, b) => KIND_RANK[b.kind!] - KIND_RANK[a.kind!] || (b.entryCount ?? 0) - (a.entryCount ?? 0),
  )[0];

  let metadataSample: CandidateReport['metadataSample'];
  let verdict: CandidateReport['verdict'] = 'none';
  let suggestedCollectionMode: CandidateReport['suggestedCollectionMode'];

  if (best?.kind === 'rss' || best?.kind === 'atom') {
    verdict = 'feed';
    suggestedCollectionMode = best.kind;
  } else if (best?.kind === 'sitemap' || best?.kind === 'sitemap-index') {
    verdict = 'sitemap';
    suggestedCollectionMode = 'sitemap';
    metadataSample = await sampleMetadata(bodies.get(best.url) ?? '', best.kind);
  } else if (probes.some((p) => p.status === 403 || p.status === 429) || !homepage.result.ok) {
    verdict = 'blocked';
  }

  return {
    id: candidate.id,
    name: candidate.name,
    company: candidate.company,
    homepageUrl: candidate.homepageUrl,
    probes: [robots.result, homepage.result, ...probes],
    best,
    suggestedCollectionMode,
    metadataSample,
    verdict,
  };
}

function renderReport(reports: CandidateReport[]): string {
  const icon = { feed: '✅', sitemap: '🟡', blocked: '⛔', none: '❌' } as const;
  const lines: string[] = [
    '## Source candidate probe',
    '',
    `User-Agent: \`TrendSignalBot/1.0 (+${repositoryUrl ?? 'no contact URL'})\``,
    '',
  ];

  lines.push(
    '| Candidate | Verdict | Mode | Endpoint | Entries | Metadata |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const report of reports) {
    const sample = report.metadataSample;
    lines.push(
      `| ${report.company} | ${icon[report.verdict]} ${report.verdict} | ${report.suggestedCollectionMode ?? '—'} | ${report.best?.url ?? '—'} | ${report.best?.entryCount ?? '—'} | ${sample ? `${sample.extracted}/${sample.probed}` : '—'} |`,
    );
  }

  lines.push('', '### Per-candidate detail', '');
  for (const report of reports) {
    lines.push(`#### ${report.company} (\`${report.id}\`)`, '');
    for (const p of report.probes) {
      const outcome = p.ok
        ? `${p.status} ${p.kind} (${p.entryCount} entries)`
        : `${p.status ?? 'ERR'} ${p.error ?? ''}`;
      lines.push(`- \`${p.url}\` → ${outcome}`);
    }
    if (report.metadataSample) {
      lines.push(
        '',
        `Sampled article pages (${report.metadataSample.extracted}/${report.metadataSample.probed} extractable):`,
      );
      for (const example of report.metadataSample.examples) lines.push(`  - ${example}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const candidateId = args.find((a) => a.startsWith('--candidate-id='))?.split('=')[1];
  const jsonPath = args.find((a) => a.startsWith('--json='))?.split('=')[1];
  // Ad-hoc probing of a publisher that is not (yet) in CANDIDATES.
  const homepage = args.find((a) => a.startsWith('--homepage='))?.split('=')[1];

  let targets: Candidate[];
  if (homepage) {
    const hostname = new URL(homepage).hostname;
    targets = [{ id: hostname, name: hostname, company: hostname, homepageUrl: homepage }];
  } else {
    targets = candidateId ? CANDIDATES.filter((c) => c.id === candidateId) : CANDIDATES;
    if (targets.length === 0) throw new Error(`Unknown candidate id: ${candidateId}`);
  }

  const hostLimiters = new Map<string, ReturnType<typeof pLimit>>();
  function hostLimiter(hostname: string) {
    let limiter = hostLimiters.get(hostname);
    if (!limiter) {
      limiter = pLimit(1);
      hostLimiters.set(hostname, limiter);
    }
    return limiter;
  }
  const globalLimit = pLimit(CANDIDATE_CONCURRENCY);

  const reports = await Promise.all(
    targets.map((candidate) =>
      globalLimit(() =>
        hostLimiter(new URL(candidate.homepageUrl).hostname)(() => probeCandidate(candidate)),
      ),
    ),
  );

  const markdown = renderReport(reports);
  console.log(markdown);

  if (jsonPath) await writeFile(jsonPath, JSON.stringify(reports, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
