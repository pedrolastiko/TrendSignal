export interface IcsEvent {
  uid?: string;
  summary: string;
  description: string;
  url?: string;
  location?: string;
  categories: string[];
  /** ISO 8601 UTC. For all-day events: midnight UTC of the first day. */
  startsAt: string;
  /** ISO 8601 UTC. For all-day events it is exclusive (iCalendar's own convention). */
  endsAt?: string;
  allDay: boolean;
}

/** RFC 5545 §3.1: a line starting with a space or tab continues the previous one. */
export function unfoldLines(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function unescapeText(value: string): string {
  // One pass, so an escaped backslash followed by "n" is not mistaken for a newline escape.
  return value
    .replace(/\\([nN,;\\])/g, (_match, char: string) => (char === 'n' || char === 'N' ? ' ' : char))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. Throws RangeError for an unknown zone. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Converts a wall-clock time in an IANA zone to epoch ms, or null if the zone is unknown. */
export function zonedLocalToUtc(
  [year, month, day, hour, minute, second]: number[],
  timeZone: string,
): number | null {
  try {
    const guess = Date.UTC(year!, month! - 1, day!, hour, minute, second);
    // The offset depends on the instant, so refine once around a DST change.
    const first = guess - zoneOffsetMs(guess, timeZone);
    return guess - zoneOffsetMs(first, timeZone);
  } catch {
    return null;
  }
}

interface ParsedProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseProperty(line: string): ParsedProperty | null {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const [rawName, ...rawParams] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf('=');
    if (eq > 0) params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/"/g, '');
  }
  return { name: (rawName ?? '').toUpperCase(), params, value: line.slice(colon + 1) };
}

function parseDate(prop: ParsedProperty): { iso: string; allDay: boolean } | null {
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(prop.value);
  if (dateOnly) {
    const ms = Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return { iso: new Date(ms).toISOString(), allDay: true };
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(prop.value);
  if (!dateTime) return null;
  const fields = dateTime.slice(1, 7).map(Number);
  const [y, mo, d, h, mi, s] = fields as [number, number, number, number, number, number];
  let ms: number | null;
  if (dateTime[7] === 'Z') ms = Date.UTC(y, mo - 1, d, h, mi, s);
  else if (prop.params.TZID) ms = zonedLocalToUtc(fields, prop.params.TZID);
  // A floating time carries no zone: read as UTC rather than guessing the reader's.
  else ms = Date.UTC(y, mo - 1, d, h, mi, s);
  if (ms === null || Number.isNaN(ms)) return null;
  return { iso: new Date(ms).toISOString(), allDay: false };
}

/** Parses the VEVENTs of an iCalendar document. Cancelled events and events without a usable start are skipped. */
export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: ParsedProperty[] | null = null;

  for (const line of unfoldLines(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = [];
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const event = buildEvent(current);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const prop = parseProperty(line);
    if (prop) current.push(prop);
  }
  return events;
}

function buildEvent(props: ParsedProperty[]): IcsEvent | null {
  const first = (name: string) => props.find((p) => p.name === name);
  if (first('STATUS')?.value.toUpperCase() === 'CANCELLED') return null;

  const startProp = first('DTSTART');
  const start = startProp ? parseDate(startProp) : null;
  const summary = unescapeText(first('SUMMARY')?.value ?? '');
  if (!start || !summary) return null;

  const endProp = first('DTEND');
  const end = endProp ? parseDate(endProp) : null;
  const url = first('URL')?.value.trim();
  const location = unescapeText(first('LOCATION')?.value ?? '');

  return {
    uid: first('UID')?.value.trim(),
    summary,
    description: unescapeText(first('DESCRIPTION')?.value ?? ''),
    url: url || undefined,
    location: location || undefined,
    categories: props
      .filter((p) => p.name === 'CATEGORIES')
      .flatMap((p) => p.value.split(','))
      .map((c) => c.trim())
      .filter(Boolean),
    startsAt: start.iso,
    endsAt: end && end.iso > start.iso ? end.iso : undefined,
    allDay: start.allDay,
  };
}
