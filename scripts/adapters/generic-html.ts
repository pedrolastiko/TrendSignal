import pLimit from 'p-limit';
import * as cheerio from 'cheerio';
import { fetchWithPolicy } from '../http.ts';
import { isSafeUrl, normalizeUrl } from '../normalize.ts';
import type { HttpCacheEntry, SourceConfig } from '../schemas.ts';
import { extractArticleMetadata } from './html-metadata.ts';
import type { AdapterResult, RawArticleCandidate } from './types.ts';

const PAGE_FETCH_CONCURRENCY = 4;

/**
 * A listing page links to far more than its articles — navigation, section
 * indexes, and repeated links to the same article under different tracking
 * parameters. Fetching only `maxItemsPerRun` links therefore starves the
 * article budget, so we probe a larger pool and cap the *articles* instead.
 */
const LINK_PROBE_MULTIPLIER = 5;
const MAX_LINKS_PROBED = 150;

const ASSET_EXTENSION_PATTERN =
  /\.(css|js|mjs|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|pdf|zip|mp[34]|webm)$/i;

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
  // Keyed by normalized URL so the same article linked with different tracking
  // parameters occupies a single slot; the value keeps the original href to fetch.
  const links = new Map<string, string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const resolved = new URL(href, base);
      if (resolved.hostname !== base.hostname) return;
      if (!isSafeUrl(resolved.toString())) return;
      resolved.hash = '';
      if (ASSET_EXTENSION_PATTERN.test(resolved.pathname)) return;
      if (!matchesPathFilters(resolved.pathname, source.includePaths, source.excludePaths)) return;
      const key = normalizeUrl(resolved.toString());
      if (!links.has(key)) links.set(key, resolved.toString());
    } catch {
      // Ignore unparsable hrefs (mailto:, javascript:, etc.).
    }
  });

  return Array.from(links.values()).slice(0, limit);
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

  const probeBudget = Math.min(source.maxItemsPerRun * LINK_PROBE_MULTIPLIER, MAX_LINKS_PROBED);
  const links = extractCandidateLinks(listing.body, source.feedUrl, source, probeBudget);
  const limit = pLimit(PAGE_FETCH_CONCURRENCY);

  const pages = await Promise.all(
    links.map((link) =>
      limit(async (): Promise<RawArticleCandidate | null> => {
        try {
          const page = await fetchWithPolicy(link, undefined, repositoryUrl);
          if (page.notModified) return null;
          return extractArticleMetadata(page.body, link, { dateMetaNames: source.dateMetaNames });
        } catch {
          return null;
        }
      }),
    ),
  );

  // Newest first, so the per-run cap keeps the most recent articles regardless of
  // where they happened to sit in the listing page's DOM order.
  const candidates = pages
    .filter((c): c is RawArticleCandidate => c !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, source.maxItemsPerRun);

  return {
    candidates,
    notModified: false,
    etag: listing.etag,
    lastModified: listing.lastModified,
    responseTimeMs: listing.responseTimeMs,
  };
}
