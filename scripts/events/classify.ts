import type { EventItem } from '../schemas.ts';

export type EventFormat = EventItem['format'];
export type EventKind = EventItem['kind'];

const NORTH_AMERICA_COUNTRIES = new Set(['US', 'CA', 'MX']);

const HYBRID_PATTERN = /\bhybrid(e)?\b/i;
const IN_PERSON_PATTERN = /\b(in[- ]person|on[- ]site|onsite|en pr[ée]sentiel)\b/i;
/** Loose words, trusted only where they describe the event itself: its title or its place. */
const ONLINE_WORD_PATTERN =
  /\b(webinar|webcast|web conference|online|virtual|live ?stream(ing)?|webinaire|en ligne|virtuel(le)?|cloud native live)\b/i;
/** In running text a bare "online" is usually about something else ("online authentication"),
 *  so the summary only counts phrases that say the event itself is held online. */
const ONLINE_PHRASE_PATTERN =
  /\b(webinar|webcast|webinaire|(online|virtual|livestreamed?|live[- ]streamed?)\s+(event|session|conference|summit|workshop|training|meeting|panel|series|program)|(held|hosted|delivered)\s+(online|virtually)|join us (online|virtually)|en ligne)\b/i;
/** NIST titles its teleconferences "… Call". */
const CALL_TITLE_PATTERN = /\bcall\s*$/i;
const CONFERENCE_PATTERN =
  /(conference|conférence|summit|congress|congrès|symposium|expo\b|forum|workshop|seminar|kubecon|securitycon|cloudnativecon|\bkcd\b)/i;
const CALL_FOR_PROPOSALS_PATTERN =
  /^\s*(cfps?\b|call for (papers|proposals|speakers|presentations))/i;

/** Conference towns and area words. Deliberately a short list: a miss only drops an in-person
 *  event from a global publisher, whereas a loose pattern would let European events through. */
const NORTH_AMERICA_PATTERN = new RegExp(
  [
    'north america',
    'united states',
    '\\busa\\b',
    '\\bu\\.s\\.a?\\b',
    'canada',
    'canadian',
    'm[eé]xico',
    'new york',
    'san francisco',
    'las vegas',
    'seattle',
    'austin',
    'boston',
    'washington,? d\\.?c\\.?',
    'chicago',
    'denver',
    'salt lake city',
    'atlanta',
    'toronto',
    'montr[eé]al',
    'vancouver',
    'ottawa',
    'calgary',
    'san diego',
    'los angeles',
    'dallas',
    'houston',
    'orlando',
    'phoenix',
    'portland',
    'nashville',
    'san jose',
    'gaithersburg',
    'boulder',
  ].join('|'),
  'i',
);

/**
 * "Half Moon Bay, CA": a US state or Canadian province after a comma at the end of a location.
 * Only abbreviations that are not also an ISO country code, so "Mumbai, IN" (India), "Berlin, DE"
 * or "Jakarta, ID" never read as Indiana, Delaware or Idaho. States left out are still caught by
 * their city or by a country name.
 */
const REGION_SUFFIX_PATTERN = new RegExp(
  `,\\s*(${[
    'AK',
    'CA',
    'CT',
    'DC',
    'FL',
    'HI',
    'IA',
    'KS',
    'MI',
    'ND',
    'NH',
    'NJ',
    'NM',
    'NV',
    'NC',
    'NY',
    'OH',
    'OK',
    'OR',
    'RI',
    'TX',
    'UT',
    'VT',
    'WA',
    'WI',
    'WV',
    'WY',
    'AB',
    'BC',
    'MB',
    'NB',
    'NS',
    'ON',
    'QC',
  ].join('|')})\\s*$`,
);

export function isCallForProposals(title: string, categories: string[] = []): boolean {
  return CALL_FOR_PROPOSALS_PATTERN.test(title) || categories.some((c) => /\bcfps?\b/i.test(c));
}

export interface FormatInput {
  title: string;
  location?: string;
  summary: string;
}

export function classifyFormat({ title, location, summary }: FormatInput): EventFormat {
  const headline = `${title} ${location ?? ''}`;
  const all = `${headline} ${summary}`;
  if (HYBRID_PATTERN.test(all)) return 'hybrid';
  const online =
    ONLINE_WORD_PATTERN.test(headline) ||
    CALL_TITLE_PATTERN.test(title) ||
    ONLINE_PHRASE_PATTERN.test(summary);
  if (online && IN_PERSON_PATTERN.test(all)) return 'hybrid';
  return online ? 'online' : 'in-person';
}

export function classifyKind(text: string, format: EventFormat): EventKind {
  if (CONFERENCE_PATTERN.test(text)) return 'conference';
  return format === 'online' ? 'webinar' : 'event';
}

/**
 * True when the text points at North America. An explicit country code settles it either
 * way; without one, the text is searched for the area, a country or a conference town.
 */
export function isNorthAmerica(text: string, countryCode?: string, location?: string): boolean {
  if (countryCode) return NORTH_AMERICA_COUNTRIES.has(countryCode.toUpperCase());
  return (
    NORTH_AMERICA_PATTERN.test(text) || (location ? REGION_SUFFIX_PATTERN.test(location) : false)
  );
}

export interface ScopeInput {
  format: EventFormat;
  text: string;
  /** The location on its own, for the state/province suffix test. */
  location?: string;
  countryCode?: string;
  sourceRegion: 'north-america' | 'global';
  /** `worldwide` (the default) keeps every event; `north-america` drops in-person ones elsewhere. */
  scope?: 'worldwide' | 'north-america';
}

/**
 * Scope rule: every online event, plus (depending on `scope`) every in-person and hybrid event,
 * or only those held in North America.
 * A source declared `north-america` vouches for its in-person events unless an explicit
 * country says otherwise.
 */
export function isInScope({
  format,
  text,
  location,
  countryCode,
  sourceRegion,
  scope = 'worldwide',
}: ScopeInput): boolean {
  if (format === 'online' || scope === 'worldwide') return true;
  if (countryCode) return isNorthAmerica(text, countryCode);
  if (sourceRegion === 'north-america') return true;
  return isNorthAmerica(text, undefined, location);
}
