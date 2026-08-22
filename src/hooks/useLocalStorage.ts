import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'trendsignal';
const STORAGE_VERSION = 'v1';

function buildKey(key: string): string {
  return `${STORAGE_PREFIX}:${STORAGE_VERSION}:${key}`;
}

function readValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(buildKey(key));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function useLocalStorage<T>(key: string, fallback: T): [T, (value: T) => void, () => void] {
  const [value, setValue] = useState<T>(() => readValue(key, fallback));

  useEffect(() => {
    try {
      window.localStorage.setItem(buildKey(key), JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode, quota); silently ignore.
    }
  }, [key, value]);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(buildKey(key));
    } catch {
      // ignore
    }
    setValue(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, reset];
}
