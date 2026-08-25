// rider-app/src/offline/tripUtils.js
// ✅ REFACTORED: Trip utilities for IndexedDB-first architecture
// Centralized logic for trip operations and cache management
// Replaces legacy tripsRepository with direct IndexedDB operations

import indexedDbAdapter from './adapters/indexedDbAdapter';

/**
 * ============================================================================
 * TRIP STORAGE ARCHITECTURE (IndexedDB-First Pattern)
 * ============================================================================
 *
 * CACHE KEYS:
 * -----------
 * trip_entry_${tripId}
 *   - Individual trip record stored as JSON
 *   - Created by NewTripScreen when trip is recorded
 *   - Updated by TripDetailScreen when trip is corrected/voided
 *   - Format: { id, rider_id, amount, paymentMethod, method, ts, timestamp, ... }
 *
 * trip_history_${riderId}
 *   - Array of all trips (maintained cache for performance)
 *   - Updated by NewTripScreen after creating new trip
 *   - Updated by DailyTradeSummaryScreen on screen focus
 *   - Soft refresh by HomeScreen on focus
 *   - Contains most recent trips first (unshift pattern)
 *   - Format: [{ trip1 }, { trip2 }, ... ]
 *
 * ============================================================================
 * TRIP RECORD STRUCTURE
 * ============================================================================
 *
 * {
 *   id: 'trip_${riderId}_${timestamp}',      // Unique trip ID
 *   rider_id: 'rider123',                     // Rider ownership
 *   amount: 350,                              // Fare amount (KSh)
 *   originalAmount: 350,                      // Original before correction (if corrected)
 *   paymentMethod: 'Cash',                    // Payment method (Cash/MPesa/LipaLater)
 *   method: 'Cash',                           // Alias for paymentMethod
 *   note: '',                                 // Optional trip note
 *   
 *   // Timestamps (both fields for compatibility)
 *   ts: 1724080000000,                        // Trip timestamp (ms) - primary
 *   timestamp: 1724080000000,                 // Trip timestamp (ms) - backup
 *   created_at: '2026-08-25T10:00:00Z',      // ISO timestamp for API
 *   date: '2026-08-25',                       // Date string for grouping
 *   
 *   // Status management
 *   status: 'active',                         // 'active' | 'voided'
 *   syncStatus: 'pending',                    // 'pending' | 'synced'
 *   
 *   // Correction tracking
 *   correctionReason: 'Wrong amount entered', // Why trip was corrected
 *   correctionTimestamp: 1724080300000,       // When correction was made
 *   
 *   // Void tracking
 *   voidReason: 'Duplicate trip',             // Why trip was voided
 *   voidTimestamp: 1724080400000,             // When void was made
 *   
 *   // Lipa Later support (optional)
 *   lipaLater: {
 *     customerId: 'cust123',                  // Lipa Later customer ID
 *     customerName: 'John Doe',               // Customer name
 *     settled: false,                         // Payment received?
 *     paymentDate: 1724166000000,             // When payment was received (if settled)
 *   }
 * }
 *
 * ============================================================================
 * USAGE PATTERNS
 * ============================================================================
 *
 * NEW TRIP (NewTripScreen):
 *   1. Create trip record with timestamp
 *   2. Save to trip_entry_${tripId} using kvSet
 *   3. Load trip_history_${riderId} cache
 *   4. Prepend new trip (unshift)
 *   5. Save updated cache back to kvSet
 *   6. Queue for sync via addToSyncQueue
 *   7. Try immediate sync if online (optional)
 *   8. Navigate to Home - HomeScreen will refresh on focus
 *
 * CORRECT TRIP (TripDetailScreen):
 *   1. Load trip from trip_entry_${tripId}
 *   2. Update amount, method, correction reason
 *   3. Save back to trip_entry_${tripId}
 *   4. Load trip_history_${riderId} cache
 *   5. Find and update the trip in cache array
 *   6. Save updated cache back to kvSet
 *   7. Queue correction for sync
 *   8. Try immediate sync if online
 *   9. Navigate to DailyTradeSummary - will refresh on focus
 *
 * VIEW TRIPS (HomeScreen/DailyTradeSummary):
 *   1. Load trip_history_${riderId} from cache
 *   2. Filter to today's active trips
 *   3. Calculate totals by payment method
 *   4. Handle Lipa Later special logic (count by payment date, not trip date)
 *   5. Display results
 *   6. On focus: reload cache (soft refresh)
 *   7. On sync: update cache with fresh data from API
 */

// ============================================================================
// TRIP OPERATIONS
// ============================================================================

/**
 * Load trip from IndexedDB
 * @param {string} tripId - Trip ID (e.g., 'trip_rider123_1724080000000')
 * @returns {Promise<Object|null>} - Trip record or null if not found
 */
export async function loadTripFromDb(tripId) {
  try {
    const recordKey = `trip_entry_${tripId}`;
    const tripData = await indexedDbAdapter.kvGet(recordKey);

    if (tripData) {
      return typeof tripData === 'string' ? JSON.parse(tripData) : tripData;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading trip from db:', err);
    return null;
  }
}

/**
 * Save trip to IndexedDB
 * @param {string} tripId - Trip ID
 * @param {Object} tripData - Trip record
 * @returns {Promise<boolean>} - Success status
 */
export async function saveTripToDb(tripId, tripData) {
  try {
    const recordKey = `trip_entry_${tripId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(tripData));
    console.log('✅ Trip saved to IndexedDB:', tripId);
    return true;
  } catch (err) {
    console.error('❌ Error saving trip:', err);
    return false;
  }
}

/**
 * Load trip history cache for a rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Array of trips (empty if not found)
 */
export async function loadTripHistoryCache(riderId) {
  try {
    const cacheKey = `trip_history_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    let items = [];

    if (cachedData) {
      try {
        items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (!Array.isArray(items)) items = [];
      } catch (parseErr) {
        console.warn('⚠️ Cache parse error');
        items = [];
      }
    }
    return items;
  } catch (err) {
    console.error('❌ Error loading trip history cache:', err);
    return [];
  }
}

/**
 * Save trip history cache for a rider
 * @param {string} riderId - Rider ID
 * @param {Array} trips - Array of trip records
 * @returns {Promise<boolean>} - Success status
 */
export async function saveTripHistoryCache(riderId, trips) {
  try {
    const cacheKey = `trip_history_${riderId}`;
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(trips));
    console.log('✅ Trip history cache saved:', { riderId, count: trips.length });
    return true;
  } catch (err) {
    console.error('❌ Error saving trip history cache:', err);
    return false;
  }
}

/**
 * Get today's trips from cache
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Today's active trips
 */
export async function getTodaysTripsFromCache(riderId) {
  try {
    const trips = await loadTripHistoryCache(riderId);
    const today = new Date().toDateString();

    return trips.filter(t => {
      const tripDate = new Date(t.ts || t.timestamp || 0).toDateString();
      return t.status === 'active' && tripDate === today;
    });
  } catch (err) {
    console.error('❌ Error getting today\'s trips:', err);
    return [];
  }
}

/**
 * Get yesterday's trips from cache
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Yesterday's active trips
 */
export async function getYesterdaysTripsFromCache(riderId) {
  try {
    const trips = await loadTripHistoryCache(riderId);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toDateString();

    return trips.filter(t => {
      const tripDate = new Date(t.ts || t.timestamp || 0).toDateString();
      return t.status === 'active' && tripDate === yesterdayString;
    });
  } catch (err) {
    console.error('❌ Error getting yesterday\'s trips:', err);
    return [];
  }
}

/**
 * Calculate total fare for trips
 * @param {Array} trips - Array of trip records
 * @returns {number} - Total fare amount (KSh)
 */
export function calculateTotalFare(trips) {
  return trips.reduce((sum, trip) => {
    if (trip.status !== 'voided') {
      return sum + (trip.amount || 0);
    }
    return sum;
  }, 0);
}

/**
 * Group trips by payment method with totals
 * @param {Array} trips - Array of trip records
 * @returns {Object} - Breakdown by method { Cash: 100, MPesa: 200, ... }
 */
export function breakdownByPaymentMethod(trips) {
  const breakdown = {};

  trips.forEach(trip => {
    if (trip.status !== 'voided') {
      const method = trip.paymentMethod || trip.method;
      if (!breakdown[method]) {
        breakdown[method] = 0;
      }
      breakdown[method] += trip.amount || 0;
    }
  });

  return breakdown;
}

/**
 * Get pending Lipa Later trips
 * @param {Array} trips - Array of trip records
 * @returns {Array} - Trips awaiting customer payment
 */
export function getPendingLipaLaterTrips(trips) {
  return trips.filter(t => {
    const method = t.paymentMethod || t.method;
    return method === 'LipaLater' && t.status === 'active' && (!t.lipaLater || !t.lipaLater.settled);
  });
}

/**
 * Get settled Lipa Later trips
 * @param {Array} trips - Array of trip records
 * @returns {Array} - Trips where customer payment received
 */
export function getSettledLipaLaterTrips(trips) {
  return trips.filter(t => {
    const method = t.paymentMethod || t.method;
    return method === 'LipaLater' && t.status === 'active' && t.lipaLater?.settled;
  });
}

/**
 * Calculate hours since trip was recorded
 * @param {number} tripTimestamp - Trip timestamp (ms)
 * @returns {number} - Hours since trip
 */
export function calculateHoursSinceTrip(tripTimestamp) {
  const now = Date.now();
  const ts = tripTimestamp || 0;
  return (now - ts) / (1000 * 60 * 60);
}

/**
 * Check if trip is still editable
 * @param {number} tripTimestamp - Trip timestamp (ms)
 * @param {number} correctionWindowHours - Correction window in hours (default 24)
 * @returns {boolean} - True if trip can still be edited
 */
export function isEditableTrip(tripTimestamp, correctionWindowHours = 24) {
  const hoursSince = calculateHoursSinceTrip(tripTimestamp);
  return hoursSince < correctionWindowHours;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all trip data for a rider (for testing/debugging only)
 * @param {string} riderId - Rider ID
 * @returns {Promise<boolean>} - Success status
 */
export async function clearTripCacheForRider(riderId) {
  try {
    const cacheKey = `trip_history_${riderId}`;
    await indexedDbAdapter.delete(cacheKey);
    console.log('✅ Trip history cache cleared for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error clearing trip cache:', err);
    return false;
  }
}

/**
 * Sync trip data from API to local cache
 * Called periodically by DailyTradeSummaryScreen/HomeScreen
 * @param {string} riderId - Rider ID
 * @param {Array} trips - Trips from API
 * @returns {Promise<boolean>} - Success status
 */
export async function syncTripsFromApi(riderId, trips) {
  try {
    // Sort by timestamp (newest first)
    const sorted = trips.sort((a, b) => {
      const bTs = b.ts || b.timestamp || 0;
      const aTs = a.ts || a.timestamp || 0;
      return bTs - aTs;
    });

    // Save to cache
    await saveTripHistoryCache(riderId, sorted);

    // Save individual trip records
    for (const trip of sorted) {
      await saveTripToDb(trip.id, trip);
    }

    console.log('✅ Synced', sorted.length, 'trips from API');
    return true;
  } catch (err) {
    console.error('❌ Error syncing trips from API:', err);
    return false;
  }
}

export default {
  loadTripFromDb,
  saveTripToDb,
  loadTripHistoryCache,
  saveTripHistoryCache,
  getTodaysTripsFromCache,
  getYesterdaysTripsFromCache,
  calculateTotalFare,
  breakdownByPaymentMethod,
  getPendingLipaLaterTrips,
  getSettledLipaLaterTrips,
  calculateHoursSinceTrip,
  isEditableTrip,
  clearTripCacheForRider,
  syncTripsFromApi,
};
