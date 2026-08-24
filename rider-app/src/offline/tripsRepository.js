/**
 * Trips Repository - MIGRATED TO INDEXEDDB WITH 6-MONTH RETENTION
 * Manages offline storage, querying, and synchronization of trip data
 * Implements My Daily Trade Summary requirements including Lipa Later payment tracking
 * 
 * KEY MIGRATION CHANGES:
 * ✅ Migrated from LocalStore to IndexedDBAdapter
 * ✅ All operations now use IndexedDB 'trips' store with proper indexing
 * ✅ Implements 6-month data retention window (from rider onboarding date)
 * ✅ Automatic cleanup of data older than 6-month retention window
 * ✅ Proper timestamp handling with both 'ts' and 'timestamp' support
 * ✅ Supports both 'method' and 'paymentMethod' for backward compatibility
 * ✅ Lipa Later payment tracking with proper date attribution
 */

import indexedDbAdapter from './adapters/indexedDbAdapter';

// ========== CONSTANTS ==========

const TRADING_DAY_START_HOUR = 4; // 4 AM local time
const DATA_RETENTION_MONTHS = 6; // 6-month retention window from rider onboarding

// ========== RETENTION WINDOW HELPERS ==========

/**
 * Get rider's onboarding date from saved rider data
 * Falls back to current date if not available
 */
export async function getRiderOnboardingDate(riderId) {
  try {
    const riderData = await indexedDbAdapter.kvGet(`rider_onboarding_${riderId}`);
    if (riderData) {
      return new Date(riderData);
    }
    
    // Fallback: try to get from rider status
    const riderStatus = await indexedDbAdapter.kvGet('rider_status');
    if (riderStatus && riderStatus.onboarded_at) {
      return new Date(riderStatus.onboarded_at);
    }
    
    // Default to current date if not found (new rider)
    return new Date();
  } catch (err) {
    console.error('[getRiderOnboardingDate] error:', err);
    return new Date();
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
  
  return record >= onboarded && record <= windowEnd;
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
  
  return startHour.getTime();
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
 * Get today's trips (from trading day start, within retention window)
 */
export async function getTodaysTrips(riderId) {
  try {
    const tradingDayStart = getTradingDayStart();
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    // Query all trips from IndexedDB
    const allTrips = await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      return ts >= tradingDayStart && isWithinRetentionWindow(ts, onboardingDate);
    });
    
    console.log('[getTodaysTrips] found:', allTrips.length);
    return allTrips;
  } catch (err) {
    console.error('[getTodaysTrips] error:', err);
    return [];
  }
}

/**
 * Get pending Lipa Later trips today
 * These are trips where payment hasn't been received yet
 */
export async function getPendingLipaLaterTrips(riderId) {
  try {
    const tradingDayStart = getTradingDayStart();
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    const allTrips = await indexedDbAdapter.queryRows('trips', (t) => {
      const method = t.method || t.paymentMethod;
      const ts = t.ts || t.timestamp;
      
      return (
        method === 'LipaLater' &&
        ts >= tradingDayStart &&
        t.status === 'active' &&
        (!t.lipaLater || !t.lipaLater.settled) &&
        isWithinRetentionWindow(ts, onboardingDate)
      );
    });
    
    console.log('[getPendingLipaLaterTrips] found:', allTrips.length);
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
export async function getSettledLipaLaterToday(riderId) {
  try {
    const tradingDayStart = getTradingDayStart();
    const tradingDayEnd = tradingDayStart + (24 * 60 * 60 * 1000);
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    const allTrips = await indexedDbAdapter.queryRows('trips', (t) => {
      const method = t.method || t.paymentMethod;
      return method === 'LipaLater' && isWithinRetentionWindow(t.ts || t.timestamp, onboardingDate);
    });
    
    const settledTrips = [];
    
    allTrips.forEach(t => {
      if (t.lipaLater && t.lipaLater.payments) {
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
    
    console.log('[getSettledLipaLaterToday] found:', settledTrips.length);
    return settledTrips;
  } catch (err) {
    console.error('[getSettledLipaLaterToday] error:', err);
    return [];
  }
}

// ========== REALIZED INCOME (DAILY SUMMARY) ==========

/**
 * Get realized income for today within retention window
 * 
 * Includes:
 * 1. Active trips recorded today (Cash, M-Pesa)
 * 2. Lipa Later payments received today (for any trip, regardless of when recorded)
 * 
 * Income is attributed to TODAY's date when:
 * - Regular trip: recorded today
 * - Lipa Later payment: received/recorded today
 */
export async function getTodaysRealizedIncome(riderId) {
  try {
    const tradingDayStart = getTradingDayStart();
    const tradingDayEnd = tradingDayStart + (24 * 60 * 60 * 1000);
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    const allTrips = await indexedDbAdapter.queryRows('trips', (t) => {
      return t.status === 'active' && isWithinRetentionWindow(t.ts || t.timestamp, onboardingDate);
    });
    
    let total = 0;
    const byMethod = {
      'Cash': 0,
      'MPesa': 0,
      'LipaLater': 0
    };
    
    // Process each trip and extract its realized income items
    allTrips.forEach(t => {
      if (t.status !== 'active') return;
      
      // Use tripRealizedIncome pattern (synchronously for this function)
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
    });

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
    
    console.log('[getTodaysRealizedIncome] total:', total);
    return result;
  } catch (err) {
    console.error('[getTodaysRealizedIncome] error:', err);
    return { total: 0, byMethod: [], breakdown: { 'Cash': 0, 'MPesa': 0, 'LipaLater': 0 } };
  }
}

// ========== TRIP CRUD OPERATIONS ==========

/**
 * Summarize trips: count, total earnings, etc.
 */
export function summarizeTrips(trips) {
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

  return summary;
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
    const ts = trip.ts || trip.timestamp;
    trip.ts = trip.ts || ts || Date.now();
    trip.timestamp = trip.timestamp || ts || Date.now();
    
    // Ensure trip has an ID
    trip.id = trip.id || `trip_${Date.now()}`;
    
    // Ensure status is set
    trip.status = trip.status || 'active';
    
    // Save to IndexedDB
    await indexedDbAdapter.insertRow('trips', trip);
    
    console.log('[saveTrip] saved:', trip.id);
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
    await indexedDbAdapter.updateRow('trips', tripId, updates);
    console.log('[updateTrip] updated:', tripId);
    return { id: tripId, ...updates };
  } catch (err) {
    console.error('[updateTrip] error:', err);
    throw err;
  }
}

/**
 * Delete trip
 */
export async function deleteTrip(tripId) {
  try {
    await indexedDbAdapter.deleteRow('trips', tripId);
    console.log('[deleteTrip] deleted:', tripId);
    return true;
  } catch (err) {
    console.error('[deleteTrip] error:', err);
    throw err;
  }
}

/**
 * Get all trips (within retention window)
 */
export async function getAllTrips(riderId) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    const allTrips = await indexedDbAdapter.queryRows('trips', (t) => {
      return isWithinRetentionWindow(t.ts || t.timestamp, onboardingDate);
    });
    
    console.log('[getAllTrips] found:', allTrips.length);
    return allTrips;
  } catch (err) {
    console.error('[getAllTrips] error:', err);
    return [];
  }
}

/**
 * Query trips by date range (within retention window)
 */
export async function getTripsByDateRange(riderId, startTime, endTime) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    const trips = await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      return ts >= startTime && ts <= endTime && isWithinRetentionWindow(ts, onboardingDate);
    });
    
    console.log('[getTripsByDateRange] found:', trips.length);
    return trips;
  } catch (err) {
    console.error('[getTripsByDateRange] error:', err);
    return [];
  }
}

/**
 * Get trips by payment method (within retention window)
 */
export async function getTripsByMethod(riderId, method) {
  try {
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    const trips = await indexedDbAdapter.queryRows('trips', (t) => {
      const m = t.method || t.paymentMethod;
      return m === method && isWithinRetentionWindow(t.ts || t.timestamp, onboardingDate);
    });
    
    console.log('[getTripsByMethod] found:', trips.length, 'method:', method);
    return trips;
  } catch (err) {
    console.error('[getTripsByMethod] error:', err);
    return [];
  }
}

/**
 * Void a trip (mark as voided but keep record)
 */
export async function voidTrip(tripId, reason) {
  try {
    return await updateTrip(tripId, { 
      status: 'voided', 
      voidedAt: Date.now(),
      correctionReason: reason
    });
  } catch (err) {
    console.error('[voidTrip] error:', err);
    throw err;
  }
}

/**
 * Save trip correction
 */
export async function saveTripCorrection(tripId, { newAmount, newMethod, reason }) {
  try {
    const trip = await getTripById(tripId);
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }

    return await updateTrip(tripId, {
      amount: newAmount,
      paymentMethod: newMethod,
      method: newMethod,
      originalAmount: trip.originalAmount || trip.amount,
      correctionReason: reason,
      correctedAt: Date.now(),
      syncStatus: 'pending'
    });
  } catch (err) {
    console.error('[saveTripCorrection] error:', err);
    throw err;
  }
}

/**
 * Get yesterday's total income (within retention window)
 * Follows cleaned.html getYesterdayTotal pattern
 */
export async function getYesterdayTotal(riderId) {
  try {
    const todayStart = getTradingDayStart();
    const yesterdayStart = todayStart - (24 * 60 * 60 * 1000);
    const yesterdayEnd = todayStart;
    const onboardingDate = await getRiderOnboardingDate(riderId);
    
    const trips = await indexedDbAdapter.queryRows('trips', (t) => {
      const ts = t.ts || t.timestamp;
      return t.status === 'active' && 
             ts >= yesterdayStart && 
             ts < yesterdayEnd &&
             isWithinRetentionWindow(ts, onboardingDate);
    });
    
    let total = 0;
    
    // Use tripRealizedIncome pattern for consistency
    trips.forEach(t => {
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
    });
    
    console.log('[getYesterdayTotal] total:', total);
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
    const trip = await indexedDbAdapter.getRow('trips', tripId);
    
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }
    
    console.log('[getTripById] found:', tripId);
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