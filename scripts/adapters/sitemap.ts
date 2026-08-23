import { XMLParser } from 'fast-xml-parser';
import pLimit from 'p-limit';
import { fetchWithPolicy } from '../http.ts';
import { isSafeUrl } from '../normalize.ts';
import type { HttpCacheEntry, SourceConfig } from '../schemas.ts';
import { extractArticleMetadata } from './html-metadata.ts';
import type { AdapterResult, RawArticleCandidate } from './types.ts';

const PAGE_FETCH_CONCURRENCY = 4;
/** Child sitemaps pulled from a <sitemapindex>, newest-first; bounded to keep runs cheap. */
const MAX_CHILD_SITEMAPS = 3;
const URL_PROBE_MULTIPLIER = 5;
const MAX_URLS_PROBED = 150;
const xmlParser = new XMLParser({ ignoreAttributes: false });

interface SitemapUrlEntry {
  loc?: string;
  lastmod?: string;
}

interface ParsedSitemap {
  urlset?: { url?: SitemapUrlEntry | SitemapUrlEntry[] };
  sitemapindex?: { sitemap?: SitemapUrlEntry | SitemapUrlEntry[] };
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function readUrlEntries(parsed: ParsedSitemap): (SitemapUrlEntry & { loc: string })[] {
  return toArray(parsed.urlset?.url).filter((entry): entry is SitemapUrlEntry & { loc: string } =>
    Boolean(entry.loc && isSafeUrl(entry.loc)),
  );
}

function matchesPathFilters(
  pathname: string,
  includePaths: string[],
  excludePaths: string[],
): boolean {
  if (excludePaths.some((p) => pathname.includes(p))) return false;
  if (includePaths.length > 0) return includePaths.some((p) => pathname.includes(p));
  return true;
}

export async function collectFromSitemap(
  source: SourceConfig,
  cacheEntry: HttpCacheEntry | undefined,
  repositoryUrl: string | undefined,
): Promise<AdapterResult> {
  const sitemap = await fetchWithPolicy(source.feedUrl, cacheEntry, repositoryUrl);
  if (sitemap.notModified) {
    return {
      candidates: [],
      notModified: true,
      etag: cacheEntry?.etag,
      lastModified: cacheEntry?.lastModified,
      responseTimeMs: sitemap.responseTimeMs,
    };
  }

  const root = xmlParser.parse(sitemap.body) as ParsedSitemap;
  let entries = readUrlEntries(root);

  // A <sitemapindex> lists child sitemaps rather than pages; follow the most recently
  // modified ones so an index URL works as a feedUrl just like a plain <urlset> does.
  if (entries.length === 0 && root.sitemapindex) {
    const children = toArray(root.sitemapindex.sitemap)
      .filter((child): child is SitemapUrlEntry & { loc: string } =>
        Boolean(child.loc && isSafeUrl(child.loc)),
      )
      .sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''))
      .slice(0, MAX_CHILD_SITEMAPS);

    const childLimit = pLimit(PAGE_FETCH_CONCURRENCY);
    const childEntries = await Promise.all(
      children.map((child) =>
        childLimit(async () => {
          try {
            const childSitemap = await fetchWithPolicy(child.loc, undefined, repositoryUrl);
            if (childSitemap.notModified) return [];
            return readUrlEntries(xmlParser.parse(childSitemap.body) as ParsedSitemap);
          } catch {
            return [];
          }
        }),
      ),
    );
    entries = childEntries.flat();
  }

  const filtered = entries.filter((entry) => {
    try {
      const pathname = new URL(entry.loc).pathname;
      return matchesPathFilters(pathname, source.includePaths, source.excludePaths);
    } catch {
      return false;
    }
  });

  // Probe more URLs than we intend to keep: sitemaps mix articles with section and
  // landing pages that carry no publication date and get dropped during extraction,
  // so capping fetches at maxItemsPerRun would starve the article budget.
  const sorted = filtered.sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''));
  const probeBudget = Math.min(source.maxItemsPerRun * URL_PROBE_MULTIPLIER, MAX_URLS_PROBED);
  const candidatesUrls = sorted.slice(0, probeBudget);

  const limit = pLimit(PAGE_FETCH_CONCURRENCY);
  const pages = await Promise.all(
    candidatesUrls.map((entry) =>
      limit(async (): Promise<RawArticleCandidate | null> => {
        try {
          const page = await fetchWithPolicy(entry.loc, undefined, repositoryUrl);
          if (page.notModified) return null;
          return extractArticleMetadata(page.body, entry.loc, {
            dateMetaNames: source.dateMetaNames,
          });
        } catch {
          return null;
        }
      }),
    ),
  );

  // `lastmod` reflects CMS republication and often runs far ahead of the real
  // editorial date, so re-sort on the publication date the pages actually declare.
  const candidates = pages
    .filter((c): c is RawArticleCandidate => c !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, source.maxItemsPerRun);

  return {
    candidates,
    notModified: false,
    etag: sitemap.etag,
    lastModified: sitemap.lastModified,
    responseTimeMs: sitemap.responseTimeMs,
  };
}
