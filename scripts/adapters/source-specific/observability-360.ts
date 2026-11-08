import * as cheerio from 'cheerio';
import { fetchWithPolicy } from '../../http.ts';
import { isSafeUrl, normalizeWhitespace } from '../../normalize.ts';
import { dayRangeEndMs, type DayRange } from '../../events/projection.ts';
import type { EventSourceConfig } from '../../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from '../types.ts';

/**
 * observability-360.com/Calendar/Events: a hand-maintained page, one block per event with a
 * heading, a date written for people ("23-24 Oct 2025"), a place, and a "More information" link.
 * Each event appears twice (a card and a summary row), so blocks are merged on their link.
 */
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const MONTH =
  '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DASH = '\\s*[-–—]\\s*';
const CROSS_MONTH = new RegExp(
  `(\\d{1,2})\\s+${MONTH}${DASH}(\\d{1,2})\\s+${MONTH}\\s+(\\d{4})`,
  'i',
);
const SAME_MONTH = new RegExp(`(\\d{1,2})${DASH}(\\d{1,2})\\s+${MONTH}\\s+(\\d{4})`, 'i');
const SINGLE_DAY = new RegExp(`(\\d{1,2})\\s+${MONTH}\\s+(\\d{4})`, 'i');

function day(year: number, month: number, d: number): string {
  return new Date(Date.UTC(year, month - 1, d)).toISOString().slice(0, 10);
}

/** "23-24 Oct 2025", "30 Nov - 2 Dec 2025" or "10 November 2025", with where it was found in the text. */
export function parseHumanDateRange(
  text: string,
): (DayRange & { index: number; length: number }) | null {
  const month = (name: string) => MONTHS[name.toLowerCase()] as number;

  let m = CROSS_MONTH.exec(text);
  if (m) {
    const [, d1, m1, d2, m2, year] = m;
    const endMonth = month(m2 as string);
    const startMonth = month(m1 as string);
    // "29 Dec - 2 Jan 2026": the start belongs to the year before.
    const startYear = startMonth > endMonth ? Number(year) - 1 : Number(year);
    return {
      startDate: day(startYear, startMonth, Number(d1)),
      endDate: day(Number(year), endMonth, Number(d2)),
      index: m.index,
      length: m[0].length,
    };
  }
  m = SAME_MONTH.exec(text);
  if (m) {
    const [, d1, d2, mon, year] = m;
    return {
      startDate: day(Number(year), month(mon as string), Number(d1)),
      endDate: day(Number(year), month(mon as string), Number(d2)),
      index: m.index,
      length: m[0].length,
    };
  }
  m = SINGLE_DAY.exec(text);
  if (m) {
    const [, d1, mon, year] = m;
    return {
      startDate: day(Number(year), month(mon as string), Number(d1)),
      index: m.index,
      length: m[0].length,
    };
  }
  return null;
}

export interface ObservabilityEvent extends DayRange {
  name: string;
  url: string;
  location: string;
  hybrid: boolean;
}

export function parseObservabilityPage(html: string): ObservabilityEvent[] {
  const $ = cheerio.load(html);
  const byUrl = new Map<string, ObservabilityEvent>();

  for (const row of $('div.row').toArray()) {
    const el = $(row);
    const name = normalizeWhitespace(el.find('h1,h2,h3,h4,h5').first().text());
    const url = el.find('a[href^="http"]').first().attr('href');
    if (!name || !url || !isSafeUrl(url) || byUrl.has(url)) continue;

    const text = normalizeWhitespace(el.text());
    const date = parseHumanDateRange(text.slice(name.length));
    if (!date) continue;
    const after = text.slice(name.length + date.index + date.length).trim();
    // The place runs up to the cost, a tag ("Co-located CNCF event") or the link text.
    const location = (
      after.split(/\b(?:Free|Co-located|More information)\b|[$€£]\s?\d/)[0] ?? ''
    ).trim();

    byUrl.set(url, {
      name,
      url,
      location,
      hybrid: /\bhybrid\b/i.test(text),
      startDate: date.startDate,
      endDate: date.endDate,
    });
  }
  return [...byUrl.values()];
}

export function observabilityCandidates(events: ObservabilityEvent[]): RawEventCandidate[] {
  return events.map((event) => ({
    title: event.name,
    url: event.url,
    startsAt: new Date(`${event.startDate}T00:00:00Z`).toISOString(),
    endsAt: new Date(dayRangeEndMs(event)).toISOString(),
    allDay: true,
    summary: '',
    location: event.location || undefined,
    attendanceMode: /^(virtual|online)$/i.test(event.location)
      ? 'online'
      : event.hybrid
        ? 'mixed'
        : 'offline',
    // A calendar page reports dates; it is not the organiser stating them.
    dateStatus: 'estimated',
    language: 'en',
  }));
}

export async function collectEventsFromObservability360(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
): Promise<EventAdapterResult> {
  const page = await fetchWithPolicy(source.feedUrl, undefined, repositoryUrl);
  const events = parseObservabilityPage(page.body);
  // A layout change that hides every block must show up as a failure, not as "no events".
  if (events.length === 0) throw new Error('No events found on the calendar page');
  return { candidates: observabilityCandidates(events), responseTimeMs: page.responseTimeMs };
}
