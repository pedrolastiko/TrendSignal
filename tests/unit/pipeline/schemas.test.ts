import { describe, expect, it } from 'vitest';
import {
  articleSchema,
  sourceConfigSchema,
  keywordConfigSchema,
  dataManifestSchema,
} from '../../../scripts/schemas.ts';

describe('Zod schema validation', () => {
  it('accepts a valid article', () => {
    const result = articleSchema.safeParse({
      id: 'a'.repeat(64),
      title: 'Title',
      url: 'https://example.com/a',
      canonicalUrl: 'https://example.com/a',
      sourceId: 'source-1',
      sourceName: 'Source',
      company: 'Company',
      sourceCategory: 'technology',
      publishedAt: '2026-08-20T10:00:00.000Z',
      discoveredAt: '2026-08-20T10:05:00.000Z',
      summary: 'Summary',
      language: 'en',
      matchedKeywordIds: [],
      relevanceScore: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an article with a relevance score above 100', () => {
    const result = articleSchema.safeParse({
      id: 'x',
      title: 'Title',
      url: 'https://example.com/a',
      canonicalUrl: 'https://example.com/a',
      sourceId: 'source-1',
      sourceName: 'Source',
      company: 'Company',
      sourceCategory: 'technology',
      publishedAt: '2026-08-20T10:00:00.000Z',
      discoveredAt: '2026-08-20T10:05:00.000Z',
      summary: 'Summary',
      language: 'en',
      matchedKeywordIds: [],
      relevanceScore: 150,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an article with a summary longer than 320 characters', () => {
    const result = articleSchema.safeParse({
      id: 'x',
      title: 'Title',
      url: 'https://example.com/a',
      canonicalUrl: 'https://example.com/a',
      sourceId: 'source-1',
      sourceName: 'Source',
      company: 'Company',
      sourceCategory: 'technology',
      publishedAt: '2026-08-20T10:00:00.000Z',
      discoveredAt: '2026-08-20T10:05:00.000Z',
      summary: 'x'.repeat(321),
      language: 'en',
      matchedKeywordIds: [],
      relevanceScore: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an article with a malformed URL', () => {
    // Note: protocol allow-listing (rejecting javascript:/file:/data:) is enforced by
    // isSafeUrl() at collection time (see normalize.test.ts), not by the URL shape check here.
    const result = articleSchema.safeParse({
      id: 'x',
      title: 'Title',
      url: 'not a valid url at all',
      canonicalUrl: 'https://example.com/a',
      sourceId: 'source-1',
      sourceName: 'Source',
      company: 'Company',
      sourceCategory: 'technology',
      publishedAt: '2026-08-20T10:00:00.000Z',
      discoveredAt: '2026-08-20T10:05:00.000Z',
      summary: 'Summary',
      language: 'en',
      matchedKeywordIds: [],
      relevanceScore: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a source config with an unknown category', () => {
    const result = sourceConfigSchema.safeParse({
      id: 's1',
      name: 'Source',
      company: 'Company',
      category: 'not-a-real-category',
      homepageUrl: 'https://example.com',
      collectionMode: 'rss',
      feedUrl: 'https://example.com/feed',
      enabled: true,
      priority: 5,
      language: 'en',
      maxItemsPerRun: 30,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a keyword config with no terms', () => {
    const result = keywordConfigSchema.safeParse({
      id: 'k1',
      labels: { fr: 'Test', en: 'Test' },
      category: 'technology',
      terms: [],
      weight: 1,
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a manifest missing required fields', () => {
    const result = dataManifestSchema.safeParse({ schemaVersion: '1' });
    expect(result.success).toBe(false);
  });
});
