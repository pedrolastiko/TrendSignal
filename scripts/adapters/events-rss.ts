import Parser from 'rss-parser';
import { fetchWithPolicy } from '../http.ts';
import { isSafeUrl } from '../normalize.ts';
import type { EventSourceConfig } from '../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from './types.ts';

const parser = new Parser();

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * In an events feed `pubDate` is the event start, not a publication date (NIST's does this).
 * A start at exactly 00:00:00 in the feed's own offset is how date-only events appear, so it
 * is read as an all-day event on the date as written, whatever the offset.
 */
export function parseRssEventStart(pubDate: string): { startsAt: string; allDay: boolean } | null {
  const midnight = /(\d{1,2}) ([A-Za-z]{3}) (\d{4}) 00:00:00 /.exec(pubDate);
  if (midnight) {
    const month = MONTHS[(midnight[2] ?? '').toLowerCase()];
    if (month !== undefined) {
      const ms = Date.UTC(Number(midnight[3]), month, Number(midnight[1]));
      return { startsAt: new Date(ms).toISOString(), allDay: true };
    }
  }
  const time = new Date(pubDate).getTime();
  if (Number.isNaN(time)) return null;
  return { startsAt: new Date(time).toISOString(), allDay: false };
}

export async function collectEventsFromRss(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
): Promise<EventAdapterResult> {
  const result = await fetchWithPolicy(source.feedUrl, undefined, repositoryUrl);
  const feed = await parser.parseString(result.body);

  const candidates: RawEventCandidate[] = [];
  for (const item of feed.items) {
    if (!item.link || !isSafeUrl(item.link) || !item.pubDate) continue;
    const start = parseRssEventStart(item.pubDate);
    if (!start) continue;
    candidates.push({
      title: item.title?.trim() ?? '',
      url: item.link,
      startsAt: start.startsAt,
      allDay: start.allDay,
      summary: item.contentSnippet ?? item.content ?? '',
      categories: item.categories ?? [],
      language: source.language,
    });
  }
  return { candidates, responseTimeMs: result.responseTimeMs };
}
