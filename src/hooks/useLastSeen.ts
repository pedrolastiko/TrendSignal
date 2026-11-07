import { useCallback, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { parseLastSeen } from '../lib/whatsNew';

/**
 * Remembers, in this browser only, when the reader last acknowledged the article feed.
 * The first visit starts the clock so an initial load does not flag everything as new.
 */
export function useLastSeen(): { lastSeenAt: number | null; markSeen: () => void } {
  const [stored, setStored] = useLocalStorage<string | null>('last-seen-at', null);
  const lastSeenAt = parseLastSeen(stored);

  useEffect(() => {
    if (lastSeenAt === null) setStored(new Date().toISOString());
    // Only the first visit (or a corrupted value) should initialise the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markSeen = useCallback(() => setStored(new Date().toISOString()), [setStored]);
  return { lastSeenAt, markSeen };
}
