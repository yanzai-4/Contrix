import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { enMessages } from './locales/en';
import { zhMessages } from './locales/zh';

export type UiLanguage = 'en' | 'zh';

const STORAGE_KEY = 'contrix.ui.language';
const LANGUAGE_PACKS: Record<UiLanguage, Record<string, string>> = {
  en: enMessages,
  zh: zhMessages
};

interface I18nContextValue {
  language: UiLanguage;
  setLanguage: (next: UiLanguage) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLanguage(): UiLanguage {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === 'zh' || value === 'en') {
      return value;
    }
  } catch {
    // Ignore storage access issues and use the default language.
  }

  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => readStoredLanguage());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage write failures.
    }
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
      t: (key) => LANGUAGE_PACKS[language][key] ?? key
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider.');
  }

  return context;
}
