import type { DayRange } from './projection.ts';

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** One "day month" or "month day" part, with optional ordinal suffix; the year is optional. */
const MONTH_NAME = '[A-Za-z]{3,9}\\.?';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const YEAR = '(20\\d{2})';

const DAY_FIRST = new RegExp(`^${DAY}(?:\\s+(${MONTH_NAME}))?$`);
const MONTH_FIRST = new RegExp(`^(${MONTH_NAME})\\s+${DAY}$`);

interface Part {
  day: number;
  month?: number;
}

function monthOf(name: string): number | undefined {
  return MONTHS[name.replace(/\.$/, '').toLowerCase()];
}

function parsePart(raw: string): Part | null {
  const text = raw.trim().replace(/,$/, '');
  const dayFirst = DAY_FIRST.exec(text);
  if (dayFirst) {
    const month = dayFirst[2] ? monthOf(dayFirst[2]) : undefined;
    if (dayFirst[2] && !month) return null;
    return { day: Number(dayFirst[1]), month };
  }
  const monthFirst = MONTH_FIRST.exec(text);
  if (monthFirst) {
    const month = monthOf(monthFirst[1] as string);
    return month ? { day: Number(monthFirst[2]), month } : null;
  }
  return null;
}

function iso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * A date as people write it on an event page: "27th – 28th October 2026", "November 3rd – 4th,
 * 2026", "9-10 February, 2027", "30 November - 2 December 2026", "10th November 2026",
 * "February 25th 2027". The year is required; anything else that does not parse gives null, so
 * a layout change cannot invent a date. A range whose end precedes its start is rejected.
 */
export function parseHumanDateRange(text: string): DayRange | null {
  const cleaned = text
    .replace(/&ndash;|&mdash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
  const yearMatch = new RegExp(`^(.*?),?\\s*${YEAR}\\b`).exec(cleaned);
  if (!yearMatch) return null;
  const year = Number(yearMatch[2]);
  const body = (yearMatch[1] as string).trim();

  const pieces = body.split(/\s*[–—-]\s*|\s+to\s+/).filter(Boolean);
  if (pieces.length < 1 || pieces.length > 2) return null;
  const first = parsePart(pieces[0] as string);
  const last = pieces[1] ? parsePart(pieces[1]) : null;
  if (!first || (pieces[1] && !last)) return null;

  // "27th – 28th October": the month is written once, on the last part.
  const startMonth = first.month ?? last?.month;
  const endMonth = last?.month ?? first.month;
  if (!startMonth || !endMonth) return null;

  const startDate = iso(year, startMonth, first.day);
  if (!startDate) return null;
  if (!last) return { startDate };
  // A range that crosses New Year ("30 December – 2 January 2027") ends in the stated year.
  const startYear = endMonth < startMonth ? year - 1 : year;
  const start = iso(startYear, startMonth, first.day);
  const endDate = iso(year, endMonth, last.day);
  if (!start || !endDate || endDate < start) return null;
  return { startDate: start, endDate: endDate > start ? endDate : undefined };
}
