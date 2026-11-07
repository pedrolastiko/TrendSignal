import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  renderFixtureText,
  startFixtureServer,
  type FixtureServerHandle,
} from '../../../scripts/fixture-server.ts';
import { buildFixtureEventSources } from '../../../scripts/fixture-sources.ts';
import {
  loadEventSeriesConfig,
  loadEventSourcesConfig,
  loadKeywordsConfig,
} from '../../../scripts/config-loader.ts';
import { collectEvents } from '../../../scripts/collect-events.ts';
import {
  addYears,
  dayRangeEndMs,
  latestEdition,
  nextUpcoming,
  projectNextEdition,
} from '../../../scripts/events/projection.ts';
import {
  cleanConferenceName,
  conferenceKey,
  sameLocation,
} from '../../../scripts/events/identity.ts';
import { buildEvent, deduplicateEvents } from '../../../scripts/events/build.ts';
import {
  buildTechconfCandidates,
  parseTechconfPast,
  parseTechconfUpcoming,
} from '../../../scripts/adapters/source-specific/techconf-ca.ts';
import {
  observabilityCandidates,
  parseHumanDateRange,
  parseObservabilityPage,
} from '../../../scripts/adapters/source-specific/observability-360.ts';
import {
  collectEventsFromCuratedSeries,
  curatedCandidates,
} from '../../../scripts/adapters/source-specific/curated-series.ts';
import type { EventItem, EventSeries, EventSourceConfig } from '../../../scripts/schemas.ts';
import type { RawEventCandidate } from '../../../scripts/adapters/types.ts';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const keywords = loadKeywordsConfig();
const render = (file: string) =>
  renderFixtureText(
    readFileSync(join('tests/fixtures', file), 'utf-8'),
    'http://fixture.test',
    NOW,
  );

function source(overrides: Partial<EventSourceConfig> = {}): EventSourceConfig {
  return {
    id: 'test-events',
    name: 'Test Events',
    company: 'Test Co',
    category: 'technology',
    homepageUrl: 'https://example.com',
    collectionMode: 'curated',
    feedUrl: 'config/event-series.yml',
    enabled: true,
    priority: 5,
    language: 'en',
    maxItemsPerRun: 50,
    includePaths: [],
    excludePaths: [],
    knownEditions: [],
    region: 'global',
    includeUnmatched: true,
    ...overrides,
  };
}

describe('projecting the next edition', () => {
  it('adds a year to the same calendar day', () => {
    expect(addYears('2026-06-02', 1)).toBe('2027-06-02');
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28'); // no 29 February in 2029
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29');
  });

  it('keeps the length of a multi-day edition', () => {
    expect(projectNextEdition({ startDate: '2026-08-01', endDate: '2026-08-06' }, NOW)).toEqual({
      startDate: '2027-08-01',
      endDate: '2027-08-06',
    });
    expect(projectNextEdition({ startDate: '2026-06-02' }, NOW)).toEqual({
      startDate: '2027-06-02',
      endDate: undefined,
    });
  });

  it('does not project an edition older than a year: it may no longer run', () => {
    expect(projectNextEdition({ startDate: '2025-10-30' }, NOW)).toBeNull();
    // Its projected day is still ahead: November 8, 2025 -> November 8, 2026.
    expect(projectNextEdition({ startDate: '2025-11-08' }, NOW)).toEqual({
      startDate: '2026-11-08',
      endDate: undefined,
    });
  });

  it('treats the last day as inclusive when deciding what is upcoming', () => {
    const ended = { startDate: '2026-11-05', endDate: '2026-11-06' };
    const endsToday = { startDate: '2026-11-06', endDate: '2026-11-07' };
    const later = { startDate: '2027-01-01' };
    expect(nextUpcoming([ended, later], NOW)).toBe(later);
    expect(nextUpcoming([ended, endsToday, later], NOW)).toBe(endsToday);
    expect(nextUpcoming([ended], NOW)).toBeNull();
    expect(dayRangeEndMs(endsToday)).toBe(Date.parse('2026-11-08T00:00:00Z'));
    expect(latestEdition([ended, later, endsToday])).toBe(later);
  });
});

describe('conference identity', () => {
  it('drops the year, the ordinal and "annual", but not the name', () => {
    expect(
      cleanConferenceName('The 42nd International Conference on Machine Learning (ICML)'),
    ).toBe('International Conference on Machine Learning (ICML)');
    expect(cleanConferenceName('SecTor 2023')).toBe('SecTor');
    expect(cleanConferenceName('4th Annual Big Data & Analytics West Summit')).toBe(
      'Big Data & Analytics West Summit',
    );
  });

  it('folds accents, spacing and punctuation so one conference has one key', () => {
    expect(conferenceKey('B|Sides Vancouver')).toBe(conferenceKey('BSides Vancouver'));
    expect(conferenceKey('DevOps Days Montréal 2023')).toBe(conferenceKey('DevOpsDays Montreal'));
    expect(conferenceKey('BSides Ottawa')).not.toBe(conferenceKey('BSides Calgary'));
  });

  it('finds a city inside a longer location, and lets a missing one match anything', () => {
    expect(sameLocation('Ottawa, ON, Canada', 'BSidesOttawa, Ottawa, ONT, Canada')).toBe(true);
    expect(sameLocation('San Francisco, CA, United States', 'San Francisco, California')).toBe(
      true,
    );
    expect(sameLocation('Toronto, ON, Canada', 'Vancouver, BC, Canada')).toBe(false);
    expect(sameLocation(undefined, 'Anywhere')).toBe(true);
  });
});

describe('techconf.ca', () => {
  const upcoming = parseTechconfUpcoming(render('techconf/index.html'));
  const past = parseTechconfPast(render('techconf/past.html'));

  it('reads date, name, link and place from the upcoming list', () => {
    expect(upcoming.map((e) => e.name)).toEqual(['Fixture Alpha Conf', 'Fixture Beta Summit']);
    expect(upcoming[0]).toMatchObject({
      link: 'https://alpha.example.test',
      location: 'Toronto, ON, Canada',
      onlineLabel: false,
    });
    expect(upcoming[1]?.onlineLabel).toBe(true);
  });

  it("takes an edition's last day from its own window, and ignores a call-for-papers window", () => {
    // 60 -> 62 days is the event itself; -30 -> 20 days is the call for papers.
    expect(upcoming[0]?.startDate).toBe('2027-01-06');
    expect(upcoming[0]?.endDate).toBe('2027-01-08');
    expect(upcoming[1]?.endDate).toBeUndefined();
  });

  it('reads the past list, which carries no links', () => {
    expect(past).toHaveLength(8);
    expect(past.every((e) => e.link === undefined)).toBe(true);
    expect(past.find((e) => e.name === 'Fixture Zeta Expo')?.location).toBe(
      'Toronto, ON, Canada & Online',
    );
  });

  const byTitle = (list: RawEventCandidate[], title: string) => list.find((c) => c.title === title);

  it('uses a date already listed as upcoming, and projects the others from last year', () => {
    const list = buildTechconfCandidates(upcoming, past, [], NOW);

    const alpha = byTitle(list, 'Fixture Alpha Conf')!;
    expect(alpha.dateStatus).toBe('confirmed');
    expect(alpha.url).toBe('https://alpha.example.test');

    // Latest edition (-100 days), not the older one: so the 2025 date, one year on.
    const gamma = byTitle(list, 'Fixture Gamma Days')!;
    expect(gamma.dateStatus).toBe('estimated');
    expect(gamma.estimatedFrom).toBe('2026-07-30');
    expect(gamma.startsAt).toBe('2027-07-30T00:00:00.000Z');
    expect(gamma.url).toBe('https://techconf.ca/');
    expect(gamma.title).not.toMatch(/20\d\d/);

    // A stale "upcoming" entry is just another past edition.
    const beta = byTitle(list, 'Fixture Beta Summit')!;
    expect(beta.dateStatus).toBe('estimated');
    expect(beta.url).toBe('https://beta.example.test');
  });

  it('does not project a conference last held more than a year ago', () => {
    const list = buildTechconfCandidates(upcoming, past, [], NOW);
    expect(byTitle(list, 'Fixture Delta Forum')).toBeUndefined();
  });

  it('reads the place into the format: virtual, in person, or both', () => {
    const list = buildTechconfCandidates(upcoming, past, [], NOW);
    expect(byTitle(list, 'Fixture Epsilon Online')?.attendanceMode).toBe('online');
    expect(byTitle(list, 'Fixture Zeta Expo')?.attendanceMode).toBe('mixed');
    expect(byTitle(list, 'Fixture Alpha Conf')?.attendanceMode).toBe('offline');
  });

  it('lets a date checked by hand replace the projection, keeping its own status', () => {
    const known = [
      {
        name: 'Fixture Known Conf',
        startDate: '2027-05-11',
        endDate: '2027-05-14',
        location: 'Montréal, QC, Canada',
        status: 'confirmed' as const,
        sourceUrl: 'https://known.example.test/dates',
        verifiedOn: '2026-11-07',
      },
      {
        name: 'Fixture Gamma Days',
        startDate: '2027-08-20',
        status: 'unconfirmed' as const,
        sourceUrl: 'https://listing.example.test/gamma',
        verifiedOn: '2026-11-07',
      },
    ];
    const list = buildTechconfCandidates(upcoming, past, known, NOW);

    const confirmed = byTitle(list, 'Fixture Known Conf')!;
    expect(confirmed).toMatchObject({ dateStatus: 'confirmed', location: 'Montréal, QC, Canada' });
    expect(confirmed.endsAt).toBe('2027-05-15T00:00:00.000Z'); // 14 May inclusive -> 15 May exclusive
    expect(confirmed.estimatedFrom).toBeUndefined();

    // Reported by a listing but not by the organiser: shown, but not as confirmed, and not projected.
    const reported = byTitle(list, 'Fixture Gamma Days')!;
    expect(reported).toMatchObject({
      dateStatus: 'estimated',
      startsAt: '2027-08-20T00:00:00.000Z',
    });
    expect(reported.estimatedFrom).toBeUndefined();
  });

  it('shows a hand-checked date for a series the lists do not mention', () => {
    const known = [
      {
        name: 'Fixture Brand New Conf 2027',
        startDate: '2027-03-01',
        status: 'confirmed' as const,
        sourceUrl: 'https://new.example.test/',
        verifiedOn: '2026-11-07',
      },
    ];
    const list = buildTechconfCandidates(upcoming, past, known, NOW);
    expect(byTitle(list, 'Fixture Brand New Conf')?.dateStatus).toBe('confirmed');
  });

  it('gives two conferences on one shared page two different ids', () => {
    const built = buildTechconfCandidates(upcoming, past, [], NOW)
      .filter((c) => c.url === 'https://techconf.ca/')
      .map((c) =>
        buildEvent(
          c,
          source({ collectionMode: 'techconf-ca', region: 'north-america' }),
          keywords,
          new Map(),
          NOW,
        ),
      )
      .filter((e): e is EventItem => e !== null);
    expect(built.length).toBeGreaterThan(1);
    expect(new Set(built.map((e) => e.id)).size).toBe(built.length);
  });
});

describe('Observability 360', () => {
  it('reads one date, a range in one month, a range across months and across years', () => {
    expect(parseHumanDateRange('10 November 2025 Atlanta')).toMatchObject({
      startDate: '2025-11-10',
    });
    expect(parseHumanDateRange('23-24 Oct 2025 Virtual')).toMatchObject({
      startDate: '2025-10-23',
      endDate: '2025-10-24',
    });
    expect(parseHumanDateRange('22–23 October 2025')).toMatchObject({
      startDate: '2025-10-22',
      endDate: '2025-10-23',
    });
    expect(parseHumanDateRange('30 Nov - 2 Dec 2025')).toMatchObject({
      startDate: '2025-11-30',
      endDate: '2025-12-02',
    });
    expect(parseHumanDateRange('29 Dec - 2 Jan 2026')).toMatchObject({
      startDate: '2025-12-29',
      endDate: '2026-01-02',
    });
    expect(parseHumanDateRange('4 Sept 2026')).toMatchObject({ startDate: '2026-09-04' });
    expect(parseHumanDateRange('sometime soon')).toBeNull();
  });

  const events = parseObservabilityPage(render('observability/events.html'));

  it('merges the card and the summary row of one event on its link', () => {
    expect(events.map((e) => e.name)).toEqual([
      'Fixture Observability Day',
      'Fixture CiliumCon North America',
      'Fixture Past Observability Meetup',
    ]);
  });

  it('keeps the place and drops the cost and tags', () => {
    expect(events.map((e) => e.location)).toEqual(['Virtual', 'Atlanta, USA', 'Virtual']);
  });

  it('marks a virtual event as online and the others as in person', () => {
    const candidates = observabilityCandidates(events);
    expect(candidates.map((c) => c.attendanceMode)).toEqual(['online', 'offline', 'online']);
    expect(candidates[0]?.endsAt).toBe(
      new Date(Date.parse(`${events[0]!.startDate}T00:00:00Z`) + 86_400_000).toISOString(),
    );
  });
});

describe('curated conferences', () => {
  const series = (overrides: Partial<EventSeries> = {}): EventSeries => ({
    id: 'demo',
    name: 'Demo Conf',
    organiser: 'Demo Organiser',
    category: 'cybersecurity',
    url: 'https://demo.example.test/',
    kind: 'conference',
    format: 'hybrid',
    location: 'Las Vegas, NV, United States',
    countryCode: 'US',
    summary: 'A demo.',
    editions: [
      {
        startDate: '2027-04-05',
        endDate: '2027-04-08',
        status: 'confirmed',
        sourceUrl: 'https://demo.example.test/dates',
        verifiedOn: '2026-11-07',
      },
    ],
    ...overrides,
  });

  it('shows the upcoming edition as recorded, with the organiser and category of the series', () => {
    const [c] = curatedCandidates([series()], NOW);
    expect(c).toMatchObject({
      title: 'Demo Conf',
      company: 'Demo Organiser',
      category: 'cybersecurity',
      kind: 'conference',
      countryCode: 'US',
      attendanceMode: 'mixed',
      dateStatus: 'confirmed',
      startsAt: '2027-04-05T00:00:00.000Z',
      endsAt: '2027-04-09T00:00:00.000Z',
    });
    expect(c?.estimatedFrom).toBeUndefined();
  });

  it('flags an unconfirmed edition as estimated without claiming it was projected', () => {
    const base = series().editions[0]!;
    const [c] = curatedCandidates(
      [series({ editions: [{ ...base, status: 'unconfirmed' }] })],
      NOW,
    );
    expect(c?.dateStatus).toBe('estimated');
    expect(c?.estimatedFrom).toBeUndefined();
  });

  it('projects last year when no edition is left, and says which edition it came from', () => {
    const past = { ...series().editions[0]!, startDate: '2026-06-02', endDate: '2026-06-03' };
    const [c] = curatedCandidates([series({ editions: [past] })], NOW);
    expect(c).toMatchObject({
      dateStatus: 'estimated',
      estimatedFrom: '2026-06-02',
      startsAt: '2027-06-02T00:00:00.000Z',
    });
  });

  it('prefers a newly recorded edition over the projection', () => {
    const old = { ...series().editions[0]!, startDate: '2026-06-02', endDate: '2026-06-03' };
    const fresh = { ...series().editions[0]!, startDate: '2027-06-08', endDate: '2027-06-09' };
    const [c] = curatedCandidates([series({ editions: [old, fresh] })], NOW);
    expect(c).toMatchObject({ dateStatus: 'confirmed', startsAt: '2027-06-08T00:00:00.000Z' });
  });

  it('skips a series whose last edition is more than a year old', () => {
    const old = { ...series().editions[0]!, startDate: '2025-04-05', endDate: '2025-04-08' };
    expect(curatedCandidates([series({ editions: [old] })], NOW)).toEqual([]);
  });

  it('only reads YAML under config/', async () => {
    await expect(
      collectEventsFromCuratedSeries(source({ feedUrl: '../etc/passwd' }), NOW),
    ).rejects.toThrow(/under config/);
    await expect(
      collectEventsFromCuratedSeries(source({ feedUrl: 'https://example.com/x.yml' }), NOW),
    ).rejects.toThrow();
  });

  it('keeps the real files valid, and every hand-entered date traceable', () => {
    const real = loadEventSeriesConfig();
    expect(real.length).toBeGreaterThanOrEqual(7);
    for (const entry of real) {
      for (const edition of entry.editions) {
        expect(edition.sourceUrl).toMatch(/^https:\/\//);
        expect(edition.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // A date only third parties report must say so.
        if (edition.status === 'unconfirmed') expect(edition.note).toBeTruthy();
      }
    }
    const sources = loadEventSourcesConfig();
    for (const s of sources) {
      for (const known of s.knownEditions) expect(known.sourceUrl).toMatch(/^https:\/\//);
    }
    expect(sources.some((s) => s.collectionMode === 'curated')).toBe(true);
  });
});

describe('de-duplicating across sources', () => {
  const none = new Map<string, EventItem>();
  const make = (
    over: Partial<RawEventCandidate>,
    src: Partial<EventSourceConfig> = {},
  ): EventItem =>
    buildEvent(
      {
        title: 'Ottawa Security Day',
        url: 'https://example.com/a',
        startsAt: '2026-11-19T00:00:00.000Z',
        allDay: true,
        summary: '',
        location: 'Ottawa, ON, Canada',
        attendanceMode: 'offline',
        ...over,
      },
      source({ ...src, collectionMode: 'ics', region: 'north-america' }),
      keywords,
      none,
      NOW,
    )!;

  it('merges one conference listed by two sources on the same day, keeping the better-scored entry', () => {
    const official = make(
      { url: 'https://example.com/official' },
      { company: 'Organiser', priority: 8 },
    );
    const sponsor = make(
      { url: 'https://sponsor.example/page', title: 'Ottawa Security Day 2026' },
      { company: 'Sponsor', priority: 6 },
    );
    const merged = deduplicateEvents([sponsor, official]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.company).toBe('Organiser');
  });

  it('does not merge the same name in another city, or on another day', () => {
    const a = make({});
    const elsewhere = make(
      { url: 'https://example.com/b', location: 'Vancouver, BC, Canada' },
      { company: 'B' },
    );
    const later = make(
      { url: 'https://example.com/c', startsAt: '2026-12-19T00:00:00.000Z' },
      { company: 'C' },
    );
    expect(deduplicateEvents([a, elsewhere, later])).toHaveLength(3);
  });

  it('drops an estimated date once the same conference is confirmed within 45 days', () => {
    const confirmed = make(
      { title: 'BSidesOttawa', location: 'BSidesOttawa, Ottawa, ONT, Canada' },
      { company: 'BSides' },
    );
    const estimate = make(
      {
        title: 'BSides Ottawa',
        url: 'https://techconf.ca/',
        startsAt: '2026-11-20T00:00:00.000Z',
        dateStatus: 'estimated',
        estimatedFrom: '2025-11-20',
        idSuffix: 'bsidesottawa',
      },
      { company: 'Tech Conferences Canada' },
    );
    const merged = deduplicateEvents([confirmed, estimate]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.dateStatus).toBe('confirmed');
  });

  it('keeps an estimate when the confirmed date is a different edition, far away', () => {
    const confirmed = make(
      { title: 'BSides Ottawa', startsAt: '2026-11-19T00:00:00.000Z' },
      { company: 'BSides' },
    );
    const nextYear = make(
      {
        title: 'BSides Ottawa',
        url: 'https://techconf.ca/',
        startsAt: '2027-11-20T00:00:00.000Z',
        dateStatus: 'estimated',
        idSuffix: 'x',
      },
      { company: 'Tech Conferences Canada' },
    );
    expect(deduplicateEvents([confirmed, nextYear])).toHaveLength(2);
  });
});

describe('date status through the pipeline', () => {
  const none = new Map<string, EventItem>();
  const base: RawEventCandidate = {
    title: 'Some Conference',
    url: 'https://example.com/c',
    startsAt: '2027-03-01T00:00:00.000Z',
    allDay: true,
    summary: '',
    location: 'Toronto, ON, Canada',
    attendanceMode: 'offline',
  };

  it('defaults to confirmed and carries an estimate and where it came from', () => {
    expect(buildEvent(base, source(), keywords, none, NOW)?.dateStatus).toBe('confirmed');
    const estimated = buildEvent(
      { ...base, dateStatus: 'estimated', estimatedFrom: '2026-03-01' },
      source(),
      keywords,
      none,
      NOW,
    )!;
    expect(estimated).toMatchObject({ dateStatus: 'estimated', estimatedFrom: '2026-03-01' });
  });

  it('lets a candidate name its own organiser, category and kind', () => {
    const built = buildEvent(
      { ...base, company: 'Organiser', category: 'cybersecurity', kind: 'conference' },
      source(),
      keywords,
      none,
      NOW,
    )!;
    expect(built).toMatchObject({
      company: 'Organiser',
      sourceCategory: 'cybersecurity',
      kind: 'conference',
    });
  });

  it('collects every new fixture source healthily, estimated dates included', async () => {
    const server: FixtureServerHandle = await startFixtureServer(
      join(process.cwd(), 'tests/fixtures'),
    );
    try {
      const { file } = await collectEvents({
        sources: buildFixtureEventSources(server.baseUrl).filter((s) =>
          ['fixture-techconf', 'fixture-observability'].includes(s.id),
        ),
        keywords,
        previous: null,
        now: new Date(),
      });
      expect(file.sources.every((s) => s.health.status === 'healthy')).toBe(true);
      const estimated = file.events.filter((e) => e.dateStatus === 'estimated');
      expect(estimated.length).toBeGreaterThanOrEqual(4);
      expect(estimated.every((e) => Boolean(e.estimatedFrom))).toBe(true);
      expect(
        file.events.some((e) => e.title === 'Fixture Known Conf' && e.dateStatus === 'confirmed'),
      ).toBe(true);
    } finally {
      await server.close();
    }
  });
});
