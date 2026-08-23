import { describe, expect, it } from 'vitest';
import {
  scoreArticleRelevance,
  scoreRecency,
  scoreSourcePriority,
  scoreSummaryMatches,
  scoreTitleMatches,
} from '../../../scripts/scoring.ts';
import type { KeywordConfig } from '../../../scripts/schemas.ts';

const keywords: KeywordConfig[] = [
  {
    id: 'ransomware',
    labels: { fr: 'Rançongiciel', en: 'Ransomware' },
    category: 'cybersecurity',
    terms: ['ransomware'],
    aliases: [],
    excludedTerms: [],
    weight: 1.2,
    enabled: true,
  },
  {
    id: 'ai',
    labels: { fr: 'IA', en: 'AI' },
    category: 'artificial-intelligence',
    terms: ['AI'],
    aliases: [],
    excludedTerms: [],
    weight: 1.0,
    enabled: true,
  },
];

describe('component scorers', () => {
  it('caps title score at 45', () => {
    expect(scoreTitleMatches(0)).toBe(0);
    expect(scoreTitleMatches(1)).toBe(15);
    expect(scoreTitleMatches(10)).toBe(45);
  });

  it('caps summary score at 25', () => {
    expect(scoreSummaryMatches(0)).toBe(0);
    expect(scoreSummaryMatches(3)).toBe(25);
  });

  it('clamps source priority to [0, 10]', () => {
    expect(scoreSourcePriority(7)).toBe(7);
    expect(scoreSourcePriority(15)).toBe(10);
    expect(scoreSourcePriority(-3)).toBe(0);
  });

  it('scores recency higher for more recent articles', () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const recent = scoreRecency(new Date('2026-08-22T06:00:00.000Z').toISOString(), now);
    const old = scoreRecency(new Date('2026-06-01T00:00:00.000Z').toISOString(), now);
    expect(recent).toBeGreaterThan(old);
    expect(old).toBe(0);
  });
});

describe('scoreArticleRelevance', () => {
  const now = new Date('2026-08-22T12:00:00.000Z');

  it('caps the total score at 100 and returns matched keyword ids', () => {
    const result = scoreArticleRelevance(
      {
        title: 'Ransomware and AI: a dangerous combination',
        summary: 'Ransomware groups are now using AI to automate attacks against enterprises.',
        publishedAt: now.toISOString(),
        sourcePriority: 10,
      },
      keywords,
      now,
    );
    expect(result.relevanceScore).toBeLessThanOrEqual(100);
    expect(result.matchedKeywordIds.sort()).toEqual(['ai', 'ransomware']);
    expect(result.relevanceScore).toBeGreaterThan(50);
  });

  it('returns a low score with no keyword matches', () => {
    const result = scoreArticleRelevance(
      {
        title: 'Quarterly roadmap update',
        summary: 'Nothing relevant here.',
        publishedAt: now.toISOString(),
        sourcePriority: 5,
      },
      keywords,
      now,
    );
    expect(result.matchedKeywordIds).toHaveLength(0);
    expect(result.relevanceScore).toBeLessThan(30);
  });

  it('never returns a negative score', () => {
    const result = scoreArticleRelevance(
      { title: '', summary: '', publishedAt: 'not-a-date', sourcePriority: 0 },
      keywords,
      now,
    );
    expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
  });
});
