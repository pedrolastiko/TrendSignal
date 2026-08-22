import type { Article, KeywordConfig, SourceConfig, Statistics } from './schemas.ts';

export function computeStatistics(
  articles: Article[],
  keywords: KeywordConfig[],
  sources: SourceConfig[],
  lastSuccessfulScanAt: string,
  now: Date = new Date(),
): Statistics {
  const articlesByCategory: Record<string, number> = {};
  for (const article of articles) {
    articlesByCategory[article.sourceCategory] =
      (articlesByCategory[article.sourceCategory] ?? 0) + 1;
  }

  const keywordStats = keywords
    .map((keyword) => {
      const matched = articles.filter((a) => a.matchedKeywordIds.includes(keyword.id));
      const lastDetectedAt = matched
        .map((a) => a.publishedAt)
        .sort()
        .at(-1);
      return {
        id: keyword.id,
        articleCount: matched.length,
        ...(lastDetectedAt ? { lastDetectedAt } : {}),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    generatedAt: now.toISOString(),
    articleCount: articles.length,
    activeSourceCount: sources.filter((s) => s.enabled).length,
    activeKeywordCount: keywords.filter((k) => k.enabled).length,
    lastSuccessfulScanAt,
    articlesByCategory,
    keywordStats,
  };
}
