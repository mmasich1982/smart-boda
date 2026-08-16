// rider-app/src/i18n/LocalizationProvider.js
// ✅ FIXED VERSION - Exposes `strings` in useTranslation hook
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as Localization from 'expo-localization';
import api from '../api/client';
import { getCachedTranslations, setCachedTranslations, getLocalLanguage, saveLocalLanguage } from '../offline/db';

// ✅ TRY TO IMPORT, BUT PROVIDE FALLBACK IF MISSING
let enFallback = {};
try {
  // @ts-ignore - Allow dynamic import
  enFallback = require('./en-fallback.js').default;
  if (!enFallback || typeof enFallback !== 'object' || Object.keys(enFallback).length === 0) {
    console.warn('[i18n] ⚠️ en-fallback.js is empty or invalid, using empty object');
    enFallback = {};
  }
} catch (err) {
  console.error('[i18n] ❌ CRITICAL: Cannot import en-fallback.js');
  console.error('[i18n] Error:', err.message);
  console.warn('[i18n] ⚠️ File must be at: src/i18n/en-fallback.js');
  enFallback = {
    'lang.title': 'Welcome',
    'preview.earned_label': 'Money earned',
    'preview.cost_label': 'Fuel & service',
    'home.running_total': 'Today Running Total',
  };
  console.log('[i18n] Using minimal fallback with', Object.keys(enFallback).length, 'keys');
}

const LocalizationContext = createContext(null);

/**
 * ✅ ROBUST: Get device's system language as fallback
 * Works on both native and web (PWA)
 */
const getDeviceLanguage = () => {
  try {
    let deviceLang = 'en';
    
    // ✅ Web PWA detection
    if (typeof navigator !== 'undefined' && navigator.language) {
      deviceLang = navigator.language.split('-')[0];
      console.log('[i18n] Detected browser language:', navigator.language);
    }
    // ✅ Native detection
    else if (Localization?.locale) {
      deviceLang = Localization.locale.split('-')[0];
      console.log('[i18n] Detected device language:', Localization.locale);
    }
    
    const supportedLanguages = ['en', 'sw']; // ⚠️ UPDATE: Set your actual supported languages
    const finalLang = supportedLanguages.includes(deviceLang) ? deviceLang : 'en';
    console.log('[i18n] Language detection result:', { deviceLang, finalLang, supported: supportedLanguages.includes(deviceLang) });
    
    return finalLang;
  } catch (err) {
    console.warn('[i18n] Failed to detect device language:', err);
    return 'en';
  }
};

export function LocalizationProvider({ children }) {
  const [languageCode, setLanguageCode] = useState('en');
  // ✅ SAFE: Always initialize with object, never undefined
  const [strings, setStrings] = useState(enFallback && Object.keys(enFallback).length > 0 ? enFallback : {});
  const [isReady, setIsReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('initializing');

  /**
   * ✅ BULLETPROOF: Load language with fallback chain
   * 1. Try cache (instant, offline works)
   * 2. Try API (fresh data)
   * 3. Fall back to bundled English
   */
  const loadLanguage = useCallback(async (code) => {
    try {
      setLoadingStatus('loading');
      console.log('[i18n] 🔄 Loading language:', code);

      // ✅ STEP 1: Use fallback for English
      if (code === 'en') {
        const fallbackToUse = enFallback && Object.keys(enFallback).length > 0 ? enFallback : {};
        setStrings(fallbackToUse);
        setLoadingStatus('fallback');
        console.log('[i18n] 📦 Using bundled English fallback, keys:', Object.keys(fallbackToUse).length);
      }

      // ✅ STEP 2: Try cache (fast, offline-friendly)
      let hasCache = false;
      try {
        const cached = await getCachedTranslations(code);
        if (cached && Object.keys(cached).length > 0) {
          setStrings(cached);
          setLoadingStatus('cached');
          hasCache = true;
          console.log('[i18n] ✅ Loaded from cache:', code, 'Keys:', Object.keys(cached).length);
        }
      } catch (cacheErr) {
        console.warn('[i18n] Cache read failed:', cacheErr.message);
      }

      // ✅ STEP 3: Try API (get fresh data)
      let apiSuccess = false;
      try {
        const res = await api.get(`/onboarding/translations/${code}`);
        if (res.data && Object.keys(res.data).length > 0) {
          setStrings(res.data);
          setLoadingStatus('fresh');
          apiSuccess = true;
          console.log('[i18n] 🌐 Fetched fresh from API:', code, 'Keys:', Object.keys(res.data).length);
          
          // Store in cache for next time
          try {
            await setCachedTranslations(code, res.data);
            console.log('[i18n] 💾 Cached for offline:', code);
          } catch (cacheErr) {
            console.warn('[i18n] Failed to cache translations:', cacheErr.message);
          }
        }
      } catch (apiErr) {
        console.warn('[i18n] API fetch failed for', code, '—', apiErr.message);
        // API failure is OK if we have cache or fallback
      }

      // ✅ STEP 4: Fallback to English if nothing else worked
      if (!hasCache && !apiSuccess && code !== 'en') {
        console.warn('[i18n] ⚠️ No cache or API for', code, '— falling back to English');
        const fallbackToUse = enFallback && Object.keys(enFallback).length > 0 ? enFallback : {};
        setStrings(fallbackToUse);
        setLoadingStatus('fallback');
      }

      // Save selected language
      setLanguageCode(code);
      try {
        await saveLocalLanguage(code);
      } catch (saveErr) {
        console.warn('[i18n] Failed to save language preference:', saveErr.message);
      }

      console.log('[i18n] ✅ Language loaded successfully:', code);
    } catch (err) {
      console.error('[i18n] ❌ Unexpected error in loadLanguage:', err);
      // Ensure we at least have something
      const fallbackToUse = enFallback && Object.keys(enFallback).length > 0 ? enFallback : {};
      setStrings(fallbackToUse);
      setLanguageCode('en');
      setLoadingStatus('error');
    } finally {
      setIsReady(true); // ✅ MANDATORY: Always mark as ready, even on error
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await getLocalLanguage();
        const languageToLoad = saved || getDeviceLanguage() || 'en';
        
        console.log('[i18n] ✅ Initialization started', {
          savedLanguage: saved,
          deviceLanguage: getDeviceLanguage(),
          loadingLanguage: languageToLoad,
          timestamp: new Date().toISOString(),
          hasEnglishFallback: Object.keys(enFallback || {}).length,
        });
        
        await loadLanguage(languageToLoad);
        console.log('[i18n] ✅ Initialization complete');
      } catch (err) {
        console.error('[i18n] ❌ Failed to load initial language:', err);
        setLoadingStatus('error');
        setIsReady(true);
      }
    })();
  }, [loadLanguage]);

  const contextValue = {
    languageCode,
    strings,
    setLanguage: loadLanguage,
    isReady,
    loadingStatus,
  };

  return (
    <LocalizationContext.Provider value={contextValue}>
      {children}
    </LocalizationContext.Provider>
  );
}

/**
 * ✅ ROBUST: Hook to use translations
 * 
 * ✅ FIXED: Now includes `strings` in return value!
 * This allows App.js to destructure: const { strings, isReady, ... } = useTranslation()
 */
export function useTranslation() {
  const ctx = useContext(LocalizationContext);
  
  if (!ctx) {
    console.error('[i18n] useTranslation used outside LocalizationProvider!');
  }

  // ✅ ULTRA-SAFE: Multiple fallbacks
  const strings = ctx?.strings || enFallback || {};
  
  const t = (key, vars = {}) => {
    let text = strings[key];
    
    if (!text) {
      console.warn('[i18n] Missing translation:', key);
      text = key;
    }
    
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
    
    return text;
  };

  return {
    t,
    strings, // ✅ *** FIX #1: ADDED THIS LINE - NOW EXPOSED! ***
    languageCode: ctx?.languageCode || 'en',
    setLanguage: ctx?.setLanguage || (() => {}),
    isReady: ctx?.isReady || false,
    loadingStatus: ctx?.loadingStatus || 'unknown',
  };
}