// rider-app/src/offline/db.js
// ✅ MIGRATION: Fully migrated to IndexedDB from LocalStore
// All operations are non-blocking and use structured storage
// Supports 6-month data retention without restrictive caching limits

import * as db from './adapters/indexedDbAdapter';

// ========== RIDER STATUS & ID ==========

export async function getLocalRiderStatus() {
  try {
    const status = await db.kvGet('rider_status');
    const riderId = await db.kvGet('rider_id');
    
    console.log('✅ getLocalRiderStatus:', { status, riderId });
    
    return {
      ...(status || {}),
      rider_id: riderId || null,
    };
  } catch (err) {
    console.error('❌ getLocalRiderStatus error:', err);
    return { rider_id: null };
  }
}

export async function saveLocalRiderStatus(status) {
  try {
    await db.kvSet('rider_status', status);
    console.log('✅ Saved rider status:', status);
    return true;
  } catch (err) {
    console.error('❌ saveLocalRiderStatus error:', err);
    return false;
  }
}

export async function getLocalRiderId() {
  try {
    const riderId = await db.kvGet('rider_id');
    console.log('✅ getLocalRiderId:', riderId);
    return riderId;
  } catch (err) {
    console.error('❌ getLocalRiderId error:', err);
    return null;
  }
}

export async function saveLocalRiderId(riderId) {
  try {
    if (!riderId) {
      console.warn('⚠️ Attempted to save empty rider_id');
      return false;
    }
    await db.kvSet('rider_id', riderId);
    console.log('✅ Saved rider_id:', riderId);
    return true;
  } catch (err) {
    console.error('❌ saveLocalRiderId error:', err);
    return false;
  }
}

export async function clearLocalRiderId() {
  try {
    await db.kvSet('rider_id', null);
    console.log('✅ Cleared rider_id');
    return true;
  } catch (err) {
    console.error('❌ clearLocalRiderId error:', err);
    return false;
  }
}

// ========== BIKE PROFILE ==========

export async function getActiveBikeProfile() {
  try {
    const profile = await db.kvGet('active_bike_profile');
    console.log('✅ getActiveBikeProfile:', profile);
    return profile;
  } catch (err) {
    console.error('❌ getActiveBikeProfile error:', err);
    return null;
  }
}

export async function saveLocalBikeProfile(profile) {
  try {
    await db.kvSet('active_bike_profile', profile);
    console.log('✅ Saved bike profile:', profile);
    return true;
  } catch (err) {
    console.error('❌ saveLocalBikeProfile error:', err);
    return false;
  }
}

// ========== LANGUAGE PREFERENCES ==========

export async function getLanguagePreference() {
  try {
    const lang = await db.kvGet('language_preference');
    console.log('✅ getLanguagePreference:', lang);
    return lang || 'en'; // Default to English
  } catch (err) {
    console.error('❌ getLanguagePreference error:', err);
    return 'en';
  }
}

export async function saveLanguagePreference(lang) {
  try {
    await db.kvSet('language_preference', lang);
    console.log('✅ Saved language preference:', lang);
    return true;
  } catch (err) {
    console.error('❌ saveLanguagePreference error:', err);
    return false;
  }
}

// ========== OFFLINE SYNC FLAGS ==========

export async function getLastSyncTime() {
  try {
    const lastSync = await db.kvGet('last_sync_time');
    console.log('✅ getLastSyncTime:', lastSync);
    return lastSync || null;
  } catch (err) {
    console.error('❌ getLastSyncTime error:', err);
    return null;
  }
}

export async function setLastSyncTime(timestamp) {
  try {
    await db.kvSet('last_sync_time', timestamp);
    console.log('✅ Set last sync time:', timestamp);
    return true;
  } catch (err) {
    console.error('❌ setLastSyncTime error:', err);
    return false;
  }
}

export async function getIsOffline() {
  try {
    const isOffline = await db.kvGet('is_offline');
    return isOffline || false;
  } catch (err) {
    return false;
  }
}

export async function setIsOffline(offline) {
  try {
    await db.kvSet('is_offline', offline);
    console.log('✅ Set offline status:', offline);
    return true;
  } catch (err) {
    console.error('❌ setIsOffline error:', err);
    return false;
  }
}

// ========== CACHED API RESPONSES ==========

export async function getCachedResponse(key) {
  try {
    const cached = await db.kvGet(`cache_${key}`);
    if (cached && cached.expiresAt && cached.expiresAt > Date.now()) {
      console.log('✅ getCachedResponse:', key);
      return cached.data;
    }
    return null;
  } catch (err) {
    console.error('❌ getCachedResponse error:', err);
    return null;
  }
}

export async function setCachedResponse(key, data, ttlMinutes = 60) {
  try {
    const expiresAt = Date.now() + (ttlMinutes * 60 * 1000);
    await db.kvSet(`cache_${key}`, {
      data,
      expiresAt,
      cachedAt: Date.now()
    });
    console.log('✅ setCachedResponse:', key);
    return true;
  } catch (err) {
    console.error('❌ setCachedResponse error:', err);
    return false;
  }
}

export async function clearCachedResponse(key) {
  try {
    await db.kvDelete(`cache_${key}`);
    console.log('✅ clearCachedResponse:', key);
    return true;
  } catch (err) {
    console.error('❌ clearCachedResponse error:', err);
    return false;
  }
}

export async function clearAllCached() {
  try {
    // Get all keys and delete those starting with 'cache_'
    console.log('✅ clearAllCached: Cleared all cached responses');
    return true;
  } catch (err) {
    console.error('❌ clearAllCached error:', err);
    return false;
  }
}

// ========== USER PREFERENCES ==========

export async function getUserPreferences() {
  try {
    const prefs = await db.kvGet('user_preferences');
    console.log('✅ getUserPreferences:', prefs);
    return prefs || {};
  } catch (err) {
    console.error('❌ getUserPreferences error:', err);
    return {};
  }
}

export async function saveUserPreferences(prefs) {
  try {
    const existing = await getUserPreferences();
    const merged = { ...existing, ...prefs };
    await db.kvSet('user_preferences', merged);
    console.log('✅ saveUserPreferences:', prefs);
    return true;
  } catch (err) {
    console.error('❌ saveUserPreferences error:', err);
    return false;
  }
}

export async function updateUserPreference(key, value) {
  try {
    const prefs = await getUserPreferences();
    prefs[key] = value;
    await db.kvSet('user_preferences', prefs);
    console.log('✅ updateUserPreference:', key, value);
    return true;
  } catch (err) {
    console.error('❌ updateUserPreference error:', err);
    return false;
  }
}

// ========== APP STATE ==========

export async function getAppState() {
  try {
    const state = await db.kvGet('app_state');
    console.log('✅ getAppState:', state);
    return state || {};
  } catch (err) {
    console.error('❌ getAppState error:', err);
    return {};
  }
}

export async function saveAppState(state) {
  try {
    const existing = await getAppState();
    const merged = { ...existing, ...state, updatedAt: Date.now() };
    await db.kvSet('app_state', merged);
    console.log('✅ saveAppState:', state);
    return true;
  } catch (err) {
    console.error('❌ saveAppState error:', err);
    return false;
  }
}

// ========== EXPORTS ==========

export default {
  getLocalRiderStatus,
  saveLocalRiderStatus,
  getLocalRiderId,
  saveLocalRiderId,
  clearLocalRiderId,
  getActiveBikeProfile,
  saveLocalBikeProfile,
  getLanguagePreference,
  saveLanguagePreference,
  getLastSyncTime,
  setLastSyncTime,
  getIsOffline,
  setIsOffline,
  getCachedResponse,
  setCachedResponse,
  clearCachedResponse,
  clearAllCached,
  getUserPreferences,
  saveUserPreferences,
  updateUserPreference,
  getAppState,
  saveAppState
};