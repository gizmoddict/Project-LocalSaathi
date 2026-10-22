/**
 * LocalSaathi Supported Indian Languages Registry
 * 
 * Provides metadata, scripts, text direction, and lookup helpers
 * for all 12 supported Indian official languages.
 */

export type SupportedLocale =
  | 'en' // English
  | 'hi' // Hindi (हिन्दी)
  | 'bn' // Bengali (বাংলা)
  | 'mr' // Marathi (मराठी)
  | 'te' // Telugu (తెలుగు)
  | 'ta' // Tamil (தமிழ்)
  | 'gu' // Gujarati (ગુજરાતી)
  | 'kn' // Kannada (ಕನ್ನಡ)
  | 'ml' // Malayalam (മലയാളം)
  | 'pa' // Punjabi (ਪੰਜਾਬੀ)
  | 'or' // Odia (ଓଡ଼ିଆ)
  | 'ur'; // Urdu (اُردُو - RTL)

export interface LanguageMetadata {
  code: SupportedLocale;
  nativeName: string;
  englishName: string;
  direction: 'ltr' | 'rtl';
  script: string;
  sampleGreeting: string;
}

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const SUPPORTED_LANGUAGES: LanguageMetadata[] = [
  {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    direction: 'ltr',
    script: 'Latin',
    sampleGreeting: 'Welcome to LocalSaathi',
  },
  {
    code: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    direction: 'ltr',
    script: 'Devanagari',
    sampleGreeting: 'लोकलसाथी में आपका स्वागत है',
  },
  {
    code: 'bn',
    nativeName: 'বাংলা',
    englishName: 'Bengali',
    direction: 'ltr',
    script: 'Bengali',
    sampleGreeting: 'লোকালসাথীতে আপনাকে স্বাগতম',
  },
  {
    code: 'mr',
    nativeName: 'मराठी',
    englishName: 'Marathi',
    direction: 'ltr',
    script: 'Devanagari',
    sampleGreeting: 'लोकलसाथीमध्ये आपले स्वागत आहे',
  },
  {
    code: 'te',
    nativeName: 'తెలుగు',
    englishName: 'Telugu',
    direction: 'ltr',
    script: 'Telugu',
    sampleGreeting: 'లోకల్‌సాథీకి స్వాగతం',
  },
  {
    code: 'ta',
    nativeName: 'தமிழ்',
    englishName: 'Tamil',
    direction: 'ltr',
    script: 'Tamil',
    sampleGreeting: 'லோக்கல்சாத்திக்கு நல்வரவு',
  },
  {
    code: 'gu',
    nativeName: 'ગુજરાતી',
    englishName: 'Gujarati',
    direction: 'ltr',
    script: 'Gujarati',
    sampleGreeting: 'લોકલસાથીમાં આપનું સ્વાગત છે',
  },
  {
    code: 'kn',
    nativeName: 'ಕನ್ನಡ',
    englishName: 'Kannada',
    direction: 'ltr',
    script: 'Kannada',
    sampleGreeting: 'ಲೋಕಲ್‌ಸಾಥಿಗೆ ಸ್ವಾಗತ',
  },
  {
    code: 'ml',
    nativeName: 'മലയാളം',
    englishName: 'Malayalam',
    direction: 'ltr',
    script: 'Malayalam',
    sampleGreeting: 'ലോക്കൽസാഥിയിലേക്ക് സ്വാഗതം',
  },
  {
    code: 'pa',
    nativeName: 'ਪੰਜਾਬੀ',
    englishName: 'Punjabi',
    direction: 'ltr',
    script: 'Gurmukhi',
    sampleGreeting: 'ਲੋਕਲਸਾਥੀ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ',
  },
  {
    code: 'or',
    nativeName: 'ଓଡ଼ିଆ',
    englishName: 'Odia',
    direction: 'ltr',
    script: 'Odia',
    sampleGreeting: 'ଲୋକାଲସାଥୀକୁ ସ୍ୱାଗତ',
  },
  {
    code: 'ur',
    nativeName: 'اُردُو',
    englishName: 'Urdu',
    direction: 'rtl',
    script: 'Perso-Arabic',
    sampleGreeting: 'لوکل ساتھی میں خوش آمدید',
  },
];

export const LANGUAGE_MAP: Record<SupportedLocale, LanguageMetadata> = SUPPORTED_LANGUAGES.reduce(
  (acc, lang) => {
    acc[lang.code] = lang;
    return acc;
  },
  {} as Record<SupportedLocale, LanguageMetadata>
);

export function isSupportedLocale(code: unknown): code is SupportedLocale {
  if (typeof code !== 'string') return false;
  return code in LANGUAGE_MAP;
}

export function getLanguageMetadata(code: SupportedLocale): LanguageMetadata {
  return LANGUAGE_MAP[code] || LANGUAGE_MAP[DEFAULT_LOCALE];
}
