import { z } from 'zod';
import { fetchWithPolicy } from '../../http.ts';
import { isSafeUrl, normalizeWhitespace, stripHtml } from '../../normalize.ts';
import { dayRangeEndMs } from '../../events/projection.ts';
import type { EventSourceConfig } from '../../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from '../types.ts';

/**
 * infosec-conferences.com, a community directory of security conferences, through the public
 * WordPress REST API of the site. Every event's slug starts with its start day (`20261118-...`),
 * so listing events by slug, latest first, reaches upcoming events without reading the archive;
 * paging stops once the day is in the past. Country and US state are taxonomy terms.
 *
 * The directory is a list, not the organiser: its dates are reported, so they are flagged
 * `estimated` without an `estimatedFrom`. Only the start day is known.
 */
const eventSchema = z.object({
  slug: z.string(),
  link: z.string(),
  title: z.object({ rendered: z.string() }),
  country: z.array(z.number()).default([]),
  'us-state': z.array(z.number()).default([]),
});
const termSchema = z.object({ id: z.number(), name: z.string() });
type ApiEvent = z.infer<typeof eventSchema>;

const PAGE_SIZE = 100;
const MAX_PAGES = 8;

function decodeEntities(text: string): string {
  return normalizeWhitespace(stripHtml(text));
}

function endpoint(base: string, path: string, params: Record<string, string>): string {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  repositoryUrl: string | undefined,
): Promise<{ data: T; ms: number }> {
  const page = await fetchWithPolicy(url, undefined, repositoryUrl);
  return { data: schema.parse(JSON.parse(page.body)), ms: page.responseTimeMs };
}

async function fetchTerms(
  base: string,
  taxonomy: string,
  repositoryUrl: string | undefined,
): Promise<{ names: Map<number, string>; ms: number }> {
  const names = new Map<number, string>();
  let ms = 0;
  for (let page = 1; page <= 3; page++) {
    const url = endpoint(base, `wp-json/wp/v2/${taxonomy}`, {
      per_page: '100',
      page: String(page),
      _fields: 'id,name',
    });
    let result;
    try {
      result = await fetchJson(url, z.array(termSchema), repositoryUrl);
    } catch (error) {
      if (page > 1) break; // WordPress answers 400 past the last page
      throw error;
    }
    ms += result.ms;
    for (const term of result.data) names.set(term.id, decodeEntities(term.name));
    if (result.data.length < 100) break;
  }
  return { names, ms };
}

export function infosecCandidate(
  event: ApiEvent,
  countries: Map<number, string>,
  states: Map<number, string>,
): RawEventCandidate | null {
  const day = /^(\d{4})(\d{2})(\d{2})-/.exec(event.slug);
  if (!day) return null;
  const startDate = `${day[1]}-${day[2]}-${day[3]}`;
  if (Number.isNaN(Date.parse(`${startDate}T00:00:00Z`)) || !isSafeUrl(event.link)) return null;
  const country = event.country.map((id) => countries.get(id)).find(Boolean);
  const state = event['us-state'].map((id) => states.get(id)).find(Boolean);
  const place = [state, country].filter(Boolean).join(', ');
  const title = decodeEntities(event.title.rendered);
  if (!title) return null;
  return {
    title,
    url: event.link,
    startsAt: new Date(`${startDate}T00:00:00Z`).toISOString(),
    endsAt: new Date(dayRangeEndMs({ startDate })).toISOString(),
    allDay: true,
    summary: '',
    location: place || undefined,
    // The directory gives a country to every event held somewhere; the others are webinars.
    attendanceMode: place ? undefined : 'online',
    language: 'en',
    dateStatus: 'estimated',
    idSuffix: event.slug,
  };
}

export async function collectEventsFromInfosecConferences(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
  now: Date,
): Promise<EventAdapterResult> {
  const base = source.feedUrl;
  const today = now.toISOString().slice(0, 10).replace(/-/g, '');
  const [countries, states] = await Promise.all([
    fetchTerms(base, 'country', repositoryUrl),
    fetchTerms(base, 'us-state', repositoryUrl),
  ]);
  let ms = countries.ms + states.ms;

  const candidates: RawEventCandidate[] = [];
  let reachedPast = false;
  for (let page = 1; page <= MAX_PAGES && !reachedPast; page++) {
    const url = endpoint(base, 'wp-json/wp/v2/event', {
      orderby: 'slug',
      order: 'desc',
      per_page: String(PAGE_SIZE),
      page: String(page),
      _fields: 'slug,link,title,country,us-state',
    });
    const result = await fetchJson(url, z.array(eventSchema), repositoryUrl);
    ms += result.ms;
    for (const event of result.data) {
      if (event.slug.slice(0, 8) < today) {
        reachedPast = true;
        break;
      }
      const candidate = infosecCandidate(event, countries.names, states.names);
      if (candidate) candidates.push(candidate);
    }
    if (result.data.length < PAGE_SIZE) break;
  }
  // The directory always has upcoming events; none means the API changed, not that it is quiet.
  if (candidates.length === 0) throw new Error('No upcoming events returned by the directory');
  return {
    candidates: candidates
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title))
      .slice(0, source.maxItemsPerRun),
    responseTimeMs: ms,
  };
}
