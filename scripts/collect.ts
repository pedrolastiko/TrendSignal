import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pLimit from 'p-limit';
import { loadKeywordsConfig, loadSourcesConfig } from './config-loader.ts';
import {
  readJsonFile,
  writeJsonFile,
  loadArticleArchive,
  saveArticleArchive,
} from './data-store.ts';
import { deduplicateArticles } from './deduplicate.ts';
import { computeStatistics } from './compute-statistics.ts';
import { computeTrends } from './compute-trends.ts';
import {
  normalizeUrl,
  deterministicArticleId,
  truncateSummary,
  guessLanguage,
} from './normalize.ts';
import { scoreArticleRelevance } from './scoring.ts';
import { updateSourceHealth, disabledSourceHealth } from './source-health.ts';
import { collectFromRss } from './adapters/rss.ts';
import { collectFromSitemap } from './adapters/sitemap.ts';
import { collectFromGenericHtml } from './adapters/generic-html.ts';
import { buildFixtureSources } from './fixture-sources.ts';
import { startFixtureServer } from './fixture-server.ts';
import { resolveRepositoryUrl } from './repository-url.ts';
import {
  articlesFileSchema,
  dataManifestSchema,
  httpCacheFileSchema,
  keywordsFileSchema,
  runHistoryFileSchema,
  sourceHealthFileSchema,
  sourceStateFileSchema,
  sourcesPublicFileSchema,
  statisticsSchema,
  trendsFileSchema,
  type Article,
  type DataManifest,
  type HttpCacheEntry,
  type KeywordConfig,
  type KeywordPublic,
  type PublicSource,
  type RunHistoryEntry,
  type SourceConfig,
  type SourceHealth,
  type SourceStateEntry,
} from './schemas.ts';
import type { RawArticleCandidate } from './adapters/types.ts';

const ARTICLES_LATEST_LIMIT = 500;
const RUN_HISTORY_LIMIT = 200;
const GLOBAL_CONCURRENCY = 6;
const PER_DOMAIN_CONCURRENCY = 2;
const FAILURE_RATIO_THRESHOLD = 0.6;
const SCHEMA_VERSION = '1';

export interface CollectOptions {
  fixtures: boolean;
  dataDir: string;
  sourceId?: string;
  dryRun: boolean;
  /** Ignores HTTP conditional-request caching (ETag/Last-Modified) and re-fetches every enabled source in full. */
  fullRefresh?: boolean;
  /** Overrides the reference clock (used by generate-demo-data.ts to keep fixture-based demo data looking fresh). */
  now?: Date;
}

function parseArgs(argv: string[]): CollectOptions {
  const options: CollectOptions = { fixtures: false, dataDir: 'data', dryRun: false };
  for (const arg of argv) {
    if (arg === '--fixtures') options.fixtures = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--full-refresh') options.fullRefresh = true;
    else if (arg.startsWith('--data-dir=')) options.dataDir = arg.slice('--data-dir='.length);
    else if (arg.startsWith('--source-id=')) options.sourceId = arg.slice('--source-id='.length);
  }
  return options;
}

function buildArticleFromCandidate(
  candidate: RawArticleCandidate,
  source: SourceConfig,
  keywords: KeywordConfig[],
  existingById: Map<string, Article>,
  now: Date,
): Article | null {
  if (!candidate.title || !candidate.publishedAt) return null;
  let canonicalUrl: string;
  try {
    canonicalUrl = normalizeUrl(candidate.url);
  } catch {
    return null;
  }

  const id = deterministicArticleId(canonicalUrl);
  const summary = truncateSummary(candidate.summary);
  const language = candidate.language ?? guessLanguage(`${candidate.title} ${summary}`);
  const { relevanceScore, matchedKeywordIds } = scoreArticleRelevance(
    {
      title: candidate.title,
      summary,
      publishedAt: candidate.publishedAt,
      sourcePriority: source.priority,
    },
    keywords,
    now,
  );

  const existing = existingById.get(id);

  return {
    id,
    title: candidate.title,
    url: candidate.url,
    canonicalUrl,
    sourceId: source.id,
    sourceName: source.name,
    company: source.company,
    sourceCategory: source.category,
    publishedAt: candidate.publishedAt,
    discoveredAt: existing?.discoveredAt ?? now.toISOString(),
    updatedAt: candidate.updatedAt,
    summary,
    imageUrl: candidate.imageUrl,
    language,
    matchedKeywordIds,
    relevanceScore,
  };
}

async function collectSource(
  source: SourceConfig,
  cacheEntry: HttpCacheEntry | undefined,
  repositoryUrl: string | undefined,
) {
  switch (source.collectionMode) {
    case 'rss':
    case 'atom':
      return collectFromRss(source, cacheEntry, repositoryUrl);
    case 'sitemap':
      return collectFromSitemap(source, cacheEntry, repositoryUrl);
    case 'html':
      return collectFromGenericHtml(source, cacheEntry, repositoryUrl);
  }
}

export async function collect(options: CollectOptions): Promise<void> {
  const now = options.now ?? new Date();
  const repositoryUrl = resolveRepositoryUrl();

  let fixtureServer: Awaited<ReturnType<typeof startFixtureServer>> | undefined;
  let sources: SourceConfig[];
  if (options.fixtures) {
    fixtureServer = await startFixtureServer(join(process.cwd(), 'tests/fixtures'));
    sources = buildFixtureSources(fixtureServer.baseUrl);
  } else {
    sources = loadSourcesConfig();
  }
  const keywords = loadKeywordsConfig();

  const targetSources = sources.filter(
    (s) => s.enabled && (!options.sourceId || s.id === options.sourceId),
  );

  const dataDir = options.dataDir;
  const isBootstrap = !existsSync(join(dataDir, 'state', 'run-history.json'));

  const existingArticles = await loadArticleArchive(dataDir);
  const existingById = new Map(existingArticles.map((a) => [a.id, a]));

  const httpCache = await readJsonFile(
    join(dataDir, 'state', 'http-cache.json'),
    httpCacheFileSchema,
    [],
  );
  const httpCacheBySource = new Map(httpCache.map((e) => [e.sourceId, e]));

  const sourceState = await readJsonFile(
    join(dataDir, 'state', 'source-state.json'),
    sourceStateFileSchema,
    [],
  );
  const sourceStateById = new Map(sourceState.map((e) => [e.sourceId, e]));

  const existingHealth = await readJsonFile(
    join(dataDir, 'generated', 'source-health.json'),
    sourceHealthFileSchema,
    [],
  );
  const healthById = new Map(existingHealth.map((h) => [h.sourceId, h]));

  const previousManifest = await readJsonFile(
    join(dataDir, 'generated', 'manifest.json'),
    dataManifestSchema.nullable(),
    null,
  );

  const domainLimiters = new Map<string, ReturnType<typeof pLimit>>();
  function limiterFor(hostname: string) {
    let limiter = domainLimiters.get(hostname);
    if (!limiter) {
      limiter = pLimit(PER_DOMAIN_CONCURRENCY);
      domainLimiters.set(hostname, limiter);
    }
    return limiter;
  }
  const globalLimit = pLimit(GLOBAL_CONCURRENCY);

  const newHttpCache: HttpCacheEntry[] = [];
  const newSourceState: SourceStateEntry[] = [];
  const newHealth: SourceHealth[] = [];
  const collectedArticles: Article[] = [];
  let successCount = 0;
  let failureCount = 0;

  await Promise.all(
    targetSources.map((source) => {
      const hostname = new URL(source.feedUrl).hostname;
      return globalLimit(() =>
        limiterFor(hostname)(async () => {
          const cacheEntry =
            options.fixtures || options.fullRefresh ? undefined : httpCacheBySource.get(source.id);
          const previousState = sourceStateById.get(source.id);
          try {
            const result = await collectSource(source, cacheEntry, repositoryUrl);
            successCount += 1;

            const articles = result.candidates
              .map((c) => buildArticleFromCandidate(c, source, keywords, existingById, now))
              .filter((a): a is Article => a !== null);
            collectedArticles.push(...articles);

            newHealth.push(
              updateSourceHealth(
                source.id,
                source.enabled,
                healthById.get(source.id),
                {
                  success: true,
                  itemsFetched: result.candidates.length,
                  newItems: articles.filter((a) => !existingById.has(a.id)).length,
                  responseTimeMs: result.responseTimeMs,
                },
                now,
              ),
            );

            if (result.etag || result.lastModified) {
              newHttpCache.push({
                sourceId: source.id,
                url: source.feedUrl,
                etag: result.etag,
                lastModified: result.lastModified,
                lastFetchedAt: now.toISOString(),
              });
            }

            newSourceState.push({
              sourceId: source.id,
              knownUrls: articles.map((a) => a.canonicalUrl).slice(0, 1000),
              consecutiveFailures: 0,
              lastAttemptAt: now.toISOString(),
              lastSuccessAt: now.toISOString(),
            });
          } catch (error) {
            failureCount += 1;
            newHealth.push(
              updateSourceHealth(
                source.id,
                source.enabled,
                healthById.get(source.id),
                {
                  success: false,
                  itemsFetched: 0,
                  newItems: 0,
                  error,
                },
                now,
              ),
            );
            newSourceState.push({
              sourceId: source.id,
              knownUrls: previousState?.knownUrls ?? [],
              consecutiveFailures: (previousState?.consecutiveFailures ?? 0) + 1,
              lastAttemptAt: now.toISOString(),
              lastSuccessAt: previousState?.lastSuccessAt,
              lastError: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
    }),
  );

  await fixtureServer?.close();

  // Sources not targeted this run (disabled, or excluded by --source-id) keep their prior health/state.
  for (const source of sources) {
    if (targetSources.some((s) => s.id === source.id)) continue;
    if (!source.enabled) {
      newHealth.push(disabledSourceHealth(source.id, healthById.get(source.id)));
    } else {
      const previous = healthById.get(source.id);
      if (previous) newHealth.push(previous);
    }
    const state = sourceStateById.get(source.id);
    if (state) newSourceState.push(state);
  }

  const failureRatio = targetSources.length === 0 ? 0 : failureCount / targetSources.length;
  if (!isBootstrap && failureRatio > FAILURE_RATIO_THRESHOLD) {
    throw new Error(
      `Aborting run: ${failureCount}/${targetSources.length} sources failed (> ${FAILURE_RATIO_THRESHOLD * 100}% threshold).`,
    );
  }

  const mergedArticles = new Map(existingArticles.map((a) => [a.id, a]));
  for (const article of collectedArticles) mergedArticles.set(article.id, article);
  const { articles: dedupedArticles, duplicateCount } = deduplicateArticles(
    Array.from(mergedArticles.values()),
  );

  const trends = computeTrends(dedupedArticles, keywords, sources, now);
  const trendScoreByKeyword = new Map(
    trends.filter((t) => t.timeframe === '7d').map((t) => [t.keywordId, t.score]),
  );
  const scoredArticles = dedupedArticles.map((article) => {
    const trendScore = article.matchedKeywordIds.reduce<number | undefined>((max, keywordId) => {
      const score = trendScoreByKeyword.get(keywordId);
      if (score === undefined) return max;
      return max === undefined ? score : Math.max(max, score);
    }, undefined);
    return trendScore === undefined ? article : { ...article, trendScore };
  });

  const lastSuccessfulScanAt =
    successCount > 0
      ? now.toISOString()
      : (previousManifest?.lastSuccessfulScanAt ?? now.toISOString());

  const statistics = computeStatistics(
    scoredArticles,
    keywords,
    sources,
    lastSuccessfulScanAt,
    now,
  );

  const sourcesPublic: PublicSource[] = sources
    .map((s) => ({
      id: s.id,
      name: s.name,
      company: s.company,
      category: s.category,
      homepageUrl: s.homepageUrl,
      collectionMode: s.collectionMode,
      enabled: s.enabled,
      priority: s.priority,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const keywordsPublic: KeywordPublic[] = keywords
    .map((k) => ({
      id: k.id,
      labels: k.labels,
      category: k.category,
      synonymCount: k.terms.length,
      enabled: k.enabled,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const articlesLatest = scoredArticles
    .filter((a) => a.matchedKeywordIds.length > 0)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, ARTICLES_LATEST_LIMIT);

  const sortedHealth = [...newHealth].sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  const manifest: DataManifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    lastSuccessfulScanAt,
    sourceCommitSha: process.env.GITHUB_SHA,
    articleCount: articlesLatest.length,
    sourceCount: sources.filter((s) => s.enabled).length,
    activeKeywordCount: keywords.filter((k) => k.enabled).length,
    files: {
      'articles-latest.json': 'articles-latest.json',
      'trends.json': 'trends.json',
      'statistics.json': 'statistics.json',
      'sources-public.json': 'sources-public.json',
      'source-health.json': 'source-health.json',
      'keywords-public.json': 'keywords-public.json',
    },
  };

  // Validate everything before it's allowed to leave the pipeline (generation-time boundary).
  articlesFileSchema.parse(articlesLatest);
  trendsFileSchema.parse(trends);
  statisticsSchema.parse(statistics);
  sourcesPublicFileSchema.parse(sourcesPublic);
  sourceHealthFileSchema.parse(sortedHealth);
  keywordsFileSchema.parse(keywordsPublic);
  dataManifestSchema.parse(manifest);

  const runHistory = await readJsonFile(
    join(dataDir, 'state', 'run-history.json'),
    runHistoryFileSchema,
    [],
  );
  const historyEntry: RunHistoryEntry = {
    runAt: now.toISOString(),
    trigger:
      process.env.GITHUB_EVENT_NAME === 'schedule'
        ? 'schedule'
        : process.env.GITHUB_EVENT_NAME === 'push'
          ? 'push'
          : 'workflow_dispatch',
    sourceCount: targetSources.length,
    successCount,
    failureCount,
    newArticleCount: collectedArticles.length,
    dedupedCount: duplicateCount,
    durationMs: Date.now() - now.getTime(),
  };
  const updatedHistory = [...runHistory, historyEntry].slice(-RUN_HISTORY_LIMIT);

  const summary = {
    sources: { targeted: targetSources.length, succeeded: successCount, failed: failureCount },
    articles: {
      collected: collectedArticles.length,
      deduplicated: duplicateCount,
      total: dedupedArticles.length,
    },
    trends: trends.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (options.dryRun) {
    console.log('Dry run: no files written.');
    return;
  }

  await saveArticleArchive(dataDir, dedupedArticles);
  await writeJsonFile(
    join(dataDir, 'state', 'http-cache.json'),
    newHttpCache.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  );
  await writeJsonFile(
    join(dataDir, 'state', 'source-state.json'),
    newSourceState.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  );
  await writeJsonFile(join(dataDir, 'state', 'run-history.json'), updatedHistory);
  await writeJsonFile(join(dataDir, 'generated', 'articles-latest.json'), articlesLatest);
  await writeJsonFile(join(dataDir, 'generated', 'trends.json'), trends);
  await writeJsonFile(join(dataDir, 'generated', 'statistics.json'), statistics);
  await writeJsonFile(join(dataDir, 'generated', 'sources-public.json'), sourcesPublic);
  await writeJsonFile(join(dataDir, 'generated', 'source-health.json'), sortedHealth);
  await writeJsonFile(join(dataDir, 'generated', 'keywords-public.json'), keywordsPublic);
  await writeJsonFile(join(dataDir, 'generated', 'manifest.json'), manifest);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    const lines = [
      '## TrendSignal refresh summary',
      `- Sources: ${successCount}/${targetSources.length} succeeded (${failureCount} failed)`,
      `- Articles: ${collectedArticles.length} collected, ${duplicateCount} deduplicated, ${dedupedArticles.length} total in archive`,
      `- Published: ${articlesLatest.length} articles, ${trends.length} trend entries`,
      `- Last successful scan: ${lastSuccessfulScanAt}`,
      '',
    ].join('\n');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines);
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  collect(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
