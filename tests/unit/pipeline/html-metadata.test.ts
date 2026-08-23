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

  it('falls back to standard HTML date metadata when JSON-LD and Open Graph carry no date', () => {
    const html = loadFixture('html/pages/standard-meta.html');
    const result = extractArticleMetadata(html, 'https://fixture.test/standard-meta.html');
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Zero Trust rollout guidance');
    expect(result?.publishedAt).toBe('2026-08-15T09:30:00.000Z');
  });

  it('returns null for a publisher-specific date meta unless the source declares it', () => {
    const html = loadFixture('html/pages/vendor-meta.html');
    expect(extractArticleMetadata(html, 'https://fixture.test/vendor-meta.html')).toBeNull();
  });

  it('reads a publisher-specific date meta named in dateMetaNames', () => {
    const html = loadFixture('html/pages/vendor-meta.html');
    const result = extractArticleMetadata(html, 'https://fixture.test/vendor-meta.html', {
      dateMetaNames: ['acmeReleaseDate'],
    });
    expect(result?.publishedAt).toBe('2026-08-10T12:00:00.000Z');
    expect(result?.summary).toContain('ransomware readiness');
  });

  it('prefers JSON-LD over a standard date meta when both are present', () => {
    const html = `<!doctype html><html><head><title>T</title>
      <meta name="date" content="2020-01-01T00:00:00Z" />
      <script type="application/ld+json">{"@type":"Article","headline":"T","datePublished":"2026-05-05T00:00:00Z"}</script>
      </head><body></body></html>`;
    const result = extractArticleMetadata(html, 'https://fixture.test/t');
    expect(result?.publishedAt).toBe('2026-05-05T00:00:00.000Z');
  });

  it('falls back to a semantic <time datetime> element', () => {
    const html = `<!doctype html><html><head><meta property="og:title" content="Timed post" /></head>
      <body><article><time datetime="2026-07-04T08:00:00Z">4 July 2026</time></article></body></html>`;
    const result = extractArticleMetadata(html, 'https://fixture.test/timed');
    expect(result?.title).toBe('Timed post');
    expect(result?.publishedAt).toBe('2026-07-04T08:00:00.000Z');
  });

  it('drops an unsafe image URL rather than throwing', () => {
    const html = `<!doctype html><html><head><title>T</title>
      <script type="application/ld+json">{"@type":"Article","headline":"T","datePublished":"2026-08-01T00:00:00Z","image":"javascript:alert(1)"}</script>
      </head><body></body></html>`;
    const result = extractArticleMetadata(html, 'https://fixture.test/t');
    expect(result?.imageUrl).toBeUndefined();
  });
});
