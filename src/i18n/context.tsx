'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  SupportedLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LANGUAGES,
  getLanguageMetadata,
  isSupportedLocale,
  LanguageMetadata,
} from './languages';
import { LOCALES, Translations } from './locales';

export const LOCALE_STORAGE_KEY = 'localsaathi_locale';

// Dot-notation path generator for Translations
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<Translations>;

export interface I18nContextValue {
  locale: SupportedLocale;
  metadata: LanguageMetadata;
  setLocale: (locale: SupportedLocale) => void;
  dir: 'ltr' | 'rtl';
  t: (key: string, params?: Record<string, string | number>) => string;
  formatCurrency: (amount: number) => string;
  formatNumber: (value: number) => string;
  formatDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Retrieve translation by dot-separated path from dictionary
 */
function resolvePath(obj: any, path: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate placeholders like {name}, {count}, {distance}
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`;
  });
}

/**
 * Resolve client language preference from storage or browser
 */
function detectInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && isSupportedLocale(saved)) {
      return saved;
    }
  } catch {
    // localStorage might be unavailable or restricted
  }

  try {
    const browserLanguages = navigator.languages || [navigator.language || ''];
    for (const rawLang of browserLanguages) {
      if (!rawLang) continue;
      const primaryTag = rawLang.split('-')[0].toLowerCase();
      if (isSupportedLocale(primaryTag)) {
        return primaryTag;
      }
    }
  } catch {
    // navigator might be restricted
  }

  return DEFAULT_LOCALE;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: SupportedLocale;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(
    initialLocale && isSupportedLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE
  );

  // Synchronize with client-side detected locale after initial mount
  useEffect(() => {
    const detected = detectInitialLocale();
    if (detected !== locale) {
      setLocaleState(detected);
    }
  }, []);

  const metadata = useMemo(() => getLanguageMetadata(locale), [locale]);

  // Apply HTML document lang and dir attributes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = metadata.direction;
      document.documentElement.setAttribute('data-locale', locale);
    }
  }, [locale, metadata.direction]);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    if (!isSupportedLocale(newLocale)) return;
    setLocaleState(newLocale);

    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      // Also set cookie so future server-side or Edge renders can detect it
      document.cookie = `${LOCALE_STORAGE_KEY}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Ignore storage errors in private modes
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('localsaathi:language_changed', { detail: { locale: newLocale } }));
    }
  }, []);

  /**
   * Main Translation Function with Fallback & Interpolation
   */
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const activeDict = LOCALES[locale];
      const fallbackDict = LOCALES[DEFAULT_LOCALE];

      // Handle plural variation if count is supplied
      let resolvedKey = key;
      if (params && typeof params.count === 'number' && params.count !== 1) {
        const pluralKey = `${key}_other`;
        if (resolvePath(activeDict, pluralKey) || resolvePath(fallbackDict, pluralKey)) {
          resolvedKey = pluralKey;
        }
      }

      // 1. Try active locale
      let template = resolvePath(activeDict, resolvedKey);

      // 2. Fallback to English
      if (!template) {
        template = resolvePath(fallbackDict, resolvedKey);
      }

      // 3. Fallback to base key if plural variation failed
      if (!template && resolvedKey !== key) {
        template = resolvePath(activeDict, key) || resolvePath(fallbackDict, key);
      }

      // 4. Return humanized key if completely missing in both
      if (!template) {
        const segments = key.split('.');
        return segments[segments.length - 1];
      }

      return interpolate(template, params);
    },
    [locale]
  );

  const formatCurrency = useCallback(
    (amount: number): string => {
      try {
        return new Intl.NumberFormat(locale === 'en' ? 'en-IN' : `${locale}-IN`, {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(amount);
      } catch {
        return `₹${amount.toLocaleString('en-IN')}`;
      }
    },
    [locale]
  );

  const formatNumber = useCallback(
    (value: number): string => {
      try {
        return new Intl.NumberFormat(locale === 'en' ? 'en-IN' : `${locale}-IN`).format(value);
      } catch {
        return String(value);
      }
    },
    [locale]
  );

  const formatDate = useCallback(
    (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
      try {
        const d = typeof date === 'string' ? new Date(date) : date;
        return new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : `${locale}-IN`, options || {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }).format(d);
      } catch {
        return String(date);
      }
    },
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      metadata,
      setLocale,
      dir: metadata.direction,
      t,
      formatCurrency,
      formatNumber,
      formatDate,
    }),
    [locale, metadata, setLocale, t, formatCurrency, formatNumber, formatDate]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}

export function useLocale() {
  const { locale, metadata, setLocale, dir } = useTranslation();
  return { locale, metadata, setLocale, dir, supportedLanguages: SUPPORTED_LANGUAGES };
}
