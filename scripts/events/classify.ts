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
export function isNorthAmerica(text: string, countryCode?: string): boolean {
  if (countryCode) return NORTH_AMERICA_COUNTRIES.has(countryCode.toUpperCase());
  return NORTH_AMERICA_PATTERN.test(text);
}

export interface ScopeInput {
  format: EventFormat;
  text: string;
  countryCode?: string;
  sourceRegion: 'north-america' | 'global';
}

/**
 * Scope rule: every online event, plus in-person and hybrid events held in North America.
 * A source declared `north-america` vouches for its in-person events unless an explicit
 * country says otherwise.
 */
export function isInScope({ format, text, countryCode, sourceRegion }: ScopeInput): boolean {
  if (format === 'online') return true;
  if (countryCode) return isNorthAmerica(text, countryCode);
  if (sourceRegion === 'north-america') return true;
  return isNorthAmerica(text);
}
