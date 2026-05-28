import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import uk from '../i18n/locales/uk.js';
import en from '../i18n/locales/en.js';

const STORAGE_KEY = 'mikrom-locale';
const LOCALES = { uk, en };

const LocaleContext = createContext(null);

// resolvePath: дістає вкладене значення за ключем a.b.c
function resolvePath(obj, path) {
    return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

// interpolate: підставляє {{var}} у рядок
function interpolate(str, vars) {
    if (!vars || typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const val = vars[key];
        return val != null ? String(val) : '';
    });
}

// detectInitialLocale: uk за замовчуванням, en якщо браузер не uk
function detectInitialLocale() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'uk' || saved === 'en') return saved;
    } catch (_) {}
    if (typeof navigator !== 'undefined') {
        const lang = (navigator.language || '').toLowerCase();
        if (lang.startsWith('en')) return 'en';
    }
    return 'uk';
}

// LocaleProvider: мова інтерфейсу uk | en
export function LocaleProvider({ children }) {
    const [locale, setLocaleState] = useState(detectInitialLocale);

    const setLocale = useCallback((next) => {
        const value = next === 'en' ? 'en' : 'uk';
        setLocaleState(value);
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (_) {}
    }, []);

    useEffect(() => {
        document.documentElement.lang = locale === 'en' ? 'en' : 'uk';
    }, [locale]);

    const t = useCallback((key, vars) => {
        const dict = LOCALES[locale] || LOCALES.uk;
        const raw = resolvePath(dict, key);
        if (raw == null) {
            const fallback = resolvePath(LOCALES.uk, key);
            if (fallback == null) return key;
            return typeof fallback === 'string' ? interpolate(fallback, vars) : key;
        }
        if (typeof raw !== 'string') return key;
        return interpolate(raw, vars);
    }, [locale]);

    const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

    return (
        <LocaleContext.Provider value={value}>
            {children}
        </LocaleContext.Provider>
    );
}

// useLocale: locale, setLocale, t(key, vars)
export function useLocale() {
    const ctx = useContext(LocaleContext);
    if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
    return ctx;
}
