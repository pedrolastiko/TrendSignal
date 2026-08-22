import Parser from 'rss-parser';
import { fetchWithPolicy } from '../http.ts';
import { isSafeUrl } from '../normalize.ts';
import type { HttpCacheEntry, SourceConfig } from '../schemas.ts';
import type { AdapterResult, RawArticleCandidate } from './types.ts';

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
});

type RssItem = Awaited<ReturnType<Parser['parseString']>>['items'][number] & {
  mediaContent?: { $?: { url?: string } };
  mediaThumbnail?: { $?: { url?: string } };
};

function extractImageUrl(item: RssItem): string | undefined {
  const enclosureUrl = item.enclosure?.url;
  if (enclosureUrl && isSafeUrl(enclosureUrl)) return enclosureUrl;

  const mediaContentUrl = item.mediaContent?.$?.url;
  if (mediaContentUrl && isSafeUrl(mediaContentUrl)) return mediaContentUrl;

  const mediaThumbnailUrl = item.mediaThumbnail?.$?.url;
  if (mediaThumbnailUrl && isSafeUrl(mediaThumbnailUrl)) return mediaThumbnailUrl;

  const content = item.content ?? item['content:encoded'] ?? '';
  const match = /<img[^>]+src="([^"]+)"/i.exec(content);
  if (match?.[1] && isSafeUrl(match[1])) return match[1];

  return undefined;
}

export async function collectFromRss(
  source: SourceConfig,
  cacheEntry: HttpCacheEntry | undefined,
  repositoryUrl: string | undefined,
): Promise<AdapterResult> {
  const result = await fetchWithPolicy(source.feedUrl, cacheEntry, repositoryUrl);
  if (result.notModified) {
    return {
      candidates: [],
      notModified: true,
      etag: cacheEntry?.etag,
      lastModified: cacheEntry?.lastModified,
      responseTimeMs: result.responseTimeMs,
    };
  }

  const feed = await parser.parseString(result.body);
  const candidates: RawArticleCandidate[] = [];

  // RSS/Atom feeds are conventionally ordered newest-first; some publishers serve their
  // entire archive rather than just recent posts, so this cap keeps each run bounded.
  const items = (feed.items as RssItem[]).slice(0, source.maxItemsPerRun);

  for (const item of items) {
    const url = item.link;
    if (!url || !isSafeUrl(url)) continue;
    const publishedAt =
      item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : undefined);
    if (!publishedAt) continue;

    candidates.push({
      title: item.title?.trim() ?? '',
      url,
      publishedAt,
      summary: item.contentSnippet ?? item.content ?? item.summary ?? '',
      imageUrl: extractImageUrl(item),
      language: source.language,
    });
  }

  return {
    candidates,
    notModified: false,
    etag: result.etag,
    lastModified: result.lastModified,
    responseTimeMs: result.responseTimeMs,
  };
}
