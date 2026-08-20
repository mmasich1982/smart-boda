// rider-app/src/offline/db.js
// ✅ FINAL FIX: All functions properly exported and working with LocalStore async API
// Provides offline storage for rider status, auth, language, translations, and more

import LocalStore from './LocalStore';

// ========== RIDER STATUS & ID ==========

export async function getLocalRiderStatus() {
  try {
    const status = await LocalStore.kvGet('rider_status');
    const riderId = await LocalStore.kvGet('rider_id');
    
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
    await LocalStore.kvSet('rider_status', status);
    console.log('✅ Saved rider status:', status);
    return true;
  } catch (err) {
    console.error('❌ saveLocalRiderStatus error:', err);
    return false;
  }
}

export async function getLocalRiderId() {
  try {
    const riderId = await LocalStore.kvGet('rider_id');
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
    await LocalStore.kvSet('rider_id', riderId);
    console.log('✅ Saved rider_id:', riderId);
    return true;
  } catch (err) {
    console.error('❌ saveLocalRiderId error:', err);
    return false;
  }
}

export async function clearLocalRiderId() {
  try {
    await LocalStore.kvSet('rider_id', null);
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
    const profile = await LocalStore.kvGet('active_bike_profile');
    console.log('✅ getActiveBikeProfile:', profile);
    return profile;
  } catch (err) {
    console.error('❌ getActiveBikeProfile error:', err);
    return null;
  }
}

export async function saveLocalBikeProfile(profile) {
  try {
    await LocalStore.kvSet('active_bike_profile', profile);
    console.log('✅ Saved bike profile:', profile);
    return true;
  } catch (err) {
    console.error('❌ saveLocalBikeProfile error:', err);
    return false;
  }
}

// ========== LANGUAGE PREFERENCES ==========

export async function getLocalLanguage() {
  try {
    const lang = await LocalStore.kvGet('local_language');
    const result = lang || 'en';
    console.log('✅ getLocalLanguage:', result);
    return result;
  } catch (err) {
    console.error('❌ getLocalLanguage error:', err);
    return 'en';
  }
}

export async function saveLocalLanguage(languageCode) {
  try {
    await LocalStore.kvSet('local_language', languageCode);
    console.log('✅ Saved language:', languageCode);
    return true;
  } catch (err) {
    console.error('❌ saveLocalLanguage error:', err);
    return false;
  }
}

// ========== TRANSLATIONS CACHE ==========

export async function getCachedTranslations(languageCode) {
  try {
    const translations = await LocalStore.kvGet(`translations_${languageCode}`);
    console.log(`✅ getCachedTranslations for ${languageCode}`);
    return translations;
  } catch (err) {
    console.error('❌ getCachedTranslations error:', err);
    return null;
  }
}

export async function setCachedTranslations(languageCode, translations) {
  try {
    await LocalStore.kvSet(`translations_${languageCode}`, translations);
    console.log(`✅ Cached translations for ${languageCode}`);
    return true;
  } catch (err) {
    console.error('❌ setCachedTranslations error:', err);
    return false;
  }
}

// ========== MASTER DATA CACHE ==========

export async function getCachedMasterData(key) {
  try {
    const data = await LocalStore.kvGet(`master_data_${key}`);
    console.log(`✅ getCachedMasterData: ${key}`);
    return data;
  } catch (err) {
    console.error('❌ getCachedMasterData error:', err);
    return null;
  }
}

export async function setCachedMasterData(key, value) {
  try {
    await LocalStore.kvSet(`master_data_${key}`, value);
    console.log(`✅ Cached master data: ${key}`);
    return true;
  } catch (err) {
    console.error('❌ setCachedMasterData error:', err);
    return false;
  }
}

// ========== AUTH TOKEN ==========

export async function getLocalAuthToken() {
  try {
    const token = await LocalStore.kvGet('auth_token');
    console.log('✅ getLocalAuthToken');
    return token;
  } catch (err) {
    console.error('❌ getLocalAuthToken error:', err);
    return null;
  }
}

export async function saveLocalAuthToken(token) {
  try {
    await LocalStore.kvSet('auth_token', token);
    console.log('✅ Saved auth token');
    return true;
  } catch (err) {
    console.error('❌ saveLocalAuthToken error:', err);
    return false;
  }
}

export async function clearSession() {
  try {
    await LocalStore.kvSet('auth_token', null);
    await LocalStore.kvSet('rider_status', null);
    await LocalStore.kvSet('rider_id', null);
    console.log('✅ Session cleared');
    return true;
  } catch (err) {
    console.error('❌ clearSession error:', err);
    return false;
  }
}

// ========== PLATE CACHE ==========

export async function checkLocalPlateCache(plateNumber) {
  try {
    const cache = (await LocalStore.kvGet('plate_check_cache')) || {};
    const result = cache[plateNumber] ?? null;
    console.log(`✅ checkLocalPlateCache: ${plateNumber}`);
    return result;
  } catch (err) {
    console.error('❌ checkLocalPlateCache error:', err);
    return null;
  }
}

export async function saveLocalPlateCache(plateNumber, result) {
  try {
    const cache = (await LocalStore.kvGet('plate_check_cache')) || {};
    cache[plateNumber] = result;
    await LocalStore.kvSet('plate_check_cache', cache);
    console.log(`✅ Saved plate cache: ${plateNumber}`);
    return true;
  } catch (err) {
    console.error('❌ saveLocalPlateCache error:', err);
    return false;
  }
}

// ========== TRIP RULE CONFIG ==========

export async function getCachedTripRuleConfig() {
  try {
    const config = await LocalStore.kvGet('trip_rule_config');
    console.log('✅ getCachedTripRuleConfig');
    return config;
  } catch (err) {
    console.error('❌ getCachedTripRuleConfig error:', err);
    return null;
  }
}

export async function setCachedTripRuleConfig(config) {
  try {
    await LocalStore.kvSet('trip_rule_config', config);
    console.log('✅ Cached trip rule config');
    return true;
  } catch (err) {
    console.error('❌ setCachedTripRuleConfig error:', err);
    return false;
  }
}

// ========== ACCOUNT SUMMARY ==========

export async function getRiderAccountSummary() {
  try {
    const summary = await LocalStore.kvGet('rider_account_summary');
    console.log('✅ getRiderAccountSummary');
    return summary;
  } catch (err) {
    console.error('❌ getRiderAccountSummary error:', err);
    return null;
  }
}

export async function saveRiderAccountSummary(summary) {
  try {
    await LocalStore.kvSet('rider_account_summary', summary);
    console.log('✅ Saved account summary');
    return true;
  } catch (err) {
    console.error('❌ saveRiderAccountSummary error:', err);
    return false;
  }
}

// ========== DATABASE HELPERS (for legacy table-based storage) ==========

export async function openLocalDb() {
  return LocalStore;
}

export async function addTrip(_db, fareAmount, paymentMethod) {
  try {
    const id = `legacy-trip-${Date.now()}`;
    const trip = {
      id,
      fare_amount: fareAmount,
      payment_method: paymentMethod,
      created_at: new Date().toISOString(),
      synced: 0,
    };
    await LocalStore.insertRow('local_trip', trip);
    console.log('✅ Added trip:', id);
    return trip;
  } catch (err) {
    console.error('❌ addTrip error:', err);
    return null;
  }
}

export async function getUnsyncedTrips(_db) {
  try {
    const trips = await LocalStore.queryRows('local_trip', (t) => t.synced === 0);
    console.log('✅ getUnsyncedTrips:', trips.length);
    return trips;
  } catch (err) {
    console.error('❌ getUnsyncedTrips error:', err);
    return [];
  }
}

// ========== FUEL & BATTERY ENTRIES (for energy hub screens) ==========

export async function saveFuelEntry(riderId, entry) {
  try {
    const id = `fuel_${riderId}_${Date.now()}`;
    const record = {
      id,
      rider_id: riderId,
      ...entry,
      created_at: new Date().toISOString(),
      synced: 0,
    };
    await LocalStore.insertRow('fuel_entry', record);
    console.log('✅ Saved fuel entry:', id);
    return record;
  } catch (err) {
    console.error('❌ saveFuelEntry error:', err);
    return null;
  }
}

export async function getFuelEntries(riderId) {
  try {
    const entries = await LocalStore.queryRows('fuel_entry', (e) => e.rider_id === riderId);
    console.log('✅ getFuelEntries:', entries.length);
    return entries;
  } catch (err) {
    console.error('❌ getFuelEntries error:', err);
    return [];
  }
}

export async function saveBatteryEntry(riderId, entry) {
  try {
    const id = `battery_${riderId}_${Date.now()}`;
    const record = {
      id,
      rider_id: riderId,
      ...entry,
      created_at: new Date().toISOString(),
      synced: 0,
    };
    await LocalStore.insertRow('battery_entry', record);
    console.log('✅ Saved battery entry:', id);
    return record;
  } catch (err) {
    console.error('❌ saveBatteryEntry error:', err);
    return null;
  }
}

export async function getBatteryEntries(riderId) {
  try {
    const entries = await LocalStore.queryRows('battery_entry', (e) => e.rider_id === riderId);
    console.log('✅ getBatteryEntries:', entries.length);
    return entries;
  } catch (err) {
    console.error('❌ getBatteryEntries error:', err);
    return [];
  }
}