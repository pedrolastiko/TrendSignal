import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractArticleMetadata } from '../../../scripts/adapters/html-metadata.ts';

const FIXTURE_BASE = 'tests/fixtures';

function loadFixture(path: string): string {
  return readFileSync(`${FIXTURE_BASE}/${path}`, 'utf-8').replaceAll(
    '{{BASE_URL}}',
    'https://fixture.test',
  );
}

describe('extractArticleMetadata', () => {
  it('extracts metadata from JSON-LD NewsArticle (highest priority)', () => {
    const html = loadFixture('sitemap/pages/article-1.html');
    const result = extractArticleMetadata(html, 'https://fixture.test/article-1.html');
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Zero Trust adoption accelerates across financial services');
    expect(result?.publishedAt).toBe('2026-08-19T10:00:00.000Z');
    expect(result?.updatedAt).toBe('2026-08-19T11:00:00.000Z');
    expect(result?.imageUrl).toBe('https://fixture.test/sitemap/pages/zero-trust.jpg');
    expect(result?.summary).toContain('Zero Trust');
  });

  it('falls back to Open Graph metadata when JSON-LD is absent', () => {
    const html = loadFixture('sitemap/pages/article-2.html');
    const result = extractArticleMetadata(html, 'https://fixture.test/article-2.html');
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Post-quantum cryptography migration guidance published');
    expect(result?.publishedAt).toBe('2026-08-18T10:00:00.000Z');
    expect(result?.imageUrl).toBe('https://fixture.test/sitemap/pages/pqc.jpg');
  });

  it('returns null when the page has no usable title/date', () => {
    const html = loadFixture('sitemap/pages/not-an-article.html');
    const result = extractArticleMetadata(html, 'https://fixture.test/not-an-article.html');
    expect(result).toBeNull();
  });

  it('extracts a JSON-LD image expressed as an object with a url field', () => {
    const html = loadFixture('html/pages/article-a.html');
    const result = extractArticleMetadata(html, 'https://fixture.test/article-a.html');
    expect(result?.imageUrl).toBe('https://fixture.test/html/pages/tprm.jpg');
  });

  it('drops an unsafe image URL rather than throwing', () => {
    const html = `<!doctype html><html><head><title>T</title>
      <script type="application/ld+json">{"@type":"Article","headline":"T","datePublished":"2026-08-01T00:00:00Z","image":"javascript:alert(1)"}</script>
      </head><body></body></html>`;
    const result = extractArticleMetadata(html, 'https://fixture.test/t');
    expect(result?.imageUrl).toBeUndefined();
  });
});
