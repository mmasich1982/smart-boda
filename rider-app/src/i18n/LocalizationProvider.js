// rider-app/src/i18n/LocalizationProvider.js
// ✅ UPDATED VERSION - Supports English AND Kiswahili with dual fallback imports
// Features:
// - Imports both en-fallback.js and kiswahili-fallback.js
// - Dynamic fallback selection based on selected language
// - Seamless language switching between English and Kiswahili
// - Full offline support with cached translations
// - Exposes `strings` in useTranslation hook for component usage

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as Localization from 'expo-localization';
import api from '../api/client';
import { getCachedTranslations, setCachedTranslations, getLocalLanguage, saveLocalLanguage } from '../offline/db';

// ✅ IMPORT ENGLISH FALLBACK
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
  console.log('[i18n] Using minimal English fallback with', Object.keys(enFallback).length, 'keys');
}

// ✅ IMPORT KISWAHILI FALLBACK
let kiswahiliFallback = {};
try {
  // @ts-ignore - Allow dynamic import
  kiswahiliFallback = require('./kiswahili-fallback.js').default;
  if (!kiswahiliFallback || typeof kiswahiliFallback !== 'object' || Object.keys(kiswahiliFallback).length === 0) {
    console.warn('[i18n] ⚠️ kiswahili-fallback.js is empty or invalid, using empty object');
    kiswahiliFallback = {};
  }
} catch (err) {
  console.error('[i18n] ❌ CRITICAL: Cannot import kiswahili-fallback.js');
  console.error('[i18n] Error:', err.message);
  console.warn('[i18n] ⚠️ File must be at: src/i18n/kiswahili-fallback.js');
  kiswahiliFallback = {
    'lang.title': 'Karibu',
    'preview.earned_label': 'Pesa iliyokusanywa',
    'preview.cost_label': 'Mafuta na huduma',
    'home.running_total': 'Jumla ya Leo Inayoendelea',
  };
  console.log('[i18n] Using minimal Kiswahili fallback with', Object.keys(kiswahiliFallback).length, 'keys');
}

// ✅ CREATE FALLBACK MAPPING - Maps language codes to their fallback data
const fallbacksByLanguage = {
  'en': enFallback,
  'sw': kiswahiliFallback,
};

console.log('[i18n] ✅ Initialized language fallbacks:', {
  english: Object.keys(enFallback).length,
  kiswahili: Object.keys(kiswahiliFallback).length,
  supported: Object.keys(fallbacksByLanguage),
});

const LocalizationContext = createContext(null);

/**
 * ✅ ROBUST: Get device's system language as fallback
 * Works on both native and web (PWA)
 * Supports: English (en) and Kiswahili (sw)
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
    
    const supportedLanguages = ['en', 'sw']; // ✅ Supported: English, Kiswahili
    const finalLang = supportedLanguages.includes(deviceLang) ? deviceLang : 'en';
    console.log('[i18n] Language detection result:', { 
      deviceLang, 
      finalLang, 
      supported: supportedLanguages.includes(deviceLang) 
    });
    
    return finalLang;
  } catch (err) {
    console.warn('[i18n] Failed to detect device language:', err);
    return 'en';
  }
};

/**
 * ✅ Get the correct fallback for the requested language
 * Ensures we always have a valid fallback object
 */
const getFallbackForLanguage = (languageCode) => {
  const fallback = fallbacksByLanguage[languageCode];
  
  if (!fallback || Object.keys(fallback).length === 0) {
    console.warn(`[i18n] ⚠️ No fallback found for language '${languageCode}', falling back to English`);
    return fallbacksByLanguage['en'] || {};
  }
  
  return fallback;
};

export function LocalizationProvider({ children }) {
  const [languageCode, setLanguageCode] = useState('en');
  // ✅ SAFE: Always initialize with object, never undefined
  const [strings, setStrings] = useState(getFallbackForLanguage('en'));
  const [isReady, setIsReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('initializing');

  /**
   * ✅ BULLETPROOF: Load language with fallback chain
   * Supports both English and Kiswahili
   * 
   * Fallback chain:
   * 1. Use bundled fallback immediately (for instant display)
   * 2. Try cache (fast, offline-friendly)
   * 3. Try API (fresh data from server)
   * 4. Use bundled fallback as final safety net
   */
  const loadLanguage = useCallback(async (code) => {
    try {
      setLoadingStatus('loading');
      console.log('[i18n] 🔄 Loading language:', code);

      // ✅ STEP 1: Use bundled fallback immediately for instant display
      // This ensures the UI doesn't show missing keys while loading
      const fallbackToUse = getFallbackForLanguage(code);
      setStrings(fallbackToUse);
      setLoadingStatus('fallback');
      
      const languageName = code === 'en' ? 'English' : code === 'sw' ? 'Kiswahili' : code;
      console.log(`[i18n] 📦 Using bundled ${languageName} fallback, keys:`, Object.keys(fallbackToUse).length);

      // ✅ STEP 2: Try cache (fast, offline-friendly)
      let hasCache = false;
      try {
        const cached = await getCachedTranslations(code);
        if (cached && Object.keys(cached).length > 0) {
          // ✅ MERGE cache with fallback (don't replace!)
          const mergedStrings = { ...fallbackToUse, ...cached };
          setStrings(mergedStrings);
          setLoadingStatus('cached');
          hasCache = true;
          console.log(`[i18n] ✅ Loaded ${languageName} from cache, Keys:`, Object.keys(cached).length);
          console.log(`[i18n] ✅ Merged with fallback, Total Keys:`, Object.keys(mergedStrings).length);
        }
      } catch (cacheErr) {
        console.warn('[i18n] Cache read failed:', cacheErr.message);
      }

      // ✅ STEP 3: Try API (get fresh data)
      let apiSuccess = false;
      try {
        const res = await api.get(`/onboarding/translations/${code}`);
        if (res.data && Object.keys(res.data).length > 0) {
          // ✅ MERGE API with fallback (don't replace!)
          // This ensures API updates override fallback, but fallback provides missing keys
          const mergedStrings = { ...fallbackToUse, ...res.data };
          setStrings(mergedStrings);
          setLoadingStatus('fresh');
          apiSuccess = true;
          console.log(`[i18n] 🌐 Fetched fresh ${languageName} from API, Keys:`, Object.keys(res.data).length);
          console.log(`[i18n] ✅ Merged with fallback, Total Keys:`, Object.keys(mergedStrings).length);
          
          // Store in cache for next time
          try {
            await setCachedTranslations(code, mergedStrings);
            console.log(`[i18n] 💾 Cached ${languageName} for offline use`);
          } catch (cacheErr) {
            console.warn('[i18n] Failed to cache translations:', cacheErr.message);
          }
        }
      } catch (apiErr) {
        console.warn(`[i18n] API fetch failed for ${languageName} (${code})`, '—', apiErr.message);
        // API failure is OK if we have cache or fallback
      }

      // ✅ STEP 4: Verify we have strings loaded (should always be true due to fallback)
      if (!strings || Object.keys(strings).length === 0) {
        console.warn(`[i18n] ⚠️ No translations available for ${languageName}, using fallback`);
        setStrings(getFallbackForLanguage(code));
        setLoadingStatus('fallback');
      }

      // Save selected language
      setLanguageCode(code);
      try {
        await saveLocalLanguage(code);
        console.log(`[i18n] 💾 Saved language preference: ${languageName}`);
      } catch (saveErr) {
        console.warn('[i18n] Failed to save language preference:', saveErr.message);
      }

      console.log(`[i18n] ✅ Language loaded successfully: ${languageName} (${code})`);
    } catch (err) {
      console.error('[i18n] ❌ Unexpected error in loadLanguage:', err);
      // Ensure we at least have something
      const fallbackToUse = getFallbackForLanguage('en');
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
          englishFallback: Object.keys(enFallback || {}).length,
          kiswahiliFallback: Object.keys(kiswahiliFallback || {}).length,
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
 * Returns:
 * - t(key, vars): Function to get translated string with optional variable substitution
 * - strings: Object containing all translations for current language
 * - languageCode: Current language code ('en' or 'sw')
 * - setLanguage: Function to switch language
 * - isReady: Boolean indicating if translations are loaded
 * - loadingStatus: Status of translation loading ('initializing', 'loading', 'fallback', 'cached', 'fresh', 'error')
 * 
 * Example usage:
 * ```
 * const { t, strings, languageCode, setLanguage, isReady } = useTranslation();
 * 
 * // Switch to Kiswahili
 * setLanguage('sw');
 * 
 * // Get a translated string
 * <Text>{t('home.running_total')}</Text>
 * 
 * // Get a translated string with variables
 * <Text>{t('home.rider_id', { rider_id: '12345' })}</Text>
 * ```
 */
export function useTranslation() {
  const ctx = useContext(LocalizationContext);
  
  if (!ctx) {
    console.error('[i18n] useTranslation used outside LocalizationProvider!');
  }

  // ✅ ULTRA-SAFE: Multiple fallbacks - ensure we always have translations
  const strings = ctx?.strings || getFallbackForLanguage(ctx?.languageCode || 'en') || {};
  
  const t = (key, vars = {}) => {
    let text = strings[key];
    
    if (!text) {
      console.warn('[i18n] Missing translation:', key, 'for language:', ctx?.languageCode || 'unknown');
      text = key; // Fallback to showing the key itself
    }
    
    // Replace variables in the string
    // Example: "Hello {name}" with vars = { name: "John" } → "Hello John"
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
    
    return text;
  };

  const currentLanguageCode = ctx?.languageCode || 'en';
  const languageName = currentLanguageCode === 'en' ? 'English' : 
                       currentLanguageCode === 'sw' ? 'Kiswahili' : 
                       currentLanguageCode;

  return {
    t, // Translation function
    strings, // Full translation object for current language
    languageCode: currentLanguageCode,
    languageName, // ✅ NEW: Human-readable language name
    setLanguage: ctx?.setLanguage || (() => {}), // Function to switch language
    isReady: ctx?.isReady || false, // Is loading complete?
    loadingStatus: ctx?.loadingStatus || 'unknown', // Current loading status
    
    // ✅ NEW: Helper to check if a translation exists
    hasTranslation: (key) => !!strings[key],
    
    // ✅ NEW: Helper to get available languages
    availableLanguages: ['en', 'sw'],
  };
}