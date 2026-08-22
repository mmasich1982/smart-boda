/**
 * Trips Repository - COMPLETE INDEXEDDB MIGRATION
 * Manages offline storage, querying, and synchronization of trip data
 * Implements My Daily Trade Summary requirements including Lipa Later payment tracking
 * 
 * MIGRATION NOTES:
 * ✅ Transitioned from LocalStorage to IndexedDB
 * ✅ All operations are fully async/await
 * ✅ Non-blocking performance improvements
 * ✅ Structured queries with indexes
 * ✅ Maintains 100% backward compatibility with existing business logic
 * 
 * KEY CHANGES:
 * - Uses IndexedDB 'trips' store instead of localStorage
 * - All methods return Promises
 * - Implements tripRealizedIncome() pattern for income extraction
 * - Implements runningTotalToday() for hero card totals
 * - Supports both 'method' and 'paymentMethod' for backward compatibility
 * - Supports both 'ts' and 'timestamp' for backward compatibility
 */

import * as db from './adapters/indexedDbAdapter';

const TRADING_DAY_START_HOUR = 4; // 4 AM local time
const TRIPS_STORE = 'trips';

/**
 * Get start of trading day in milliseconds
 */
function getTradingDayStart() {
  const now = new Date();
  const startHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), TRADING_DAY_START_HOUR, 0, 0, 0);
  
  if (now < startHour) {
    startHour.setDate(startHour.getDate() - 1);
  }
  
  return startHour.getTime();
}

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
  try {
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
  } catch (err) {
    console.error('[tripRealizedIncome] error:', err);
    return [];
  }
}

/**
 * Check if a trip has realized income on or after a given time
 * Useful for filtering trips that contributed to income in a period
 */
export async function isRealizedIncomeTrip(t, sinceMs) {
  try {
    if (t.status !== 'active') return false;
    const incomeItems = await tripRealizedIncome(t);
    return incomeItems.some(item => sinceMs === undefined || item.ts >= sinceMs);
  } catch (err) {
    console.error('[isRealizedIncomeTrip] error:', err);
    return false;
  }
}

/**
 * Get running total of today's income
 * This is the single source of truth for income totals used by:
 * - Hero Fare Card
 * - Daily Trade Summary
 * - All income calculations
 * 
 * Follows cleaned.html runningTotalToday() pattern
 * NOW USES INDEXEDDB FOR BETTER PERFORMANCE
 */
export async function runningTotalToday() {
  try {
    const tradingDayStart = getTradingDayStart();
    const trips = await db.queryByIndex(TRIPS_STORE, 'ts', Date.now());
    
    let total = 0;
    
    // Iterate through all trips and their realized income items
    for (const trip of trips) {
      const incomeItems = await tripRealizedIncome(trip);
      
      // Count only income items from today
      incomeItems.forEach(item => {
        if (item.ts >= tradingDayStart) {
          total += item.amount;
        }
      });
    }
    
    console.log(`✅ runningTotalToday: ${total}`);
    return total;
  } catch (err) {
    console.error('[runningTotalToday] error:', err);
    return 0;
  }
}

/**
 * Get today's trips (from trading day start)
 * Uses IndexedDB range queries for efficiency
 */
export async function getTodaysTrips() {
  try {
    const tradingDayStart = getTradingDayStart();
    const tradingDayEnd = tradingDayStart + (24 * 60 * 60 * 1000);
    
    const trips = await db.queryByRange(TRIPS_STORE, 'ts', tradingDayStart, tradingDayEnd);
    
    console.log(`✅ getTodaysTrips: Found ${trips.length} trips`);
    return trips;
  } catch (err) {
    console.error('[getTodaysTrips] error:', err);
    return [];
  }
}

/**
 * Get pending Lipa Later trips today
 * These are trips where payment hasn't been received yet
 */
export async function getPendingLipaLaterTrips() {
  try {
    const tradingDayStart = getTradingDayStart();
    
    // Query all trips, then filter for LipaLater
    const allTrips = await db.queryRows(TRIPS_STORE, (t) => {
      const method = t.method || t.paymentMethod;
      const ts = t.ts || t.timestamp;
      
      return (
        method === 'LipaLater' &&
        ts >= tradingDayStart &&
        t.status === 'active' &&
        (!t.lipaLater || !t.lipaLater.settled)
      );
    });
    
    console.log(`✅ getPendingLipaLaterTrips: Found ${allTrips.length} pending trips`);
    return allTrips;
  } catch (err) {
    console.error('[getPendingLipaLaterTrips] error:', err);
    return [];
  }
}

/**
 * Get settled Lipa Later payments received today
 * These are payments for trips (which may have been from earlier dates)
 * but the payment was received/recorded today
 */
export async function getSettledLipaLaterToday() {
  try {
    const tradingDayStart = getTradingDayStart();
    const tradingDayEnd = tradingDayStart + (24 * 60 * 60 * 1000);
    
    const allTrips = await db.queryRows(TRIPS_STORE);
    const settledTrips = [];
    
    allTrips.forEach(t => {
      const method = t.method || t.paymentMethod;
      
      if (method === 'LipaLater' && t.lipaLater && t.lipaLater.payments) {
        t.lipaLater.payments.forEach(payment => {
          // Use payment timestamp to determine payment date
          const paymentTime = payment.timestamp ||
                             (payment.date ? new Date(payment.date).getTime() : null);
          
          if (paymentTime && paymentTime >= tradingDayStart && paymentTime < tradingDayEnd) {
            settledTrips.push({
              id: t.id,
              amount: payment.amount,
              customerName: t.lipaLater.customerName,
              paymentDate: new Date(paymentTime),
              originalTrip: t
            });
          }
        });
      }
    });
    
    console.log(`✅ getSettledLipaLaterToday: Found ${settledTrips.length} settled payments`);
    return settledTrips;
  } catch (err) {
    console.error('[getSettledLipaLaterToday] error:', err);
    return [];
  }
}

/**
 * Get realized income for today
 * ENHANCED: Now uses tripRealizedIncome() pattern for proper calculation
 * 
 * Includes:
 * 1. Active trips recorded today (Cash, M-Pesa)
 * 2. Lipa Later payments received today (for any trip, regardless of when recorded)
 * 
 * Income is attributed to TODAY's date when:
 * - Regular trip: recorded today
 * - Lipa Later payment: received/recorded today
 */
export async function getTodaysRealizedIncome() {
  try {
    const tradingDayStart = getTradingDayStart();
    const tradingDayEnd = tradingDayStart + (24 * 60 * 60 * 1000);
    
    const trips = await db.queryRows(TRIPS_STORE);
    
    let total = 0;
    const byMethod = {
      'Cash': 0,
      'MPesa': 0,
      'LipaLater': 0
    };
    
    // Process each trip and extract its realized income items
    for (const t of trips) {
      if (t.status !== 'active') continue;
      
      // Use tripRealizedIncome pattern
      const method = t.method || t.paymentMethod;
      const ts = t.ts || t.timestamp;
      
      if (method === 'LipaLater') {
        // Lipa Later: iterate through payments by date
        if (t.lipaLater && t.lipaLater.payments) {
          t.lipaLater.payments.forEach(payment => {
            const paymentTime = payment.timestamp ||
                               (payment.date ? new Date(payment.date).getTime() : null);
            
            if (paymentTime && paymentTime >= tradingDayStart && paymentTime < tradingDayEnd) {
              const amount = payment.amount || 0;
              total += amount;
              byMethod['LipaLater'] = (byMethod['LipaLater'] || 0) + amount;
            }
          });
        }
      } else {
        // Regular trips: count if recorded today
        if (ts >= tradingDayStart && ts < tradingDayEnd) {
          const amount = t.amount || 0;
          total += amount;
          const methodKey = method === 'MPesa' ? 'MPesa' : method || 'Cash';
          byMethod[methodKey] = (byMethod[methodKey] || 0) + amount;
        }
      }
    }

    // Build result with all payment methods in correct order
    const result = {
      total,
      byMethod: [],
      breakdown: byMethod
    };
    
    // Add non-zero methods to byMethod array
    ['Cash', 'MPesa', 'LipaLater'].forEach(method => {
      if (byMethod[method] > 0) {
        result.byMethod.push({ method, amount: byMethod[method] });
      }
    });
    
    console.log(`✅ getTodaysRealizedIncome: Total ${total}`);
    return result;
  } catch (err) {
    console.error('[getTodaysRealizedIncome] error:', err);
    return { total: 0, byMethod: [], breakdown: { 'Cash': 0, 'MPesa': 0, 'LipaLater': 0 } };
  }
}

/**
 * Summarize trips: count, total earnings, etc.
 */
export function summarizeTrips(trips) {
  try {
    if (!trips || trips.length === 0) {
      return {
        count: 0,
        totalEarnings: 0,
        averagePerTrip: 0,
        tripsByMethod: {}
      };
    }

    const summary = {
      count: trips.length,
      totalEarnings: 0,
      tripsByMethod: {}
    };

    trips.forEach(trip => {
      summary.totalEarnings += trip.amount || 0;
      const method = trip.method || trip.paymentMethod || 'unknown';
      if (!summary.tripsByMethod[method]) {
        summary.tripsByMethod[method] = { count: 0, total: 0 };
      }
      summary.tripsByMethod[method].count++;
      summary.tripsByMethod[method].total += trip.amount || 0;
    });

    summary.averagePerTrip = summary.count > 0 
      ? Math.round(summary.totalEarnings / summary.count)
      : 0;

    console.log(`✅ summarizeTrips: ${summary.count} trips, ${summary.totalEarnings} KSH`);
    return summary;
  } catch (err) {
    console.error('[summarizeTrips] error:', err);
    return { count: 0, totalEarnings: 0, averagePerTrip: 0, tripsByMethod: {} };
  }
}

/**
 * Save trip to IndexedDB
 * IMPORTANT: Ensure trip object has proper field names:
 * - Use 'method' (or 'paymentMethod' for backward compatibility)
 * - Use 'ts' (or 'timestamp' for backward compatibility)
 */
export async function saveTrip(trip) {
  try {
    // Ensure timestamps are set
    const ts = trip.ts || trip.timestamp || Date.now();
    trip.ts = trip.ts || ts;
    trip.timestamp = trip.timestamp || ts;
    
    // Ensure trip has an ID
    trip.id = trip.id || `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Ensure status is set
    trip.status = trip.status || 'active';
    
    const saved = await db.insertRow(TRIPS_STORE, trip);
    console.log(`✅ saveTrip: Saved trip ${trip.id}`);
    return trip.id;
  } catch (err) {
    console.error('[saveTrip] error:', err);
    throw err;
  }
}

/**
 * Update existing trip
 */
export async function updateTrip(tripId, updates) {
  try {
    const updated = await db.updateRow(TRIPS_STORE, tripId, updates);
    console.log(`✅ updateTrip: Updated trip ${tripId}`);
    return updated;
  } catch (err) {
    console.error('[updateTrip] error:', err);
    throw err;
  }
}

/**
 * Save trip correction (amendment to existing trip)
 * Used for trips within the correction window
 */
export async function saveTripCorrection(tripId, correction) {
  try {
    const trip = await db.getRow(TRIPS_STORE, tripId);
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const correctedTrip = {
      ...trip,
      amount: correction.newAmount || trip.amount,
      method: correction.newMethod || trip.method,
      correctionReason: correction.reason,
      originalAmount: trip.amount,
      correctedAt: Date.now(),
      status: 'active'
    };

    const updated = await db.updateRow(TRIPS_STORE, tripId, correctedTrip);
    console.log(`✅ saveTripCorrection: Corrected trip ${tripId}`);
    return updated;
  } catch (err) {
    console.error('[saveTripCorrection] error:', err);
    throw err;
  }
}

/**
 * Delete trip
 */
export async function deleteTrip(tripId) {
  try {
    await db.deleteRow(TRIPS_STORE, tripId);
    console.log(`✅ deleteTrip: Deleted trip ${tripId}`);
    return true;
  } catch (err) {
    console.error('[deleteTrip] error:', err);
    throw err;
  }
}

/**
 * Get all trips
 */
export async function getAllTrips() {
  try {
    const trips = await db.queryRows(TRIPS_STORE);
    console.log(`✅ getAllTrips: Found ${trips.length} trips`);
    return trips;
  } catch (err) {
    console.error('[getAllTrips] error:', err);
    return [];
  }
}

/**
 * Query trips by date range (using IndexedDB range queries)
 */
export async function getTripsByDateRange(startTime, endTime) {
  try {
    const trips = await db.queryByRange(TRIPS_STORE, 'ts', startTime, endTime);
    console.log(`✅ getTripsByDateRange: Found ${trips.length} trips`);
    return trips;
  } catch (err) {
    console.error('[getTripsByDateRange] error:', err);
    return [];
  }
}

/**
 * Get trips by payment method (using IndexedDB index)
 */
export async function getTripsByMethod(method) {
  try {
    const trips = await db.queryByIndex(TRIPS_STORE, 'method', method);
    console.log(`✅ getTripsByMethod: Found ${trips.length} trips for method ${method}`);
    return trips;
  } catch (err) {
    console.error('[getTripsByMethod] error:', err);
    return [];
  }
}

/**
 * Void a trip (mark as voided but keep record)
 */
export async function voidTrip(tripId) {
  try {
    const voided = await updateTrip(tripId, { status: 'voided', voidedAt: Date.now() });
    console.log(`✅ voidTrip: Voided trip ${tripId}`);
    return voided;
  } catch (err) {
    console.error('[voidTrip] error:', err);
    throw err;
  }
}

/**
 * Get yesterday's total income
 * Follows cleaned.html getYesterdayTotal pattern
 */
export async function getYesterdayTotal() {
  try {
    const todayStart = getTradingDayStart();
    const yesterdayStart = todayStart - (24 * 60 * 60 * 1000);
    const yesterdayEnd = todayStart;
    
    const trips = await db.queryByRange(TRIPS_STORE, 'ts', yesterdayStart, yesterdayEnd);
    
    let total = 0;
    
    // Use tripRealizedIncome pattern for consistency
    for (const t of trips) {
      if (t.status !== 'active') continue;
      
      const method = t.method || t.paymentMethod;
      const ts = t.ts || t.timestamp;
      
      if (method === 'LipaLater') {
        // Lipa Later: iterate through payments
        if (t.lipaLater && t.lipaLater.payments) {
          t.lipaLater.payments.forEach(payment => {
            const paymentTime = payment.timestamp ||
                               (payment.date ? new Date(payment.date).getTime() : null);
            
            if (paymentTime && paymentTime >= yesterdayStart && paymentTime < yesterdayEnd) {
              total += payment.amount || 0;
            }
          });
        }
      } else {
        // Regular trips: count if recorded yesterday
        if (ts >= yesterdayStart && ts < yesterdayEnd) {
          total += t.amount || 0;
        }
      }
    }
    
    console.log(`✅ getYesterdayTotal: ${total}`);
    return total;
  } catch (err) {
    console.error('[getYesterdayTotal] error:', err);
    return 0;
  }
}

export const getYesterdaysTotal = getYesterdayTotal; // Alias for compatibility

/**
 * Get a specific trip by ID
 */
export async function getTripById(tripId) {
  try {
    const trip = await db.getRow(TRIPS_STORE, tripId);
    
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }
    
    console.log(`✅ getTripById: Retrieved trip ${tripId}`);
    return trip;
  } catch (err) {
    console.error('[getTripById] error:', err);
    throw err;
  }
}

/**
 * Clear all trips (use with caution!)
 */
export async function clearAllTrips() {
  try {
    await db.clearStore(TRIPS_STORE);
    console.log(`⚠️ clearAllTrips: Cleared all trips`);
  } catch (err) {
    console.error('[clearAllTrips] error:', err);
    throw err;
  }
}

export default {
  tripRealizedIncome,
  isRealizedIncomeTrip,
  runningTotalToday,
  getTodaysTrips,
  getPendingLipaLaterTrips,
  getSettledLipaLaterToday,
  getTodaysRealizedIncome,
  summarizeTrips,
  saveTrip,
  updateTrip,
  saveTripCorrection,
  deleteTrip,
  getAllTrips,
  getTripsByDateRange,
  getTripsByMethod,
  voidTrip,
  getYesterdayTotal,
  getYesterdaysTotal,
  getTripById,
  clearAllTrips
};