import { useCallback, useEffect, useState } from 'react';
import { loadAllData, type TrendSignalData } from '../data/client';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TrendSignalData };

export function useTrendSignalData(): { state: DataState; reload: () => void } {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [refreshToken, setRefreshToken] = useState(0);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAllData()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          setState({ status: 'error', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { state, reload };
}

export function isStale(lastSuccessfulScanAt: string, thresholdHours = 24): boolean {
  const last = new Date(lastSuccessfulScanAt).getTime();
  if (Number.isNaN(last)) return true;
  const hours = (Date.now() - last) / (1000 * 60 * 60);
  return hours > thresholdHours;
}
