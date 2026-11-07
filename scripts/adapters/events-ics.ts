import { fetchWithPolicy } from '../http.ts';
import { isSafeUrl, stripHtml } from '../normalize.ts';
import { parseIcs } from '../events/ics.ts';
import type { EventSourceConfig } from '../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from './types.ts';

export async function collectEventsFromIcs(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
): Promise<EventAdapterResult> {
  const result = await fetchWithPolicy(source.feedUrl, undefined, repositoryUrl);
  // An HTML app shell answers 200 for a feed path; refuse it rather than parse zero events.
  if (!result.body.includes('BEGIN:VCALENDAR')) {
    throw new Error('Response is not an iCalendar document');
  }

  const candidates: RawEventCandidate[] = [];
  for (const event of parseIcs(result.body)) {
    if (!event.url || !isSafeUrl(event.url)) continue;
    candidates.push({
      title: event.summary,
      url: event.url,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      summary: stripHtml(event.description),
      location: event.location,
      categories: event.categories,
      language: source.language,
    });
  }
  return { candidates, responseTimeMs: result.responseTimeMs };
}
