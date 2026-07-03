"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { dictionaries, en, type TranslationKey } from "@/lib/i18n/dictionaries";

export type Locale = "en" | "pt";
export const LOCALES: Locale[] = ["en", "pt"];
export const LOCALE_STORAGE_KEY = "telar.locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  pt: "Português",
};

type TranslateParams = Record<string, string | number>;
export type Translate = (key: TranslationKey, params?: TranslateParams) => string;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

/** Default locale used for SSR and the first client render (avoids hydration drift). */
const DEFAULT_LOCALE: Locale = "en";

export function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "en" || stored === "pt") return stored;

  const language = window.navigator.language?.toLowerCase() ?? "";
  return language.startsWith("pt") ? "pt" : DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const detected = detectLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (detected !== DEFAULT_LOCALE) setLocaleState(detected);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }, []);

  const t = useCallback<Translate>(
    (key, params) => interpolate(dictionaries[locale][key] ?? en[key] ?? key, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
