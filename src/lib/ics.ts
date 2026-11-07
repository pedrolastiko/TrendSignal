import type { EventItem } from '../types';

const encoder = new TextEncoder();

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1: lines are at most 75 octets; a continuation starts with one space. */
export function foldLine(line: string): string[] {
  const lines: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      lines.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  lines.push(current);
  return lines;
}

function utcStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function dateStamp(iso: string): string {
  return utcStamp(iso).slice(0, 8);
}

/** An all-day event without an end lasts one day; a timed one, one hour. */
function endOf(event: EventItem): string {
  if (event.endsAt) return event.endsAt;
  const start = Date.parse(event.startsAt);
  return new Date(start + (event.allDay ? 24 : 1) * 60 * 60 * 1000).toISOString();
}

/** A one-event iCalendar document, built in the browser from the published JSON. */
export function buildEventIcs(event: EventItem, now: Date = new Date()): string {
  const location = event.location ?? (event.format === 'online' ? 'Online' : undefined);
  const tentative = event.dateStatus === 'estimated';
  const description = [
    tentative ? 'Date not confirmed by the organiser.' : '',
    event.summary,
    event.url,
  ]
    .filter(Boolean)
    .join('\n');

  const properties = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TrendSignal//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@trendsignal`,
    `DTSTAMP:${utcStamp(now.toISOString())}`,
    event.allDay
      ? `DTSTART;VALUE=DATE:${dateStamp(event.startsAt)}`
      : `DTSTART:${utcStamp(event.startsAt)}`,
    event.allDay
      ? `DTEND;VALUE=DATE:${dateStamp(endOf(event))}`
      : `DTEND:${utcStamp(endOf(event))}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${event.url}`,
    ...(tentative ? ['STATUS:TENTATIVE'] : []),
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${properties.flatMap(foldLine).join('\r\n')}\r\n`;
}

export function eventIcsFileName(event: EventItem): string {
  const slug = event.title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'event'}.ics`;
}

/** Saves the event as an .ics file. Nothing is sent anywhere. */
export function downloadEventIcs(event: EventItem): void {
  const blob = new Blob([buildEventIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = eventIcsFileName(event);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
