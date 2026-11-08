import * as cheerio from 'cheerio';
import { fetchWithPolicy } from '../../http.ts';
import { isSafeUrl, normalizeWhitespace } from '../../normalize.ts';
import { parseHumanDateRange } from '../../events/human-date.ts';
import { dayRangeEndMs } from '../../events/projection.ts';
import type { EventSourceConfig } from '../../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from '../types.ts';

/**
 * qgmedia.io/events: the events QG Media organises itself (ISMG summits, CS4CA, CyberSeries,
 * OTsec, ManuSec), one card per event with a linked title, a free-text excerpt such as
 * "27th – 28th October 2026 | São Paulo", and a series label. Cards without a parseable date
 * (the "Executive Dinners" series) are skipped. The organiser lists its own events, so the dates
 * are stated by the organiser.
 */
export interface QgMediaCard {
  title: string;
  url: string;
  series: string;
  dateText: string;
  place: string;
}

export function parseQgMediaCards(html: string): QgMediaCard[] {
  const $ = cheerio.load(html);
  const cards: QgMediaCard[] = [];
  for (const el of $('article.tg-item').toArray()) {
    const card = $(el);
    const anchor = card.find('.tg-item-title a').first();
    const url = anchor.attr('href');
    const excerpt = normalizeWhitespace(card.find('p.tg-item-excerpt').first().text());
    const title = normalizeWhitespace(anchor.text());
    if (!url || !title || !excerpt) continue;
    const [dateText = '', ...placeParts] = excerpt.split('|');
    cards.push({
      title,
      url,
      series: normalizeWhitespace(card.find('.tg-item-term').first().text()),
      dateText: dateText.trim(),
      place: placeParts.join('|').trim(),
    });
  }
  return cards;
}

export function qgMediaCandidates(cards: QgMediaCard[]): RawEventCandidate[] {
  const candidates: RawEventCandidate[] = [];
  for (const card of cards) {
    const range = parseHumanDateRange(card.dateText);
    if (!range || !isSafeUrl(card.url)) continue;
    const virtual = /^(virtual|online)$/i.test(card.place);
    candidates.push({
      title: card.title,
      url: card.url,
      startsAt: new Date(`${range.startDate}T00:00:00Z`).toISOString(),
      endsAt: new Date(dayRangeEndMs(range)).toISOString(),
      allDay: true,
      summary: card.series ? `${card.series}.` : '',
      location: virtual ? undefined : card.place || undefined,
      attendanceMode: virtual ? 'online' : 'offline',
      kind: 'conference',
      language: 'en',
      dateStatus: 'confirmed',
      idSuffix: card.url,
    });
  }
  return candidates.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title),
  );
}

export async function collectEventsFromQgMedia(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
): Promise<EventAdapterResult> {
  const page = await fetchWithPolicy(source.feedUrl, undefined, repositoryUrl);
  const cards = parseQgMediaCards(page.body);
  // A layout change that empties the list must show up as a failure, not as "no events".
  if (cards.length === 0) throw new Error('No event cards found on the QG Media events page');
  return { candidates: qgMediaCandidates(cards), responseTimeMs: page.responseTimeMs };
}
