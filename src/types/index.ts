export type SourceCategory =
  'consulting' | 'technology' | 'cybersecurity' | 'artificial-intelligence' | 'media';

export type CollectionMode = 'rss' | 'atom' | 'sitemap' | 'html';

export interface Article {
  id: string;
  title: string;
  url: string;
  canonicalUrl: string;
  sourceId: string;
  sourceName: string;
  company: string;
  sourceCategory: SourceCategory;
  publishedAt: string;
  discoveredAt: string;
  updatedAt?: string;
  summary: string;
  imageUrl?: string;
  language: 'fr' | 'en' | 'unknown';
  /** Publisher-supplied tags, normalized during collection. */
  tags: string[];
  matchedKeywordIds: string[];
  /** Keywords reached through a tag alias; not yet folded into relevance or trends. */
  tagMatchedIds: string[];
  relevanceScore: number;
  trendScore?: number;
}

export interface KeywordDefinition {
  id: string;
  labels: { fr: string; en: string };
  category: string;
  terms: string[];
  excludedTerms?: string[];
  weight: number;
  enabled: boolean;
}

export interface KeywordStat {
  id: string;
  articleCount: number;
  lastDetectedAt?: string;
}

// Browser projection of config/keywords.yml; matching internals (terms, weight) stay server-side.
export interface KeywordPublic {
  id: string;
  labels: { fr: string; en: string };
  category: string;
  synonymCount: number;
  enabled: boolean;
}

export interface PublicSource {
  id: string;
  name: string;
  company: string;
  category: SourceCategory;
  homepageUrl: string;
  collectionMode: CollectionMode;
  enabled: boolean;
  priority: number;
}

export type SourceHealthStatus = 'healthy' | 'warning' | 'error' | 'disabled';

export interface SourceHealth {
  sourceId: string;
  status: SourceHealthStatus;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  responseTimeMs?: number;
  itemsFetched: number;
  newItems: number;
  consecutiveFailures: number;
  lastError?: string;
}

export type TrendTimeframe = '24h' | '7d' | '30d';
export type TrendStatus = 'breakout' | 'emerging' | 'rising' | 'stable' | 'declining';

export interface Trend {
  id: string;
  label: string;
  keywordId: string;
  timeframe: TrendTimeframe;
  score: number;
  status: TrendStatus;
  articleCount: number;
  previousArticleCount: number;
  growthRate: number | null;
  distinctSourceCount: number;
  leadingSourceIds: string[];
  relatedArticleIds: string[];
}

export interface DataManifest {
  schemaVersion: string;
  generatedAt: string;
  lastSuccessfulScanAt: string;
  sourceCommitSha?: string;
  dataCommitSha?: string;
  articleCount: number;
  sourceCount: number;
  activeKeywordCount: number;
  files: Record<string, string>;
}

export interface Statistics {
  generatedAt: string;
  articleCount: number;
  activeSourceCount: number;
  activeKeywordCount: number;
  lastSuccessfulScanAt: string;
  articlesByCategory: Record<SourceCategory, number>;
  keywordStats: KeywordStat[];
}
