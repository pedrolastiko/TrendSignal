import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseQgMediaCards,
  qgMediaCandidates,
} from '../../../scripts/adapters/source-specific/qgmedia.ts';
import { infosecCandidate } from '../../../scripts/adapters/source-specific/infosec-conferences.ts';
import { parseHumanDateRange } from '../../../scripts/events/human-date.ts';

describe('parseHumanDateRange', () => {
  it.each([
    ['27th – 28th October 2026', '2026-10-27', '2026-10-28'],
    ['27th &ndash; 28th October 2026', '2026-10-27', '2026-10-28'],
    ['November 3rd – 4th, 2026', '2026-11-03', '2026-11-04'],
    ['9-10 February, 2027', '2027-02-09', '2027-02-10'],
    ['March 2-3, 2027', '2027-03-02', '2027-03-03'],
    ['30 November - 2 December 2026', '2026-11-30', '2026-12-02'],
    ['30th December – 2nd January 2027', '2026-12-30', '2027-01-02'],
    ['10th November 2026', '2026-11-10', undefined],
    ['February 25th 2027', '2027-02-25', undefined],
  ])('reads %s', (text, startDate, endDate) => {
    expect(parseHumanDateRange(text)).toEqual({ startDate, endDate });
  });

  it.each([
    'Coming soon',
    '',
    '12th Foo 2026',
    '31st February 2026',
    '5th – 3rd March 2026',
    'March 2026',
  ])('refuses %j rather than inventing a date', (text) => {
    expect(parseHumanDateRange(text)).toBeNull();
  });
});

describe('qgmedia adapter', () => {
  const html = readFileSync('tests/fixtures/qgmedia/events.html', 'utf-8');
  const cards = parseQgMediaCards(html);

  it('reads title, link, series, date text and place from each card with an excerpt', () => {
    expect(cards.map((c) => c.title)).toEqual([
      'CS4CA LATAM',
      'Perth Cyber Summit',
      'ManuSec Europe Virtual',
      'CS4CA USA',
      'Unsafe link',
      'Date to be announced',
    ]);
    expect(cards[0]).toMatchObject({
      series: 'CS4CA Series',
      dateText: '27th – 28th October 2026',
      place: 'São Paulo',
    });
  });

  it('keeps dated events with a safe link, as organiser-stated, and marks virtual ones online', () => {
    const candidates = qgMediaCandidates(cards);
    expect(candidates.map((c) => c.title)).toEqual([
      'CS4CA LATAM',
      'ManuSec Europe Virtual',
      'Perth Cyber Summit',
      'CS4CA USA',
    ]);
    const [latam, virtual] = candidates;
    expect(latam).toMatchObject({
      startsAt: '2026-10-27T00:00:00.000Z',
      endsAt: '2026-10-29T00:00:00.000Z',
      location: 'São Paulo',
      attendanceMode: 'offline',
      dateStatus: 'confirmed',
    });
    expect(virtual).toMatchObject({ attendanceMode: 'online', location: undefined });
  });
});

describe('infosec-conferences adapter', () => {
  const events = JSON.parse(
    readFileSync('tests/fixtures/infosec/events.json', 'utf-8'),
  ) as Parameters<typeof infosecCandidate>[0][];
  const countries = new Map([
    [4, 'United States'],
    [7, 'Germany'],
  ]);
  const states = new Map([[15, 'Texas']]);
  const [texas, berlin, webinar, undated, unsafe] = events.map((e) =>
    infosecCandidate(e, countries, states),
  );

  it('takes the start day from the slug and the place from the country and state terms', () => {
    expect(texas).toMatchObject({
      title: 'Security & Risk Management Conference 2026',
      startsAt: '2026-11-18T00:00:00.000Z',
      location: 'Texas, United States',
      allDay: true,
    });
    expect(berlin?.location).toBe('Germany');
  });

  it('flags every date as reported by a directory, not stated by the organiser', () => {
    expect(texas?.dateStatus).toBe('estimated');
    expect(texas?.estimatedFrom).toBeUndefined();
  });

  it('treats an event without a country as online, and skips undated or unsafe entries', () => {
    expect(webinar?.attendanceMode).toBe('online');
    expect(texas?.attendanceMode).toBeUndefined();
    expect(undated).toBeNull();
    expect(unsafe).toBeNull();
  });
});

describe('curated conference list from the GitHub list', () => {
  it('is valid, and every edition says where and when its date was read', async () => {
    const { loadEventSeriesConfig } = await import('../../../scripts/config-loader.ts');
    const series = loadEventSeriesConfig('config/event-series-github-list.yml');
    expect(series.length).toBeGreaterThan(40);
    expect(new Set(series.map((s) => s.id)).size).toBe(series.length);
    for (const entry of series)
      for (const edition of entry.editions) {
        expect(edition.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(edition.sourceUrl).toMatch(/^https?:\/\//);
      }
  });
});
