import type { LucideIcon } from 'lucide-react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useI18n, type Locale } from '../hooks/useI18n';
import { useTheme } from '../hooks/useTheme';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/theme';

const themeIcons: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const LOCALES: readonly Locale[] = ['en', 'fr'];

function segmentClass(active: boolean): string {
  return `inline-flex flex-1 items-center justify-center gap-1.5 rounded-control px-2 py-1.5 text-xs font-medium transition-colors ${
    active ? 'bg-primary text-on-primary' : 'text-ink hover:bg-surface'
  }`;
}

/** Personal display preferences (theme, interface language), stored in this browser only. */
export function PreferencesPanel() {
  const { t, locale, setLocale } = useI18n();
  const { preference, setPreference } = useTheme();

  return (
    <section aria-label={t.preferences.title} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted" id="pref-theme-label">
          {t.preferences.theme.label}
        </p>
        <div
          role="group"
          aria-labelledby="pref-theme-label"
          className="flex gap-1 rounded-control border border-border p-1"
        >
          {THEME_PREFERENCES.map((option) => {
            const Icon = themeIcons[option];
            return (
              <button
                key={option}
                type="button"
                aria-pressed={preference === option}
                onClick={() => setPreference(option)}
                className={segmentClass(preference === option)}
              >
                <Icon size={14} aria-hidden="true" />
                {t.preferences.theme[option]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted" id="pref-language-label">
          {t.preferences.language.label}
        </p>
        <div
          role="group"
          aria-labelledby="pref-language-label"
          className="flex gap-1 rounded-control border border-border p-1"
        >
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              lang={option}
              aria-pressed={locale === option}
              onClick={() => setLocale(option)}
              className={segmentClass(locale === option)}
            >
              {t.preferences.language[option]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
