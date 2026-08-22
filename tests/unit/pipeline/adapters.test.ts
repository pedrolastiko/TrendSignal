import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { startFixtureServer, type FixtureServerHandle } from '../../../scripts/fixture-server.ts';
import { collectFromRss } from '../../../scripts/adapters/rss.ts';
import { collectFromSitemap } from '../../../scripts/adapters/sitemap.ts';
import { collectFromGenericHtml } from '../../../scripts/adapters/generic-html.ts';
import type { SourceConfig } from '../../../scripts/schemas.ts';

let server: FixtureServerHandle;

beforeAll(async () => {
  server = await startFixtureServer(join(process.cwd(), 'tests/fixtures'));
});

afterAll(async () => {
  await server.close();
});

function baseSource(overrides: Partial<SourceConfig>): SourceConfig {
  return {
    id: 'test-source',
    name: 'Test Source',
    company: 'Test Co',
    category: 'technology',
    homepageUrl: 'https://example.com',
    collectionMode: 'rss',
    feedUrl: 'https://example.com/feed',
    enabled: true,
    priority: 5,
    language: 'en',
    maxItemsPerRun: 30,
    includePaths: [],
    excludePaths: [],
    ...overrides,
  };
}

describe('collectFromRss (fixture-backed, no live network)', () => {
  it('parses all items from the fixture RSS feed', async () => {
    const source = baseSource({ collectionMode: 'rss', feedUrl: `${server.baseUrl}/rss/feed.xml` });
    const result = await collectFromRss(source, undefined, undefined);
    expect(result.notModified).toBe(false);
    expect(result.candidates.length).toBe(4);
    const titles = result.candidates.map((c) => c.title);
    expect(titles).toContain('New AI governance framework announced for enterprise deployments');
  });

  it('extracts an enclosure image and strips HTML from the summary', async () => {
    const source = baseSource({ feedUrl: `${server.baseUrl}/rss/feed.xml` });
    const result = await collectFromRss(source, undefined, undefined);
    const aiArticle = result.candidates.find((c) => c.title.includes('AI governance'));
    expect(aiArticle?.imageUrl).toBe('https://example-security.test/images/ai-governance.jpg');
  });
});

describe('collectFromSitemap (fixture-backed, no live network)', () => {
  it('follows sitemap URLs and extracts per-page metadata, dropping non-article pages', async () => {
    const source = baseSource({
      collectionMode: 'sitemap',
      feedUrl: `${server.baseUrl}/sitemap/sitemap.xml`,
      includePaths: ['/pages/'],
    });
    const result = await collectFromSitemap(source, undefined, undefined);
    expect(result.candidates).toHaveLength(2);
    const titles = result.candidates.map((c) => c.title).sort();
    expect(titles).toEqual([
      'Post-quantum cryptography migration guidance published',
      'Zero Trust adoption accelerates across financial services',
    ]);
  });
});

describe('collectFromGenericHtml (fixture-backed, no live network)', () => {
  it('extracts article metadata for every distinct link on the listing page', async () => {
    // The adapter itself does not deduplicate — the fixture listing page links to
    // article-a.html twice (once with an extra ?utm_source= tracking param), so both
    // resolve and are fetched; deduplicateArticles() is what collapses these later
    // in the pipeline (see deduplicate.test.ts).
    const source = baseSource({
      collectionMode: 'html',
      feedUrl: `${server.baseUrl}/html/listing.html`,
      includePaths: ['/pages/article'],
    });
    const result = await collectFromGenericHtml(source, undefined, undefined);
    const titles = result.candidates.map((c) => c.title).sort();
    expect(titles).toEqual([
      'Cloud security spending outlook',
      'Third-party risk management trends for 2026',
      'Third-party risk management trends for 2026',
    ]);
  });

  it('excludes links outside includePaths (nav links like About/Careers)', async () => {
    const source = baseSource({
      collectionMode: 'html',
      feedUrl: `${server.baseUrl}/html/listing.html`,
      includePaths: ['/pages/article'],
    });
    const result = await collectFromGenericHtml(source, undefined, undefined);
    const titles = result.candidates.map((c) => c.title);
    expect(titles).not.toContain('About');
    expect(titles).not.toContain('Careers');
  });
});
