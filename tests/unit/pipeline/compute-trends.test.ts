import { describe, expect, it } from 'vitest';
import { computeTrends } from '../../../scripts/compute-trends.ts';
import type { Article, KeywordConfig, SourceConfig } from '../../../scripts/schemas.ts';

const now = new Date('2026-08-22T12:00:00.000Z');

const keywords: KeywordConfig[] = [
  {
    id: 'zero-trust',
    labels: { fr: 'Zero Trust', en: 'Zero Trust' },
    category: 'cybersecurity',
    terms: ['zero trust'],
    excludedTerms: [],
    weight: 1,
    enabled: true,
  },
];

const sources: SourceConfig[] = [
  {
    id: 'source-a',
    name: 'Source A',
    company: 'Company A',
    category: 'cybersecurity',
    homepageUrl: 'https://a.example.com',
    collectionMode: 'rss',
    feedUrl: 'https://a.example.com/feed',
    enabled: true,
    priority: 8,
    language: 'en',
    maxItemsPerRun: 30,
    includePaths: [],
    excludePaths: [],
    dateMetaNames: [],
  },
  {
    id: 'source-b',
    name: 'Source B',
    company: 'Company B',
    category: 'cybersecurity',
    homepageUrl: 'https://b.example.com',
    collectionMode: 'rss',
    feedUrl: 'https://b.example.com/feed',
    enabled: true,
    priority: 6,
    language: 'en',
    maxItemsPerRun: 30,
    includePaths: [],
    excludePaths: [],
    dateMetaNames: [],
  },
];

function article(overrides: Partial<Article>): Article {
  return {
    id: overrides.id ?? Math.random().toString(36),
    title: 'Zero Trust news',
    url: 'https://example.com/a',
    canonicalUrl: 'https://example.com/a',
    sourceId: 'source-a',
    sourceName: 'Source A',
    company: 'Company A',
    sourceCategory: 'cybersecurity',
    publishedAt: now.toISOString(),
    discoveredAt: now.toISOString(),
    summary: 'Summary',
    language: 'en',
    matchedKeywordIds: ['zero-trust'],
    relevanceScore: 50,
    ...overrides,
  };
}

function hoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe('computeTrends', () => {
  it('handles zero previous volume without throwing and sets growthRate to null', () => {
    const articles = [article({ id: '1', publishedAt: hoursAgo(2) })];
    const trends = computeTrends(articles, keywords, sources, now);
    const trend24h = trends.find((t) => t.keywordId === 'zero-trust' && t.timeframe === '24h');
    expect(trend24h).toBeDefined();
    expect(trend24h?.previousArticleCount).toBe(0);
    expect(trend24h?.growthRate).toBeNull();
  });

  it('does not classify a single low-volume article as a breakout', () => {
    const articles = [article({ id: '1', sourceId: 'source-a', publishedAt: hoursAgo(2) })];
    const trends = computeTrends(articles, keywords, sources, now);
    const trend24h = trends.find((t) => t.keywordId === 'zero-trust' && t.timeframe === '24h');
    expect(trend24h?.status).not.toBe('breakout');
  });

  it('requires at least two distinct sources for a breakout', () => {
    const manyFromOneSource = Array.from({ length: 10 }, (_, i) =>
      article({ id: `same-${i}`, sourceId: 'source-a', publishedAt: hoursAgo(1) }),
    );
    const trends = computeTrends(manyFromOneSource, keywords, sources, now);
    const trend24h = trends.find((t) => t.keywordId === 'zero-trust' && t.timeframe === '24h');
    expect(trend24h?.distinctSourceCount).toBe(1);
    expect(trend24h?.status).not.toBe('breakout');
  });

  it('computes growth rate relative to the previous equal-length window', () => {
    const articles = [
      article({ id: '1', publishedAt: hoursAgo(1) }),
      article({ id: '2', publishedAt: hoursAgo(2) }),
      article({ id: '3', publishedAt: hoursAgo(30) }), // previous 24h window
    ];
    const trends = computeTrends(articles, keywords, sources, now);
    const trend24h = trends.find((t) => t.keywordId === 'zero-trust' && t.timeframe === '24h');
    expect(trend24h?.articleCount).toBe(2);
    expect(trend24h?.previousArticleCount).toBe(1);
    expect(trend24h?.growthRate).toBe(100);
  });

  it('reports distinct source count and leading sources', () => {
    const articles = [
      article({ id: '1', sourceId: 'source-a', publishedAt: hoursAgo(1) }),
      article({ id: '2', sourceId: 'source-b', publishedAt: hoursAgo(2) }),
    ];
    const trends = computeTrends(articles, keywords, sources, now);
    const trend24h = trends.find((t) => t.keywordId === 'zero-trust' && t.timeframe === '24h');
    expect(trend24h?.distinctSourceCount).toBe(2);
    expect(trend24h?.leadingSourceIds.sort()).toEqual(['source-a', 'source-b']);
  });

  it('produces one trend entry per enabled keyword per timeframe', () => {
    const trends = computeTrends([], keywords, sources, now);
    expect(trends).toHaveLength(keywords.length * 3);
  });
});
