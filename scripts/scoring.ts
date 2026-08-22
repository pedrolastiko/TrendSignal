import type { KeywordConfig } from './schemas.ts';
import { matchKeywords, type KeywordMatchResult } from './keyword-match.ts';

/**
 * Deterministic 0-100 relevance model (documented in docs/data-model.md):
 *   Title matches    up to 45  (15 pts per distinct matched keyword, capped)
 *   Summary matches  up to 25  (10 pts per distinct matched keyword, capped)
 *   Keyword weight   up to 10  (7 pts per unit of average matched-keyword weight, capped)
 *   Source priority  up to 10  (source priority value, 0-10, used directly)
 *   Recency          up to 10  (stepped by publication age)
 * Components are summed and capped at 100.
 */
export function scoreTitleMatches(titleMatchedCount: number): number {
  return Math.min(45, titleMatchedCount * 15);
}

export function scoreSummaryMatches(summaryMatchedCount: number): number {
  return Math.min(25, summaryMatchedCount * 10);
}

export function scoreKeywordWeight(matchedKeywords: KeywordConfig[]): number {
  if (matchedKeywords.length === 0) return 0;
  const avgWeight = matchedKeywords.reduce((sum, k) => sum + k.weight, 0) / matchedKeywords.length;
  return Math.min(10, Math.round(avgWeight * 7));
}

export function scoreSourcePriority(priority: number): number {
  return Math.max(0, Math.min(10, Math.round(priority)));
}

const RECENCY_STEPS: { maxHours: number; score: number }[] = [
  { maxHours: 24, score: 10 },
  { maxHours: 72, score: 7 },
  { maxHours: 24 * 7, score: 4 },
  { maxHours: 24 * 30, score: 2 },
];

export function scoreRecency(publishedAt: string, now: Date = new Date()): number {
  const published = new Date(publishedAt).getTime();
  if (Number.isNaN(published)) return 0;
  const hours = Math.max(0, (now.getTime() - published) / (1000 * 60 * 60));
  const step = RECENCY_STEPS.find((s) => hours <= s.maxHours);
  return step ? step.score : 0;
}

export interface RelevanceInput {
  title: string;
  summary: string;
  publishedAt: string;
  sourcePriority: number;
}

export interface RelevanceResult {
  relevanceScore: number;
  matchedKeywordIds: string[];
}

export function scoreArticleRelevance(
  article: RelevanceInput,
  keywords: KeywordConfig[],
  now: Date = new Date(),
): RelevanceResult {
  const match: KeywordMatchResult = matchKeywords(article, keywords);
  const keywordsById = new Map(keywords.map((k) => [k.id, k]));
  const matchedKeywords = match.matchedKeywordIds
    .map((id) => keywordsById.get(id))
    .filter((k): k is KeywordConfig => Boolean(k));

  const title = scoreTitleMatches(match.titleMatchedIds.length);
  const summary = scoreSummaryMatches(match.summaryMatchedIds.length);
  const weight = scoreKeywordWeight(matchedKeywords);
  const priority = scoreSourcePriority(article.sourcePriority);
  const recency = scoreRecency(article.publishedAt, now);

  const relevanceScore = Math.max(0, Math.min(100, title + summary + weight + priority + recency));

  return { relevanceScore, matchedKeywordIds: match.matchedKeywordIds };
}
