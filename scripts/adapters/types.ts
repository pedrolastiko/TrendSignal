import type { SourceCategory } from '../schemas.ts';

export interface RawArticleCandidate {
  title: string;
  url: string;
  publishedAt: string;
  updatedAt?: string;
  summary: string;
  imageUrl?: string;
  language?: 'fr' | 'en';
  /** Publisher-supplied tags, already normalized by `scripts/tags.ts`. */
  tags?: string[];
}

export interface AdapterResult {
  candidates: RawArticleCandidate[];
  notModified: boolean;
  etag?: string;
  lastModified?: string;
  responseTimeMs: number;
}

/** An event as a publisher states it, before scope, keyword and expiry rules are applied. */
export interface RawEventCandidate {
  title: string;
  url: string;
  startsAt: string;
  /** Exclusive for all-day events. */
  endsAt?: string;
  allDay: boolean;
  summary: string;
  location?: string;
  /** ISO 3166-1 alpha-2, only when the publisher states the country explicitly. */
  countryCode?: string;
  categories?: string[];
  /** What the publisher declares (schema.org eventAttendanceMode); beats the text heuristics. */
  attendanceMode?: 'online' | 'offline' | 'mixed';
  language?: 'fr' | 'en';
  /** Overrides the source's company: the organiser, for a curated or aggregated listing. */
  company?: string;
  /** Overrides the source's category, for a curated list that spans several. */
  category?: SourceCategory;
  /** Overrides the text-based guess of the event's kind. */
  kind?: 'webinar' | 'conference' | 'event';
  /** `estimated` when the date is not confirmed by the organiser. */
  dateStatus?: 'confirmed' | 'estimated';
  /** First day (YYYY-MM-DD) of the edition an estimated date was projected from. */
  estimatedFrom?: string;
  /** Tells apart events that share one URL (a listing page) so their ids do not collide. */
  idSuffix?: string;
}

export interface EventAdapterResult {
  candidates: RawEventCandidate[];
  responseTimeMs: number;
}
