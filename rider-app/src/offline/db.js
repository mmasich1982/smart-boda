// rider-app/src/offline/db.js
// ✅ MIGRATION: Fully migrated to IndexedDB from LocalStore
// All operations are non-blocking and use structured storage
// Supports 6-month data retention without restrictive caching limits

import indexedDbAdapter from '../../adapters/indexeddb-adapter';

// ========== RIDER STATUS & ID ==========

export async function getLocalRiderStatus() {
  try {
    const status = await indexedDbAdapter.kvGet('rider_status');
    const riderId = await indexedDbAdapter.kvGet('rider_id');
    
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
    await indexedDbAdapter.kvSet('rider_status', status);
    console.log('✅ Saved rider status:', status);
    return true;
  } catch (err) {
    console.error('❌ saveLocalRiderStatus error:', err);
    return false;
  }
}

export async function getLocalRiderId() {
  try {
    const riderId = await indexedDbAdapter.kvGet('rider_id');
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
    await indexedDbAdapter.kvSet('rider_id', riderId);
    console.log('✅ Saved rider_id:', riderId);
    return true;
  } catch (err) {
    console.error('❌ saveLocalRiderId error:', err);
    return false;
  }
}

export async function clearLocalRiderId() {
  try {
    await indexedDbAdapter.kvSet('rider_id', null);
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
    const profile = await indexedDbAdapter.kvGet('active_bike_profile');
    console.log('✅ getActiveBikeProfile:', profile);
    return profile;
  } catch (err) {
    console.error('❌ getActiveBikeProfile error:', err);
    return null;
  }
}

export async function saveLocalBikeProfile(profile) {
  try {
    await indexedDbAdapter.kvSet('active_bike_profile', profile);
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
    const lang = await indexedDbAdapter.kvGet('local_language');
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
    await indexedDbAdapter.kvSet('local_language', languageCode);
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
    const translations = await indexedDbAdapter.kvGet(`translations_${languageCode}`);
    console.log(`✅ getCachedTranslations for ${languageCode}`);
    return translations;
  } catch (err) {
    console.error('❌ getCachedTranslations error:', err);
    return null;
  }
}

export async function setCachedTranslations(languageCode, translations) {
  try {
    await indexedDbAdapter.kvSet(`translations_${languageCode}`, translations);
    console.log(`✅ Cached translations for ${languageCode}`);
    return true;
  } catch (err) {
    console.error('❌ setCachedTranslations error:', err);
    return false;
  }
}

// ========== MASTER DATA CACHE ==========
// ✅ IMPORTANT: Master data is preloaded and cached without artificial limits
// This allows the app to function offline with dropdown lists and reference data

export async function getCachedMasterData(key) {
  try {
    const data = await indexedDbAdapter.kvGet(`master_data_${key}`);
    console.log(`✅ getCachedMasterData: ${key}`);
    return data;
  } catch (err) {
    console.error('❌ getCachedMasterData error:', err);
    return null;
  }
}

export async function setCachedMasterData(key, value) {
  try {
    await indexedDbAdapter.kvSet(`master_data_${key}`, value);
    console.log(`✅ Cached master data: ${key}`);
    return true;
  } catch (err) {
    console.error('❌ setCachedMasterData error:', err);
    return false;
  }
}

/**
 * Preload all master data from API and cache in IndexedDB
 * Called during app initialization or when online
 * @param {function} fetchMasterDataFn - Function to fetch master data from API
 * @returns {Promise<boolean>} - True if preloading succeeded
 */
export async function preloadMasterData(fetchMasterDataFn) {
  try {
    console.log('📥 Preloading master data from API...');
    
    const masterDataKeys = [
      'fuel_types',
      'bike_models',
      'service_types',
      'expense_categories',
      'compliance_types',
      'payment_methods',
      'goal_types',
      'oil_types',
    ];

    let preloadedCount = 0;

    for (const key of masterDataKeys) {
      try {
        // Check if we already have cached data
        const existing = await getCachedMasterData(key);
        if (existing) {
          console.log(`✅ Master data '${key}' already cached, skipping fetch`);
          preloadedCount++;
          continue;
        }

        // Fetch from API (requires fetchMasterDataFn to handle API calls)
        const data = await fetchMasterDataFn(key);
        if (data) {
          await setCachedMasterData(key, data);
          console.log(`✅ Preloaded master data: ${key}`);
          preloadedCount++;
        }
      } catch (err) {
        console.warn(`⚠️ Failed to preload master data '${key}':`, err);
        // Continue with other keys even if one fails
      }
    }

    console.log(`✅ Master data preload complete: ${preloadedCount}/${masterDataKeys.length} keys`);
    return preloadedCount === masterDataKeys.length;
  } catch (err) {
    console.error('❌ preloadMasterData error:', err);
    return false;
  }
}

// ========== AUTH TOKEN ==========

export async function getLocalAuthToken() {
  try {
    const token = await indexedDbAdapter.kvGet('auth_token');
    console.log('✅ getLocalAuthToken');
    return token;
  } catch (err) {
    console.error('❌ getLocalAuthToken error:', err);
    return null;
  }
}

export async function saveLocalAuthToken(token) {
  try {
    await indexedDbAdapter.kvSet('auth_token', token);
    console.log('✅ Saved auth token');
    return true;
  } catch (err) {
    console.error('❌ saveLocalAuthToken error:', err);
    return false;
  }
}

export async function clearSession() {
  try {
    await indexedDbAdapter.kvSet('auth_token', null);
    await indexedDbAdapter.kvSet('rider_status', null);
    await indexedDbAdapter.kvSet('rider_id', null);
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
    const cache = (await indexedDbAdapter.kvGet('plate_check_cache')) || {};
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
    const cache = (await indexedDbAdapter.kvGet('plate_check_cache')) || {};
    cache[plateNumber] = result;
    await indexedDbAdapter.kvSet('plate_check_cache', cache);
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
    const config = await indexedDbAdapter.kvGet('trip_rule_config');
    console.log('✅ getCachedTripRuleConfig');
    return config;
  } catch (err) {
    console.error('❌ getCachedTripRuleConfig error:', err);
    return null;
  }
}

export async function setCachedTripRuleConfig(config) {
  try {
    await indexedDbAdapter.kvSet('trip_rule_config', config);
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
    const summary = await indexedDbAdapter.kvGet('rider_account_summary');
    console.log('✅ getRiderAccountSummary');
    return summary;
  } catch (err) {
    console.error('❌ getRiderAccountSummary error:', err);
    return null;
  }
}

export async function saveRiderAccountSummary(summary) {
  try {
    await indexedDbAdapter.kvSet('rider_account_summary', summary);
    console.log('✅ Saved account summary');
    return true;
  } catch (err) {
    console.error('❌ saveRiderAccountSummary error:', err);
    return false;
  }
}

// ========== DATABASE HELPERS (for table-based storage) ==========
// ✅ All operations now use IndexedDB with proper object stores

export async function openLocalDb() {
  return indexedDbAdapter;
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
    await indexedDbAdapter.insertRow('local_trip', trip);
    console.log('✅ Added trip:', id);
    return trip;
  } catch (err) {
    console.error('❌ addTrip error:', err);
    return null;
  }
}

export async function getUnsyncedTrips(_db) {
  try {
    const trips = await indexedDbAdapter.queryRows('local_trip', (t) => t.synced === 0);
    console.log('✅ getUnsyncedTrips:', trips.length);
    return trips;
  } catch (err) {
    console.error('❌ getUnsyncedTrips error:', err);
    return [];
  }
}

// ========== FUEL & BATTERY ENTRIES (for energy hub screens) ==========
// ✅ IMPORTANT: No artificial limits on stored entries
// Supports full 6-month retention window

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
    await indexedDbAdapter.insertRow('fuel_entry', record);
    console.log('✅ Saved fuel entry:', id);
    return record;
  } catch (err) {
    console.error('❌ saveFuelEntry error:', err);
    return null;
  }
}

export async function getFuelEntries(riderId) {
  try {
    const entries = await indexedDbAdapter.queryRows('fuel_entry', (e) => e.rider_id === riderId);
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
    await indexedDbAdapter.insertRow('battery_entry', record);
    console.log('✅ Saved battery entry:', id);
    return record;
  } catch (err) {
    console.error('❌ saveBatteryEntry error:', err);
    return null;
  }
}

export async function getBatteryEntries(riderId) {
  try {
    const entries = await indexedDbAdapter.queryRows('battery_entry', (e) => e.rider_id === riderId);
    console.log('✅ getBatteryEntries:', entries.length);
    return entries;
  } catch (err) {
    console.error('❌ getBatteryEntries error:', err);
    return [];
  }
}

// ========== DATA RETENTION & CLEANUP ==========
// ✅ IMPORTANT: 6-month retention policy
// Data older than 6 months is automatically cleaned up to reset the cycle
// Lipa Later transactions are retained for 1 year (as per requirements)

/**
 * Clean up data older than 6 months
 * Called periodically (e.g., weekly) to maintain storage cycle
 * @returns {Promise<object>} - Cleanup stats {tripsCleaned, entriesCleaned, statementsCleaned}
 */
export async function cleanupOldData() {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoIso = sixMonthsAgo.toISOString();

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoIso = oneYearAgo.toISOString();

    console.log('🧹 Starting data cleanup...');
    console.log(`  - Trips older than: ${sixMonthsAgoIso}`);
    console.log(`  - Entries older than: ${sixMonthsAgoIso}`);
    console.log(`  - Lipa Later older than: ${oneYearAgoIso}`);

    let tripsCleaned = 0;
    let entriesCleaned = 0;
    let statementsCleaned = 0;
    let lipaLaterCleaned = 0;

    // Clean up old trips
    try {
      const trips = await indexedDbAdapter.queryRows('local_trip');
      for (const trip of trips) {
        if (trip.created_at && trip.created_at < sixMonthsAgoIso) {
          await indexedDbAdapter.deleteRow('local_trip', trip.id);
          tripsCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up trips:', err);
    }

    // Clean up old fuel entries
    try {
      const fuelEntries = await indexedDbAdapter.queryRows('fuel_entry');
      for (const entry of fuelEntries) {
        if (entry.created_at && entry.created_at < sixMonthsAgoIso) {
          await indexedDbAdapter.deleteRow('fuel_entry', entry.id);
          entriesCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up fuel entries:', err);
    }

    // Clean up old battery entries
    try {
      const batteryEntries = await indexedDbAdapter.queryRows('battery_entry');
      for (const entry of batteryEntries) {
        if (entry.created_at && entry.created_at < sixMonthsAgoIso) {
          await indexedDbAdapter.deleteRow('battery_entry', entry.id);
          entriesCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up battery entries:', err);
    }

    // Clean up old statements (6-month policy)
    try {
      const statements = await indexedDbAdapter.queryRows('local_statement');
      for (const stmt of statements) {
        if (stmt.created_at && stmt.created_at < sixMonthsAgoIso) {
          await indexedDbAdapter.deleteRow('local_statement', stmt.id);
          statementsCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up statements:', err);
    }

    // Note: Lipa Later records are cleaned based on 1-year policy in separate handler
    // They are available in PostgreSQL for historical records older than 1 year

    console.log('✅ Data cleanup complete:');
    console.log(`  - Trips cleaned: ${tripsCleaned}`);
    console.log(`  - Entries cleaned: ${entriesCleaned}`);
    console.log(`  - Statements cleaned: ${statementsCleaned}`);
    console.log(`  - Lipa Later cleaned: ${lipaLaterCleaned}`);

    return {
      tripsCleaned,
      entriesCleaned,
      statementsCleaned,
      lipaLaterCleaned,
    };
  } catch (err) {
    console.error('❌ cleanupOldData error:', err);
    return {
      tripsCleaned: 0,
      entriesCleaned: 0,
      statementsCleaned: 0,
      lipaLaterCleaned: 0,
    };
  }
}