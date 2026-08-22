import { describe, expect, it } from 'vitest';
import { deduplicateArticles } from '../../../scripts/deduplicate.ts';
import type { Article } from '../../../scripts/schemas.ts';

function article(overrides: Partial<Article>): Article {
  return {
    id: overrides.id ?? Math.random().toString(36),
    title: 'Sample article',
    url: 'https://example.com/a',
    canonicalUrl: 'https://example.com/a',
    sourceId: 'source-1',
    sourceName: 'Source One',
    company: 'Example Co',
    sourceCategory: 'technology',
    publishedAt: '2026-08-20T10:00:00.000Z',
    discoveredAt: '2026-08-20T10:05:00.000Z',
    summary: 'A short summary.',
    language: 'en',
    matchedKeywordIds: [],
    relevanceScore: 10,
    ...overrides,
  };
}

describe('deduplicateArticles', () => {
  it('removes exact canonical URL duplicates', () => {
    const a = article({ id: '1', canonicalUrl: 'https://example.com/post' });
    const b = article({ id: '2', canonicalUrl: 'https://example.com/post' });
    const result = deduplicateArticles([a, b]);
    expect(result.articles).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
  });

  it('removes duplicates that differ only by query parameters', () => {
    const a = article({ id: '1', canonicalUrl: 'https://example.com/post?ref=abc' });
    const b = article({ id: '2', canonicalUrl: 'https://example.com/post?ref=xyz' });
    const result = deduplicateArticles([a, b]);
    expect(result.articles).toHaveLength(1);
  });

  it('merges same normalized title from the same company within 7 days', () => {
    const a = article({
      id: '1',
      title: 'Breaking: New AI Regulation Announced',
      company: 'Example Co',
      canonicalUrl: 'https://example.com/post-a',
      publishedAt: '2026-08-20T10:00:00.000Z',
    });
    const b = article({
      id: '2',
      title: 'breaking new ai regulation announced!!',
      company: 'Example Co',
      canonicalUrl: 'https://mirror.example.com/post-b',
      publishedAt: '2026-08-22T10:00:00.000Z',
    });
    const result = deduplicateArticles([a, b]);
    expect(result.articles).toHaveLength(1);
  });

  it('does not merge the same title from different companies', () => {
    const a = article({
      id: '1',
      title: 'Quarterly earnings report',
      company: 'Company A',
      canonicalUrl: 'https://a.example.com/post',
    });
    const b = article({
      id: '2',
      title: 'Quarterly earnings report',
      company: 'Company B',
      canonicalUrl: 'https://b.example.com/post',
    });
    const result = deduplicateArticles([a, b]);
    expect(result.articles).toHaveLength(2);
  });

  it('does not merge the same title from the same company more than 7 days apart', () => {
    const a = article({
      id: '1',
      title: 'Annual report highlights',
      company: 'Example Co',
      canonicalUrl: 'https://example.com/2026',
      publishedAt: '2026-01-01T10:00:00.000Z',
    });
    const b = article({
      id: '2',
      title: 'Annual report highlights',
      company: 'Example Co',
      canonicalUrl: 'https://example.com/2027',
      publishedAt: '2027-01-01T10:00:00.000Z',
    });
    const result = deduplicateArticles([a, b]);
    expect(result.articles).toHaveLength(2);
  });

  it('keeps distinct articles untouched', () => {
    const a = article({ id: '1', canonicalUrl: 'https://example.com/a', title: 'Article A' });
    const b = article({ id: '2', canonicalUrl: 'https://example.com/b', title: 'Article B' });
    const result = deduplicateArticles([a, b]);
    expect(result.articles).toHaveLength(2);
    expect(result.duplicateCount).toBe(0);
  });
});
