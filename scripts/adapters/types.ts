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
}

export interface EventAdapterResult {
  candidates: RawEventCandidate[];
  responseTimeMs: number;
}
