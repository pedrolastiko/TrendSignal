import { z } from 'zod';

export const sourceCategorySchema = z.enum([
  'consulting',
  'technology',
  'cybersecurity',
  'artificial-intelligence',
  'media',
]);

export type SourceCategory = z.infer<typeof sourceCategorySchema>;

export const collectionModeSchema = z.enum(['rss', 'atom', 'sitemap', 'html']);

// --- config/sources.yml ----------------------------------------------------

export const sourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  company: z.string().min(1),
  category: sourceCategorySchema,
  homepageUrl: z.string().url(),
  /**
   * Publisher logo, used as the article-card image when an article has none of its
   * own. Discovered and validated by scripts/discover-source-logos.ts — never guessed.
   */
  logoUrl: z.string().url().optional(),
  collectionMode: collectionModeSchema,
  feedUrl: z.string(),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(10),
  language: z.enum(['fr', 'en']),
  maxItemsPerRun: z.number().int().positive(),
  includePaths: z.array(z.string()).default([]),
  excludePaths: z.array(z.string()).default([]),
  /**
   * Publisher-specific `<meta name="...">` names carrying the publication date,
   * for sitemap/html sources whose pages ship neither JSON-LD nor Open Graph dates.
   * Tried only after the generic extraction chain (see adapters/html-metadata.ts).
   */
  dateMetaNames: z.array(z.string()).default([]),
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
  /**
   * Publisher tag spellings that denote this keyword. Matched by exact equality on the
   * normalized tag key, never as a substring — a tag is an explicit assertion, so it
   * needs none of the word-boundary machinery `terms` requires, and exact matching keeps
   * a broad alias like "ai" from firing on unrelated prose.
   */
  aliases: z.array(z.string()).default([]),
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
  /** Publisher-supplied tags, normalized but not mapped onto the vocabulary. */
  tags: z.array(z.string()).default([]),
  matchedKeywordIds: z.array(z.string()),
  /**
   * Keywords matched through a tag alias rather than through the article text. Kept
   * separate from `matchedKeywordIds` so the added recall can be measured before it is
   * allowed to influence relevance or trends.
   */
  tagMatchedIds: z.array(z.string()).default([]),
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
  logoUrl: z.string().url().optional(),
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
  /** Upcoming events in events.json; absent on data generated before events existed. */
  eventCount: z.number().int().nonnegative().optional(),
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

// --- Events -------------------------------------------------------------------------
// Events are a separate dataset from articles: their date lies ahead, so they must not
// feed trend scoring or the "latest articles" ordering. See docs/data-model.md.

export const eventCollectionModeSchema = z.enum([
  'ics',
  'rss',
  'jsonld',
  'cncf-events',
  'techconf-ca',
  'observability-360',
  'qgmedia',
  'infosec-conferences',
  'curated',
]);

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * A date someone checked by hand. `confirmed` only when the organiser (or its venue) states it;
 * `unconfirmed` when only third-party listings do. Always with where it was read and when.
 */
export const knownEditionSchema = z.object({
  startDate: isoDay,
  /** Last day, inclusive. */
  endDate: isoDay.optional(),
  location: z.string().optional(),
  url: z.string().url().optional(),
  status: z.enum(['confirmed', 'unconfirmed']),
  sourceUrl: z.string().url(),
  verifiedOn: isoDay,
  note: z.string().optional(),
});
export type KnownEdition = z.infer<typeof knownEditionSchema>;

/** A conference series with its known editions; used by the `curated` mode and by techconf-ca overrides. */
export const eventSeriesSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** The organiser, shown as the event's company. */
  organiser: z.string().min(1),
  category: sourceCategorySchema,
  /** The conference's own site. */
  url: z.string().url(),
  kind: z.enum(['webinar', 'conference', 'event']).default('conference'),
  format: z.enum(['online', 'in-person', 'hybrid']),
  location: z.string().optional(),
  /** ISO 3166-1 alpha-2. */
  countryCode: z.string().length(2).optional(),
  summary: z.string().max(320).default(''),
  editions: z.array(knownEditionSchema).min(1),
});
export type EventSeries = z.infer<typeof eventSeriesSchema>;

export const eventSeriesFileSchema = z.object({
  schemaVersion: z.number().int(),
  series: z.array(eventSeriesSchema),
});

export const eventSourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  company: z.string().min(1),
  category: sourceCategorySchema,
  /** A hand-curated list has no page of its own. */
  homepageUrl: z.string().url().optional(),
  /**
   * `rss`: the item's pubDate is the event start. `jsonld`: a listing page whose linked pages
   * carry a schema.org Event. `cncf-events`: cncf.io WordPress REST API.
   */
  collectionMode: eventCollectionModeSchema,
  feedUrl: z.string(),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(10),
  language: z.enum(['fr', 'en']),
  maxItemsPerRun: z.number().int().positive(),
  /** `jsonld` only: which links of the listing page are event pages (path substrings, required). */
  includePaths: z.array(z.string()).default([]),
  excludePaths: z.array(z.string()).default([]),
  /**
   * `techconf-ca` only: dates verified by hand for a series (matched by name), used instead of
   * projecting last year's.
   */
  knownEditions: z.array(knownEditionSchema.extend({ name: z.string().min(1) })).default([]),
  /**
   * Where the publisher's in-person events take place when the feed gives no location.
   * Online events are kept whatever the region.
   */
  region: z.enum(['north-america', 'global']).default('global'),
  /**
   * Keep events that match no tracked keyword. Only for publishers whose whole scope is
   * IT, AI or cybersecurity; a mixed publisher (NIST) must stay keyword-gated.
   */
  includeUnmatched: z.boolean().default(false),
});
export type EventSourceConfig = z.infer<typeof eventSourceConfigSchema>;

export const eventScopeSchema = z.enum(['worldwide', 'north-america']);
export type EventScope = z.infer<typeof eventScopeSchema>;

export const eventsConfigFileSchema = z.object({
  schemaVersion: z.number().int(),
  /**
   * Which in-person events are kept: `worldwide` keeps every one (each carries its continent);
   * `north-america` keeps only those held there. Online events are always kept.
   */
  scope: eventScopeSchema.default('worldwide'),
  sources: z.array(eventSourceConfigSchema),
});

export const continentSchema = z.enum([
  'north-america',
  'south-america',
  'europe',
  'asia',
  'africa',
  'oceania',
]);

export const eventFormatSchema = z.enum(['online', 'in-person', 'hybrid']);
export const eventKindSchema = z.enum(['webinar', 'conference', 'event']);

export const eventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  company: z.string().min(1),
  sourceCategory: sourceCategorySchema,
  /** ISO 8601 UTC. For all-day events: midnight UTC of the first day. */
  startsAt: z.string(),
  /** ISO 8601 UTC. For all-day events it is exclusive: midnight UTC after the last day. */
  endsAt: z.string().optional(),
  allDay: z.boolean(),
  kind: eventKindSchema,
  format: eventFormatSchema,
  location: z.string().max(120).optional(),
  /** Where an in-person or hybrid event is held; absent for online events or when unknown. */
  continent: continentSchema.optional(),
  summary: z.string().max(320),
  language: z.enum(['fr', 'en', 'unknown']),
  matchedKeywordIds: z.array(z.string()),
  relevanceScore: z.number().int().min(0).max(100),
  discoveredAt: z.string(),
  /**
   * `estimated` when the organiser has not confirmed the date: either projected from last
   * year's edition (`estimatedFrom` is that edition's first day) or only reported by listings.
   */
  dateStatus: z.enum(['confirmed', 'estimated']).default('confirmed'),
  estimatedFrom: isoDay.optional(),
});
export type EventItem = z.infer<typeof eventSchema>;

export const eventSourceStatusSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  company: z.string().min(1),
  homepageUrl: z.string().url().optional(),
  collectionMode: eventCollectionModeSchema,
  enabled: z.boolean(),
  health: sourceHealthSchema,
});
export type EventSourceStatus = z.infer<typeof eventSourceStatusSchema>;

export const eventsFileSchema = z.object({
  generatedAt: z.string(),
  events: z.array(eventSchema),
  sources: z.array(eventSourceStatusSchema),
});
export type EventsFile = z.infer<typeof eventsFileSchema>;
