export interface RawArticleCandidate {
  title: string;
  url: string;
  publishedAt: string;
  updatedAt?: string;
  summary: string;
  imageUrl?: string;
  language?: 'fr' | 'en';
}

export interface AdapterResult {
  candidates: RawArticleCandidate[];
  notModified: boolean;
  etag?: string;
  lastModified?: string;
  responseTimeMs: number;
}
