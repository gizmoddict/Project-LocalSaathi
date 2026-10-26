/**
 * Central Locale Dictionary Index
 */
import { SupportedLocale } from '../languages';
import { en, Translations } from './en';
import { hi } from './hi';
import { bn } from './bn';
import { mr } from './mr';
import { te } from './te';
import { ta } from './ta';
import { gu } from './gu';
import { kn } from './kn';
import { ml } from './ml';
import { pa } from './pa';
import { or } from './or';
import { ur } from './ur';

export type { Translations };

export const LOCALES: Record<SupportedLocale, Translations> = {
  en,
  hi,
  bn,
  mr,
  te,
  ta,
  gu,
  kn,
  ml,
  pa,
  or,
  ur,
};
