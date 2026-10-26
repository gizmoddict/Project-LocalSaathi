'use client';

import React, { useState, useEffect } from 'react';
import { Globe, X } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { SUPPORTED_LANGUAGES, SupportedLocale } from '@/i18n/languages';

const PROMPT_STORAGE_KEY = 'localsaathi_language_prompt_dismissed';

export function FirstVisitLanguagePrompt() {
  const { locale, setLocale, t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(PROMPT_STORAGE_KEY);
      const userSelectedLocale = localStorage.getItem('localsaathi_locale');
      // Only show if the user has never explicitly dismissed the prompt and never picked a locale
      if (!dismissed && !userSelectedLocale) {
        setVisible(true);
      }
    } catch {
      // Ignored
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(PROMPT_STORAGE_KEY, 'true');
    } catch {
      // Ignored
    }
  };

  const handleSelect = (code: SupportedLocale) => {
    setLocale(code);
    handleDismiss();
  };

  if (!visible) return null;

  // Highlights top 6 widely used Indian regional languages on first prompt
  const popularCodes: SupportedLocale[] = ['hi', 'bn', 'te', 'mr', 'ta', 'en'];
  const popularLanguages = SUPPORTED_LANGUAGES.filter((l) => popularCodes.includes(l.code));

  return (
    <div
      role="region"
      aria-label="Language selection banner"
      className="relative z-40 border-b border-[#c8dfd0] bg-[#eef7f0] px-4 py-2.5 text-slate-800 shadow-sm"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 font-medium">
          <Globe className="h-4 w-4 shrink-0 text-[#28734f]" />
          <span>
            <strong className="font-bold text-[#18382c]">{t('languagePrompt.title')}</strong> —{' '}
            {t('languagePrompt.subtitle')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {popularLanguages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleSelect(lang.code)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                lang.code === locale
                  ? 'bg-[#173b2f] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-[#d6ebd9] hover:text-[#18382c] border border-slate-200'
              }`}
            >
              {lang.nativeName}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t('languagePrompt.dismiss')}
            className="ml-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
