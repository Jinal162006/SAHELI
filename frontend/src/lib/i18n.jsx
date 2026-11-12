import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from '../locales/en';
import hi from '../locales/hi';
import hiLatn from '../locales/hi-Latn';

// Adding a language: create src/locales/<code>.js with any subset of the English keys
// (missing keys fall back to English) and add it here.
export const LANGUAGES = [
  { code: 'en', label: 'English', htmlLang: 'en' },
  { code: 'hi', label: 'हिन्दी', htmlLang: 'hi', beta: true },
  { code: 'hi-Latn', label: 'Hinglish', htmlLang: 'hi-Latn', beta: true },
];

const CATALOGS = { en, hi, 'hi-Latn': hiLatn };
const STORAGE_KEY = 'saheli.lang';

function lookup(catalog, key) {
  let node = catalog;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

function interpolate(value, vars) {
  if (typeof value !== 'string' || !vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match));
}

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && CATALOGS[saved]) return saved;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(initialLanguage);

  useEffect(() => {
    const entry = LANGUAGES.find((l) => l.code === language);
    document.documentElement.lang = entry?.htmlLang ?? 'en';
  }, [language]);

  const setLanguage = useCallback((code) => {
    if (!CATALOGS[code]) return;
    setLanguageState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Not persisted; still applied for this visit.
    }
  }, []);

  const t = useCallback(
    (key, vars) => {
      const keys = vars && typeof vars.count === 'number' ? [`${key}_${vars.count === 1 ? 'one' : 'other'}`, key] : [key];
      for (const k of keys) {
        const value = lookup(CATALOGS[language], k) ?? lookup(en, k);
        if (value !== undefined) return interpolate(value, vars);
      }
      if (import.meta.env.DEV) console.warn(`Missing translation: ${key}`);
      return key;
    },
    [language],
  );

  /** True when a key exists, so optional copy can be skipped cleanly. */
  const has = useCallback((key) => lookup(en, key) !== undefined, []);

  const value = useMemo(() => ({ language, setLanguage, t, has }), [language, setLanguage, t, has]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

export function useT() {
  return useI18n().t;
}
