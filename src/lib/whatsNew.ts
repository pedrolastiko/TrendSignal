import type { Article } from '../types';

/** A stored timestamp is only trusted if it parses; anything else counts as "never seen". */
export function parseLastSeen(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** New = first discovered by the collector after the reader last marked the feed as seen. */
export function isNewArticle(article: Pick<Article, 'discoveredAt'>, lastSeenAt: number | null) {
  if (lastSeenAt === null) return false;
  const discovered = Date.parse(article.discoveredAt);
  return !Number.isNaN(discovered) && discovered > lastSeenAt;
}
