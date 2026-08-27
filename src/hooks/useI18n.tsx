import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { fr } from '../i18n/fr';
import { en } from '../i18n/en';
import { useLocalStorage } from './useLocalStorage';

export type Locale = 'fr' | 'en';

const dictionaries = { fr, en };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof fr;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // The storage key is deliberately not the old `locale`: useLocalStorage persists on
  // mount, so every past visitor already has `"fr"` written under that key and would
  // keep the French interface no matter what this default says.
  const [locale, setLocale] = useLocalStorage<Locale>('ui-locale', 'en');

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: dictionaries[locale] }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
