// rider-app/src/offline/db.js
// ✅ CONSOLIDATED: Merges original db.js + db_updated.js
// ✅ Uses ONLY IndexedDB with correct store names
// ✅ NO LocalStore - full migration to IndexedDB
// ✅ Includes both language preference naming conventions for compatibility
// All operations are non-blocking and use structured storage
// Supports 6-month data retention without restrictive caching limits

import indexedDbAdapter from './adapters/indexedDbAdapter';

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
// ✅ Both naming conventions included for compatibility

// Legacy naming convention (original db.js)
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

// New naming convention (db_updated.js) - uses 'language_preference' key
export async function getLanguagePreference() {
  try {
    const lang = await indexedDbAdapter.kvGet('language_preference');
    console.log('✅ getLanguagePreference:', lang);
    return lang || 'en';
  } catch (err) {
    console.error('❌ getLanguagePreference error:', err);
    return 'en';
  }
}

export async function saveLanguagePreference(lang) {
  try {
    await indexedDbAdapter.kvSet('language_preference', lang);
    console.log('✅ Saved language preference:', lang);
    return true;
  } catch (err) {
    console.error('❌ saveLanguagePreference error:', err);
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
    return cache[plateNumber] || null;
  } catch (err) {
    console.error('❌ checkLocalPlateCache error:', err);
    return null;
  }
}

export async function saveLocalPlateCache(plateNumber, data) {
  try {
    const cache = (await indexedDbAdapter.kvGet('plate_check_cache')) || {};
    cache[plateNumber] = data;
    await indexedDbAdapter.kvSet('plate_check_cache', cache);
    console.log('✅ Saved plate cache:', plateNumber);
    return true;
  } catch (err) {
    console.error('❌ saveLocalPlateCache error:', err);
    return false;
  }
}

// ========== TRIP RULE CONFIG CACHE ==========

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
    console.log('✅ Saved rider account summary');
    return true;
  } catch (err) {
    console.error('❌ saveRiderAccountSummary error:', err);
    return false;
  }
}

// ========== DATABASE INITIALIZATION ==========

export async function openLocalDb() {
  try {
    console.log('✅ Local database initialized (IndexedDB)');
    return true;
  } catch (err) {
    console.error('❌ openLocalDb error:', err);
    return false;
  }
}

// ========== TRIP DATA ==========

export async function addTrip(riderId, trip) {
  try {
    const id = `trip_${riderId}_${Date.now()}`;
    const record = {
      id,
      rider_id: riderId,
      ...trip,
      created_at: new Date().toISOString(),
      synced: 0,
    };
    // ✅ CORRECTED: Uses 'trips' store
    await indexedDbAdapter.insertRow('trips', record);
    console.log('✅ Saved trip:', id);
    return record;
  } catch (err) {
    console.error('❌ addTrip error:', err);
    return null;
  }
}

export async function getUnsyncedTrips(riderId) {
  try {
    // ✅ CORRECTED: Uses 'trips' store
    const trips = await indexedDbAdapter.queryRows('trips', (t) => t.rider_id === riderId && t.synced === 0);
    console.log('✅ getUnsyncedTrips:', trips.length);
    return trips;
  } catch (err) {
    console.error('❌ getUnsyncedTrips error:', err);
    return [];
  }
}

export async function getTripsFromCache(riderId, period = 'today') {
  try {
    // For today: use trips_today_${riderId}
    // For period: construct appropriate cache key
    let cacheKey = `trips_today_${riderId}`;
    
    if (period === 'this_week') {
      cacheKey = `trips_week_${riderId}`;
    } else if (period === 'this_month') {
      cacheKey = `trips_month_${riderId}`;
    }
    
    const cached = await indexedDbAdapter.kvGet(cacheKey);
    if (cached) {
      const trips = typeof cached === 'string' ? JSON.parse(cached) : cached;
      console.log(`✅ Retrieved ${trips.length} trips from cache (${period})`);
      return trips || [];
    }
    return [];
  } catch (err) {
    console.warn('⚠️ Error retrieving trips from cache:', err);
    return [];
  }
}

/**
 * Get all trips from IndexedDB
 * ✅ CORRECTED: Uses 'trips' store
 */
export async function getAllTrips() {
  try {
    const trips = await indexedDbAdapter.queryRows('trips');
    console.log('✅ getAllTrips:', trips.length);
    return trips;
  } catch (err) {
    console.error('❌ getAllTrips error:', err);
    return [];
  }
}

/**
 * Get trip by ID
 * ✅ CORRECTED: Uses 'trips' store
 */
export async function getTripById(tripId) {
  try {
    const trip = await indexedDbAdapter.getRow('trips', tripId);
    console.log('✅ getTripById:', tripId);
    return trip;
  } catch (err) {
    console.error('❌ getTripById error:', err);
    return null;
  }
}

/**
 * Update trip
 * ✅ CORRECTED: Uses 'trips' store
 */
export async function updateTrip(tripId, updates) {
  try {
    const trip = await indexedDbAdapter.updateRow('trips', tripId, updates);
    console.log('✅ updateTrip:', tripId);
    return trip;
  } catch (err) {
    console.error('❌ updateTrip error:', err);
    return null;
  }
}

/**
 * Delete trip
 * ✅ CORRECTED: Uses 'trips' store
 */
export async function deleteTrip(tripId) {
  try {
    await indexedDbAdapter.deleteRow('trips', tripId);
    console.log('✅ deleteTrip:', tripId);
    return true;
  } catch (err) {
    console.error('❌ deleteTrip error:', err);
    return false;
  }
}

// ========== MAINTENANCE ENTRIES ==========

export async function saveMaintenanceEntryToTable(entry) {
  try {
    // Insert into maintenanceEntry table
    await indexedDbAdapter.insertRow('maintenanceEntry', {
      id: entry.id,
      rider_id: entry.rider_id,
      cost: entry.cost,
      category: entry.category || 'Service',
      description: entry.description || '',
      submitted_at: entry.submitted_at || new Date().toISOString(),
      ts: Date.now(),
      sync_status: 'pending'
    });
    console.log('✅ Saved maintenance entry to table:', entry.id);
    return true;
  } catch (err) {
    console.warn('⚠️ Error saving maintenance entry to table:', err);
    return false;
  }
}

export async function getMaintenanceEntriesForPeriod(riderId, startTime, endTime) {
  try {
    const entries = await indexedDbAdapter.queryRows('maintenanceEntry', (row) => {
      if (row.rider_id !== riderId) return false;
      const entryTime = row.submitted_at ? new Date(row.submitted_at).getTime() : row.ts;
      return entryTime >= startTime && entryTime <= endTime;
    });
    console.log(`✅ Retrieved ${entries.length} maintenance entries`);
    return entries;
  } catch (err) {
    console.warn('⚠️ Error retrieving maintenance entries:', err);
    return [];
  }
}

export async function getMaintenanceHistoryFromCache(riderId) {
  try {
    const cached = await indexedDbAdapter.kvGet(`maintenance_history_${riderId}`);
    if (cached) {
      const entries = typeof cached === 'string' ? JSON.parse(cached) : cached;
      console.log(`✅ Retrieved ${entries.length} maintenance entries from cache`);
      return entries || [];
    }
    return [];
  } catch (err) {
    console.warn('⚠️ Error retrieving maintenance history from cache:', err);
    return [];
  }
}

// ========== OTHER EXPENSES ==========

export async function saveExpenseToTable(expense) {
  try {
    // Insert into local_expenses table
    await indexedDbAdapter.insertRow('local_expenses', {
      id: expense.id,
      rider_id: expense.rider_id,
      amount: expense.amount,
      category: expense.category || 'Other',
      notes: expense.notes || '',
      created_at: expense.created_at || new Date().toISOString(),
      ts: Date.now(),
      sync_status: 'pending'
    });
    console.log('✅ Saved expense to table:', expense.id);
    return true;
  } catch (err) {
    console.warn('⚠️ Error saving expense to table:', err);
    return false;
  }
}

export async function getExpensesForPeriod(riderId, startTime, endTime) {
  try {
    const expenses = await indexedDbAdapter.queryRows('local_expenses', (row) => {
      if (row.rider_id !== riderId) return false;
      const entryTime = row.created_at ? new Date(row.created_at).getTime() : row.ts;
      return entryTime >= startTime && entryTime <= endTime;
    });
    console.log(`✅ Retrieved ${expenses.length} expenses`);
    return expenses;
  } catch (err) {
    console.warn('⚠️ Error retrieving expenses:', err);
    return [];
  }
}

// ========== FUEL ENTRIES ==========

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
    // ✅ CORRECTED: Changed from 'fuel_entry' to 'fuelEntry'
    await indexedDbAdapter.insertRow('fuelEntry', record);
    console.log('✅ Saved fuel entry:', id);
    return record;
  } catch (err) {
    console.error('❌ saveFuelEntry error:', err);
    return null;
  }
}

export async function getFuelEntries(riderId) {
  try {
    // ✅ CORRECTED: Changed from 'fuel_entry' to 'fuelEntry'
    const entries = await indexedDbAdapter.queryRows('fuelEntry', (e) => e.rider_id === riderId);
    console.log('✅ getFuelEntries:', entries.length);
    return entries;
  } catch (err) {
    console.error('❌ getFuelEntries error:', err);
    return [];
  }
}

export async function getFuelEntriesForPeriod(riderId, startTime, endTime) {
  try {
    const entries = await indexedDbAdapter.queryRows('fuelEntry', (row) => {
      if (row.rider_id !== riderId) return false;
      const entryTime = row.submitted_at ? new Date(row.submitted_at).getTime() : row.ts;
      return entryTime >= startTime && entryTime <= endTime;
    });
    console.log(`✅ Retrieved ${entries.length} fuel entries`);
    return entries;
  } catch (err) {
    console.warn('⚠️ Error retrieving fuel entries:', err);
    return [];
  }
}

export async function getFuelHistoryFromCache(riderId) {
  try {
    const cached = await indexedDbAdapter.kvGet(`fuel_history_${riderId}`);
    if (cached) {
      const entries = typeof cached === 'string' ? JSON.parse(cached) : cached;
      console.log(`✅ Retrieved ${entries.length} fuel entries from cache`);
      return entries || [];
    }
    return [];
  } catch (err) {
    console.warn('⚠️ Error retrieving fuel history from cache:', err);
    return [];
  }
}

// ========== BATTERY ENTRIES ==========

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
    // ✅ CORRECTED: Changed from 'battery_entry' to 'batteryEntry'
    await indexedDbAdapter.insertRow('batteryEntry', record);
    console.log('✅ Saved battery entry:', id);
    return record;
  } catch (err) {
    console.error('❌ saveBatteryEntry error:', err);
    return null;
  }
}

export async function getBatteryEntries(riderId) {
  try {
    // ✅ CORRECTED: Changed from 'battery_entry' to 'batteryEntry'
    const entries = await indexedDbAdapter.queryRows('batteryEntry', (e) => e.rider_id === riderId);
    console.log('✅ getBatteryEntries:', entries.length);
    return entries;
  } catch (err) {
    console.error('❌ getBatteryEntries error:', err);
    return [];
  }
}

export async function getBatteryHistoryFromCache(riderId) {
  try {
    const cached = await indexedDbAdapter.kvGet(`battery_history_${riderId}`);
    if (cached) {
      const entries = typeof cached === 'string' ? JSON.parse(cached) : cached;
      console.log(`✅ Retrieved ${entries.length} battery entries from cache`);
      return entries || [];
    }
    return [];
  } catch (err) {
    console.warn('⚠️ Error retrieving battery history from cache:', err);
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
 * ✅ CORRECTED: Using proper store names
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
    // ✅ CORRECTED: Changed from 'local_trip' to 'trips'
    try {
      const trips = await indexedDbAdapter.queryRows('trips');
      for (const trip of trips) {
        if (trip.created_at && trip.created_at < sixMonthsAgoIso) {
          await indexedDbAdapter.deleteRow('trips', trip.id);
          tripsCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up trips:', err);
    }

    // Clean up old fuel entries
    // ✅ CORRECTED: Changed from 'fuel_entry' to 'fuelEntry'
    try {
      const fuelEntries = await indexedDbAdapter.queryRows('fuelEntry');
      for (const entry of fuelEntries) {
        if (entry.created_at && entry.created_at < sixMonthsAgoIso) {
          await indexedDbAdapter.deleteRow('fuelEntry', entry.id);
          entriesCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up fuel entries:', err);
    }

    // Clean up old battery entries
    // ✅ CORRECTED: Changed from 'battery_entry' to 'batteryEntry'
    try {
      const batteryEntries = await indexedDbAdapter.queryRows('batteryEntry');
      for (const entry of batteryEntries) {
        if (entry.created_at && entry.created_at < sixMonthsAgoIso) {
          await indexedDbAdapter.deleteRow('batteryEntry', entry.id);
          entriesCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up battery entries:', err);
    }

    // Clean up old statements (6-month policy)
    // ✅ CORRECTED: Changed from 'local_statement' to 'statements'
    try {
      const statements = await indexedDbAdapter.queryRows('statements');
      for (const stmt of statements) {
        if (stmt.created_at && stmt.created_at < sixMonthsAgoIso) {
          await indexedDbAdapter.deleteRow('statements', stmt.id);
          statementsCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up statements:', err);
    }

    // Clean up old Lipa Later records (1-year policy)
    try {
      const lipaLaterRecords = await indexedDbAdapter.queryRows('lipaLater');
      for (const record of lipaLaterRecords) {
        if (record.created_at && record.created_at < oneYearAgoIso) {
          await indexedDbAdapter.deleteRow('lipaLater', record.id);
          lipaLaterCleaned++;
        }
      }
    } catch (err) {
      console.warn('⚠️ Error cleaning up Lipa Later records:', err);
    }

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

// ========== DEFAULT EXPORT ==========
// ✅ ALL functions exported for compatibility

export default {
  // Rider status & ID
  getLocalRiderStatus,
  saveLocalRiderStatus,
  getLocalRiderId,
  saveLocalRiderId,
  clearLocalRiderId,
  
  // Bike profile
  getActiveBikeProfile,
  saveLocalBikeProfile,
  
  // Language preferences (BOTH naming conventions included)
  getLocalLanguage,
  saveLocalLanguage,
  getLanguagePreference,
  saveLanguagePreference,
  
  // Translations
  getCachedTranslations,
  setCachedTranslations,
  
  // Master data
  getCachedMasterData,
  setCachedMasterData,
  preloadMasterData,
  
  // Auth
  getLocalAuthToken,
  saveLocalAuthToken,
  clearSession,
  
  // Plate cache
  checkLocalPlateCache,
  saveLocalPlateCache,
  
  // Trip rules
  getCachedTripRuleConfig,
  setCachedTripRuleConfig,
  
  // Account summary
  getRiderAccountSummary,
  saveRiderAccountSummary,
  
  // Database
  openLocalDb,
  
  // Trips
  addTrip,
  getUnsyncedTrips,
  getTripsFromCache,
  getAllTrips,
  getTripById,
  updateTrip,
  deleteTrip,
  
  // Maintenance
  saveMaintenanceEntryToTable,
  getMaintenanceEntriesForPeriod,
  getMaintenanceHistoryFromCache,
  
  // Expenses
  saveExpenseToTable,
  getExpensesForPeriod,
  
  // Fuel
  saveFuelEntry,
  getFuelEntries,
  getFuelEntriesForPeriod,
  getFuelHistoryFromCache,
  
  // Battery
  saveBatteryEntry,
  getBatteryEntries,
  getBatteryHistoryFromCache,
  
  // Cleanup
  cleanupOldData,
};