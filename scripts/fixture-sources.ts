import type { SourceConfig } from './schemas.ts';

/**
 * Local fixture sources used by `collect:fixtures` and `generate:demo` so the
 * full pipeline (fetch -> normalize -> dedupe -> match -> score -> trends) can
 * run end-to-end against served fixture files, without contacting any live
 * publisher. Paths are relative to the fixture HTTP server root (tests/fixtures).
 */
export function buildFixtureSources(baseUrl: string): SourceConfig[] {
  return [
    {
      id: 'fixture-rss-source',
      name: 'Fixture Security Blog',
      company: 'Fixture Security Co',
      category: 'cybersecurity',
      homepageUrl: `${baseUrl}/rss/`,
      collectionMode: 'rss',
      feedUrl: `${baseUrl}/rss/feed.xml`,
      enabled: true,
      priority: 6,
      language: 'en',
      maxItemsPerRun: 30,
      includePaths: [],
      excludePaths: [],
    },
    {
      id: 'fixture-sitemap-source',
      name: 'Fixture Sitemap Publisher',
      company: 'Fixture Publisher Co',
      category: 'technology',
      homepageUrl: `${baseUrl}/sitemap/`,
      collectionMode: 'sitemap',
      feedUrl: `${baseUrl}/sitemap/sitemap.xml`,
      enabled: true,
      priority: 5,
      language: 'en',
      maxItemsPerRun: 30,
      includePaths: ['/pages/'],
      excludePaths: [],
    },
    {
      id: 'fixture-html-source',
      name: 'Fixture Consulting Insights',
      company: 'Fixture Consulting',
      category: 'consulting',
      homepageUrl: `${baseUrl}/html/`,
      collectionMode: 'html',
      feedUrl: `${baseUrl}/html/listing.html`,
      enabled: true,
      priority: 4,
      language: 'en',
      maxItemsPerRun: 30,
      includePaths: ['/pages/article'],
      excludePaths: [],
    },
  ];
}
