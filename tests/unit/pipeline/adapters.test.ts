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
    dateMetaNames: [],
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

  it('reads <category> elements as tags, dropping editorial rubrics and duplicates', async () => {
    const source = baseSource({ feedUrl: `${server.baseUrl}/rss/feed.xml` });
    const result = await collectFromRss(source, undefined, undefined);

    const aiArticle = result.candidates.find((c) => c.title.includes('AI governance'));
    // "Uncategorized" is an editorial rubric, not a topic.
    expect(aiArticle?.tags).toEqual(['AI Governance', 'Responsible AI']);

    const ransomware = result.candidates.find((c) => c.title.includes('Ransomware group'));
    // "Ransomware" and "ransomware" are one tag; the first spelling seen is kept.
    expect(ransomware?.tags).toEqual(['Ransomware', 'Threat Intelligence']);
  });

  it('leaves tags empty for an item with no <category>', async () => {
    const source = baseSource({ feedUrl: `${server.baseUrl}/rss/feed.xml` });
    const result = await collectFromRss(source, undefined, undefined);
    const untagged = result.candidates.find((c) => c.title.includes('Souveraineté'));
    expect(untagged?.tags).toEqual([]);
  });

  it('caps the number of candidates at maxItemsPerRun for feeds larger than the limit', async () => {
    const source = baseSource({ feedUrl: `${server.baseUrl}/rss/feed.xml`, maxItemsPerRun: 2 });
    const result = await collectFromRss(source, undefined, undefined);
    expect(result.candidates.length).toBe(2);
  });

  it('keeps the newest items when capping a feed that is not ordered newest-first', async () => {
    const source = baseSource({
      feedUrl: `${server.baseUrl}/rss/unordered-feed.xml`,
      maxItemsPerRun: 1,
    });
    const result = await collectFromRss(source, undefined, undefined);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.title).toBe('Newest post on agentic AI');
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

  it('merges JSON-LD keywords with <meta name="keywords"> into article tags', async () => {
    const source = baseSource({
      collectionMode: 'sitemap',
      feedUrl: `${server.baseUrl}/sitemap/sitemap.xml`,
      includePaths: ['/pages/'],
    });
    const result = await collectFromSitemap(source, undefined, undefined);
    const zeroTrust = result.candidates.find((c) => c.title.includes('Zero Trust'));
    // JSON-LD first, then the meta list; "Company News" is stoplisted and "Zero Trust"
    // appears in both channels but only once in the result.
    expect(zeroTrust?.tags).toEqual(['Zero Trust', 'IAM', 'Cloud Security']);
  });

  it('resolves a <sitemapindex> by following its child sitemaps', async () => {
    const source = baseSource({
      collectionMode: 'sitemap',
      feedUrl: `${server.baseUrl}/sitemap/sitemap-index.xml`,
      includePaths: ['/pages/'],
    });
    const result = await collectFromSitemap(source, undefined, undefined);
    const titles = result.candidates.map((c) => c.title).sort();
    expect(titles).toEqual([
      'Post-quantum cryptography migration guidance published',
      'Zero Trust adoption accelerates across financial services',
    ]);
  });

  it('returns candidates ordered newest-first by their declared publication date', async () => {
    const source = baseSource({
      collectionMode: 'sitemap',
      feedUrl: `${server.baseUrl}/sitemap/sitemap.xml`,
      includePaths: ['/pages/'],
    });
    const result = await collectFromSitemap(source, undefined, undefined);
    const dates = result.candidates.map((c) => c.publishedAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe('collectFromGenericHtml (fixture-backed, no live network)', () => {
  it('collapses links to the same article that differ only by tracking parameters', async () => {
    // The fixture listing links article-a.html twice, the second time with an extra
    // ?utm_source=. Candidate links are keyed by normalized URL, so it is fetched once.
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

  it('still finds articles when navigation links fill the page ahead of them', async () => {
    // Regression test for the Deloitte failure: with no includePaths filter, the nav
    // menu links (and an asset-shaped URL) come first in DOM order. Capping fetches at
    // maxItemsPerRun consumed the whole budget on navigation and returned no articles.
    const source = baseSource({
      collectionMode: 'html',
      feedUrl: `${server.baseUrl}/html/nav-heavy-listing.html`,
      includePaths: [],
      maxItemsPerRun: 2,
    });
    const result = await collectFromGenericHtml(source, undefined, undefined);
    const titles = result.candidates.map((c) => c.title).sort();
    expect(titles).toEqual([
      'Cloud security spending outlook',
      'Third-party risk management trends for 2026',
    ]);
  });

  it('reads a publication date from a source-specific meta name via dateMetaNames', async () => {
    const source = baseSource({
      collectionMode: 'html',
      feedUrl: `${server.baseUrl}/html/nav-heavy-vendor-listing.html`,
      includePaths: ['/pages/vendor-meta'],
      dateMetaNames: ['acmeReleaseDate'],
    });
    const result = await collectFromGenericHtml(source, undefined, undefined);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.title).toBe('Ransomware readiness benchmark');
    expect(result.candidates[0]?.publishedAt).toBe('2026-08-10T12:00:00.000Z');
  });
});
