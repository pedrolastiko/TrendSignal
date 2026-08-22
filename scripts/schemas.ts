import { z } from 'zod';

export const sourceCategorySchema = z.enum([
  'consulting',
  'technology',
  'cybersecurity',
  'artificial-intelligence',
  'media',
]);

export const collectionModeSchema = z.enum(['rss', 'atom', 'sitemap', 'html']);

// --- config/sources.yml ----------------------------------------------------

export const sourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  company: z.string().min(1),
  category: sourceCategorySchema,
  homepageUrl: z.string().url(),
  collectionMode: collectionModeSchema,
  feedUrl: z.string(),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(10),
  language: z.enum(['fr', 'en']),
  maxItemsPerRun: z.number().int().positive(),
  includePaths: z.array(z.string()).default([]),
  excludePaths: z.array(z.string()).default([]),
});

export type SourceConfig = z.infer<typeof sourceConfigSchema>;

export const sourcesConfigFileSchema = z.object({
  schemaVersion: z.number().int(),
  sources: z.array(sourceConfigSchema),
});

// --- config/keywords.yml ----------------------------------------------------

export const keywordConfigSchema = z.object({
  id: z.string().min(1),
  labels: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
  category: z.string().min(1),
  terms: z.array(z.string().min(1)).min(1),
  excludedTerms: z.array(z.string()).default([]),
  weight: z.number().positive(),
  enabled: z.boolean(),
});

export type KeywordConfig = z.infer<typeof keywordConfigSchema>;

export const keywordsConfigFileSchema = z.object({
  schemaVersion: z.number().int(),
  keywords: z.array(keywordConfigSchema),
});

// --- config/categories.yml ---------------------------------------------------

export const categoryConfigSchema = z.object({
  id: z.string().min(1),
  labels: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
});

export const categoriesConfigFileSchema = z.object({
  schemaVersion: z.number().int(),
  categories: z.array(categoryConfigSchema),
});

// --- Generated public data ----------------------------------------------------

export const articleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  company: z.string().min(1),
  sourceCategory: sourceCategorySchema,
  publishedAt: z.string(),
  discoveredAt: z.string(),
  updatedAt: z.string().optional(),
  summary: z.string().max(320),
  imageUrl: z.string().url().optional(),
  language: z.enum(['fr', 'en', 'unknown']),
  matchedKeywordIds: z.array(z.string()),
  relevanceScore: z.number().int().min(0).max(100),
  trendScore: z.number().int().min(0).max(100).optional(),
});

export type Article = z.infer<typeof articleSchema>;

export const keywordPublicSchema = z.object({
  id: z.string().min(1),
  labels: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
  category: z.string().min(1),
  synonymCount: z.number().int().nonnegative(),
  enabled: z.boolean(),
});
export type KeywordPublic = z.infer<typeof keywordPublicSchema>;

export const publicSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  company: z.string().min(1),
  category: sourceCategorySchema,
  homepageUrl: z.string().url(),
  collectionMode: collectionModeSchema,
  enabled: z.boolean(),
  priority: z.number().int(),
});
export type PublicSource = z.infer<typeof publicSourceSchema>;

export const sourceHealthSchema = z.object({
  sourceId: z.string().min(1),
  status: z.enum(['healthy', 'warning', 'error', 'disabled']),
  lastAttemptAt: z.string().optional(),
  lastSuccessAt: z.string().optional(),
  responseTimeMs: z.number().nonnegative().optional(),
  itemsFetched: z.number().int().nonnegative(),
  newItems: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastError: z.string().optional(),
});
export type SourceHealth = z.infer<typeof sourceHealthSchema>;

export const trendSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  keywordId: z.string().min(1),
  timeframe: z.enum(['24h', '7d', '30d']),
  score: z.number().int().min(0).max(100),
  status: z.enum(['breakout', 'emerging', 'rising', 'stable', 'declining']),
  articleCount: z.number().int().nonnegative(),
  previousArticleCount: z.number().int().nonnegative(),
  growthRate: z.number().nullable(),
  distinctSourceCount: z.number().int().nonnegative(),
  leadingSourceIds: z.array(z.string()),
  relatedArticleIds: z.array(z.string()),
});
export type Trend = z.infer<typeof trendSchema>;

export const dataManifestSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  lastSuccessfulScanAt: z.string(),
  sourceCommitSha: z.string().optional(),
  dataCommitSha: z.string().optional(),
  articleCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  activeKeywordCount: z.number().int().nonnegative(),
  files: z.record(z.string()),
});
export type DataManifest = z.infer<typeof dataManifestSchema>;

export const statisticsSchema = z.object({
  generatedAt: z.string(),
  articleCount: z.number().int().nonnegative(),
  activeSourceCount: z.number().int().nonnegative(),
  activeKeywordCount: z.number().int().nonnegative(),
  lastSuccessfulScanAt: z.string(),
  articlesByCategory: z.record(z.number().int().nonnegative()),
  keywordStats: z.array(
    z.object({
      id: z.string(),
      articleCount: z.number().int().nonnegative(),
      lastDetectedAt: z.string().optional(),
    }),
  ),
});
export type Statistics = z.infer<typeof statisticsSchema>;

export const articlesFileSchema = z.array(articleSchema);
export const sourcesPublicFileSchema = z.array(publicSourceSchema);
export const sourceHealthFileSchema = z.array(sourceHealthSchema);
export const trendsFileSchema = z.array(trendSchema);
export const keywordsFileSchema = z.array(keywordPublicSchema);

// --- Internal data-branch state -----------------------------------------------

export const httpCacheEntrySchema = z.object({
  sourceId: z.string(),
  url: z.string(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  lastFetchedAt: z.string(),
});
export type HttpCacheEntry = z.infer<typeof httpCacheEntrySchema>;
export const httpCacheFileSchema = z.array(httpCacheEntrySchema);

export const runHistoryEntrySchema = z.object({
  runAt: z.string(),
  trigger: z.enum(['schedule', 'push', 'workflow_dispatch']),
  sourceCount: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  newArticleCount: z.number().int().nonnegative(),
  dedupedCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});
export type RunHistoryEntry = z.infer<typeof runHistoryEntrySchema>;
export const runHistoryFileSchema = z.array(runHistoryEntrySchema);

export const sourceStateEntrySchema = z.object({
  sourceId: z.string(),
  knownUrls: z.array(z.string()),
  consecutiveFailures: z.number().int().nonnegative(),
  lastAttemptAt: z.string().optional(),
  lastSuccessAt: z.string().optional(),
  lastError: z.string().optional(),
});
export type SourceStateEntry = z.infer<typeof sourceStateEntrySchema>;
export const sourceStateFileSchema = z.array(sourceStateEntrySchema);
