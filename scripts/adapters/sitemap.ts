import { XMLParser } from 'fast-xml-parser';
import pLimit from 'p-limit';
import { fetchWithPolicy } from '../http.ts';
import { isSafeUrl } from '../normalize.ts';
import type { HttpCacheEntry, SourceConfig } from '../schemas.ts';
import { extractArticleMetadata } from './html-metadata.ts';
import type { AdapterResult, RawArticleCandidate } from './types.ts';

const PAGE_FETCH_CONCURRENCY = 4;
const xmlParser = new XMLParser({ ignoreAttributes: false });

interface SitemapUrlEntry {
  loc?: string;
  lastmod?: string;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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

  const parsed: unknown = xmlParser.parse(sitemap.body);
  const root = parsed as { urlset?: { url?: SitemapUrlEntry | SitemapUrlEntry[] } };
  const entries = toArray(root.urlset?.url).filter(
    (entry): entry is SitemapUrlEntry & { loc: string } =>
      Boolean(entry.loc && isSafeUrl(entry.loc)),
  );

  const filtered = entries.filter((entry) => {
    try {
      const pathname = new URL(entry.loc).pathname;
      return matchesPathFilters(pathname, source.includePaths, source.excludePaths);
    } catch {
      return false;
    }
  });

  const sorted = filtered.sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''));
  const candidatesUrls = sorted.slice(0, source.maxItemsPerRun);

  const limit = pLimit(PAGE_FETCH_CONCURRENCY);
  const pages = await Promise.all(
    candidatesUrls.map((entry) =>
      limit(async (): Promise<RawArticleCandidate | null> => {
        try {
          const page = await fetchWithPolicy(entry.loc, undefined, repositoryUrl);
          if (page.notModified) return null;
          return extractArticleMetadata(page.body, entry.loc);
        } catch {
          return null;
        }
      }),
    ),
  );

  return {
    candidates: pages.filter((c): c is RawArticleCandidate => c !== null),
    notModified: false,
    etag: sitemap.etag,
    lastModified: sitemap.lastModified,
    responseTimeMs: sitemap.responseTimeMs,
  };
}
