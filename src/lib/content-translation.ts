/**
 * Optional Content Translation Adapter
 * 
 * Handles translation of user-generated content (e.g., job descriptions,
 * direct messages) separate from static UI localization strings.
 * 
 * Adheres to strict privacy and cost-protection principles:
 * - Default provider is 'none' (zero cost, zero external API leakage)
 * - Safe timeouts with AbortController
 * - Never logs or exposes sensitive user data
 */

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLocale: string;
  targetLocale: string;
  isTranslated: boolean;
  provider: 'none' | 'mock' | 'custom';
}

const DEFAULT_TIMEOUT_MS = 5000;

export class ContentTranslationAdapter {
  private provider: string;
  private timeoutMs: number;

  constructor() {
    this.provider = (process.env.TRANSLATION_PROVIDER || 'none').toLowerCase();
    this.timeoutMs = Number(process.env.TRANSLATION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  }

  /**
   * Translates arbitrary user-generated content into the target language.
   * If provider is 'none' or unconfigured, it safely returns original text.
   */
  async translate(
    text: string,
    targetLocale: string,
    sourceLocale: string = 'en'
  ): Promise<TranslationResult> {
    if (!text || !text.trim() || targetLocale === sourceLocale) {
      return {
        originalText: text,
        translatedText: text,
        sourceLocale,
        targetLocale,
        isTranslated: false,
        provider: 'none',
      };
    }

    if (this.provider === 'none') {
      return {
        originalText: text,
        translatedText: text,
        sourceLocale,
        targetLocale,
        isTranslated: false,
        provider: 'none',
      };
    }

    if (this.provider === 'mock') {
      return {
        originalText: text,
        translatedText: `[${targetLocale.toUpperCase()}] ${text}`,
        sourceLocale,
        targetLocale,
        isTranslated: true,
        provider: 'mock',
      };
    }

    // Custom or enterprise translation webhook integration
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      // Example secure server-side proxy endpoint
      const response = await fetch('/api/v1/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLocale, sourceLocale }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`Translation proxy returned status ${response.status}`);
      }

      const data = (await response.json()) as { translatedText?: string; sourceLocale?: string };
      return {
        originalText: text,
        translatedText: data.translatedText || text,
        sourceLocale: data.sourceLocale || sourceLocale,
        targetLocale,
        isTranslated: Boolean(data.translatedText),
        provider: 'custom',
      };
    } catch {
      // Graceful fallback to original content on any network/server failure
      return {
        originalText: text,
        translatedText: text,
        sourceLocale,
        targetLocale,
        isTranslated: false,
        provider: 'custom',
      };
    }
  }
}

export const contentTranslator = new ContentTranslationAdapter();
