import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  renderFixtureText,
  startFixtureServer,
  type FixtureServerHandle,
} from '../../../scripts/fixture-server.ts';
import { buildFixtureEventSources } from '../../../scripts/fixture-sources.ts';
import { loadKeywordsConfig } from '../../../scripts/config-loader.ts';
import { collectEvents } from '../../../scripts/collect-events.ts';
import { parseIcs, unfoldLines, zonedLocalToUtc } from '../../../scripts/events/ics.ts';
import {
  classifyFormat,
  classifyKind,
  isCallForProposals,
  isInScope,
  isNorthAmerica,
} from '../../../scripts/events/classify.ts';
import {
  buildEvent,
  deduplicateEvents,
  eventEndMs,
  hasEnded,
} from '../../../scripts/events/build.ts';
import { parseRssEventStart } from '../../../scripts/adapters/events-rss.ts';
import { collectEventsFromCncf } from '../../../scripts/adapters/source-specific/cncf-events.ts';
import {
  candidateFromLdEvent,
  collectEventsFromJsonLd,
  extractLdEvents,
  parseJsonLdDate,
} from '../../../scripts/adapters/events-jsonld.ts';
import {
  eventsFileSchema,
  type EventItem,
  type EventSourceConfig,
} from '../../../scripts/schemas.ts';
import type { RawEventCandidate } from '../../../scripts/adapters/types.ts';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const keywords = loadKeywordsConfig();

function source(overrides: Partial<EventSourceConfig> = {}): EventSourceConfig {
  return {
    id: 'test-events',
    name: 'Test Events',
    company: 'Test Co',
    category: 'cybersecurity',
    homepageUrl: 'https://example.com',
    collectionMode: 'ics',
    feedUrl: 'https://example.com/e.ics',
    enabled: true,
    priority: 5,
    language: 'en',
    maxItemsPerRun: 50,
    includePaths: [],
    excludePaths: [],
    knownEditions: [],
    region: 'global',
    includeUnmatched: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<RawEventCandidate> = {}): RawEventCandidate {
  return {
    title: 'Webinar: Zero Trust in practice',
    url: 'https://example.com/e/1',
    startsAt: '2026-11-20T15:00:00.000Z',
    allDay: false,
    summary: 'A session on zero trust architecture.',
    ...overrides,
  };
}

describe('iCalendar parsing', () => {
  it('unfolds continuation lines', () => {
    expect(unfoldLines('SUMMARY:A long\r\n  title\r\nURL:x')).toEqual([
      'SUMMARY:A long title',
      'URL:x',
    ]);
  });

  it('converts wall-clock times in a zone to UTC, across daylight saving', () => {
    expect(
      new Date(zonedLocalToUtc([2026, 7, 1, 10, 0, 0], 'America/New_York')!).toISOString(),
    ).toBe('2026-07-01T14:00:00.000Z');
    expect(
      new Date(zonedLocalToUtc([2026, 12, 1, 10, 0, 0], 'America/New_York')!).toISOString(),
    ).toBe('2026-12-01T15:00:00.000Z');
    expect(new Date(zonedLocalToUtc([2026, 12, 4, 13, 0, 0], 'Asia/Tokyo')!).toISOString()).toBe(
      '2026-12-04T04:00:00.000Z',
    );
  });

  it('returns null for an unknown zone instead of guessing', () => {
    expect(zonedLocalToUtc([2026, 7, 1, 10, 0, 0], 'Not/AZone')).toBeNull();
  });

  const fixture = renderFixtureText(
    readFileSync('tests/fixtures/ics/events.ics', 'utf-8'),
    'http://fixture.test',
    NOW,
  );
  const events = parseIcs(fixture);

  it('reads events, skips cancelled ones, and ignores VTIMEZONE blocks', () => {
    expect(events.map((e) => e.summary)).not.toContain('Webinar: Cancelled ransomware briefing');
    expect(events).toHaveLength(6);
  });

  it('handles UTC, zoned and all-day starts', () => {
    const utc = events.find((e) => e.summary.startsWith('Webinar: Zero Trust'))!;
    expect(utc.startsAt).toBe('2026-11-17T15:00:00.000Z');
    expect(utc.allDay).toBe(false);

    const zoned = events.find((e) => e.summary.startsWith('Virtual summit'))!;
    expect(zoned.startsAt).toBe('2026-11-27T15:00:00.000Z'); // 10:00 EST

    const allDay = events.find((e) => e.summary === 'Cyber Defense Conference')!;
    expect(allDay.allDay).toBe(true);
    expect(allDay.startsAt).toBe('2026-12-17T00:00:00.000Z');
    expect(allDay.endsAt).toBe('2026-12-19T00:00:00.000Z'); // exclusive
  });

  it('unescapes commas, semicolons, backslashes and newlines', () => {
    const [event] = parseIcs(
      'BEGIN:VEVENT\nDTSTART:20261110T150000Z\nSUMMARY:A\\, B\\; C \\\\ D\\nE\nEND:VEVENT',
    );
    expect(event?.summary).toBe('A, B; C \\ D E');
  });

  it('does not read an escaped backslash followed by n as a newline', () => {
    const [event] = parseIcs(
      'BEGIN:VEVENT\nDTSTART:20261110T150000Z\nSUMMARY:C:\\\\new\nEND:VEVENT',
    );
    expect(event?.summary).toBe('C:\\new');
  });

  it('unescapes text and keeps the folded description whole', () => {
    const zeroTrust = events.find((e) => e.summary.startsWith('Webinar: Zero Trust'))!;
    expect(zeroTrust.description).toBe(
      'A practical session on Zero Trust architecture, with a live demo. Registration is free.',
    );
    expect(zeroTrust.url).toBe('http://fixture.test/events/zero-trust-webinar');
    const folded = events.find((e) => e.summary.startsWith('Virtual summit'))!;
    expect(folded.description).toContain('folded across several lines');
  });
});

describe('classification', () => {
  it('reads a webinar, a title ending in Call, and a hybrid event as such', () => {
    expect(classifyFormat({ title: 'Webinar: Passkeys', summary: '' })).toBe('online');
    expect(
      classifyFormat({ title: 'Small Business Community of Interest Call', summary: '' }),
    ).toBe('online');
    expect(classifyFormat({ title: 'SecurityCon', summary: 'A hybrid event.' })).toBe('hybrid');
    expect(
      classifyFormat({ title: 'Summit', summary: 'Join in-person or attend the virtual session.' }),
    ).toBe('hybrid');
  });

  it('does not take "online authentication" in a summary for an online event', () => {
    expect(
      classifyFormat({
        title: 'FIDO Tokyo Seminar',
        summary: 'Technical specifications for online authentication that replaces passwords.',
      }),
    ).toBe('in-person');
  });

  it('trusts an explicit online location and online-event phrases in the summary', () => {
    expect(classifyFormat({ title: 'Briefing', location: 'Online', summary: '' })).toBe('online');
    expect(classifyFormat({ title: 'Briefing', summary: 'This online session covers…' })).toBe(
      'online',
    );
  });

  it('classifies the kind of event', () => {
    expect(classifyKind('KubeCon + CloudNativeCon North America', 'in-person')).toBe('conference');
    expect(classifyKind('Passkeys webinar', 'online')).toBe('webinar');
    expect(classifyKind('ArgoCon', 'in-person')).toBe('event');
  });

  it('detects calls for proposals', () => {
    expect(isCallForProposals('CFP OPEN FOSDEM 2027')).toBe(true);
    expect(isCallForProposals('Call for Speakers: SecurityCon')).toBe(true);
    expect(isCallForProposals('SecurityCon', ['Upcoming CFPs'])).toBe(true);
    expect(isCallForProposals('Webinar on CFPs for open source')).toBe(false);
  });

  it('recognises North America by country code first, then by text', () => {
    expect(isNorthAmerica('', 'US')).toBe(true);
    expect(isNorthAmerica('Toronto', 'FR')).toBe(false);
    expect(isNorthAmerica('Open Source SecurityCon North America')).toBe(true);
    expect(isNorthAmerica('Cyber Defense Conference Toronto, Canada')).toBe(true);
    expect(isNorthAmerica('Security Forum Paris, France')).toBe(false);
    expect(isNorthAmerica('FIDO Tokyo Seminar')).toBe(false);
  });

  it('keeps every online event, and in-person ones only in North America (scope north-america)', () => {
    const base = { text: 'x', sourceRegion: 'global' as const, scope: 'north-america' as const };
    expect(isInScope({ ...base, scope: 'worldwide', format: 'in-person', text: 'Paris' })).toBe(
      true,
    );
    expect(isInScope({ ...base, format: 'online', countryCode: 'FR' })).toBe(true);
    expect(isInScope({ ...base, format: 'in-person', text: 'Paris' })).toBe(false);
    expect(isInScope({ ...base, format: 'hybrid', text: 'Seattle' })).toBe(true);
    expect(isInScope({ ...base, format: 'in-person', countryCode: 'CA' })).toBe(true);
  });

  it('lets a North American source vouch for its in-person events, unless a country disagrees', () => {
    const base = {
      format: 'in-person' as const,
      text: 'Gaithersburg',
      sourceRegion: 'north-america' as const,
      scope: 'north-america' as const,
    };
    expect(isInScope(base)).toBe(true);
    expect(isInScope({ ...base, countryCode: 'DE' })).toBe(false);
  });
});

describe('RSS event dates', () => {
  it('reads a timed pubDate as the start', () => {
    expect(parseRssEventStart('Tue, 10 Nov 2026 14:00:00 -0500')).toEqual({
      startsAt: '2026-11-10T19:00:00.000Z',
      allDay: false,
    });
  });

  it('reads a midnight pubDate as an all-day event on the date as written', () => {
    expect(parseRssEventStart('Mon, 16 Nov 2026 00:00:00 -0500')).toEqual({
      startsAt: '2026-11-16T00:00:00.000Z',
      allDay: true,
    });
  });

  it('rejects an unparseable date', () => {
    expect(parseRssEventStart('someday')).toBeNull();
  });
});

describe('buildEvent', () => {
  const none = new Map<string, EventItem>();

  it('builds a published event with a deterministic id', () => {
    const a = buildEvent(candidate(), source(), keywords, none, NOW)!;
    const b = buildEvent(candidate(), source(), keywords, none, NOW)!;
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f]{64}$/);
    expect(a.format).toBe('online');
    expect(a.kind).toBe('webinar');
    expect(a.matchedKeywordIds).toContain('zero-trust');
    expect(a.relevanceScore).toBeGreaterThan(0);
    expect(a.relevanceScore).toBeLessThanOrEqual(90);
  });

  it('gives two dates of one recurring URL two ids', () => {
    const a = buildEvent(candidate(), source(), keywords, none, NOW)!;
    const b = buildEvent(
      candidate({ startsAt: '2026-12-20T15:00:00.000Z' }),
      source(),
      keywords,
      none,
      NOW,
    )!;
    expect(a.id).not.toBe(b.id);
  });

  it('keeps the first discovery date across runs', () => {
    const first = buildEvent(candidate(), source(), keywords, none, NOW)!;
    const later = buildEvent(
      candidate(),
      source(),
      keywords,
      new Map([[first.id, first]]),
      new Date('2026-11-09T12:00:00.000Z'),
    )!;
    expect(later.discoveredAt).toBe(NOW.toISOString());
  });

  it('drops events that are over, too far ahead, or calls for proposals', () => {
    expect(
      buildEvent(
        candidate({ startsAt: '2026-11-01T15:00:00.000Z' }),
        source(),
        keywords,
        none,
        NOW,
      ),
    ).toBeNull();
    expect(
      buildEvent(
        candidate({ startsAt: '2029-01-01T15:00:00.000Z' }),
        source(),
        keywords,
        none,
        NOW,
      ),
    ).toBeNull();
    expect(
      buildEvent(candidate({ title: 'CFP OPEN: Zero Trust Con' }), source(), keywords, none, NOW),
    ).toBeNull();
  });

  it('keeps an event that is running now, and one that ends in the future', () => {
    const running = candidate({
      startsAt: '2026-11-07T09:00:00.000Z',
      endsAt: '2026-11-07T18:00:00.000Z',
    });
    expect(buildEvent(running, source(), keywords, none, NOW)).not.toBeNull();
  });

  it('applies the North America rule to in-person events only, when so configured', () => {
    const paris = candidate({ title: 'Zero Trust Forum', location: 'Paris, France', summary: '' });
    expect(buildEvent(paris, source(), keywords, none, NOW, 'north-america')).toBeNull();
    const worldwide = buildEvent(paris, source(), keywords, none, NOW);
    expect(worldwide?.continent).toBe('europe');
    const toronto = candidate({
      title: 'Zero Trust Forum',
      location: 'Toronto, Canada',
      summary: '',
    });
    expect(buildEvent(toronto, source(), keywords, none, NOW)?.continent).toBe('north-america');
    expect(buildEvent(toronto, source(), keywords, none, NOW, 'north-america')?.format).toBe(
      'in-person',
    );
    const onlineFromParis = candidate({ location: 'Paris, France' });
    expect(buildEvent(onlineFromParis, source(), keywords, none, NOW)?.format).toBe('online');
    expect(buildEvent(onlineFromParis, source(), keywords, none, NOW)?.continent).toBeUndefined();
  });

  it('gates on tracked keywords unless the source is exempt', () => {
    const offTopic = candidate({ title: 'Webinar: Gardening tips', summary: 'Plants and soil.' });
    expect(buildEvent(offTopic, source(), keywords, none, NOW)).toBeNull();
    const kept = buildEvent(offTopic, source({ includeUnmatched: true }), keywords, none, NOW);
    expect(kept?.matchedKeywordIds).toEqual([]);
  });

  it('strips HTML from the title and truncates the summary to 320 characters', () => {
    const built = buildEvent(
      candidate({ title: 'Webinar: <b>Zero Trust</b>', summary: `<p>${'word '.repeat(200)}</p>` }),
      source(),
      keywords,
      none,
      NOW,
    )!;
    expect(built.title).toBe('Webinar: Zero Trust');
    expect(built.summary.length).toBeLessThanOrEqual(320);
    expect(built.summary).not.toContain('<');
  });

  it('computes when events end, with all-day ends exclusive', () => {
    expect(eventEndMs({ startsAt: '2026-11-09T00:00:00.000Z', allDay: true })).toBe(
      Date.parse('2026-11-10T00:00:00.000Z'),
    );
    expect(hasEnded({ startsAt: '2026-11-06T00:00:00.000Z', allDay: true }, NOW)).toBe(true);
    expect(hasEnded({ startsAt: '2026-11-07T00:00:00.000Z', allDay: true }, NOW)).toBe(false);
    expect(hasEnded({ startsAt: '2026-11-07T11:00:00.000Z', allDay: false }, NOW)).toBe(false); // 2 h default
    expect(hasEnded({ startsAt: '2026-11-07T09:00:00.000Z', allDay: false }, NOW)).toBe(true);
  });
});

describe('deduplicateEvents', () => {
  const none = new Map<string, EventItem>();
  const build = (overrides: Partial<RawEventCandidate>, src = source()) =>
    buildEvent(candidate(overrides), src, keywords, none, NOW)!;

  it('merges the same URL and start, and the same company, title and start', () => {
    const a = build({});
    const sameUrl = { ...a, title: 'Another title' };
    const sameTitle = build({ url: 'https://example.com/e/other' });
    expect(deduplicateEvents([a, sameUrl, sameTitle])).toHaveLength(1);
  });

  it('keeps similar-named events that start on different days', () => {
    const a = build({});
    const other = build(
      { url: 'https://other.example/e/1', startsAt: '2026-12-20T15:00:00.000Z' },
      source({ company: 'Other Co' }),
    );
    expect(deduplicateEvents([a, other])).toHaveLength(2);
  });

  it('sorts soonest first', () => {
    const late = build({
      url: 'https://example.com/late',
      title: 'Webinar: Zero Trust late',
      startsAt: '2026-12-20T15:00:00.000Z',
    });
    const early = build({
      url: 'https://example.com/early',
      title: 'Webinar: Zero Trust early',
      startsAt: '2026-11-10T15:00:00.000Z',
    });
    expect(deduplicateEvents([late, early]).map((e) => e.url)).toEqual([early.url, late.url]);
  });
});

describe('fixture rendering', () => {
  it('turns relative-date tokens into dates after now', () => {
    const text =
      '{{IN_DAYS:3:ICS_DATE}}|{{IN_DAYS:3:ICS_UTC}}|{{IN_DAYS:3:SLASH}}|{{IN_DAYS:3:RFC822}}|{{IN_DAYS:3:RFC822_MIDNIGHT}}|{{IN_DAYS:3:ICS_LOCAL}}';
    expect(renderFixtureText(text, 'http://x', NOW)).toBe(
      '20261110|20261110T150000Z|2026/11/10|Tue, 10 Nov 2026 15:00:00 +0000|Tue, 10 Nov 2026 00:00:00 +0000|20261110T100000',
    );
  });

  it('leaves unknown tokens alone', () => {
    expect(renderFixtureText('{{IN_DAYS:3:NOPE}}', 'http://x', NOW)).toBe('{{IN_DAYS:3:NOPE}}');
  });
});

describe('collecting events from fixture sources', () => {
  let server: FixtureServerHandle;
  beforeAll(async () => {
    server = await startFixtureServer(join(process.cwd(), 'tests/fixtures'));
  });
  afterAll(async () => {
    await server.close();
  });

  // One clock for the whole block: the fixture server dates its events from the real now.
  const clock = new Date();
  const run = (extra: Partial<Parameters<typeof collectEvents>[0]> = {}) =>
    collectEvents({
      sources: buildFixtureEventSources(server.baseUrl),
      keywords,
      previous: null,
      now: clock,
      scope: 'north-america',
      ...extra,
    });

  it('publishes in-scope upcoming events from all three adapters, and nothing else', async () => {
    const { file, summary } = await run();
    const titles = file.events.map((e) => e.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Webinar: Zero Trust in practice',
        'Virtual summit: AI governance for security leaders',
        'Cyber Defense Conference',
        'Ransomware Response Workshop',
        'Cybersecurity Community Call',
        'KCD Austin – Zero Trust Day',
        'Webinar: AI security in practice',
        'Cybersecurity Leadership Summit',
        'DevSecOps Forum',
        'Webinar: Ransomware readiness',
        'Fixture Alpha Conf',
        'Fixture Known Conf',
        'Fixture Observability Day',
        'Fixture CiliumCon North America',
      ]),
    );
    for (const excluded of [
      'Security Forum Paris', // in person, outside North America
      'CFP OPEN: SecurityCon 2027',
      'Webinar: Cancelled ransomware briefing',
      'Webinar: A past Zero Trust session',
      'Annual Gardening Expo', // no tracked keyword
      'KCD Lyon', // CNCF's country term is France
      'Event with empty custom fields',
      'Cyber Security Summit Sydney', // in person, outside North America
      'Webinar: Cancelled session',
      'Webinar: A past session',
      'Fixture Delta Forum', // last held more than a year ago
      'Fixture Past Observability Meetup',
    ]) {
      expect(titles).not.toContain(excluded);
    }
    expect(file.events).toHaveLength(18);
    expect(summary).toMatchObject({ targeted: 6, succeeded: 6, failed: 0 });
    expect(file.sources.every((s) => s.health.status === 'healthy')).toBe(true);
    expect(() => eventsFileSchema.parse(file)).not.toThrow();
  });

  it('is deterministic apart from the clock, and sorted soonest first', async () => {
    const a = await run();
    const b = await run();
    expect(a.file.events).toEqual(b.file.events);
    const starts = a.file.events.map((e) => e.startsAt);
    expect(starts).toEqual([...starts].sort());
  });

  it('isolates a failing source and keeps its last known events', async () => {
    const first = await run();
    const broken = buildFixtureEventSources(server.baseUrl).map((s) =>
      s.id === 'fixture-ics-events' ? { ...s, feedUrl: `${server.baseUrl}/ics/missing.ics` } : s,
    );
    const second = await run({ sources: broken, previous: first.file });

    expect(second.summary).toMatchObject({ succeeded: 5, failed: 1 });
    const status = second.file.sources.find((s) => s.id === 'fixture-ics-events')!;
    expect(status.health.status).toBe('warning');
    expect(status.health.consecutiveFailures).toBe(1);
    expect(status.health.lastSuccessAt).toBe(first.file.generatedAt);
    // Everything the failed source had published is still there.
    const before = first.file.events.filter((e) => e.sourceId === 'fixture-ics-events');
    const after = second.file.events.filter((e) => e.sourceId === 'fixture-ics-events');
    expect(after.map((e) => e.id)).toEqual(before.map((e) => e.id));
    // Health never leaks a stack trace or a path.
    expect(status.health.lastError).not.toMatch(/\n|\/home|at .*\(/);
  });

  it('turns a disabled source off without collecting it', async () => {
    const sources = buildFixtureEventSources(server.baseUrl).map((s) =>
      s.id === 'fixture-rss-events' ? { ...s, enabled: false } : s,
    );
    const { file, summary } = await run({ sources });
    expect(summary.targeted).toBe(5);
    expect(file.sources.find((s) => s.id === 'fixture-rss-events')?.health.status).toBe('disabled');
    expect(file.events.some((e) => e.sourceId === 'fixture-rss-events')).toBe(false);
  });

  it('refreshes only the targeted source and carries over the others', async () => {
    const first = await run();
    const { file, summary } = await run({
      previous: first.file,
      targetSourceId: 'fixture-rss-events',
    });
    expect(summary.targeted).toBe(1);
    expect(file.events.map((e) => e.id).sort()).toEqual(first.file.events.map((e) => e.id).sort());
  });

  it('reads CNCF custom fields from meta, resolves the country and ends all-day events exclusively', async () => {
    const cncf = buildFixtureEventSources(server.baseUrl).find(
      (s) => s.id === 'fixture-cncf-events',
    )!;
    const { candidates } = await collectEventsFromCncf(cncf, undefined);
    const austin = candidates.find((c) => c.title === 'KCD Austin – Zero Trust Day')!;
    expect(austin.countryCode).toBe('us');
    expect(austin.location).toBe('Austin, United States');
    expect(austin.allDay).toBe(true);
    expect(Date.parse(austin.endsAt!) - Date.parse(austin.startsAt)).toBe(2 * 24 * 60 * 60 * 1000);
    expect(austin.summary).toBe('A community day about Zero Trust on Kubernetes.');
    // A post whose custom fields came back as an empty list has no date, so it is skipped.
    expect(candidates.map((c) => c.title)).not.toContain('Event with empty custom fields');
  });
});

describe('events file schema', () => {
  const valid = {
    id: 'a'.repeat(64),
    title: 'Webinar',
    url: 'https://example.com/e',
    sourceId: 's',
    sourceName: 'S',
    company: 'C',
    sourceCategory: 'cybersecurity',
    startsAt: '2026-11-20T15:00:00.000Z',
    allDay: false,
    kind: 'webinar',
    format: 'online',
    summary: 'x',
    language: 'en',
    matchedKeywordIds: [],
    relevanceScore: 40,
    discoveredAt: '2026-11-07T12:00:00.000Z',
  };
  const wrap = (event: unknown) => ({
    generatedAt: NOW.toISOString(),
    events: [event],
    sources: [],
  });

  it('accepts a valid event', () => {
    expect(eventsFileSchema.safeParse(wrap(valid)).success).toBe(true);
  });

  it.each([
    ['a bad url', { ...valid, url: 'not a url' }],
    ['a score above 100', { ...valid, relevanceScore: 101 }],
    ['an unknown format', { ...valid, format: 'telepathy' }],
    ['a summary over 320 characters', { ...valid, summary: 'x'.repeat(321) }],
    ['a missing title', { ...valid, title: undefined }],
  ])('rejects %s', (_label, event) => {
    expect(eventsFileSchema.safeParse(wrap(event)).success).toBe(false);
  });
});

describe('state and province suffixes', () => {
  it('reads a US state or Canadian province after a comma as North America', () => {
    expect(isNorthAmerica('x', undefined, 'Half Moon Bay, CA')).toBe(true);
    expect(isNorthAmerica('x', undefined, 'New Orleans, LA')).toBe(false); // LA is also Laos
    expect(isNorthAmerica('x', undefined, 'Montreal, QC')).toBe(true);
    expect(isNorthAmerica('x', undefined, 'Austin, TX')).toBe(true);
  });

  it('never reads an ISO country code as a state', () => {
    for (const place of [
      'Mumbai, IN',
      'Berlin, DE',
      'Jakarta, ID',
      'Tel Aviv, IL',
      'Lima, PE',
      'Bogota, CO',
    ]) {
      expect(isNorthAmerica('x', undefined, place)).toBe(false);
    }
  });

  it('applies it only to a location, and an explicit country still wins', () => {
    expect(isNorthAmerica('Half Moon Bay, CA')).toBe(false);
    expect(isNorthAmerica('x', 'FR', 'Paris, TX')).toBe(false);
    expect(
      isInScope({ format: 'in-person', text: 'x', location: 'Austin, TX', sourceRegion: 'global' }),
    ).toBe(true);
  });
});

describe('publisher attendance mode', () => {
  const none = new Map<string, EventItem>();
  it('outranks the text heuristics', () => {
    // The title says "virtual" but the publisher declares a physical event.
    const offline = buildEvent(
      candidate({
        title: 'Virtual reality in security, Toronto',
        location: 'Toronto, Canada',
        attendanceMode: 'offline',
      }),
      source({ includeUnmatched: true }),
      keywords,
      none,
      NOW,
    );
    expect(offline?.format).toBe('in-person');
    const mixed = buildEvent(
      candidate({ attendanceMode: 'mixed', location: 'Toronto, Canada' }),
      source(),
      keywords,
      none,
      NOW,
    );
    expect(mixed?.format).toBe('hybrid');
    const online = buildEvent(
      candidate({ attendanceMode: 'online' }),
      source(),
      keywords,
      none,
      NOW,
    );
    expect(online?.format).toBe('online');
  });
});

describe('JSON-LD events', () => {
  it('parses date-only, offset and floating dates', () => {
    expect(parseJsonLdDate('2026-12-02')).toEqual({
      iso: '2026-12-02T00:00:00.000Z',
      allDay: true,
    });
    expect(parseJsonLdDate('2026-11-10T20:30:00+0000')).toEqual({
      iso: '2026-11-10T20:30:00.000Z',
      allDay: false,
    });
    expect(parseJsonLdDate('2026-11-10T10:30:00-05:00')?.iso).toBe('2026-11-10T15:30:00.000Z');
    expect(parseJsonLdDate('2026-11-10T09:00:00')?.iso).toBe('2026-11-10T09:00:00.000Z');
    expect(parseJsonLdDate('next week')).toBeNull();
  });

  const page = (body: unknown) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(body)}</script></head></html>`;

  it('finds events in a graph or a list, whatever the Event subtype', () => {
    const html = page({
      '@graph': [
        { '@type': 'WebPage', name: 'p' },
        { '@type': 'EducationEvent', name: 'A', startDate: '2026-12-01' },
      ],
    });
    expect(extractLdEvents(html).map((e) => e.name)).toEqual(['A']);
    expect(
      extractLdEvents(page([{ '@type': 'Event', name: 'B', startDate: '2026-12-01' }])),
    ).toHaveLength(1);
  });

  it('skips events without a name or start, and malformed blocks', () => {
    expect(extractLdEvents(page({ '@type': 'Event', name: 'No date' }))).toHaveLength(0);
    expect(extractLdEvents('<script type="application/ld+json">{ nope</script>')).toEqual([]);
  });

  it('turns an event into a candidate: the fetched URL, an inclusive date-only end, the address', () => {
    const [node] = extractLdEvents(
      page({
        '@type': 'Event',
        name: 'Forum',
        startDate: '2026-12-02',
        endDate: '2026-12-03',
        description: '<p>Two <b>days</b>.</p>',
        url: 'https://elsewhere.example/claims-this',
        eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: 'Convention Centre',
          address: { addressLocality: 'Toronto', addressCountry: 'CA' },
        },
      }),
    );
    const result = candidateFromLdEvent(node!, 'https://example.com/e/forum', 'en')!;
    expect(result.url).toBe('https://example.com/e/forum');
    expect(result.allDay).toBe(true);
    expect(result.endsAt).toBe('2026-12-04T00:00:00.000Z'); // 3 Dec inclusive -> 4 Dec exclusive
    expect(result.summary).toBe('Two days.');
    expect(result.location).toBe('Convention Centre, Toronto');
    expect(result.countryCode).toBe('CA');
    expect(result.attendanceMode).toBe('mixed');
  });

  it('treats a virtual location as online, and drops cancelled or postponed events', () => {
    const virtual = extractLdEvents(
      page({
        '@type': 'Event',
        name: 'V',
        startDate: '2026-12-01T10:00:00Z',
        location: { '@type': 'VirtualLocation', url: 'https://x.test' },
      }),
    )[0]!;
    expect(candidateFromLdEvent(virtual, 'https://example.com/v', 'en')?.attendanceMode).toBe(
      'online',
    );
    for (const status of [
      'https://schema.org/EventCancelled',
      'https://schema.org/EventPostponed',
    ]) {
      const node = extractLdEvents(
        page({ '@type': 'Event', name: 'X', startDate: '2026-12-01', eventStatus: status }),
      )[0]!;
      expect(candidateFromLdEvent(node, 'https://example.com/x', 'en')).toBeNull();
    }
  });

  describe('collecting from a listing page', () => {
    let server: FixtureServerHandle;
    beforeAll(async () => {
      server = await startFixtureServer(join(process.cwd(), 'tests/fixtures'));
    });
    afterAll(async () => {
      await server.close();
    });
    const fixtureSource = (overrides: Partial<EventSourceConfig> = {}) => ({
      ...buildFixtureEventSources(server.baseUrl).find((s) => s.id === 'fixture-jsonld-events')!,
      ...overrides,
    });

    it('follows only the event links, once each, on the listing host', async () => {
      const { candidates } = await collectEventsFromJsonLd(fixtureSource(), undefined);
      const titles = candidates.map((c) => c.title);
      expect(titles).toEqual(
        expect.arrayContaining([
          'Webinar: AI security in practice',
          'Cybersecurity Leadership Summit',
          'Cyber Security Summit Sydney',
          'Webinar: A past session',
          'DevSecOps Forum',
          'Webinar: Ransomware readiness',
        ]),
      );
      expect(titles).not.toContain('Webinar: Cancelled session');
      expect(titles).toHaveLength(new Set(candidates.map((c) => c.url)).size);
      expect(candidates.every((c) => c.url.startsWith(server.baseUrl))).toBe(true);
    });

    it('survives a malformed block next to a valid one', async () => {
      const { candidates } = await collectEventsFromJsonLd(fixtureSource(), undefined);
      expect(
        candidates.find((c) => c.title === 'Webinar: Ransomware readiness')?.attendanceMode,
      ).toBe('online');
    });

    it('fails loudly when it cannot tell event links apart, or finds none', async () => {
      await expect(
        collectEventsFromJsonLd(fixtureSource({ includePaths: [] }), undefined),
      ).rejects.toThrow(/includePaths/);
      await expect(
        collectEventsFromJsonLd(fixtureSource({ includePaths: ['/does-not-exist/'] }), undefined),
      ).rejects.toThrow(/No event links/);
      await expect(
        collectEventsFromJsonLd(
          fixtureSource({
            feedUrl: `${server.baseUrl}/jsonld/events/no-event.html`,
            includePaths: ['/x/'],
          }),
          undefined,
        ),
      ).rejects.toThrow(/No event links/);
    });

    it('rejects pages that link events but none carry a schema.org Event', async () => {
      await expect(
        collectEventsFromJsonLd(
          fixtureSource({
            excludePaths: [
              'ai-security',
              'austin',
              'sydney',
              'cancelled',
              'past',
              'toronto',
              'malformed',
            ],
          }),
          undefined,
        ),
      ).rejects.toThrow(/No schema.org Event/);
    });
  });
});
