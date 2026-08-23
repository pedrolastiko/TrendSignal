/**
 * Diagnostic harness: runs the real adapters against every enabled source in
 * config/sources.yml and reports what each one actually yields — items fetched,
 * how many survived metadata extraction, their publication-date spread, and how
 * many matched an enabled keyword.
 *
 * This exists to catch sources that "succeed" (healthy, no error) while silently
 * contributing nothing usable, which per-source health alone cannot distinguish.
 *
 * Not part of the build or CI: it hits live publishers. Run manually with
 *   npx tsx scripts/audit-sources.ts [--source-id=<id>]
 */
import pLimit from 'p-limit';
import { loadKeywordsConfig, loadSourcesConfig } from './config-loader.ts';
import { collectFromRss } from './adapters/rss.ts';
import { collectFromSitemap } from './adapters/sitemap.ts';
import { collectFromGenericHtml } from './adapters/generic-html.ts';
import { matchKeywords } from './keyword-match.ts';
import { truncateSummary } from './normalize.ts';
import { resolveRepositoryUrl } from './repository-url.ts';
import type { SourceConfig } from './schemas.ts';
import type { RawArticleCandidate } from './adapters/types.ts';

const AUDIT_CONCURRENCY = 4;

// Resolved exactly as collect.ts does, so the audit sends the same User-Agent the
// workflow sends — publishers do reject a contact-less bot UA.
const repositoryUrl = resolveRepositoryUrl();

function collectFor(source: SourceConfig) {
  switch (source.collectionMode) {
    case 'rss':
    case 'atom':
      return collectFromRss(source, undefined, repositoryUrl);
    case 'sitemap':
      return collectFromSitemap(source, undefined, repositoryUrl);
    case 'html':
      return collectFromGenericHtml(source, undefined, repositoryUrl);
  }
}

function daysAgo(iso: string, now: number): number {
  return Math.round((now - new Date(iso).getTime()) / 86_400_000);
}

interface Row {
  id: string;
  mode: string;
  status: string;
  fetched: number;
  matched: number;
  newestDays: number | null;
  within30d: number;
  note: string;
}

async function run(): Promise<void> {
  const onlyId = process.argv
    .slice(2)
    .find((a) => a.startsWith('--source-id='))
    ?.split('=')[1];
  const keywords = loadKeywordsConfig();
  const sources = loadSourcesConfig().filter((s) => s.enabled && (!onlyId || s.id === onlyId));
  const now = Date.now();
  const limit = pLimit(AUDIT_CONCURRENCY);

  const rows: Row[] = await Promise.all(
    sources.map((source) =>
      limit(async (): Promise<Row> => {
        try {
          const result = await collectFor(source);
          const candidates: RawArticleCandidate[] = result.candidates;
          const matched = candidates.filter(
            (c) =>
              matchKeywords({ title: c.title, summary: truncateSummary(c.summary) }, keywords)
                .matchedKeywordIds.length > 0,
          );
          const ages = candidates
            .map((c) => daysAgo(c.publishedAt, now))
            .filter((d) => Number.isFinite(d))
            .sort((a, b) => a - b);
          return {
            id: source.id,
            mode: source.collectionMode,
            status: candidates.length === 0 ? 'EMPTY' : matched.length === 0 ? 'NO-MATCH' : 'ok',
            fetched: candidates.length,
            matched: matched.length,
            newestDays: ages[0] ?? null,
            within30d: ages.filter((d) => d <= 30).length,
            note: '',
          };
        } catch (error) {
          return {
            id: source.id,
            mode: source.collectionMode,
            status: 'FAILED',
            fetched: 0,
            matched: 0,
            newestDays: null,
            within30d: 0,
            note: error instanceof Error ? error.message.slice(0, 60) : String(error).slice(0, 60),
          };
        }
      }),
    ),
  );

  rows.sort((a, b) => a.matched - b.matched || a.id.localeCompare(b.id));

  console.log(
    `\n${'source'.padEnd(26)} ${'mode'.padEnd(8)} ${'state'.padEnd(9)} ${'got'.padStart(5)} ${'match'.padStart(6)} ${'newest'.padStart(7)} ${'<=30d'.padStart(6)}  note`,
  );
  console.log('-'.repeat(100));
  for (const r of rows) {
    const newest = r.newestDays === null ? '-' : `${r.newestDays}d`;
    console.log(
      `${r.id.padEnd(26)} ${r.mode.padEnd(8)} ${r.status.padEnd(9)} ${String(r.fetched).padStart(5)} ${String(r.matched).padStart(6)} ${newest.padStart(7)} ${String(r.within30d).padStart(6)}  ${r.note}`,
    );
  }

  const problems = rows.filter((r) => r.status !== 'ok');
  console.log(
    `\n${rows.length} enabled sources | ${rows.length - problems.length} contributing | ${problems.length} contributing nothing`,
  );
  if (problems.length > 0) {
    console.log(`problem sources: ${problems.map((p) => `${p.id}(${p.status})`).join(', ')}`);
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
