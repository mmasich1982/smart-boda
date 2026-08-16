// rider-app/src/offline/db.js
// FIXED: Added rider_id storage functions to complement rider_status
// - getLocalRiderId() / saveLocalRiderId() for storing rider UUID from backend
// - Updated getLocalRiderStatus() to also return rider_id if available
// - Maintains backward compatibility with existing code

import LocalStore from './LocalStore';

// ---- Trips (kept for backward compatibility; tripsRepository.js is the real trip API) ----
export async function openLocalDb() { return LocalStore; }

export async function addTrip(_db, fareAmount, paymentMethod) {
  const id = `legacy-trip-${Date.now()}`;
  return LocalStore.insertRow('local_trip', {
    id, fare_amount: fareAmount, payment_method: paymentMethod,
    created_at: new Date().toISOString(), synced: 0,
  });
}

export async function getUnsyncedTrips(_db) {
  return LocalStore.queryRows('local_trip', (t) => t.synced === 0);
}

// ---- Onboarding / rider status (Module A -- OnboardingNavigator.js's cold-start routing) ----
export async function getLocalRiderStatus() {
  const status = await LocalStore.kvGet('rider_status');
  const riderId = await LocalStore.kvGet('rider_id');
  
  // ✅ FIXED: Combine rider_status and rider_id for convenient access
  return {
    ...(status || {}),
    rider_id: riderId || null,  // Include rider_id in returned object
  };
}

export async function saveLocalRiderStatus(status) {
  return LocalStore.kvSet('rider_status', status);
}

// ✅ FIXED: Add specific functions for managing rider_id
export async function getLocalRiderId() {
  return LocalStore.kvGet('rider_id');
}

export async function saveLocalRiderId(riderId) {
  if (!riderId) {
    console.warn('[db.js] Attempted to save empty rider_id');
    return;
  }
  console.log('[db.js] Saving rider_id:', riderId);
  return LocalStore.kvSet('rider_id', riderId);
}

export async function clearLocalRiderId() {
  return LocalStore.kvSet('rider_id', null);
}

// ---- Bike profile (Module A) ----
export async function getActiveBikeProfile() {
  return LocalStore.kvGet('active_bike_profile');
}

export async function saveLocalBikeProfile(profile) {
  return LocalStore.kvSet('active_bike_profile', profile);
}

// ---- Language preference (Module A i18n) ----
export async function getLocalLanguage() {
  const lang = await LocalStore.kvGet('local_language');
  return lang || 'en';
}

export async function saveLocalLanguage(languageCode) {
  return LocalStore.kvSet('local_language', languageCode);
}

// ---- Cached UI translations (Module A i18n -- offline-first string lookups) ----
export async function getCachedTranslations(languageCode) {
  return LocalStore.kvGet(`translations_${languageCode}`);
}

export async function setCachedTranslations(languageCode, translations) {
  return LocalStore.kvSet(`translations_${languageCode}`, translations);
}

// ---- Cached master data (dropdowns, fuel types, payment channels, etc.) ----
export async function getCachedMasterData(key) {
  return LocalStore.kvGet(`master_data_${key}`);
}

export async function setCachedMasterData(key, value) {
  return LocalStore.kvSet(`master_data_${key}`, value);
}

// ---- Auth (used by api/client.js's request interceptor) ----
export async function getLocalAuthToken() {
  return LocalStore.kvGet('auth_token');
}

export async function saveLocalAuthToken(token) {
  return LocalStore.kvSet('auth_token', token);
}

export async function clearSession() {
  await LocalStore.kvSet('auth_token', null);
  await LocalStore.kvSet('rider_status', null);
  await LocalStore.kvSet('rider_id', null);  // ✅ FIXED: Also clear rider_id on logout
}

// ---- Duplicate-plate local cache (Module A -- avoids re-checking the server every keystroke) ----
export async function checkLocalPlateCache(plateNumber) {
  const cache = (await LocalStore.kvGet('plate_check_cache')) || {};
  return cache[plateNumber] ?? null;
}

export async function saveLocalPlateCache(plateNumber, result) {
  const cache = (await LocalStore.kvGet('plate_check_cache')) || {};
  cache[plateNumber] = result;
  return LocalStore.kvSet('plate_check_cache', cache);
}

// ---- Trip/Entry rule config (correction window hours, etc. -- Super Admin configurable) ----
export async function getCachedTripRuleConfig() {
  return LocalStore.kvGet('trip_rule_config');
}

export async function setCachedTripRuleConfig(config) {
  return LocalStore.kvSet('trip_rule_config', config);
}

export async function getRiderAccountSummary() {
  return LocalStore.kvGet('rider_account_summary');
}

export async function saveRiderAccountSummary(summary) {
  return LocalStore.kvSet('rider_account_summary', summary);
}