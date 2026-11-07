/**
 * Same date, next year. Used when an organiser has not announced new dates: the previous
 * edition's calendar date is assumed to repeat, and the result is always flagged as estimated.
 * Works on plain YYYY-MM-DD days, since the sources that need it only know days.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayRange {
  /** First day, YYYY-MM-DD. */
  startDate: string;
  /** Last day, inclusive, YYYY-MM-DD. */
  endDate?: string;
}

function parseDay(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The same calendar day `years` later; 29 February becomes 28 February in a common year. */
export function addYears(day: string, years: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const year = y + years;
  const clamped = m === 2 && d === 29 && !isLeapYear(year) ? 28 : d;
  return formatDay(Date.UTC(year, m - 1, clamped));
}

/** The first day after the range, as epoch ms: when the event is over. */
export function dayRangeEndMs(range: DayRange): number {
  return parseDay(range.endDate ?? range.startDate) + DAY_MS;
}

/**
 * Next year's version of an edition, keeping its length, or null when that is already over:
 * an edition older than a year says nothing about this one, so it is not projected.
 */
export function projectNextEdition(last: DayRange, now: Date): DayRange | null {
  const startDate = addYears(last.startDate, 1);
  const span = last.endDate ? parseDay(last.endDate) - parseDay(last.startDate) : 0;
  const projected: DayRange = {
    startDate,
    endDate: span > 0 ? formatDay(parseDay(startDate) + span) : undefined,
  };
  return dayRangeEndMs(projected) > now.getTime() ? projected : null;
}

/** The edition to show: the earliest one not yet over, or null. */
export function nextUpcoming<T extends DayRange>(editions: T[], now: Date): T | null {
  return (
    [...editions]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .find((edition) => dayRangeEndMs(edition) > now.getTime()) ?? null
  );
}

export function latestEdition<T extends DayRange>(editions: T[]): T | null {
  return [...editions].sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}
