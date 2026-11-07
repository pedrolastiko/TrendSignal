export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Same keys as `useLocalStorage` builds, read directly so the theme can be applied
 *  before React renders (no flash of the wrong theme). */
const STORAGE_KEY = 'trendsignal:v1:theme';

const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#0F172A', dark: '#0B1220' };

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/** Reads the stored preference, tolerating missing, corrupted or unavailable storage. */
export function readStoredThemePreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 'system';
    const parsed: unknown = JSON.parse(raw);
    return isThemePreference(parsed) ? parsed : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[resolved]);
}

/** Recharts takes colours as SVG attributes, which cannot use the CSS variables, so the
 *  chart reads these resolved values instead. They mirror the tokens in styles/index.css. */
export const CHART_COLORS: Record<
  ResolvedTheme,
  { grid: string; axis: string; bar: string; tooltipBg: string; tooltipText: string }
> = {
  light: {
    grid: '#E5E7EB',
    axis: '#6B7280',
    bar: '#0F172A',
    tooltipBg: '#FFFFFF',
    tooltipText: '#111827',
  },
  dark: {
    grid: '#334155',
    axis: '#94A3B8',
    bar: '#E2E8F0',
    tooltipBg: '#111827',
    tooltipText: '#F1F5F9',
  },
};
