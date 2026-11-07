import * as cheerio from 'cheerio';
import { fetchWithPolicy } from '../../http.ts';
import { isSafeUrl } from '../../normalize.ts';
import { cleanConferenceName, conferenceKey } from '../../events/identity.ts';
import {
  dayRangeEndMs,
  latestEdition,
  nextUpcoming,
  projectNextEdition,
  type DayRange,
} from '../../events/projection.ts';
import type { EventSourceConfig, KnownEdition } from '../../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from '../types.ts';

/**
 * techconf.ca, a community list of tech conferences in Canada: an "upcoming" page (date, linked
 * name, place) and a "past" page (date, name, place; no links). The past page is what makes
 * recurring conferences visible, so for each series with no upcoming date:
 *
 *   1. a date checked by hand (`knownEditions`) wins, with its own confirmed/unconfirmed status;
 *   2. otherwise an edition already listed as upcoming is used as is;
 *   3. otherwise the latest edition's date is assumed to repeat next year, flagged `estimated`
 *      (an edition older than a year is not projected: it may no longer run).
 *
 * "A new date is already known" is judged by this list (and the hand-checked dates); the
 * conferences' own sites are not crawled.
 */
const DAY_PATTERN = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/;

export interface TechconfEdition extends DayRange {
  name: string;
  location: string;
  link?: string;
  /** The page's own "online" label. */
  onlineLabel: boolean;
}

function parseList(html: string): TechconfEdition[] {
  const $ = cheerio.load(html);
  const editions: TechconfEdition[] = [];
  for (const li of $('ul.conference-list > li').toArray()) {
    const el = $(li);
    const script = el.find('script').text();
    const location = el.find('small').text().replace(/\s+/g, ' ').trim();
    const anchor = el.find('a.post-link');
    const text = el
      .clone()
      .find('small,script,span')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    const match = DAY_PATTERN.exec(text);
    if (!match) continue;
    const startDate = match[1] as string;
    const link = anchor.attr('href');

    // The page tags the event's own window ("happening now") as
    // `today >= dateTimestamp('<start>') && today <= dateTimestamp('<end>')`; a window that does
    // not begin on the event's first day is something else (a call for papers) and is ignored.
    const windows = [
      ...script.matchAll(
        /today\s*>=\s*dateTimestamp\('(\d{4}-\d{2}-\d{2})'\)\s*&&\s*today\s*<=\s*dateTimestamp\('(\d{4}-\d{2}-\d{2})'\)/g,
      ),
    ];
    const own = windows.find((w) => w[1] === startDate);
    const endDate = own && (own[2] as string) > startDate ? (own[2] as string) : undefined;

    editions.push({
      name: (anchor.length ? anchor.text() : (match[2] as string)).replace(/\s+/g, ' ').trim(),
      location,
      link: link && isSafeUrl(link) ? link : undefined,
      onlineLabel: /label-primary">Online</.test(script),
      startDate,
      endDate,
    });
  }
  return editions;
}

export const parseTechconfUpcoming = parseList;
export const parseTechconfPast = parseList;

function attendanceOf(location: string, onlineLabel: boolean): RawEventCandidate['attendanceMode'] {
  if (/^(virtual|online)$/i.test(location)) return 'online';
  if (/&\s*(online|virtual)/i.test(location) || onlineLabel) return 'mixed';
  return 'offline';
}

function midnight(day: string): string {
  return new Date(`${day}T00:00:00Z`).toISOString();
}

function exclusiveEnd(range: DayRange): string {
  return new Date(dayRangeEndMs(range)).toISOString();
}

/** The conference's name as it should read in a year that is not in the list: no year, no ordinal. */
const displayName = cleanConferenceName;

export function buildTechconfCandidates(
  upcoming: TechconfEdition[],
  past: TechconfEdition[],
  known: (KnownEdition & { name: string })[],
  now: Date,
): RawEventCandidate[] {
  const series = new Map<string, TechconfEdition[]>();
  for (const edition of [...upcoming, ...past]) {
    const key = conferenceKey(edition.name);
    series.set(key, [...(series.get(key) ?? []), edition]);
  }
  const knownByKey = new Map<string, (KnownEdition & { name: string })[]>();
  for (const entry of known) {
    const key = conferenceKey(entry.name);
    knownByKey.set(key, [...(knownByKey.get(key) ?? []), entry]);
  }

  const candidates: RawEventCandidate[] = [];
  const base = { kind: 'conference' as const, language: 'en' as const };

  for (const [key, editions] of series) {
    const latest = latestEdition(editions);
    if (!latest) continue;
    const link = editions.find((e) => e.link)?.link;
    const name = displayName(latest.name);
    const idSuffix = key;

    const fromKnown = nextUpcoming(knownByKey.get(key) ?? [], now);
    if (fromKnown) {
      candidates.push({
        ...base,
        title: name,
        url: fromKnown.url ?? link ?? 'https://techconf.ca/',
        startsAt: midnight(fromKnown.startDate),
        endsAt: exclusiveEnd(fromKnown),
        allDay: true,
        summary: fromKnown.note ?? '',
        location: fromKnown.location ?? latest.location,
        attendanceMode: attendanceOf(fromKnown.location ?? latest.location, latest.onlineLabel),
        dateStatus: fromKnown.status === 'confirmed' ? 'confirmed' : 'estimated',
        idSuffix,
      });
      continue;
    }

    const listed = nextUpcoming(editions, now);
    if (listed) {
      candidates.push({
        ...base,
        title: listed.name,
        url: listed.link ?? 'https://techconf.ca/',
        startsAt: midnight(listed.startDate),
        endsAt: exclusiveEnd(listed),
        allDay: true,
        summary: '',
        location: listed.location,
        attendanceMode: attendanceOf(listed.location, listed.onlineLabel),
        dateStatus: 'confirmed',
        idSuffix,
      });
      continue;
    }

    const projected = projectNextEdition(latest, now);
    if (!projected) continue;
    candidates.push({
      ...base,
      title: name,
      url: link ?? 'https://techconf.ca/',
      startsAt: midnight(projected.startDate),
      endsAt: exclusiveEnd(projected),
      allDay: true,
      summary: '',
      location: latest.location,
      attendanceMode: attendanceOf(latest.location, latest.onlineLabel),
      dateStatus: 'estimated',
      estimatedFrom: latest.startDate,
      idSuffix,
    });
  }

  // A known edition for a series the lists do not mention is still worth showing.
  for (const [key, entries] of knownByKey) {
    if (series.has(key)) continue;
    const next = nextUpcoming(entries, now);
    if (!next) continue;
    candidates.push({
      ...base,
      title: displayName(next.name),
      url: next.url ?? 'https://techconf.ca/',
      startsAt: midnight(next.startDate),
      endsAt: exclusiveEnd(next),
      allDay: true,
      summary: next.note ?? '',
      location: next.location,
      attendanceMode: attendanceOf(next.location ?? '', false),
      dateStatus: next.status === 'confirmed' ? 'confirmed' : 'estimated',
      idSuffix: key,
    });
  }

  return candidates.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title),
  );
}

export async function collectEventsFromTechconf(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
  now: Date,
): Promise<EventAdapterResult> {
  const upcomingPage = await fetchWithPolicy(source.feedUrl, undefined, repositoryUrl);
  const pastUrl = new URL('past.html', source.feedUrl).toString();
  const pastPage = await fetchWithPolicy(pastUrl, undefined, repositoryUrl);

  const upcoming = parseTechconfUpcoming(upcomingPage.body);
  const past = parseTechconfPast(pastPage.body);
  // A layout change that empties the lists must show up as a failure, not as "no events".
  if (past.length === 0) throw new Error('No conferences found on the past-conferences page');

  const candidates = buildTechconfCandidates(upcoming, past, source.knownEditions, now);
  return {
    candidates,
    responseTimeMs: upcomingPage.responseTimeMs + pastPage.responseTimeMs,
  };
}
