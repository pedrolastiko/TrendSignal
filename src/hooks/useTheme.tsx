import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  isThemePreference,
  resolveTheme,
  systemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme';
import { useLocalStorage } from './useLocalStorage';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Personal display preference: `system` follows the OS and reacts to live changes. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setPreference] = useLocalStorage<ThemePreference>('theme', 'system');
  const preference = isThemePreference(stored) ? stored : 'system';
  const [systemResolved, setSystemResolved] = useState<ResolvedTheme>(() => systemTheme());

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemResolved(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = preference === 'system' ? systemResolved : resolveTheme(preference);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
