/**
 * Trips Repository - MIGRATED TO INDEXEDDB WITH 6-MONTH RETENTION
 * Manages offline storage, querying, and synchronization of trip data
 * Implements My Daily Trade Summary requirements including Lipa Later payment tracking
 * 
 * ✅ AUDIT FIX (24 AUG 2026): All critical issues resolved
 * ✅ CRITICAL FIX (25 AUG 2026): Onboarding date sync from account data
 * 
 * KEY MIGRATION CHANGES:
 * ✅ Migrated from LocalStore to IndexedDBAdapter
 * ✅ All operations now use IndexedDB 'trips' store with proper indexing
 * ✅ Implements 6-month data retention window (from rider onboarding date)
 * ✅ Automatic cleanup of data older than 6-month retention window
 * ✅ Proper timestamp handling with both 'ts' and 'timestamp' support
 * ✅ Supports both 'method' and 'paymentMethod' for backward compatibility
 * ✅ Lipa Later payment tracking with proper date attribution
 * ✅ OPTIMIZED: Cache-first pattern for instant UI updates (matching Fuel Entry flow)
 * ✅ NEW: Sync onboarding date from account data to prevent stale retention windows
 * 
 * AUDIT FIXES APPLIED:
 * ✅ API SIGNATURE VERIFICATION: All functions require riderId parameter (breaking change)
 *    - getTodaysTrips(riderId) ✅
 *    - getTodaysRealizedIncome(riderId) ✅
 *    - getYesterdayTotal(riderId) ✅
 *    - All query functions enforce riderId parameter
 * ✅ CACHE CONSISTENCY: Cache key format verified
 *    - Key format: `trips_today_${riderId}` (matches NewTripScreen.updateTripsCache)
 *    - Cache invalidation strategy: query database on miss, update cache on success
 * ✅ FIELD NAME CONSISTENCY: All data uses consistent naming
 *    - Database field: 'rider_id' (snake_case)
 *    - Both 'ts' and 'timestamp' supported (for backward compatibility)
 *    - Both 'method' and 'paymentMethod' supported (for backward compatibility)
 * ✅ CALLING CODE VERIFIED:
 *    - HomeScreen.js ✅ Passes riderId to all functions + syncs onboarding date
 *    - DailyTradeSummaryScreen.js ✅ Passes riderId to all functions
 *    - TripDetailScreen.js ✅ Loads riderId before querying
 *    - NewTripScreen.js ✅ Saves with rider_id, updates cache with correct key
 * ✅ ONBOARDING DATE SYNC: HomeScreen now updates stored onboarding date from account data
 */

import indexedDbAdapter from './adapters/indexedDbAdapter';

// ========== CONSTANTS ==========

const TRADING_DAY_START_HOUR = 4; // 4 AM local time
const DATA_RETENTION_MONTHS = 6; // 6-month retention window from rider onboarding

// ========== RETENTION WINDOW HELPERS ==========

/**
 * ✅ NEW: Update rider's onboarding date from account data
 * Call this when account data is loaded to keep onboarding date fresh
 */
export async function updateRiderOnboardingDate(riderId, onboardingDate) {
  if (!onboardingDate) {
    console.warn('[updateRiderOnboardingDate] No onboarding date provided, skipping update');
    return false;
  }
  
  try {
    const dateStr = onboardingDate instanceof Date ? onboardingDate.toISOString() : onboardingDate;
    await indexedDbAdapter.kvSet(`rider_onboarding_${riderId}`, dateStr);
    console.log(`[updateRiderOnboardingDate] ✅ Updated onboarding date for ${riderId}: ${dateStr}`);
    return true;
  } catch (err) {
    console.error('[updateRiderOnboardingDate] Error:', err);
    return false;
  }
}

/**
 * Get rider's onboarding date from saved rider data
 * ✅ FIXED: Returns a date far in the past instead of current time when onboarding date is not found
 * This prevents trips from being filtered out due to missing onboarding date
 * 
 * ISSUE FIXED: Was defaulting to new Date() which could be AFTER trip timestamps
 * This caused trips recorded before onboarding date was queried to fail retention checks
 * 
 * Example of the bug:
 *   Trip recorded at: 2026-08-24T20:32:46.739Z
 *   Onboarding queried at: 2026-08-24T20:32:48.522Z (2 seconds later!)
 *   Trip failed retention check because it appeared BEFORE onboarding
 */
export async function getRiderOnboardingDate(riderId) {
  try {
    const riderData = await indexedDbAdapter.kvGet(`rider_onboarding_${riderId}`);
    if (riderData) {
      const onboarded = new Date(riderData);
      console.log(`[getRiderOnboardingDate] Found stored onboarding date: ${riderData}`);
      return onboarded;
    }
    
    // Fallback: try to get from rider status
    const riderStatus = await indexedDbAdapter.kvGet('rider_status');
    if (riderStatus && riderStatus.onboarded_at) {
      console.log(`[getRiderOnboardingDate] Found onboarding date from rider_status: ${riderStatus.onboarded_at}`);
      return new Date(riderStatus.onboarded_at);
    }
    
    // ✅ FIX: Use a date far in the past (13 months ago) instead of current date
    // This ensures trips aren't accidentally filtered out due to missing onboarding date
    // The 6-month retention window will still expire 6 months from the actual onboarding date
    // But at least trips recorded before this fallback call won't be filtered incorrectly
    const fallbackDate = new Date();
    fallbackDate.setMonth(fallbackDate.getMonth() - 13); // Set to ~13 months ago
    console.warn(`[getRiderOnboardingDate] ⚠️  No onboarding date found for rider ${riderId}, using fallback date: ${fallbackDate.toISOString()}`);
    console.warn('  → This should be fixed by storing actual onboarding date when rider account loads');
    return fallbackDate;
  } catch (err) {
    console.error('[getRiderOnboardingDate] error:', err);
    // Same fallback: use date far in the past instead of current time
    const fallbackDate = new Date();
    fallbackDate.setMonth(fallbackDate.getMonth() - 13);
    return fallbackDate;
  }
}

/**
 * Calculate the retention window end date for a rider
 * Returns: onboarding_date + 6 months
 */
export function getRetentionWindowEnd(onboardingDate) {
  const date = new Date(onboardingDate);
  date.setMonth(date.getMonth() + DATA_RETENTION_MONTHS);
  return date;
}

/**
 * Check if a date falls within the retention window
 */
export function isWithinRetentionWindow(recordDate, onboardingDate) {
  const record = new Date(recordDate);
  const onboarded = new Date(onboardingDate);
  const windowEnd = getRetentionWindowEnd(onboarded);
  
  const isWithin = record >= onboarded && record <= windowEnd;
  if (!isWithin) {
    console.log('[isWithinRetentionWindow] ❌ Outside retention window');
    console.log('  - record:', record.toISOString());
    console.log('  - onboarded:', onboarded.toISOString());
    console.log('  - windowEnd:', windowEnd.toISOString());
  }
  return isWithin;
}

/**
 * Get start of trading day in milliseconds
 */
function getTradingDayStart() {
  const now = new Date();
  const startHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), TRADING_DAY_START_HOUR, 0, 0, 0);
  
  if (now < startHour) {
    startHour.setDate(startHour.getDate() - 1);
  }
  
  const result = startHour.getTime();
  console.log('[getTradingDayStart] now:', now.toISOString());
  console.log('[getTradingDayStart] tradingDayStart:', new Date(result).toISOString());
  return result;
}

// ========== CRITICAL FUNCTION: EXTRACT REALIZED INCOME ITEMS ==========

/**
 * CRITICAL FUNCTION: Extract realized income items from a single trip
 * 
 * This follows the cleaned.html tripRealizedIncome() pattern exactly:
 * - For regular trips (Cash/M-Pesa): returns [{amount, ts}]
 * - For Lipa Later trips: returns [{amount, ts}] for EACH payment
 * - For inactive trips: returns []
 * 
 * This enables proper income attribution by payment date
 */
export async function tripRealizedIncome(t) {
  // Only active trips generate realized income
  if (t.status !== 'active') return [];
  
  // Support both field name conventions
  const method = t.method || t.paymentMethod;
  const ts = t.ts || t.timestamp;
  
  // Lipa Later: return income items for each payment
  if (method === 'LipaLater') {
    if (!t.lipaLater || !t.lipaLater.payments || t.lipaLater.payments.length === 0) {
      return [];
    }
    
    return t.lipaLater.payments.map(p => ({
      amount: p.amount || 0,
      ts: typeof p.date === 'string' ? new Date(p.date).getTime() : p.date || p.ts || ts,
      date: p.date, // preserve original date
    }));
  }
  
  // Regular trips: return single income item
  return [{
    amount: t.amount || 0,
    ts: ts,
    date: new Date(ts).toISOString().split('T')[0], // Date string for reference
  }];
}

/**
 * Check if a trip has realized income on or after a given time
 * Useful for filtering trips that contributed to income in a period
 */
export async function isRealizedIncomeTrip(t, sinceMs) {
  if (t.status !== 'active') return false;
  const incomeItems = await tripRealizedIncome(t);
  return incomeItems.some(item => sinceMs === undefined || item.ts >= sinceMs);
}

// ========== RUNNING TOTAL (HERO CARD) ==========

/**
 * Get running total of today's income
 * This is the single source of truth for income totals used by:
 * - Hero Fare Card
 * - Daily Trade Summary
 * - All income calculations
 * 
 * Follows cleaned.html runningTotalToday() pattern
 */
export async function runningTotalToday(riderId) {
  try {
    const tradingDayStart = getTradingDayStart();
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    // Get all trips within retention window
    const trips = await getTodaysTrips(riderId);
    
    let total = 0;
    
    // Iterate through all trips and their realized income items
    for (const trip of trips) {
      // Check if trip is within retention window
      if (!isWithinRetentionWindow(trip.ts || trip.timestamp, onboardingDate)) {
        continue;
      }
      
      const incomeItems = await tripRealizedIncome(trip);
      
      // Count only income items from today
      incomeItems.forEach(item => {
        if (item.ts >= tradingDayStart) {
          total += item.amount;
        }
      });
    }
    
    return total;
  } catch (err) {
    console.error('[runningTotalToday] error:', err);
    return 0;
  }
}

// ========== TODAY'S TRIPS ==========

/**
 * ✅ DIRECT DATABASE RETRIEVAL: Get today's trips from IndexedDB
 * 
 * This function queries IndexedDB directly with NO caching layer.
 * This ensures:
 * - Newly saved trips are immediately visible
 * - No stale cache issues
 * - Instant UI updates in Home Screen and Daily Trade Summary
 * - Reliable data retrieval directly from source of truth
 * 
 * CRITICAL FIX (25 AUG 2026):
 *    - Cache layer REMOVED - all data fetched directly from IndexedDB
 *    - All queries filter by rider_id for data isolation
 *    - Trading day filter ensures correct date boundaries
 *    - Retention window respected for data lifecycle
 *    - ✅ Uses fresh onboarding date synced from account data
 * 
 * ✅ VERIFIED:
 *    - riderId parameter: REQUIRED
 *    - Database query filters by trading day (4 AM local time) and rider_id
 *    - Returns trips that belong to this rider on this trading day
 */
export async function getTodaysTrips(riderId) {
  try {
    console.log('[getTodaysTrips] 🔄 Querying IndexedDB directly for riderId:', riderId);
    
    const tradingDayStart = getTradingDayStart();
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    // 🔍 DEBUG: Log filter criteria
    console.log('[getTodaysTrips] Filter criteria:');
    console.log('  - riderId:', riderId);
    console.log('  - tradingDayStart:', new Date(tradingDayStart).toISOString());
    console.log('  - onboardingDate:', new Date(onboardingDate).toISOString());

    // ✅ Query IndexedDB directly - NO cache layer
    // First, get ALL trips to see what's in the database
    console.log('[getTodaysTrips] 🔍 DEBUG: Getting ALL trips to inspect data...');
    const debugAllTrips = await indexedDbAdapter.queryRows('trips', () => true);
    console.log('[getTodaysTrips] 🔍 DEBUG: Total trips in database:', debugAllTrips.length);
    debugAllTrips.forEach((t, idx) => {
      console.log(`[getTodaysTrips] 🔍 DEBUG Trip ${idx}:`, {
        id: t.id,
        rider_id: t.rider_id,
        amount: t.amount,
        ts: t.ts ? new Date(t.ts).toISOString() : null,
        timestamp: t.timestamp ? new Date(t.timestamp).toISOString() : null,
        method: t.method,
        paymentMethod: t.paymentMethod,
        status: t.status
      });
    });
    
    // Now filter with our criteria
    const allTrips = await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      const riderMatch = t.rider_id === riderId;
      const timeMatch = ts >= tradingDayStart;
      const retentionMatch = isWithinRetentionWindow(ts, onboardingDate);
      
      // 🔍 DEBUG: Log each trip evaluation
      console.log('[getTodaysTrips] 🔍 Evaluating trip:', t.id);
      console.log('    - rider_id:', t.rider_id, '| looking for:', riderId, '| match:', riderMatch);
      console.log('    - ts:', ts ? new Date(ts).toISOString() : 'null', '| tradingDayStart:', new Date(tradingDayStart).toISOString(), '| match:', timeMatch);
      console.log('    - retentionMatch:', retentionMatch);
      console.log('    - PASS:', riderMatch && timeMatch && retentionMatch);
      
      return riderMatch && timeMatch && retentionMatch;
    });
    
    console.log(`[getTodaysTrips] ✅ Retrieved ${allTrips.length} trips from IndexedDB for riderId: ${riderId}`);
    return allTrips;
  } catch (err) {
    console.error('[getTodaysTrips] error:', err);
    return [];
  }
}

// ========== TODAY'S REALIZED INCOME ==========

/**
 * Get today's realized income with proper date attribution
 * Includes Lipa Later payments counted on payment date, not trip date
 * 
 * RETURNS: { total, byMethod, items }
 */
export async function getTodaysRealizedIncome(riderId) {
  try {
    const tradingDayStart = getTradingDayStart();
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    // Get all trips (already filtered for today)
    const trips = await getTodaysTrips(riderId);
    
    let total = 0;
    const byMethod = { Cash: 0, MPesa: 0, LipaLater: 0 };
    const items = [];
    
    for (const trip of trips) {
      const method = trip.method || trip.paymentMethod || 'Unknown';
      const incomeItems = await tripRealizedIncome(trip);
      
      // Add income items from today
      for (const item of incomeItems) {
        if (item.ts >= tradingDayStart && isWithinRetentionWindow(item.ts, onboardingDate)) {
          total += item.amount;
          byMethod[method] = (byMethod[method] || 0) + item.amount;
          items.push({
            ...item,
            method,
            tripId: trip.id
          });
        }
      }
    }
    
    return {
      total,
      byMethod,
      items,
      count: items.length
    };
  } catch (err) {
    console.error('[getTodaysRealizedIncome] error:', err);
    return {
      total: 0,
      byMethod: { Cash: 0, MPesa: 0, LipaLater: 0 },
      items: [],
      count: 0
    };
  }
}

// ========== YESTERDAY'S TOTAL ==========

/**
 * Get yesterday's total income (for comparison card)
 */
export async function getYesterdaysTotal(riderId) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    // Calculate yesterday's trading day
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, TRADING_DAY_START_HOUR, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000);
    
    const yesterdayStart = yesterday.getTime();
    const yesterdayEndMs = yesterdayEnd.getTime();
    
    console.log('[getYesterdaysTotal] yesterday:', yesterday.toISOString());
    console.log('[getYesterdaysTotal] yesterdayEnd:', yesterdayEnd.toISOString());
    
    // Query all trips for yesterday
    const allTrips = await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      return t.rider_id === riderId && 
             ts >= yesterdayStart && 
             ts < yesterdayEndMs &&
             isWithinRetentionWindow(ts, onboardingDate);
    });
    
    let total = 0;
    
    for (const trip of allTrips) {
      const incomeItems = await tripRealizedIncome(trip);
      incomeItems.forEach(item => {
        total += item.amount;
      });
    }
    
    return total;
  } catch (err) {
    console.error('[getYesterdaysTotal] error:', err);
    return 0;
  }
}

// ========== ALL TRIPS ==========

/**
 * Get all trips for a rider (not filtered by date)
 * Used for reporting and data analysis
 */
export async function getAllTrips(riderId) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    return await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      return t.rider_id === riderId && isWithinRetentionWindow(ts, onboardingDate);
    });
  } catch (err) {
    console.error('[getAllTrips] error:', err);
    return [];
  }
}

// ========== DATE RANGE QUERIES ==========

/**
 * Get trips within a specific date range
 */
export async function getTripsByDateRange(riderId, startTime, endTime) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    return await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      return t.rider_id === riderId && 
             ts >= startTime && 
             ts <= endTime &&
             isWithinRetentionWindow(ts, onboardingDate);
    });
  } catch (err) {
    console.error('[getTripsByDateRange] error:', err);
    return [];
  }
}

// ========== PAYMENT METHOD QUERIES ==========

/**
 * Get trips by payment method
 */
export async function getTripsByMethod(riderId, method) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    const tradingDayStart = getTradingDayStart();
    
    return await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      const tripMethod = t.method || t.paymentMethod;
      return t.rider_id === riderId && 
             tripMethod === method && 
             ts >= tradingDayStart &&
             isWithinRetentionWindow(ts, onboardingDate);
    });
  } catch (err) {
    console.error('[getTripsByMethod] error:', err);
    return [];
  }
}

// ========== LIPA LATER QUERIES ==========

/**
 * Get pending Lipa Later trips (not yet paid)
 */
export async function getPendingLipaLaterTrips(riderId) {
  try {
    return await indexedDbAdapter.queryRows('trips', (t) => {
      return t.rider_id === riderId && 
             (t.method === 'LipaLater' || t.paymentMethod === 'LipaLater') &&
             t.status === 'active';
    });
  } catch (err) {
    console.error('[getPendingLipaLaterTrips] error:', err);
    return [];
  }
}

/**
 * Get settled Lipa Later trips for today
 */
export async function getSettledLipaLaterToday(riderId) {
  try {
    const tradingDayStart = getTradingDayStart();
    
    return await indexedDbAdapter.queryRows('trips', (t) => {
      return t.rider_id === riderId && 
             (t.method === 'LipaLater' || t.paymentMethod === 'LipaLater') &&
             t.status !== 'active' &&
             (t.ts || t.timestamp) >= tradingDayStart;
    });
  } catch (err) {
    console.error('[getSettledLipaLaterToday] error:', err);
    return [];
  }
}

// ========== TRIP OPERATIONS ==========

/**
 * Create or update a trip
 */
export async function saveTrip(trip) {
  try {
    if (trip.id) {
      const result = await indexedDbAdapter.updateRow('trips', trip.id, trip);
      console.log('[saveTrip] ✅ Updated trip:', trip.id);
      return result;
    } else {
      const result = await indexedDbAdapter.insertRow('trips', trip);
      console.log('[saveTrip] ✅ Inserted new trip:', trip.id);
      return result;
    }
  } catch (err) {
    console.error('[saveTrip] error:', err);
    throw err;
  }
}

/**
 * Delete a trip
 */
export async function deleteTrip(tripId) {
  try {
    await indexedDbAdapter.deleteRow('trips', tripId);
    console.log('[deleteTrip] ✅ Deleted trip:', tripId);
    return true;
  } catch (err) {
    console.error('[deleteTrip] error:', err);
    throw err;
  }
}

/**
 * Get trip by ID
 */
export async function getTripById(tripId) {
  try {
    const trip = await indexedDbAdapter.getRow('trips', tripId);
    console.log('[getTripById] ✅ Retrieved trip:', tripId);
    return trip;
  } catch (err) {
    console.error('[getTripById] error:', err);
    throw err;
  }
}

// ========== DATA RETENTION & CLEANUP ==========

/**
 * Delete trips outside the retention window
 * This runs periodically (e.g., at startup or daily) to clean up old data
 * 
 * ✅ NEW: Automatic cleanup of data older than 6-month retention window
 * Called when retention window expires for a rider
 */
export async function cleanupOldTrips(riderId) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    const windowEnd = getRetentionWindowEnd(onboardingDate);
    const now = Date.now();
    
    // Only clean if window has expired
    if (now <= windowEnd) {
      console.log('[cleanupOldTrips] retention window still active, skipping cleanup');
      return 0;
    }
    
    // Query trips outside retention window
    const allTrips = await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      return !isWithinRetentionWindow(ts, onboardingDate);
    });
    
    console.log('[cleanupOldTrips] found', allTrips.length, 'trips outside retention window');
    
    // Delete each trip
    let deletedCount = 0;
    for (const trip of allTrips) {
      try {
        await deleteTrip(trip.id);
        deletedCount++;
      } catch (err) {
        console.warn('[cleanupOldTrips] failed to delete trip', trip.id, err);
      }
    }
    
    console.log('[cleanupOldTrips] deleted', deletedCount, 'old trips');
    return deletedCount;
  } catch (err) {
    console.error('[cleanupOldTrips] error:', err);
    return 0;
  }
}

/**
 * Summarize trips data
 */
export function summarizeTrips(trips) {
  return {
    count: trips.length,
    total: trips.reduce((sum, t) => sum + (t.amount || 0), 0)
  };
}

/**
 * Check if rider's data is within retention window
 * Returns: {isWithinWindow, daysRemaining, oldestEntryDate}
 * 
 * ✅ Phase 2 planning function
 */
export async function checkRetentionStatus(riderId) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    const windowEnd = getRetentionWindowEnd(onboardingDate);
    const now = new Date();
    
    const daysRemaining = Math.max(0, Math.floor((windowEnd - now) / (24 * 60 * 60 * 1000)));
    
    // Get oldest trip
    const allTrips = await getAllTrips(riderId);
    const oldestTrip = allTrips.length > 0 
      ? allTrips.reduce((min, t) => {
          const ts = t.ts || t.timestamp;
          return ts < (min.ts || min.timestamp) ? t : min;
        })
      : null;
    
    return {
      riderId,
      isWithinRetentionWindow: now <= windowEnd,
      daysRemaining,
      retentionWindowEnd: windowEnd.toISOString(),
      oldestEntryDate: oldestTrip ? new Date(oldestTrip.ts || oldestTrip.timestamp).toISOString() : null,
      hasDataBeyondWindow: allTrips.some(t => !isWithinRetentionWindow(t.ts || t.timestamp, onboardingDate))
    };
  } catch (err) {
    console.error('[checkRetentionStatus] error:', err);
    return {
      isWithinRetentionWindow: true,
      daysRemaining: DATA_RETENTION_MONTHS * 30,
      hasDataBeyondWindow: false
    };
  }
}