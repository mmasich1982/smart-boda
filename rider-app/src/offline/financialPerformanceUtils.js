// rider-app/src/offline/financialPerformanceUtils.js
// ✅ REFACTORED: Financial performance utilities for IndexedDB-first architecture
// Centralized logic for fuel, battery, maintenance, and other expense operations
// Mirrors tripUtils.js pattern for consistency and maintainability
// Includes 6-month retention policy compliance
// ✅ FIXED: getExpenseTotalsByPeriod now properly filters by period boundaries

import indexedDbAdapter from './adapters/indexedDbAdapter';

/**
 * ============================================================================
 * FINANCIAL PERFORMANCE STORAGE ARCHITECTURE (IndexedDB-First Pattern)
 * ============================================================================
 *
 * CACHE KEYS BY EXPENSE TYPE:
 * ───────────────────────────
 *
 * FUEL ENTRIES:
 * • fuel_entry_${entryId}: Individual fuel record
 *   Format: { id, rider_id, cost, mode, ts, timestamp, created_at, syncStatus, ... }
 * • fuel_history_${riderId}: Array of all fuel entries (performance cache)
 *   Updated by FuelEntryScreen after recording new fuel
 *   Refreshed by FuelHistoryScreen on focus
 * • fuel_summary_${riderId}: Period summaries for quick access
 *   Format: { total: 15000, count: 5, lastUpdated: timestamp }
 *
 * BATTERY ENTRIES:
 * • battery_entry_${entryId}: Individual battery charge record
 *   Format: { id, rider_id, cost, mode, ts, timestamp, created_at, syncStatus, ... }
 * • battery_history_${riderId}: Array of all battery entries
 *   Updated by BatteryEntryScreen after recording new charge
 *   Refreshed by BatteryHistoryScreen on focus
 * • battery_summary_${riderId}: Period summaries
 *   Format: { total: 8000, count: 3, lastUpdated: timestamp }
 *
 * MAINTENANCE ENTRIES:
 * • maintenance_entry_${entryId}: Individual maintenance record
 *   Format: { id, rider_id, cost, category, ts, timestamp, created_at, syncStatus, ... }
 * • maintenance_history_${riderId}: Array of all maintenance entries
 *   Updated by MaintenanceEntryScreen after recording service
 *   Refreshed by MaintenanceHistoryScreen on focus
 * • maintenance_summary_${riderId}: Period summaries
 *   Format: { total: 5000, count: 2, lastUpdated: timestamp }
 *
 * OTHER EXPENSES:
 * • other_expense_${entryId}: Individual other expense record
 *   Format: { id, rider_id, amount, category, note, ts, timestamp, created_at, ... }
 * • other_expenses_summary_${riderId}: Summary of other expenses
 *   Format: { total: 3000, count: 4, byCategory: { Food: 1500, ... } }
 *
 * INCOME (TRIPS):
 * • trip_income_${riderId}_${period}: Income summary by period
 *   Format: { total: 50000, count: 25, period: 'today' | 'this_week' | 'this_month' }
 *
 * PERIOD SUMMARIES (for MoneyMasteryScreen):
 * • money_mastery_${riderId}_${period}: Full period summary
 *   Format: { net_profit, income, fuel, battery, maintenance, other, breakdown }
 * • money_mastery_all_totals_${riderId}: All period totals combined
 *   Format: { today: {...}, this_week: {...}, this_month: {...} }
 *
 * ============================================================================
 * EXPENSE RECORD STRUCTURE
 * ============================================================================
 *
 * FUEL ENTRY:
 * {
 *   id: 'fuel_${riderId}_${timestamp}',
 *   rider_id: 'rider123',
 *   cost: 630,                      // Amount in KSh
 *   mode: 'petrol' | 'charging',    // Fuel type
 *   
 *   // Timestamps (dual fields for compatibility)
 *   ts: 1724080000000,              // Primary timestamp (ms)
 *   timestamp: 1724080000000,       // Backup timestamp (ms)
 *   created_at: '2026-08-25T10:00:00Z',
 *   date: '2026-08-25',
 *   
 *   // Status
 *   status: 'active',
 *   syncStatus: 'pending' | 'synced'
 * }
 *
 * BATTERY ENTRY:
 * {
 *   id: 'battery_${riderId}_${timestamp}',
 *   rider_id: 'rider123',
 *   cost: 450,
 *   mode: 'charging',
 *   ts, timestamp, created_at, date, status, syncStatus
 * }
 *
 * MAINTENANCE ENTRY:
 * {
 *   id: 'maintenance_${riderId}_${timestamp}',
 *   rider_id: 'rider123',
 *   cost: 2500,
 *   category: 'Chain Replacement' | 'Tire Repair' | 'General Service',
 *   note: 'Chain was worn out',
 *   ts, timestamp, created_at, date, status, syncStatus
 * }
 *
 * OTHER EXPENSE:
 * {
 *   id: 'other_expense_${riderId}_${timestamp}',
 *   rider_id: 'rider123',
 *   amount: 200,
 *   category: 'Food' | 'Phone Data' | 'Transport' | 'Medical' | 'Family' | 'Other',
 *   note: 'Lunch during peak hours',
 *   ts, timestamp, created_at, date, status, syncStatus
 * }
 *
 * ============================================================================
 * USAGE PATTERNS
 * ============================================================================
 *
 * RECORD FUEL ENTRY (FuelEntryScreen):
 *   1. Create fuel entry with timestamp
 *   2. Save to fuel_entry_${entryId} using kvSet
 *   3. Load fuel_history_${riderId} cache
 *   4. Prepend new entry (unshift)
 *   5. Save updated cache back to kvSet
 *   6. Invalidate fuel_summary_${riderId} cache
 *   7. Queue for sync via addToSyncQueue
 *   8. Try immediate sync if online
 *   9. FuelHistoryScreen will refresh on focus
 *
 * VIEW FUEL HISTORY (FuelHistoryScreen):
 *   1. Load fuel_history_${riderId} from cache
 *   2. Filter by period/date as needed
 *   3. Calculate totals and display
 *   4. On focus: reload cache (soft refresh)
 *   5. On sync: update cache with fresh data from API
 *
 * UPDATE SUMMARIES (MoneyMasteryScreen):
 *   1. Calculate summary from all expense types
 *   2. Save to money_mastery_${riderId}_${period}
 *   3. MoneyMasteryScreen loads this cached summary
 *   4. On refresh: recompute and update cache
 *   5. AddOtherExpenseScreen invalidates cache on save
 *
 * ============================================================================
 * RETENTION POLICY (6-MONTH ROLLING WINDOW)
 * ============================================================================
 *
 * RETENTION WINDOW: 6 months from onboarding date
 * 
 * LIFECYCLE:
 * • Phase 1 (Days 0-180): Active period
 *   - Data stored in IndexedDB for fast offline access
 *   - Fully editable and viewable
 *   - Synced to PostgreSQL when online
 * 
 * • Phase 2 (Days 180+): Archive period
 *   - Data deleted from IndexedDB (device storage freed)
 *   - Data persists in PostgreSQL (long-term archive)
 *   - Not accessible via offline screens
 *   - Available via API if archive endpoints exist
 *
 * CLEANUP TRIGGERS:
 * • Automatic weekly via background service
 * • On app startup (if weekly cleanup missed)
 * • On demand via storage management screen
 *
 * SAFETY CHECKS:
 * • Never delete unless syncStatus === 'synced'
 * • Preserve at least 30 days even if sync fails
 * • Skip cleanup if offline (user might be viewing old data)
 * • Log all cleanup operations
 *
 * ============================================================================
 */

// ============================================================================
// PERIOD BOUNDARY CALCULATIONS
// ============================================================================

/**
 * Get period boundaries for accurate filtering
 * @param {string} period - 'today' | 'this_week' | 'this_month'
 * @returns {Object} - { start: Date, end: Date } with milliseconds
 */
function getPeriodBoundaries(period) {
  const now = new Date();
  let start, end;

  if (period === 'today') {
    // Trading day: 4 AM to 4 AM
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
    if (now < start) {
      start.setDate(start.getDate() - 1);
    }
    end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(end.getMilliseconds() - 1);
  } else if (period === 'this_week') {
    // Calculate week start (Monday) without mutating original date
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    start = new Date(now.getFullYear(), now.getMonth(), diff);
    start.setHours(4, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setMilliseconds(end.getMilliseconds() - 1);
  } else if (period === 'this_month') {
    // Month from 1st at 4 AM to last day at 3:59:59
    start = new Date(now.getFullYear(), now.getMonth(), 1, 4, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 3, 59, 59, 999);
  }

  return { start, end };
}

// ============================================================================
// FUEL ENTRY OPERATIONS
// ============================================================================

/**
 * Load fuel entry from IndexedDB
 * @param {string} entryId - Fuel entry ID
 * @returns {Promise<Object|null>} - Fuel entry or null
 */
export async function loadFuelEntryFromDb(entryId) {
  try {
    const recordKey = `fuel_entry_${entryId}`;
    const data = await indexedDbAdapter.kvGet(recordKey);

    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading fuel entry:', err);
    return null;
  }
}

/**
 * Save fuel entry to IndexedDB
 * @param {string} entryId - Fuel entry ID
 * @param {Object} entryData - Fuel entry record
 * @returns {Promise<boolean>} - Success status
 */
export async function saveFuelEntryToDb(entryId, entryData) {
  try {
    const recordKey = `fuel_entry_${entryId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(entryData));
    console.log('✅ Fuel entry saved:', entryId);
    return true;
  } catch (err) {
    console.error('❌ Error saving fuel entry:', err);
    return false;
  }
}

/**
 * Load fuel history cache for rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Fuel entries
 */
export async function loadFuelHistoryCache(riderId) {
  try {
    const cacheKey = `fuel_history_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    let items = [];

    if (cachedData) {
      try {
        items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (!Array.isArray(items)) items = [];
      } catch (parseErr) {
        console.warn('⚠️ Fuel history cache parse error');
        items = [];
      }
    }

    return items;
  } catch (err) {
    console.error('❌ Error loading fuel history cache:', err);
    return [];
  }
}

/**
 * Save fuel history cache for rider
 * @param {string} riderId - Rider ID
 * @param {Array} entries - Fuel entries to cache
 * @returns {Promise<boolean>} - Success status
 */
export async function saveFuelHistoryCache(riderId, entries) {
  try {
    const cacheKey = `fuel_history_${riderId}`;
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(entries));
    console.log('✅ Fuel history cache updated for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error saving fuel history cache:', err);
    return false;
  }
}

// ============================================================================
// BATTERY ENTRY OPERATIONS
// ============================================================================

/**
 * Load battery entry from IndexedDB
 * @param {string} entryId - Battery entry ID
 * @returns {Promise<Object|null>} - Battery entry or null
 */
export async function loadBatteryEntryFromDb(entryId) {
  try {
    const recordKey = `battery_entry_${entryId}`;
    const data = await indexedDbAdapter.kvGet(recordKey);

    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading battery entry:', err);
    return null;
  }
}

/**
 * Save battery entry to IndexedDB
 * @param {string} entryId - Battery entry ID
 * @param {Object} entryData - Battery entry record
 * @returns {Promise<boolean>} - Success status
 */
export async function saveBatteryEntryToDb(entryId, entryData) {
  try {
    const recordKey = `battery_entry_${entryId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(entryData));
    console.log('✅ Battery entry saved:', entryId);
    return true;
  } catch (err) {
    console.error('❌ Error saving battery entry:', err);
    return false;
  }
}

/**
 * Load battery history cache for rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Battery entries
 */
export async function loadBatteryHistoryCache(riderId) {
  try {
    const cacheKey = `battery_history_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    let items = [];

    if (cachedData) {
      try {
        items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (!Array.isArray(items)) items = [];
      } catch (parseErr) {
        console.warn('⚠️ Battery history cache parse error');
        items = [];
      }
    }

    return items;
  } catch (err) {
    console.error('❌ Error loading battery history cache:', err);
    return [];
  }
}

/**
 * Save battery history cache for rider
 * @param {string} riderId - Rider ID
 * @param {Array} entries - Battery entries to cache
 * @returns {Promise<boolean>} - Success status
 */
export async function saveBatteryHistoryCache(riderId, entries) {
  try {
    const cacheKey = `battery_history_${riderId}`;
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(entries));
    console.log('✅ Battery history cache updated for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error saving battery history cache:', err);
    return false;
  }
}

// ============================================================================
// MAINTENANCE ENTRY OPERATIONS
// ============================================================================

/**
 * Load maintenance entry from IndexedDB
 * @param {string} entryId - Maintenance entry ID
 * @returns {Promise<Object|null>} - Maintenance entry or null
 */
export async function loadMaintenanceEntryFromDb(entryId) {
  try {
    const recordKey = `maintenance_entry_${entryId}`;
    const data = await indexedDbAdapter.kvGet(recordKey);

    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading maintenance entry:', err);
    return null;
  }
}

/**
 * Save maintenance entry to IndexedDB
 * @param {string} entryId - Maintenance entry ID
 * @param {Object} entryData - Maintenance entry record
 * @returns {Promise<boolean>} - Success status
 */
export async function saveMaintenanceEntryToDb(entryId, entryData) {
  try {
    const recordKey = `maintenance_entry_${entryId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(entryData));
    console.log('✅ Maintenance entry saved:', entryId);
    return true;
  } catch (err) {
    console.error('❌ Error saving maintenance entry:', err);
    return false;
  }
}

/**
 * Load maintenance history cache for rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Maintenance entries
 */
export async function loadMaintenanceHistoryCache(riderId) {
  try {
    const cacheKey = `maintenance_history_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    let items = [];

    if (cachedData) {
      try {
        items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (!Array.isArray(items)) items = [];
      } catch (parseErr) {
        console.warn('⚠️ Maintenance history cache parse error');
        items = [];
      }
    }

    return items;
  } catch (err) {
    console.error('❌ Error loading maintenance history cache:', err);
    return [];
  }
}

/**
 * Save maintenance history cache for rider
 * @param {string} riderId - Rider ID
 * @param {Array} entries - Maintenance entries to cache
 * @returns {Promise<boolean>} - Success status
 */
export async function saveMaintenanceHistoryCache(riderId, entries) {
  try {
    const cacheKey = `maintenance_history_${riderId}`;
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(entries));
    console.log('✅ Maintenance history cache updated for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error saving maintenance history cache:', err);
    return false;
  }
}

// ============================================================================
// OTHER EXPENSE OPERATIONS
// ============================================================================

/**
 * Load other expense from IndexedDB
 * @param {string} entryId - Expense entry ID
 * @returns {Promise<Object|null>} - Expense entry or null
 */
export async function loadOtherExpenseFromDb(entryId) {
  try {
    const recordKey = `other_expense_${entryId}`;
    const data = await indexedDbAdapter.kvGet(recordKey);

    if (data) {
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading other expense:', err);
    return null;
  }
}

/**
 * Save other expense to IndexedDB
 * @param {string} entryId - Expense entry ID
 * @param {Object} entryData - Expense entry record
 * @returns {Promise<boolean>} - Success status
 */
export async function saveOtherExpenseToDb(entryId, entryData) {
  try {
    const recordKey = `other_expense_${entryId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(entryData));
    console.log('✅ Other expense saved:', entryId);
    return true;
  } catch (err) {
    console.error('❌ Error saving other expense:', err);
    return false;
  }
}

/**
 * Calculate summary of other expenses by category
 * @param {string} riderId - Rider ID
 * @returns {Promise<Object>} - Summary with entries and categories
 */
export async function calculateOtherExpensesSummary(riderId) {
  try {
    const cacheKey = `other_expenses_summary_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    
    if (cachedData) {
      const data = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
      return data || { entries: [], total: 0, byCategory: {} };
    }
    
    return { entries: [], total: 0, byCategory: {} };
  } catch (err) {
    console.error('❌ Error calculating other expenses summary:', err);
    return { entries: [], total: 0, byCategory: {} };
  }
}

// ============================================================================
// SUMMARY & AGGREGATION OPERATIONS
// ============================================================================

/**
 * ✅ FIXED: Get expense totals for a period
 * Now properly filters all expenses within the specified period boundaries
 * @param {string} riderId - Rider ID
 * @param {string} period - 'today' | 'this_week' | 'this_month'
 * @returns {Promise<Object>} - Summary with all expense types filtered by period
 */
export async function getExpenseTotalsByPeriod(riderId, period) {
  try {
    const { start, end } = getPeriodBoundaries(period);
    const startMs = start.getTime();
    const endMs = end.getTime();

    const summaries = {
      fuel: 0,
      battery: 0,
      maintenance: 0,
      other: 0
    };

    // Load and filter fuel expenses
    try {
      const fuelHistoryCache = await indexedDbAdapter.kvGet(`fuel_history_${riderId}`);
      if (fuelHistoryCache) {
        let fuelEntries = [];
        try {
          fuelEntries = typeof fuelHistoryCache === 'string' ? JSON.parse(fuelHistoryCache) : fuelHistoryCache;
          if (!Array.isArray(fuelEntries)) fuelEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Fuel cache parse error');
        }
        
        fuelEntries.forEach(f => {
          const ts = f.ts || f.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            summaries.fuel += f.cost || 0;
          }
        });
      }
    } catch (err) {
      console.warn('⚠️ Error loading fuel totals:', err);
    }

    // Load and filter battery expenses
    try {
      const batteryHistoryCache = await indexedDbAdapter.kvGet(`battery_history_${riderId}`);
      if (batteryHistoryCache) {
        let batteryEntries = [];
        try {
          batteryEntries = typeof batteryHistoryCache === 'string' ? JSON.parse(batteryHistoryCache) : batteryHistoryCache;
          if (!Array.isArray(batteryEntries)) batteryEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Battery cache parse error');
        }
        
        batteryEntries.forEach(b => {
          const ts = b.ts || b.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            summaries.battery += b.cost || 0;
          }
        });
      }
    } catch (err) {
      console.warn('⚠️ Error loading battery totals:', err);
    }

    // Load and filter maintenance expenses
    try {
      const maintenanceHistoryCache = await indexedDbAdapter.kvGet(`maintenance_history_${riderId}`);
      if (maintenanceHistoryCache) {
        let maintenanceEntries = [];
        try {
          maintenanceEntries = typeof maintenanceHistoryCache === 'string' ? JSON.parse(maintenanceHistoryCache) : maintenanceHistoryCache;
          if (!Array.isArray(maintenanceEntries)) maintenanceEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Maintenance cache parse error');
        }
        
        maintenanceEntries.forEach(m => {
          const ts = m.ts || m.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            summaries.maintenance += m.cost || 0;
          }
        });
      }
    } catch (err) {
      console.warn('⚠️ Error loading maintenance totals:', err);
    }

    // Load and filter other expenses
    try {
      const otherSummary = await indexedDbAdapter.kvGet(`other_expenses_summary_${riderId}`);
      if (otherSummary) {
        const data = typeof otherSummary === 'string' ? JSON.parse(otherSummary) : otherSummary;
        if (data.entries && Array.isArray(data.entries)) {
          data.entries.forEach(e => {
            const ts = e.ts || e.timestamp || 0;
            if (ts >= startMs && ts <= endMs) {
              summaries.other += e.amount || 0;
            }
          });
        }
      }
    } catch (err) {
      console.warn('⚠️ Error loading other expense totals:', err);
    }

    console.log(`✅ Expense totals for ${period}:`, summaries);
    return summaries;
  } catch (err) {
    console.error('❌ Error getting expense totals:', err);
    return {
      fuel: 0,
      battery: 0,
      maintenance: 0,
      other: 0
    };
  }
}

/**
 * Invalidate all period-based caches (called when new expense is saved)
 * @param {string} riderId - Rider ID
 * @returns {Promise<boolean>} - Success status
 */
export async function invalidateFinancialCaches(riderId) {
  try {
    const cacheKeys = [
      `money_mastery_${riderId}_today`,
      `money_mastery_${riderId}_this_week`,
      `money_mastery_${riderId}_this_month`,
      `money_mastery_all_totals_${riderId}`,
      `fuel_summary_${riderId}`,
      `battery_summary_${riderId}`,
      `maintenance_summary_${riderId}`,
      `other_expenses_summary_${riderId}`,
    ];

    for (const key of cacheKeys) {
      try {
        await indexedDbAdapter.deleteRow('kvStore', key);
      } catch (err) {
        console.warn(`⚠️ Failed to clear cache key: ${key}`);
      }
    }

    console.log('✅ Invalidated financial caches for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error invalidating financial caches:', err);
    return false;
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all financial data for a rider (for testing/debugging)
 * @param {string} riderId - Rider ID
 * @returns {Promise<boolean>} - Success status
 */
export async function clearFinancialCacheForRider(riderId) {
  try {
    const cacheKeys = [
      `fuel_history_${riderId}`,
      `battery_history_${riderId}`,
      `maintenance_history_${riderId}`,
      `other_expenses_summary_${riderId}`,
      `money_mastery_${riderId}_today`,
      `money_mastery_${riderId}_this_week`,
      `money_mastery_${riderId}_this_month`,
      `money_mastery_all_totals_${riderId}`,
      `fuel_summary_${riderId}`,
      `battery_summary_${riderId}`,
      `maintenance_summary_${riderId}`,
    ];

    for (const key of cacheKeys) {
      try {
        await indexedDbAdapter.deleteRow('kvStore', key);
      } catch (err) {
        console.warn(`⚠️ Failed to clear: ${key}`);
      }
    }

    console.log('✅ Cleared all financial caches for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error clearing financial cache:', err);
    return false;
  }
}

/**
 * Sync financial data from API to local cache
 * @param {string} riderId - Rider ID
 * @param {string} dataType - 'fuel' | 'battery' | 'maintenance' | 'other'
 * @param {Array} entries - Entries from API
 * @returns {Promise<boolean>} - Success status
 */
export async function syncFinancialDataFromApi(riderId, dataType, entries) {
  try {
    // Sort by timestamp (newest first)
    const sorted = entries.sort((a, b) => {
      const bTs = b.ts || b.timestamp || 0;
      const aTs = a.ts || a.timestamp || 0;
      return bTs - aTs;
    });

    // Save to appropriate cache based on data type
    let cacheKey, saveFunc;
    
    if (dataType === 'fuel') {
      cacheKey = `fuel_history_${riderId}`;
      saveFunc = saveFuelEntryToDb;
    } else if (dataType === 'battery') {
      cacheKey = `battery_history_${riderId}`;
      saveFunc = saveBatteryEntryToDb;
    } else if (dataType === 'maintenance') {
      cacheKey = `maintenance_history_${riderId}`;
      saveFunc = saveMaintenanceEntryToDb;
    } else if (dataType === 'other') {
      // Other expenses don't have a history cache, just summary
      for (const entry of sorted) {
        await saveOtherExpenseToDb(entry.id, entry);
      }
      console.log('✅ Synced', sorted.length, dataType, 'entries from API');
      return true;
    }

    // Save to cache
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(sorted));

    // Save individual records
    for (const entry of sorted) {
      await saveFunc(entry.id, entry);
    }

    console.log('✅ Synced', sorted.length, dataType, 'entries from API');
    return true;
  } catch (err) {
    console.error('❌ Error syncing financial data from API:', err);
    return false;
  }
}

export default {
  // Fuel operations
  loadFuelEntryFromDb,
  saveFuelEntryToDb,
  loadFuelHistoryCache,
  saveFuelHistoryCache,
  
  // Battery operations
  loadBatteryEntryFromDb,
  saveBatteryEntryToDb,
  loadBatteryHistoryCache,
  saveBatteryHistoryCache,
  
  // Maintenance operations
  loadMaintenanceEntryFromDb,
  saveMaintenanceEntryToDb,
  loadMaintenanceHistoryCache,
  saveMaintenanceHistoryCache,
  
  // Other expense operations
  loadOtherExpenseFromDb,
  saveOtherExpenseToDb,
  calculateOtherExpensesSummary,
  
  // Summary & aggregation
  getExpenseTotalsByPeriod,
  invalidateFinancialCaches,
  
  // Cache management
  clearFinancialCacheForRider,
  syncFinancialDataFromApi,
};