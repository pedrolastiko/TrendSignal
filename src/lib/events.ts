import type { Continent, EventFormat, EventItem, EventKind } from '../types';

/** In the order they are listed. */
export const CONTINENTS: readonly Continent[] = [
  'north-america',
  'south-america',
  'europe',
  'asia',
  'africa',
  'oceania',
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Mirrors the pipeline: a timed event with no stated end is assumed to last this long. */
const DEFAULT_DURATION_MS = 2 * HOUR_MS;

export type EventPeriod = '7d' | '30d' | '90d' | 'all';

export interface EventFilters {
  kind: 'all' | EventKind;
  format: 'all' | EventFormat;
  keywordId: string;
  sourceId: string;
  period: EventPeriod;
  dateStatus: 'all' | 'confirmed';
  /** Online events have no continent, so choosing one leaves them out. */
  continent: 'all' | Continent;
}

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  kind: 'all',
  format: 'all',
  keywordId: 'all',
  sourceId: 'all',
  period: 'all',
  dateStatus: 'all',
  continent: 'all',
};

const PERIOD_DAYS: Record<Exclude<EventPeriod, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** When the event is over; all-day ends are exclusive, so a one-day event ends the next midnight UTC. */
export function eventEndMs(event: Pick<EventItem, 'startsAt' | 'endsAt' | 'allDay'>): number {
  if (event.endsAt) return Date.parse(event.endsAt);
  return Date.parse(event.startsAt) + (event.allDay ? DAY_MS : DEFAULT_DURATION_MS);
}

/** The data can be hours old, so ended events are dropped again in the browser. */
export function isUpcomingEvent(event: EventItem, now: number = Date.now()): boolean {
  return eventEndMs(event) > now;
}

export function filterEvents(
  events: EventItem[],
  filters: EventFilters,
  now: number = Date.now(),
): EventItem[] {
  const horizon = filters.period === 'all' ? Infinity : now + PERIOD_DAYS[filters.period] * DAY_MS;
  return events.filter((event) => {
    if (!isUpcomingEvent(event, now)) return false;
    if (filters.kind !== 'all' && event.kind !== filters.kind) return false;
    if (filters.format !== 'all' && event.format !== filters.format) return false;
    if (filters.keywordId !== 'all' && !event.matchedKeywordIds.includes(filters.keywordId))
      return false;
    if (filters.sourceId !== 'all' && event.sourceId !== filters.sourceId) return false;
    if (filters.dateStatus === 'confirmed' && event.dateStatus !== 'confirmed') return false;
    if (filters.continent !== 'all' && event.continent !== filters.continent) return false;
    return Date.parse(event.startsAt) <= horizon;
  });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The calendar day an event is listed under: the reader's own for timed events, UTC for all-day ones. */
export function eventDayKey(event: EventItem, timeZone?: string): string {
  const start = new Date(event.startsAt);
  if (event.allDay) return event.startsAt.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(start);
  return parts || `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

export interface EventDayGroup {
  dayKey: string;
  events: EventItem[];
}

/** Groups already-sorted events by day, keeping their order. */
export function groupEventsByDay(events: EventItem[], timeZone?: string): EventDayGroup[] {
  const groups: EventDayGroup[] = [];
  for (const event of events) {
    const dayKey = eventDayKey(event, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.dayKey === dayKey) last.events.push(event);
    else groups.push({ dayKey, events: [event] });
  }
  return groups;
}

function intlLocale(locale: string): string {
  return locale === 'fr' ? 'fr-FR' : 'en-US';
}

/** Heading for a day group, e.g. "Tuesday, November 10". A day key is a plain date, shown as is. */
export function formatDayHeading(dayKey: string, locale: string): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "10:00 AM EST – 11:00 AM EST" for a timed event in the reader's zone; the date range for an all-day one. */
export function formatEventWhen(event: EventItem, locale: string, timeZone?: string): string {
  const loc = intlLocale(locale);
  const start = new Date(event.startsAt);

  if (event.allDay) {
    const lastDay = new Date(
      (event.endsAt ? Date.parse(event.endsAt) : start.getTime() + DAY_MS) - DAY_MS,
    );
    const format = new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeZone: 'UTC' });
    return lastDay.getTime() > start.getTime()
      ? format.formatRange(start, lastDay)
      : format.format(start);
  }

  const time = new Intl.DateTimeFormat(loc, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  });
  const from = time.format(start);
  if (!event.endsAt) return from;
  return `${from} – ${time.format(new Date(event.endsAt))}`;
}

/** How many events each continent has, for the filter. */
export function countByContinent(events: EventItem[]): Map<Continent, number> {
  const counts = new Map<Continent, number>();
  for (const event of events) {
    if (event.continent) counts.set(event.continent, (counts.get(event.continent) ?? 0) + 1);
  }
  return counts;
}
