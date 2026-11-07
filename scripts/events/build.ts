import { createHash } from 'node:crypto';
import {
  guessLanguage,
  normalizeUrl,
  normalizeWhitespace,
  stripHtml,
  truncateSummary,
} from '../normalize.ts';
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

export function deterministicEventId(canonicalUrl: string, startsAt: string): string {
  return createHash('sha256').update(`${canonicalUrl}#${startsAt}`).digest('hex');
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

  const id = deterministicEventId(canonicalUrl, candidate.startsAt);
  return {
    id,
    title,
    url: candidate.url,
    sourceId: source.id,
    sourceName: source.name,
    company: source.company,
    sourceCategory: source.category,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    allDay: candidate.allDay,
    kind: classifyKind(text, format),
    format,
    location,
    summary,
    language: candidate.language ?? guessLanguage(`${title} ${summary}`),
    matchedKeywordIds,
    relevanceScore,
    discoveredAt: previousById.get(id)?.discoveredAt ?? now.toISOString(),
  };
}

function titleKey(event: EventItem): string {
  const title = event.title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return `${event.company.toLowerCase()}|${title.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}|${event.startsAt}`;
}

/** Same URL and start, or same company, title and start (one event listed on two pages). */
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
    seenIds.add(event.id);
    seenTitles.add(key);
    kept.push(event);
  }
  return sortEvents(kept);
}

/** Soonest first; the id breaks ties so regenerated files do not reshuffle. */
export function sortEvents(events: EventItem[]): EventItem[] {
  return [...events].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
  );
}
