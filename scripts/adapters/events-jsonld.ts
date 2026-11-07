import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { z } from 'zod';
import { fetchWithPolicy } from '../http.ts';
import { isSafeUrl, stripHtml } from '../normalize.ts';
import type { EventSourceConfig } from '../schemas.ts';
import type { EventAdapterResult, RawEventCandidate } from './types.ts';

/**
 * Events from a listing page whose linked pages each carry a schema.org `Event` in JSON-LD
 * (Tenable does). The listing is only used to find the links; everything else is read from the
 * event pages, since the listing itself carries no structured data.
 */
const DETAIL_CONCURRENCY = 4;
/** Ceiling on pages fetched per run, whatever `maxItemsPerRun` says. */
const MAX_DETAIL_PAGES = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const ldEventSchema = z
  .object({
    name: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().optional(),
    description: z.string().optional(),
    eventAttendanceMode: z.string().optional(),
    eventStatus: z.string().optional(),
    location: z.unknown().optional(),
  })
  .passthrough();

/**
 * A date-only value is an all-day event. An offset may be written `+0000` or `+00:00`. A time
 * with no offset is floating; it is read as UTC rather than guessing the reader's zone.
 */
export function parseJsonLdDate(value: string): { iso: string; allDay: boolean } | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ms = Date.parse(`${trimmed}T00:00:00Z`);
    return Number.isNaN(ms) ? null : { iso: new Date(ms).toISOString(), allDay: true };
  }
  const withColon = trimmed.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const hasZone = /(Z|[+-]\d{2}:\d{2})$/.test(withColon);
  const ms = Date.parse(hasZone ? withColon : `${withColon}Z`);
  return Number.isNaN(ms) ? null : { iso: new Date(ms).toISOString(), allDay: false };
}

function attendanceModeOf(value: string | undefined): RawEventCandidate['attendanceMode'] {
  if (value?.endsWith('OnlineEventAttendanceMode')) return 'online';
  if (value?.endsWith('MixedEventAttendanceMode')) return 'mixed';
  if (value?.endsWith('OfflineEventAttendanceMode')) return 'offline';
  return undefined;
}

interface LocationInfo {
  text: string;
  countryCode?: string;
  virtual: boolean;
}

function readLocation(raw: unknown): LocationInfo {
  const parts: string[] = [];
  let countryCode: string | undefined;
  let virtual = false;

  for (const place of Array.isArray(raw) ? raw : [raw]) {
    if (typeof place === 'string') {
      parts.push(place);
      continue;
    }
    if (!place || typeof place !== 'object') continue;
    const node = place as Record<string, unknown>;
    if (String(node['@type']).includes('VirtualLocation')) virtual = true;
    if (typeof node.name === 'string') parts.push(node.name);
    const address = node.address;
    if (typeof address === 'string') parts.push(address);
    else if (address && typeof address === 'object') {
      const a = address as Record<string, unknown>;
      for (const key of ['addressLocality', 'addressRegion']) {
        if (typeof a[key] === 'string') parts.push(a[key] as string);
      }
      const country = a.addressCountry;
      const code = typeof country === 'string' ? country : (country as { name?: string })?.name;
      if (typeof code === 'string') {
        // Only an ISO alpha-2 code settles the country; a name is left to the text rules.
        if (/^[A-Za-z]{2}$/.test(code)) countryCode = code;
        else parts.push(code);
      }
    }
  }
  return { text: parts.join(', ').slice(0, 120), countryCode, virtual };
}

/** Every schema.org Event node in a page's JSON-LD blocks, validated; malformed blocks are skipped. */
export function extractLdEvents(html: string): z.infer<typeof ldEventSchema>[] {
  const $ = cheerio.load(html);
  const events: z.infer<typeof ldEventSchema>[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(record['@type']).filter((t) => typeof t === 'string');
    if (types.some((t) => (t as string).endsWith('Event'))) {
      const parsed = ldEventSchema.safeParse(record);
      if (parsed.success) events.push(parsed.data);
    }
    for (const value of Object.values(record)) if (value && typeof value === 'object') visit(value);
  };
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      visit(JSON.parse($(script).contents().text()));
    } catch {
      // A malformed block says nothing about the others.
    }
  }
  return events;
}

export function candidateFromLdEvent(
  node: z.infer<typeof ldEventSchema>,
  pageUrl: string,
  language: RawEventCandidate['language'],
): RawEventCandidate | null {
  if (/Event(Cancelled|Postponed)$/.test(node.eventStatus ?? '')) return null;
  const start = parseJsonLdDate(node.startDate);
  if (!start) return null;

  let endsAt: string | undefined;
  const end = node.endDate ? parseJsonLdDate(node.endDate) : null;
  if (end) {
    // A date-only end is the last day, inclusive; the model keeps all-day ends exclusive.
    const ms = Date.parse(end.iso) + (start.allDay && end.allDay ? DAY_MS : 0);
    if (ms > Date.parse(start.iso)) endsAt = new Date(ms).toISOString();
  }

  const location = readLocation(node.location);
  const mode =
    attendanceModeOf(node.eventAttendanceMode) ?? (location.virtual ? 'online' : undefined);
  return {
    // The URL we fetched, not the one the page claims for itself.
    url: pageUrl,
    title: node.name,
    startsAt: start.iso,
    endsAt,
    allDay: start.allDay,
    summary: stripHtml(node.description ?? ''),
    location: location.text || undefined,
    countryCode: location.countryCode,
    attendanceMode: mode,
    language,
  };
}

function detailLinks(html: string, listingUrl: string, source: EventSourceConfig): string[] {
  const listing = new URL(listingUrl);
  const $ = cheerio.load(html);
  const links = new Set<string>();
  for (const anchor of $('a[href]').toArray()) {
    let url: URL;
    try {
      url = new URL($(anchor).attr('href') ?? '', listing);
    } catch {
      continue;
    }
    url.hash = '';
    url.search = '';
    if (!isSafeUrl(url.toString()) || url.hostname !== listing.hostname) continue;
    if (url.pathname === listing.pathname || url.pathname === `${listing.pathname}/`) continue;
    if (!source.includePaths.some((p) => url.pathname.includes(p))) continue;
    if (source.excludePaths.some((p) => url.pathname.includes(p))) continue;
    links.add(url.toString());
  }
  return [...links];
}

export async function collectEventsFromJsonLd(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
): Promise<EventAdapterResult> {
  if (source.includePaths.length === 0) {
    throw new Error('A jsonld event source needs includePaths to tell event links from the rest');
  }

  const listing = await fetchWithPolicy(source.feedUrl, undefined, repositoryUrl);
  const links = detailLinks(listing.body, source.feedUrl, source).slice(
    0,
    Math.min(source.maxItemsPerRun, MAX_DETAIL_PAGES),
  );
  // A layout change that hides the links must show up as a failure, not as "no events".
  if (links.length === 0) throw new Error('No event links found on the listing page');

  const limit = pLimit(DETAIL_CONCURRENCY);
  let pagesWithEvent = 0;
  let responseTimeMs = listing.responseTimeMs;
  const candidates: RawEventCandidate[] = [];

  await Promise.all(
    links.map((link) =>
      limit(async () => {
        try {
          const page = await fetchWithPolicy(link, undefined, repositoryUrl);
          responseTimeMs += page.responseTimeMs;
          const [node] = extractLdEvents(page.body);
          if (!node) return;
          pagesWithEvent += 1;
          const candidate = candidateFromLdEvent(node, link, source.language);
          if (candidate) candidates.push(candidate);
        } catch {
          // One unreachable event page does not make the others wrong.
        }
      }),
    ),
  );

  if (pagesWithEvent === 0) throw new Error('No schema.org Event found on the linked pages');
  candidates.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.url.localeCompare(b.url));
  return { candidates, responseTimeMs };
}
