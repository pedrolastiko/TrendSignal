import { z } from 'zod';
import { fetchWithPolicy } from '../../http.ts';
import { isSafeUrl, stripHtml } from '../../normalize.ts';
import type { EventSourceConfig } from '../../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from '../types.ts';

/**
 * cncf.io events (KubeCon, KCDs…) from its public WordPress REST API.
 *
 * Source-specific because the data lives in custom fields: `lf_event_date_start` and friends
 * under `meta` (not `acf`, which comes back as an empty list), with the country as a term id
 * resolved through `/lf-country`. WordPress returns an empty PHP array, i.e. `[]`, where an
 * object is expected, hence the preprocess.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 3;

const emptyListToObject = (value: unknown) => (Array.isArray(value) ? {} : value);

const wpEventSchema = z.object({
  title: z.object({ rendered: z.string() }),
  link: z.string(),
  content: z.object({ rendered: z.string() }).optional(),
  'lf-country': z.array(z.number()).optional(),
  meta: z.preprocess(
    emptyListToObject,
    z
      .object({
        lf_event_date_start: z.string().optional(),
        lf_event_date_end: z.string().optional(),
        lf_event_city: z.string().optional(),
      })
      .passthrough(),
  ),
});

const countrySchema = z.object({ id: z.number(), name: z.string(), slug: z.string() });

/** CNCF writes dates as YYYY/MM/DD. */
function parseSlashDate(value: string | undefined): number | null {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function collectEventsFromCncf(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
): Promise<EventAdapterResult> {
  let responseTimeMs = 0;

  const countriesUrl = new URL('lf-country?per_page=100', source.feedUrl).toString();
  const countriesResult = await fetchWithPolicy(countriesUrl, undefined, repositoryUrl);
  responseTimeMs += countriesResult.responseTimeMs;
  const countries = new Map(
    z
      .array(countrySchema)
      .parse(JSON.parse(countriesResult.body))
      .map((c) => [c.id, c] as const),
  );

  const candidates: RawEventCandidate[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${source.feedUrl}?per_page=${PAGE_SIZE}&orderby=date&order=desc&page=${page}`;
    const result = await fetchWithPolicy(url, undefined, repositoryUrl);
    responseTimeMs += result.responseTimeMs;
    const posts = z.array(wpEventSchema).parse(JSON.parse(result.body));

    for (const post of posts) {
      const start = parseSlashDate(post.meta.lf_event_date_start);
      if (start === null || !isSafeUrl(post.link)) continue;
      // The last day is inclusive in CNCF's data; the model keeps all-day ends exclusive.
      const end = parseSlashDate(post.meta.lf_event_date_end) ?? start;
      const country = post['lf-country']?.map((id) => countries.get(id)).find(Boolean);
      const city = post.meta.lf_event_city?.trim();
      const location = [city, country?.name].filter(Boolean).join(', ');

      candidates.push({
        title: stripHtml(post.title.rendered),
        url: post.link,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(Math.max(end, start) + DAY_MS).toISOString(),
        allDay: true,
        summary: stripHtml(post.content?.rendered ?? ''),
        location: location || undefined,
        countryCode: country && /^[a-z]{2}$/i.test(country.slug) ? country.slug : undefined,
        language: source.language,
      });
    }
    if (posts.length < PAGE_SIZE) break;
  }
  return { candidates, responseTimeMs };
}
