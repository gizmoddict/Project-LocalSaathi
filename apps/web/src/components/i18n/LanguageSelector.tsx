'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from '@/i18n/context';
import { SUPPORTED_LANGUAGES, SupportedLocale } from '@/i18n/languages';

interface LanguageSelectorProps {
  variant?: 'header' | 'mobile' | 'compact';
  className?: string;
}

export function LanguageSelector({ variant = 'header', className = '' }: LanguageSelectorProps) {
  const { locale, setLocale, metadata, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        const currentIndex = SUPPORTED_LANGUAGES.findIndex((l) => l.code === locale);
        setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % SUPPORTED_LANGUAGES.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + SUPPORTED_LANGUAGES.length) % SUPPORTED_LANGUAGES.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < SUPPORTED_LANGUAGES.length) {
          selectLanguage(SUPPORTED_LANGUAGES[focusedIndex].code);
        }
        break;
      case 'Escape':
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  const selectLanguage = (code: SupportedLocale) => {
    setLocale(code);
    setIsOpen(false);
  };

  if (variant === 'mobile') {
    return (
      <div className={`pt-2 border-t border-slate-100 ${className}`}>
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Globe className="h-3.5 w-3.5 text-[#28734f]" />
          <span>{t('nav.selectLanguage')}</span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1.5 px-2">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang.code === locale;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => selectLanguage(lang.code)}
                aria-pressed={isSelected}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-[#173b2f] text-white shadow-sm font-bold'
                    : 'bg-slate-50 text-slate-700 hover:bg-[#edf4ed] hover:text-[#18382c]'
                }`}
              >
                <span className="truncate">
                  {lang.nativeName}
                  {lang.code !== 'en' && (
                    <span className={`ml-1 text-[10px] ${isSelected ? 'text-emerald-200' : 'text-slate-400'}`}>
                      ({lang.englishName})
                    </span>
                  )}
                </span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`} onKeyDown={handleKeyDown}>
      <button
        type="button"
        id="language-selector-button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={`${t('nav.selectLanguage')}. ${t('nav.currentLanguage', { lang: metadata.nativeName })}`}
        onClick={() => setIsOpen((prev) => !prev)}
        className="group flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition duration-150 hover:border-[#173b2f] hover:text-[#173b2f] focus:outline-none focus:ring-2 focus:ring-[#173b2f]/30"
      >
        <Globe className="h-3.5 w-3.5 text-[#28734f] transition group-hover:scale-110" />
        <span className="font-semibold text-slate-800">{metadata.nativeName}</span>
        {metadata.code !== 'en' && (
          <span className="hidden lg:inline text-[10px] font-normal text-slate-400">
            ({metadata.englishName})
          </span>
        )}
        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t('nav.selectLanguage')}
          tabIndex={-1}
          className="absolute right-0 z-50 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl ring-1 ring-black/5 focus:outline-none"
        >
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
            {t('nav.selectLanguage')} (12 Languages)
          </div>
          {SUPPORTED_LANGUAGES.map((lang, index) => {
            const isSelected = lang.code === locale;
            const isFocused = index === focusedIndex;

            return (
              <div
                key={lang.code}
                role="option"
                id={`lang-option-${lang.code}`}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => selectLanguage(lang.code)}
                onMouseEnter={() => setFocusedIndex(index)}
                className={`group flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs transition ${
                  isSelected
                    ? 'bg-[#edf4ed] text-[#173b2f] font-bold'
                    : isFocused
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-900 group-hover:text-[#173b2f]">
                    {lang.nativeName}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {lang.englishName} • {lang.script}
                  </span>
                </div>
                {isSelected && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#173b2f] text-white">
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
