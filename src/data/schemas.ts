import { z } from 'zod';

export const sourceCategorySchema = z.enum([
  'consulting',
  'technology',
  'cybersecurity',
  'artificial-intelligence',
  'media',
]);

export const collectionModeSchema = z.enum(['rss', 'atom', 'sitemap', 'html']);

export const articleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  company: z.string().min(1),
  sourceCategory: sourceCategorySchema,
  publishedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  discoveredAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  updatedAt: z.string().optional(),
  summary: z.string().max(320),
  imageUrl: z.string().url().optional(),
  language: z.enum(['fr', 'en', 'unknown']),
  // Defaulted so the app keeps rendering against data published before tags existed.
  tags: z.array(z.string()).default([]),
  matchedKeywordIds: z.array(z.string()),
  tagMatchedIds: z.array(z.string()).default([]),
  relevanceScore: z.number().int().min(0).max(100),
  trendScore: z.number().int().min(0).max(100).optional(),
});

export const keywordDefinitionSchema = z.object({
  id: z.string().min(1),
  labels: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
  category: z.string().min(1),
  terms: z.array(z.string().min(1)).min(1),
  excludedTerms: z.array(z.string()).optional(),
  weight: z.number().positive(),
  enabled: z.boolean(),
});

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

export const keywordPublicSchema = z.object({
  id: z.string().min(1),
  labels: z.object({ fr: z.string().min(1), en: z.string().min(1) }),
  category: z.string().min(1),
  synonymCount: z.number().int().nonnegative(),
  enabled: z.boolean(),
});

export const keywordsFileSchema = z.array(keywordPublicSchema);
export const articlesFileSchema = z.array(articleSchema);
export const sourcesPublicFileSchema = z.array(publicSourceSchema);
export const sourceHealthFileSchema = z.array(sourceHealthSchema);
export const trendsFileSchema = z.array(trendSchema);
