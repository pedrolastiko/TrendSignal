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
  /** Publisher logo used when an article carries no image of its own. */
  logoUrl?: string;
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
  eventCount?: number;
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

export type Continent =
  'north-america' | 'south-america' | 'europe' | 'asia' | 'africa' | 'oceania';

export type EventKind = 'webinar' | 'conference' | 'event';
export type EventFormat = 'online' | 'in-person' | 'hybrid';

export interface EventItem {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  company: string;
  sourceCategory: SourceCategory;
  /** ISO 8601 UTC. For all-day events: midnight UTC of the first day. */
  startsAt: string;
  /** ISO 8601 UTC. For all-day events it is exclusive. */
  endsAt?: string;
  allDay: boolean;
  kind: EventKind;
  format: EventFormat;
  location?: string;
  /** Where an in-person or hybrid event is held; absent for online events or when unknown. */
  continent?: Continent;
  summary: string;
  language: 'fr' | 'en' | 'unknown';
  matchedKeywordIds: string[];
  relevanceScore: number;
  discoveredAt: string;
  /** `estimated`: the organiser has not confirmed the date. */
  dateStatus: 'confirmed' | 'estimated';
  /** First day of the edition an estimated date was projected from, when it was. */
  estimatedFrom?: string;
}

export interface EventSourceStatus {
  id: string;
  name: string;
  company: string;
  homepageUrl?: string;
  /** How it is collected; free text, since newer data may use modes this build does not know. */
  collectionMode: string;
  enabled: boolean;
  health: SourceHealth;
}

export interface EventsFile {
  generatedAt: string;
  events: EventItem[];
  sources: EventSourceStatus[];
}
