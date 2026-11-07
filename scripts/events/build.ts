import { createHash } from 'node:crypto';
import {
  guessLanguage,
  normalizeUrl,
  normalizeWhitespace,
  stripHtml,
  truncateSummary,
} from '../normalize.ts';
import { conferenceKey, sameLocation } from './identity.ts';
import { scoreEventRelevance } from '../scoring.ts';
import type { EventItem, EventSourceConfig, KeywordConfig } from '../schemas.ts';
import type { RawEventCandidate } from '../adapters/types.ts';
import { classifyFormat, classifyKind, isCallForProposals, isInScope } from './classify.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_LOCATION_LENGTH = 120;
/** Events further out than this are placeholders more than plans, and bury the near ones. */
const MAX_HORIZON_MS = 548 * DAY_MS;
/** A timed event with no stated end is assumed to last this long before it counts as over. */
const DEFAULT_DURATION_MS = 2 * HOUR_MS;

type TimeSpan = Pick<EventItem, 'startsAt' | 'endsAt' | 'allDay'>;

/** When the event is over. All-day ends are exclusive, so a one-day event ends the next midnight UTC. */
export function eventEndMs({ startsAt, endsAt, allDay }: TimeSpan): number {
  if (endsAt) return Date.parse(endsAt);
  const start = Date.parse(startsAt);
  return start + (allDay ? DAY_MS : DEFAULT_DURATION_MS);
}

export function hasEnded(event: TimeSpan, now: Date): boolean {
  return eventEndMs(event) <= now.getTime();
}

const FORMAT_BY_MODE = { online: 'online', mixed: 'hybrid', offline: 'in-person' } as const;

/** A publisher's own statement (schema.org eventAttendanceMode) outranks any text heuristic. */
function formatFromAttendanceMode(
  mode: RawEventCandidate['attendanceMode'],
): EventItem['format'] | undefined {
  return mode ? FORMAT_BY_MODE[mode] : undefined;
}

export function deterministicEventId(
  canonicalUrl: string,
  startsAt: string,
  suffix?: string,
): string {
  const input = suffix ? `${canonicalUrl}#${startsAt}#${suffix}` : `${canonicalUrl}#${startsAt}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Turns a publisher's event into a published one, or null when it does not belong: unusable
 * data, a call for papers, already over, outside the scope (online, or North America), or —
 * unless the source is exempt — matching no tracked keyword.
 */
export function buildEvent(
  candidate: RawEventCandidate,
  source: EventSourceConfig,
  keywords: KeywordConfig[],
  previousById: Map<string, EventItem>,
  now: Date,
): EventItem | null {
  const title = normalizeWhitespace(stripHtml(candidate.title));
  if (!title || Number.isNaN(Date.parse(candidate.startsAt))) return null;
  if (isCallForProposals(title, candidate.categories)) return null;

  let canonicalUrl: string;
  try {
    canonicalUrl = normalizeUrl(candidate.url);
  } catch {
    return null;
  }

  const summary = truncateSummary(candidate.summary);
  const location = candidate.location?.slice(0, MAX_LOCATION_LENGTH) || undefined;
  const text = [title, summary, location, ...(candidate.categories ?? [])].join(' ');

  const format =
    formatFromAttendanceMode(candidate.attendanceMode) ??
    classifyFormat({ title, location, summary });
  if (
    !isInScope({
      format,
      text,
      location,
      countryCode: candidate.countryCode,
      sourceRegion: source.region,
    })
  ) {
    return null;
  }

  const timeSpan: TimeSpan = {
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    allDay: candidate.allDay,
  };
  if (hasEnded(timeSpan, now)) return null;
  if (Date.parse(candidate.startsAt) - now.getTime() > MAX_HORIZON_MS) return null;

  const { relevanceScore, matchedKeywordIds } = scoreEventRelevance(
    { title, summary, sourcePriority: source.priority },
    keywords,
  );
  if (matchedKeywordIds.length === 0 && !source.includeUnmatched) return null;

  const id = deterministicEventId(canonicalUrl, candidate.startsAt, candidate.idSuffix);
  return {
    id,
    title,
    url: candidate.url,
    sourceId: source.id,
    sourceName: source.name,
    company: candidate.company ?? source.company,
    sourceCategory: candidate.category ?? source.category,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    allDay: candidate.allDay,
    kind: candidate.kind ?? classifyKind(text, format),
    format,
    location,
    summary,
    language: candidate.language ?? guessLanguage(`${title} ${summary}`),
    matchedKeywordIds,
    relevanceScore,
    discoveredAt: previousById.get(id)?.discoveredAt ?? now.toISOString(),
    dateStatus: candidate.dateStatus ?? 'confirmed',
    estimatedFrom: candidate.estimatedFrom,
  };
}

function titleKey(event: EventItem): string {
  const title = event.title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return `${event.company.toLowerCase()}|${title.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}|${event.startsAt}`;
}

/** An estimated date is dropped for a confirmed one this close to it: the same edition, announced. */
const ESTIMATE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

/** The same conference: same name once years and punctuation are folded away, in a compatible place. */
function sameConference(a: EventItem, b: EventItem): boolean {
  return conferenceKey(a.title) === conferenceKey(b.title) && sameLocation(a.location, b.location);
}

const startDay = (event: EventItem) => event.startsAt.slice(0, 10);

/**
 * One entry per event:
 *  - the same URL and start, or the same company, title and start (one event listed twice);
 *  - the same conference starting the same day, whoever lists it (KubeCon on CNCF's page and on a
 *    sponsor's): the better-scored entry stays;
 *  - an estimated date next to a confirmed one for the same conference, within 45 days: the
 *    estimate goes.
 * Different conferences are never merged on a similar title alone.
 */
export function deduplicateEvents(events: EventItem[]): EventItem[] {
  const ranked = [...events].sort(
    (a, b) => b.relevanceScore - a.relevanceScore || a.id.localeCompare(b.id),
  );
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const kept: EventItem[] = [];
  for (const event of ranked) {
    const key = titleKey(event);
    if (seenIds.has(event.id) || seenTitles.has(key)) continue;
    if (kept.some((other) => sameConference(event, other) && startDay(event) === startDay(other))) {
      continue;
    }
    seenIds.add(event.id);
    seenTitles.add(key);
    kept.push(event);
  }

  const confirmed = kept.filter((e) => e.dateStatus === 'confirmed');
  const superseded = (event: EventItem) =>
    event.dateStatus === 'estimated' &&
    confirmed.some(
      (other) =>
        sameConference(event, other) &&
        Math.abs(Date.parse(event.startsAt) - Date.parse(other.startsAt)) <= ESTIMATE_WINDOW_MS,
    );
  return sortEvents(kept.filter((event) => !superseded(event)));
}

/** Soonest first; the id breaks ties so regenerated files do not reshuffle. */
export function sortEvents(events: EventItem[]): EventItem[] {
  return [...events].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
  );
}
