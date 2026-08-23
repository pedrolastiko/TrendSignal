import type { KeywordConfig } from './schemas.ts';
import { tagKey } from './tags.ts';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Span {
  start: number;
  end: number;
}

/** Unicode-aware, case-insensitive word-boundary matcher (works for short acronyms like "AI"/"IA"/"IAM" and accented phrases alike). */
function findTermSpans(text: string, term: string): Span[] {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu');
  const spans: Span[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

function normalize(text: string): string {
  return text.normalize('NFC');
}

/** Returns true if `keyword` has at least one term match in `text` that is not fully explained by an excluded term. */
function keywordMatchesText(text: string, keyword: KeywordConfig): boolean {
  const normalizedText = normalize(text);
  const excludedSpans = (keyword.excludedTerms ?? []).flatMap((term) =>
    findTermSpans(normalizedText, normalize(term)),
  );

  return keyword.terms.some((term) => {
    const spans = findTermSpans(normalizedText, normalize(term));
    return spans.some((span) => !excludedSpans.some((excluded) => overlaps(span, excluded)));
  });
}

export interface KeywordMatchResult {
  matchedKeywordIds: string[];
  titleMatchedIds: string[];
  summaryMatchedIds: string[];
}

/**
 * Maps publisher tags onto the vocabulary by exact match against a keyword's `aliases`
 * or its `terms`, on the normalized tag key.
 *
 * Deliberately exact rather than substring: `terms` exist to find a concept inside
 * running prose and need word boundaries to stay honest, whereas a tag is a discrete
 * label the publisher chose. Treating "AI Bots" as a match for the term "AI" would
 * reintroduce exactly the over-matching the word-boundary matcher avoids.
 */
export function matchKeywordsByTags(tags: string[], keywords: KeywordConfig[]): string[] {
  if (tags.length === 0) return [];
  const keys = new Set(tags.map(tagKey));

  return keywords
    .filter(
      (keyword) =>
        keyword.enabled &&
        [...keyword.aliases, ...keyword.terms].some((value) => keys.has(tagKey(value))),
    )
    .map((keyword) => keyword.id)
    .sort();
}

export function matchKeywords(
  article: { title: string; summary: string },
  keywords: KeywordConfig[],
): KeywordMatchResult {
  const titleMatchedIds: string[] = [];
  const summaryMatchedIds: string[] = [];

  for (const keyword of keywords) {
    if (!keyword.enabled) continue;
    if (keywordMatchesText(article.title, keyword)) titleMatchedIds.push(keyword.id);
    if (keywordMatchesText(article.summary, keyword)) summaryMatchedIds.push(keyword.id);
  }

  const matchedKeywordIds = Array.from(new Set([...titleMatchedIds, ...summaryMatchedIds])).sort();
  return { matchedKeywordIds, titleMatchedIds, summaryMatchedIds };
}
