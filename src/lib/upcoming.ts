/** Publisher clocks and timezone handling drift by a few hours; a date this close to now is
 *  treated as already published rather than flagged as an upcoming event. */
export const UPCOMING_TOLERANCE_MS = 60 * 60 * 1000;

export function isUpcoming(publishedAt: string, now: number = Date.now()): boolean {
  const time = Date.parse(publishedAt);
  return !Number.isNaN(time) && time - now > UPCOMING_TOLERANCE_MS;
}
