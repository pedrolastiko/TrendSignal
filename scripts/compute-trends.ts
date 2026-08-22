import type { Article, KeywordConfig, SourceConfig, Trend } from './schemas.ts';

const TIMEFRAME_HOURS: Record<Trend['timeframe'], number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};
const TIMEFRAMES: Trend['timeframe'][] = ['24h', '7d', '30d'];
const MAX_RELATED_ARTICLES = 10;
const MAX_LEADING_SOURCES = 3;
const DIVERSITY_SATURATION_SOURCES = 5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function inWindow(publishedAt: string, from: number, to: number): boolean {
  const time = new Date(publishedAt).getTime();
  return !Number.isNaN(time) && time >= from && time < to;
}

/**
 * Trend score weights (documented in docs/data-model.md):
 *   35% normalized publication volume (relative to the busiest keyword this run)
 *   30% publication acceleration (growth vs. the previous equal-length window)
 *   20% distinct source diversity (saturates at DIVERSITY_SATURATION_SOURCES sources)
 *   15% weighted source authority (average configured priority of leading sources)
 */
export function computeTrends(
  articles: Article[],
  keywords: KeywordConfig[],
  sources: SourceConfig[],
  now: Date = new Date(),
): Trend[] {
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const enabledKeywords = keywords.filter((k) => k.enabled);
  const trends: Trend[] = [];

  for (const timeframe of TIMEFRAMES) {
    const windowHours = TIMEFRAME_HOURS[timeframe];
    const currentTo = now.getTime();
    const currentFrom = currentTo - windowHours * 60 * 60 * 1000;
    const previousFrom = currentFrom - windowHours * 60 * 60 * 1000;

    const currentByKeyword = new Map<string, Article[]>();
    const previousCountByKeyword = new Map<string, number>();

    for (const keyword of enabledKeywords) {
      const current = articles.filter(
        (a) =>
          a.matchedKeywordIds.includes(keyword.id) &&
          inWindow(a.publishedAt, currentFrom, currentTo),
      );
      const previousCount = articles.filter(
        (a) =>
          a.matchedKeywordIds.includes(keyword.id) &&
          inWindow(a.publishedAt, previousFrom, currentFrom),
      ).length;
      currentByKeyword.set(keyword.id, current);
      previousCountByKeyword.set(keyword.id, previousCount);
    }

    const maxArticleCount = Math.max(
      1,
      ...Array.from(currentByKeyword.values()).map((a) => a.length),
    );

    for (const keyword of enabledKeywords) {
      const current = currentByKeyword.get(keyword.id) ?? [];
      const previousArticleCount = previousCountByKeyword.get(keyword.id) ?? 0;
      const articleCount = current.length;

      const growthRate =
        previousArticleCount === 0
          ? null
          : Math.round(((articleCount - previousArticleCount) / previousArticleCount) * 100);

      const sourceCounts = new Map<string, number>();
      for (const article of current) {
        sourceCounts.set(article.sourceId, (sourceCounts.get(article.sourceId) ?? 0) + 1);
      }
      const distinctSourceCount = sourceCounts.size;
      const leadingSourceIds = Array.from(sourceCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_LEADING_SOURCES)
        .map(([sourceId]) => sourceId);

      const relatedArticleIds = [...current]
        .sort(
          (a, b) =>
            b.relevanceScore - a.relevanceScore || b.publishedAt.localeCompare(a.publishedAt),
        )
        .slice(0, MAX_RELATED_ARTICLES)
        .map((a) => a.id);

      const volumeNormalized = clamp01(articleCount / maxArticleCount);
      const accelerationNormalized =
        growthRate === null ? (articleCount > 0 ? 0.5 : 0) : clamp01(0.5 + growthRate / 200);
      const diversityNormalized = clamp01(distinctSourceCount / DIVERSITY_SATURATION_SOURCES);
      const leadingPriorities = leadingSourceIds
        .map((id) => sourcesById.get(id)?.priority ?? 0)
        .filter((p): p is number => typeof p === 'number');
      const avgPriority = leadingPriorities.length
        ? leadingPriorities.reduce((sum, p) => sum + p, 0) / leadingPriorities.length
        : 0;
      const authorityNormalized = clamp01(avgPriority / 10);

      const rawScore =
        0.35 * volumeNormalized +
        0.3 * accelerationNormalized +
        0.2 * diversityNormalized +
        0.15 * authorityNormalized;
      const score = Math.max(0, Math.min(100, Math.round(rawScore * 100)));

      let status: Trend['status'];
      if (score >= 80 && distinctSourceCount >= 2 && articleCount >= 2) {
        status = 'breakout';
      } else if (score >= 65) {
        status = 'emerging';
      } else if (score >= 45) {
        status = 'rising';
      } else if (score >= 25) {
        status = 'stable';
      } else {
        status = growthRate !== null && growthRate < 0 ? 'declining' : 'stable';
      }

      trends.push({
        id: `${keyword.id}-${timeframe}`,
        label: keyword.labels.en,
        keywordId: keyword.id,
        timeframe,
        score,
        status,
        articleCount,
        previousArticleCount,
        growthRate,
        distinctSourceCount,
        leadingSourceIds,
        relatedArticleIds,
      });
    }
  }

  return trends.sort((a, b) => a.id.localeCompare(b.id));
}
