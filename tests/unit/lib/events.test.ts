import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EVENT_FILTERS,
  countByContinent,
  eventDayKey,
  filterEvents,
  formatDayHeading,
  formatEventWhen,
  groupEventsByDay,
  isUpcomingEvent,
} from '../../../src/lib/events';
import { buildEventIcs, eventIcsFileName, foldLine } from '../../../src/lib/ics';
import type { EventItem } from '../../../src/types';

const NOW = Date.parse('2026-11-07T12:00:00.000Z');

function event(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: 'e1',
    title: 'Webinar: Zero Trust in practice',
    url: 'https://example.com/e/1',
    sourceId: 's1',
    sourceName: 'Source',
    company: 'Example Co',
    sourceCategory: 'cybersecurity',
    startsAt: '2026-11-17T15:00:00.000Z',
    allDay: false,
    kind: 'webinar',
    format: 'online',
    summary: 'A short summary.',
    language: 'en',
    matchedKeywordIds: ['zero-trust'],
    relevanceScore: 40,
    discoveredAt: '2026-11-07T00:00:00.000Z',
    dateStatus: 'confirmed',
    ...overrides,
  };
}

describe('continent filter', () => {
  const paris = event({ id: 'p', format: 'in-person', continent: 'europe' });
  const austin = event({ id: 'a', format: 'in-person', continent: 'north-america' });
  const online = event({ id: 'o' });
  it('keeps only events held on that continent, which leaves online events out', () => {
    const ids = (continent: 'all' | 'europe') =>
      filterEvents([paris, austin, online], { ...DEFAULT_EVENT_FILTERS, continent }, NOW).map(
        (e) => e.id,
      );
    expect(ids('all')).toEqual(['p', 'a', 'o']);
    expect(ids('europe')).toEqual(['p']);
  });
  it('counts events by continent', () => {
    const counts = countByContinent([paris, austin, online, paris]);
    expect(counts.get('europe')).toBe(2);
    expect(counts.get('north-america')).toBe(1);
    expect(counts.has('asia')).toBe(false);
  });
});

describe('filterEvents', () => {
  const webinar = event();
  const conference = event({
    id: 'e2',
    kind: 'conference',
    format: 'in-person',
    sourceId: 's2',
    startsAt: '2027-01-20T00:00:00.000Z',
    allDay: true,
    matchedKeywordIds: ['devsecops'],
  });
  const over = event({ id: 'e3', startsAt: '2026-11-01T15:00:00.000Z' });
  const all = [webinar, conference, over];

  it('drops events that are already over, even if the data still lists them', () => {
    expect(filterEvents(all, DEFAULT_EVENT_FILTERS, NOW).map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('filters by kind, format, keyword and source', () => {
    const f = (patch: Partial<typeof DEFAULT_EVENT_FILTERS>) =>
      filterEvents(all, { ...DEFAULT_EVENT_FILTERS, ...patch }, NOW).map((e) => e.id);
    expect(f({ kind: 'conference' })).toEqual(['e2']);
    expect(f({ format: 'online' })).toEqual(['e1']);
    expect(f({ keywordId: 'devsecops' })).toEqual(['e2']);
    expect(f({ sourceId: 's1' })).toEqual(['e1']);
  });

  it('can keep only dates the organiser has confirmed', () => {
    const estimated = event({ id: 'e4', dateStatus: 'estimated', estimatedFrom: '2026-06-02' });
    const list = [webinar, estimated];
    const f = (dateStatus: 'all' | 'confirmed') =>
      filterEvents(list, { ...DEFAULT_EVENT_FILTERS, dateStatus }, NOW).map((e) => e.id);
    expect(f('all')).toEqual(['e1', 'e4']);
    expect(f('confirmed')).toEqual(['e1']);
  });

  it('limits to a number of days ahead', () => {
    const f = (period: '7d' | '30d' | '90d' | 'all') =>
      filterEvents(all, { ...DEFAULT_EVENT_FILTERS, period }, NOW).map((e) => e.id);
    expect(f('7d')).toEqual([]);
    expect(f('30d')).toEqual(['e1']);
    expect(f('90d')).toEqual(['e1', 'e2']);
    expect(f('all')).toEqual(['e1', 'e2']);
  });

  it('keeps an event that is running now', () => {
    const running = event({ startsAt: '2026-11-07T11:00:00.000Z' });
    expect(isUpcomingEvent(running, NOW)).toBe(true);
    expect(isUpcomingEvent(event({ startsAt: '2026-11-07T09:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('grouping and formatting', () => {
  it('groups consecutive events of the same day, in the reader zone for timed events', () => {
    const a = event({ id: 'a', startsAt: '2026-11-17T15:00:00.000Z' });
    const b = event({ id: 'b', startsAt: '2026-11-17T20:00:00.000Z' });
    const c = event({ id: 'c', startsAt: '2026-11-18T09:00:00.000Z' });
    expect(groupEventsByDay([a, b, c], 'UTC').map((g) => [g.dayKey, g.events.length])).toEqual([
      ['2026-11-17', 2],
      ['2026-11-18', 1],
    ]);
    // 09:00 UTC on the 18th is still the 17th evening in Honolulu (UTC-10).
    expect(eventDayKey(c, 'Pacific/Honolulu')).toBe('2026-11-17');
  });

  it('lists an all-day event under its UTC date whatever the reader zone', () => {
    const allDay = event({ startsAt: '2026-12-17T00:00:00.000Z', allDay: true });
    expect(eventDayKey(allDay, 'America/Los_Angeles')).toBe('2026-12-17');
  });

  it('writes a day heading and a time range', () => {
    expect(formatDayHeading('2026-11-17', 'en')).toBe('Tuesday, November 17, 2026');
    const timed = event({ endsAt: '2026-11-17T16:00:00.000Z' });
    expect(formatEventWhen(timed, 'en', 'America/New_York')).toBe('10:00 AM EST – 11:00 AM EST');
  });

  it('writes an all-day range, treating the end as exclusive', () => {
    const single = event({
      allDay: true,
      startsAt: '2026-12-17T00:00:00.000Z',
      endsAt: '2026-12-18T00:00:00.000Z',
    });
    expect(formatEventWhen(single, 'en')).toBe('Dec 17, 2026');
    const multi = { ...single, endsAt: '2026-12-19T00:00:00.000Z' };
    expect(formatEventWhen(multi, 'en')).toMatch(/Dec 17\s*–\s*18, 2026/);
  });
});

describe('calendar export', () => {
  const now = new Date('2026-11-07T12:00:00.000Z');

  it('builds a timed event in UTC with a default one-hour end', () => {
    const ics = buildEventIcs(event({ location: 'Online' }), now);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20261117T150000Z\r\n');
    expect(ics).toContain('DTEND:20261117T160000Z\r\n');
    expect(ics).toContain('UID:e1@trendsignal\r\n');
    expect(ics).toContain('DTSTAMP:20261107T120000Z\r\n');
    expect(ics).toContain('LOCATION:Online\r\n');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('uses date values for an all-day event and keeps the exclusive end', () => {
    const ics = buildEventIcs(
      event({
        allDay: true,
        startsAt: '2026-12-17T00:00:00.000Z',
        endsAt: '2026-12-19T00:00:00.000Z',
        format: 'in-person',
        location: 'Toronto, Canada',
      }),
      now,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261217\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261219\r\n');
    expect(ics).toContain('LOCATION:Toronto\\, Canada\r\n');
  });

  it('escapes commas, semicolons, backslashes and newlines', () => {
    const ics = buildEventIcs(event({ title: 'A, B; C \\ D', summary: 'line1\nline2' }), now);
    expect(ics).toContain('SUMMARY:A\\, B\\; C \\\\ D\r\n');
    expect(ics).toContain('DESCRIPTION:line1\\nline2\\nhttps://example.com/e/1\r\n');
  });

  it('folds long lines at 75 octets without splitting a character', () => {
    const lines = foldLine(`SUMMARY:${'é'.repeat(80)}`);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(
      `SUMMARY:${'é'.repeat(80)}`,
    );
  });

  it('marks an event whose date is not confirmed as tentative, and says so in the description', () => {
    const ics = buildEventIcs(event({ dateStatus: 'estimated', estimatedFrom: '2026-06-02' }), now);
    expect(ics).toContain('STATUS:TENTATIVE\r\n');
    expect(ics).toContain('DESCRIPTION:Date not confirmed by the organiser.\\n');
    expect(buildEventIcs(event(), now)).not.toContain('TENTATIVE');
  });

  it('names the file after the title', () => {
    expect(eventIcsFileName(event({ title: 'Webinar: Passkeys — état des lieux!' }))).toBe(
      'webinar-passkeys-etat-des-lieux.ics',
    );
    expect(eventIcsFileName(event({ title: '!!!' }))).toBe('event.ics');
  });
});
