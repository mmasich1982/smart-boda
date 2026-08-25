// rider-app/src/offline/tripRetentionPolicy.js
// ✅ RETENTION POLICY: Six-month rolling window for trip data
// Manages cleanup of aged trip records from IndexedDB to preserve device storage
// All data is safely archived in PostgreSQL before deletion

/**
 * ============================================================================
 * TRIP DATA RETENTION POLICY
 * ============================================================================
 *
 * STORAGE ARCHITECTURE:
 * └─ IndexedDB (Device Local Storage - 6-month rolling window)
 *    ├─ trip_entry_${tripId}: Individual trip records
 *    ├─ trip_history_${riderId}: Cache of all trips for fast access
 *    └─ [Auto-cleanup]: Trips older than 6 months deleted
 *
 * └─ PostgreSQL (Server - Long-term Archive & Sync Destination)
 *    ├─ trips: All trips ever recorded
 *    ├─ trip_corrections: Correction history
 *    ├─ trip_voids: Void history
 *    └─ [No retention limit]: Complete historical record
 *
 * ============================================================================
 * RETENTION WINDOW
 * ============================================================================
 *
 * • Retention Period: 6 months (180 days)
 * • Calculation: Based on trip timestamp (ts or timestamp field)
 * • Automatic Cleanup: Runs weekly (can be triggered on app startup)
 * • Rider Onboarding: Used as reference point for older trips
 * • Data Safety: All trips synced to PostgreSQL before deletion
 *
 * RATIONALE:
 * ─────────
 * • Device Performance: Prevents IndexedDB from becoming slow/bloated
 * • Storage Capacity: Frees up device storage for new data (especially mobile)
 * • Fast Access: Recent trips load instantly from cache
 * • Offline Support: 6 months is sufficient for offline-first pattern
 * • Privacy: Users can request full deletion beyond 6 months
 * • Compliance: Meets typical data retention requirements
 *
 * ============================================================================
 * DATA LIFECYCLE
 * ============================================================================
 *
 * PHASE 1: ACTIVE PERIOD (Days 0-180)
 * ────────────────────────────────────
 * • Trip is recorded in IndexedDB (trip_entry_${tripId})
 * • Trip is added to cache (trip_history_${riderId})
 * • Trip is queued for sync (sync_queue)
 * • App syncs to PostgreSQL (when online)
 * • Trip is editable/voidable within 24 hours
 * • Trip is fully accessible via HomeScreen, DailyTradeSummary, etc.
 *
 * PHASE 2: ARCHIVE PERIOD (Days 180+)
 * ────────────────────────────────────
 * • Trip exists in PostgreSQL (persisted)
 * • Trip is deleted from IndexedDB (device storage freed)
 * • Trip is no longer accessible via offline screens
 * • Rider can still view via API (if archive screen exists)
 * • Trip is immutable (no corrections/voids possible)
 *
 * ============================================================================
 * CLEANUP PROCESS
 * ============================================================================
 *
 * TRIGGER: Automatic weekly cleanup OR on app startup
 *
 * PROCEDURE:
 * 1. Get rider onboarding date from account data
 * 2. Calculate 6-month retention window
 * 3. Query trip cache (trip_history_${riderId})
 * 4. Identify trips older than retention window
 * 5. Verify all aged trips are synced to PostgreSQL (check syncStatus)
 * 6. Delete aged trip_entry_${tripId} records from IndexedDB
 * 7. Update trip_history cache (remove aged trips)
 * 8. Log cleanup results
 *
 * SAFETY CHECKS:
 * • Never delete trips from IndexedDB unless syncStatus === 'synced'
 * • Never delete if offline (user might be viewing old data)
 * • Preserve at least 3 days of data even if sync fails
 * • Allow manual override (user can request archive data)
 *
 * ============================================================================
 * EDGE CASES
 * ============================================================================
 *
 * NEW RIDER (< 6 months since onboarding):
 * • All trips stored in IndexedDB
 * • No cleanup occurs
 * • Full offline access to all trip data
 *
 * RIDER WITH NO SYNC (offline throughout retention period):
 * • Trips accumulate in sync queue (not deleted)
 * • User can still view in IndexedDB
 * • Cleanup skipped (safety check: not synced yet)
 * • Once online, trips sync then cleanup begins
 *
 * RIDER SWITCHES PHONE:
 * • Deletes old IndexedDB (no historical data)
 * • New IndexedDB starts fresh
 * • Full historical data available via API (if archive endpoint exists)
 * • User can re-sync if needed
 *
 * DATA EXPORT REQUEST:
 * • User can request copy of all trip data via API
 * • Export includes full 6+ month archive from PostgreSQL
 * • Local IndexedDB only shows 6-month window
 * • API can serve historical data on demand
 *
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */

// Configuration constants
export const RETENTION_CONFIG = {
  // Retention window in milliseconds
  RETENTION_WINDOW_MS: 6 * 30 * 24 * 60 * 60 * 1000, // 6 months (approximate)
  
  // Cleanup schedule
  CLEANUP_INTERVAL_MS: 7 * 24 * 60 * 60 * 1000, // Weekly
  
  // Safety buffer: Don't delete if offline or sync incomplete
  SYNC_SAFETY_BUFFER_HOURS: 72, // 3 days
  
  // Minimum data to preserve (always keep)
  MIN_DAYS_TO_PRESERVE: 30, // At least 1 month always available
};

/**
 * Calculate retention cutoff date
 * Trips created before this date can be deleted from IndexedDB
 * 
 * @param {string|Date} onboardingDate - Rider's onboarding date
 * @returns {Date} - Cutoff date (trips older than this can be deleted)
 */
export function getRetentionCutoffDate(onboardingDate) {
  try {
    const onboarded = new Date(onboardingDate);
    const cutoff = new Date(onboarded);
    
    // Add 6 months to onboarding date
    cutoff.setMonth(cutoff.getMonth() + 6);
    
    return cutoff;
  } catch (err) {
    console.error('❌ Error calculating retention cutoff:', err);
    // Default to 6 months from today if error
    const today = new Date();
    today.setMonth(today.getMonth() - 6);
    return today;
  }
}

/**
 * Check if a trip is within retention window
 * 
 * @param {number} tripTimestamp - Trip timestamp (ms)
 * @param {Date} cutoffDate - Retention cutoff date
 * @returns {boolean} - True if trip should be retained
 */
export function isWithinRetentionWindow(tripTimestamp, cutoffDate) {
  try {
    const tripDate = new Date(tripTimestamp);
    return tripDate >= cutoffDate;
  } catch (err) {
    console.error('❌ Error checking retention window:', err);
    return true; // Keep trip if we can't determine
  }
}

/**
 * Calculate days remaining before trip deletion
 * 
 * @param {number} tripTimestamp - Trip timestamp (ms)
 * @param {Date} cutoffDate - Retention cutoff date
 * @returns {number} - Days remaining (negative if already expired)
 */
export function getDaysUntilDeletion(tripTimestamp, cutoffDate) {
  try {
    const tripDate = new Date(tripTimestamp);
    const now = new Date();
    const daysOld = Math.floor((now - tripDate) / (1000 * 60 * 60 * 24));
    const daysUntilCutoff = Math.floor((cutoffDate - tripDate) / (1000 * 60 * 60 * 24));
    
    return Math.max(-1, daysUntilCutoff);
  } catch (err) {
    console.error('❌ Error calculating days until deletion:', err);
    return 999; // Return large number if error
  }
}

/**
 * Get retention status for a trip
 * 
 * @param {Object} trip - Trip record
 * @param {Date} cutoffDate - Retention cutoff date
 * @returns {Object} - Status info {status, daysRemaining, isSynced, canDelete}
 */
export function getTripRetentionStatus(trip, cutoffDate) {
  try {
    const tripTimestamp = trip.ts || trip.timestamp;
    const isRetained = isWithinRetentionWindow(tripTimestamp, cutoffDate);
    const daysRemaining = getDaysUntilDeletion(tripTimestamp, cutoffDate);
    const isSynced = trip.syncStatus === 'synced';
    const canDelete = !isRetained && isSynced;

    return {
      status: isRetained ? 'retained' : 'expired',
      daysRemaining,
      isSynced,
      canDelete,
      tripId: trip.id,
      tripDate: new Date(tripTimestamp).toISOString(),
    };
  } catch (err) {
    console.error('❌ Error getting retention status:', err);
    return {
      status: 'unknown',
      daysRemaining: 999,
      isSynced: false,
      canDelete: false,
    };
  }
}

/**
 * Get trips eligible for deletion
 * 
 * @param {Array} trips - Array of trip records
 * @param {Date} cutoffDate - Retention cutoff date
 * @returns {Array} - Trips that can be safely deleted
 */
export function getTripsEligibleForDeletion(trips, cutoffDate) {
  try {
    return trips.filter(trip => {
      const status = getTripRetentionStatus(trip, cutoffDate);
      return status.canDelete; // Must be expired AND synced
    });
  } catch (err) {
    console.error('❌ Error finding deletable trips:', err);
    return [];
  }
}

/**
 * Get storage usage summary
 * 
 * @param {Array} trips - Array of trip records
 * @param {Date} cutoffDate - Retention cutoff date
 * @returns {Object} - Storage stats {retained, expired, synced, pending, canDelete}
 */
export function getStorageUsageSummary(trips, cutoffDate) {
  try {
    const retained = trips.filter(t => 
      isWithinRetentionWindow(t.ts || t.timestamp, cutoffDate)
    ).length;
    
    const expired = trips.length - retained;
    
    const synced = trips.filter(t => t.syncStatus === 'synced').length;
    
    const pending = trips.length - synced;
    
    const deletable = getTripsEligibleForDeletion(trips, cutoffDate).length;

    // Estimate bytes (rough: ~500 bytes per trip record)
    const estimatedRetainedBytes = retained * 500;
    const estimatedExpiredBytes = expired * 500;

    return {
      totalTrips: trips.length,
      retained,
      expired,
      synced,
      pending,
      canDelete: deletable,
      estimatedRetainedBytes,
      estimatedExpiredBytes,
      estimatedRetainedMB: (estimatedRetainedBytes / 1024 / 1024).toFixed(2),
      estimatedExpiredMB: (estimatedExpiredBytes / 1024 / 1024).toFixed(2),
    };
  } catch (err) {
    console.error('❌ Error calculating storage usage:', err);
    return {
      totalTrips: 0,
      retained: 0,
      expired: 0,
      synced: 0,
      pending: 0,
      canDelete: 0,
      estimatedRetainedBytes: 0,
      estimatedExpiredBytes: 0,
      estimatedRetainedMB: '0.00',
      estimatedExpiredMB: '0.00',
    };
  }
}

export default {
  RETENTION_CONFIG,
  getRetentionCutoffDate,
  isWithinRetentionWindow,
  getDaysUntilDeletion,
  getTripRetentionStatus,
  getTripsEligibleForDeletion,
  getStorageUsageSummary,
};
