import pLimit from 'p-limit';
import * as cheerio from 'cheerio';
import { fetchWithPolicy } from '../http.ts';
import { isSafeUrl } from '../normalize.ts';
import type { HttpCacheEntry, SourceConfig } from '../schemas.ts';
import { extractArticleMetadata } from './html-metadata.ts';
import type { AdapterResult, RawArticleCandidate } from './types.ts';

const PAGE_FETCH_CONCURRENCY = 4;

function matchesPathFilters(
  pathname: string,
  includePaths: string[],
  excludePaths: string[],
): boolean {
  if (excludePaths.some((p) => pathname.includes(p))) return false;
  if (includePaths.length > 0) return includePaths.some((p) => pathname.includes(p));
  return true;
}

function extractCandidateLinks(
  html: string,
  pageUrl: string,
  source: SourceConfig,
  limit: number,
): string[] {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const resolved = new URL(href, base);
      if (resolved.hostname !== base.hostname) return;
      if (!isSafeUrl(resolved.toString())) return;
      resolved.hash = '';
      if (!matchesPathFilters(resolved.pathname, source.includePaths, source.excludePaths)) return;
      links.add(resolved.toString());
    } catch {
      // Ignore unparsable hrefs (mailto:, javascript:, etc.).
    }
  });

  return Array.from(links).slice(0, limit);
}

export async function collectFromGenericHtml(
  source: SourceConfig,
  cacheEntry: HttpCacheEntry | undefined,
  repositoryUrl: string | undefined,
): Promise<AdapterResult> {
  const listing = await fetchWithPolicy(source.feedUrl, cacheEntry, repositoryUrl);
  if (listing.notModified) {
    return {
      candidates: [],
      notModified: true,
      etag: cacheEntry?.etag,
      lastModified: cacheEntry?.lastModified,
      responseTimeMs: listing.responseTimeMs,
    };
  }

  const links = extractCandidateLinks(listing.body, source.feedUrl, source, source.maxItemsPerRun);
  const limit = pLimit(PAGE_FETCH_CONCURRENCY);

  const pages = await Promise.all(
    links.map((link) =>
      limit(async (): Promise<RawArticleCandidate | null> => {
        try {
          const page = await fetchWithPolicy(link, undefined, repositoryUrl);
          if (page.notModified) return null;
          return extractArticleMetadata(page.body, link);
        } catch {
          return null;
        }
      }),
    ),
  );

  return {
    candidates: pages.filter((c): c is RawArticleCandidate => c !== null),
    notModified: false,
    etag: listing.etag,
    lastModified: listing.lastModified,
    responseTimeMs: listing.responseTimeMs,
  };
}
