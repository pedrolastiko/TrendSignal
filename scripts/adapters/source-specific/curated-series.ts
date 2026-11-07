import { loadEventSeriesConfig } from '../../config-loader.ts';
import {
  dayRangeEndMs,
  latestEdition,
  nextUpcoming,
  projectNextEdition,
} from '../../events/projection.ts';
import type { EventSeries, EventSourceConfig } from '../../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from '../types.ts';

/**
 * Flagship conferences kept by hand in a repository file, for organisers whose sites cannot be
 * collected (Black Hat, RSAC and Gartner answer 403 to the collector). Nothing is fetched.
 *
 * Per series: the earliest edition not yet over is shown, `confirmed` or not as recorded; with
 * none, the latest edition's date is assumed to repeat next year and flagged `estimated`.
 */
const FORMAT_TO_MODE = { online: 'online', hybrid: 'mixed', 'in-person': 'offline' } as const;

function midnight(day: string): string {
  return new Date(`${day}T00:00:00Z`).toISOString();
}

export function curatedCandidates(series: EventSeries[], now: Date): RawEventCandidate[] {
  const candidates: RawEventCandidate[] = [];
  for (const entry of series) {
    const upcoming = nextUpcoming(entry.editions, now);
    const latest = latestEdition(entry.editions);
    const projected = !upcoming && latest ? projectNextEdition(latest, now) : null;
    const range = upcoming ?? projected;
    if (!range) continue;

    const edition = upcoming ?? latest;
    candidates.push({
      title: entry.name,
      url: upcoming?.url ?? entry.url,
      startsAt: midnight(range.startDate),
      endsAt: new Date(dayRangeEndMs(range)).toISOString(),
      allDay: true,
      summary: entry.summary,
      location: upcoming?.location ?? entry.location ?? edition?.location,
      countryCode: entry.countryCode,
      attendanceMode: FORMAT_TO_MODE[entry.format],
      company: entry.organiser,
      category: entry.category,
      kind: entry.kind,
      language: 'en',
      dateStatus: upcoming && upcoming.status === 'confirmed' ? 'confirmed' : 'estimated',
      estimatedFrom: projected && latest ? latest.startDate : undefined,
      idSuffix: entry.id,
    });
  }
  return candidates.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title),
  );
}

export function collectEventsFromCuratedSeries(
  source: EventSourceConfig,
  now: Date,
): Promise<EventAdapterResult> {
  // The "feed" is a file in this repository; refuse anything that is not under config/.
  if (!/^config\/[\w.-]+\.ya?ml$/.test(source.feedUrl)) {
    return Promise.reject(new Error('A curated source must point at a YAML file under config/'));
  }
  const series = loadEventSeriesConfig(source.feedUrl);
  return Promise.resolve({ candidates: curatedCandidates(series, now), responseTimeMs: 0 });
}
