import { normalizeUrl } from './normalize.ts';
import type { Article } from './schemas.ts';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripAllQueryParams(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  return normalizeUrl(parsed.toString());
}

export interface DeduplicationResult {
  articles: Article[];
  duplicateCount: number;
}

/**
 * Applies dedup rules in order: normalized canonical URL, then URL with all
 * query params stripped, then same normalized title from the same company
 * within a 7-day window. Input order determines which duplicate is kept.
 */
export function deduplicateArticles(articles: Article[]): DeduplicationResult {
  const byCanonicalUrl = new Map<string, Article>();
  const byStrippedUrl = new Map<string, Article>();
  const byCompanyTitle = new Map<string, Article[]>();
  let duplicateCount = 0;

  for (const article of articles) {
    const canonicalKey = normalizeUrl(article.canonicalUrl);
    if (byCanonicalUrl.has(canonicalKey)) {
      duplicateCount += 1;
      continue;
    }

    const strippedKey = stripAllQueryParams(article.canonicalUrl);
    if (byStrippedUrl.has(strippedKey)) {
      duplicateCount += 1;
      continue;
    }

    const titleKey = `${article.company.toLowerCase()}::${normalizeTitle(article.title)}`;
    const sameTitleCandidates = byCompanyTitle.get(titleKey) ?? [];
    const publishedAt = new Date(article.publishedAt).getTime();
    const isDuplicateTitle = sameTitleCandidates.some((candidate) => {
      const candidatePublishedAt = new Date(candidate.publishedAt).getTime();
      return Math.abs(publishedAt - candidatePublishedAt) <= SEVEN_DAYS_MS;
    });
    if (isDuplicateTitle) {
      duplicateCount += 1;
      continue;
    }

    byCanonicalUrl.set(canonicalKey, article);
    byStrippedUrl.set(strippedKey, article);
    byCompanyTitle.set(titleKey, [...sameTitleCandidates, article]);
  }

  return { articles: Array.from(byCanonicalUrl.values()), duplicateCount };
}
