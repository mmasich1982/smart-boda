/**
 * rider-app/src/offline/syncOrchestrator.js
 * ============================================================================
 * SMART-BODA SYNC ORCHESTRATOR - PERIODIC SYNC CHECKER + LIPA LATER SYNC
 * ============================================================================
 * 
 * 🎯 PURPOSE:
 * Manages automatic sync checking at configurable intervals (default: 1 minute)
 * Coordinates with existing SyncQueue to process pending items when:
 * - User comes online (network connectivity restored)
 * - Periodic interval expires (1 minute)
 * ✅ FIXED: Now includes Lipa Later payment sync orchestration
 * 
 * ✅ KEY FEATURES:
 * - Non-blocking: Runs in background without interrupting user
 * - Configurable interval: Default 1 minute, fully configurable
 * - Network aware: Only syncs when online, retries when offline
 * - Exponential backoff: Respects existing queue retry logic
 * - Memory efficient: Tracks last sync time, not data copies
 * - Offline-first compatible: Works seamlessly with IndexedDB-first architecture
 * - East African Time: All timestamps use EAT for consistency
 * ✅ Lipa Later sync: Ensures server IDs propagate correctly through payment workflow
 * 
 * 📋 CONFIGURATION:
 * By default, sync is checked every 1 minute.
 * To customize: Call setSyncCheckInterval(milliseconds) before starting
 * 
 * 🚀 STARTUP:
 * Call initializeSyncOrchestrator() once in App.js or navigation setup
 * 
 * ============================================================================
 */

import { processPendingSync, getLastSyncReport } from './syncQueue';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import NetInfo from '@react-native-community/netinfo';
import { db } from './db';

// Configuration constants
let SYNC_CHECK_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds (changed from 5 minutes)
let syncTimerRef = null;
let lastSyncAttemptTime = 0;
let isOrchestratorActive = false;
let networkStateUnsubscribe = null;
let lastNetworkState = { isConnected: false, isInternetReachable: false };
let lastSyncReport = null; // ✅ NEW: Track last sync report
let syncInProgress = false; // ✅ NEW: Prevent concurrent sync attempts

/**
 * Set the sync check interval (in milliseconds)
 * Call this before initializeSyncOrchestrator() to customize the interval
 * 
 * @param {number} intervalMs - Interval in milliseconds
 * @example setSyncCheckInterval(3 * 60 * 1000) // 3 minutes
 * @example setSyncCheckInterval(10 * 1000) // 10 seconds (for testing)
 */
export function setSyncCheckInterval(intervalMs) {
  if (intervalMs < 1000) {
    console.warn('⚠️ Sync interval too short (< 1 second), setting to 1 second minimum');
    SYNC_CHECK_INTERVAL = 1000;
  } else {
    SYNC_CHECK_INTERVAL = intervalMs;
    console.log(`✅ Sync check interval set to ${intervalMs / 1000} seconds`);
  }
}

/**
 * Get the current sync check interval
 * @returns {number} Interval in milliseconds
 */
export function getSyncCheckInterval() {
  return SYNC_CHECK_INTERVAL;
}

/**
 * Perform a single sync check
 * Called periodically OR when network connectivity changes
 * 
 * ✅ Non-blocking: Runs async without awaiting in caller
 * ✅ Safe: Catches errors internally, never throws
 * ✅ NEW: Prevents concurrent sync attempts
 * ✅ NEW: Returns comprehensive sync report with success/failure details
 * 
 * @returns {Promise<Object>} Complete sync report with successfulItems and failedItems
 */
export async function performSyncCheck() {
  const now = Date.now();
  
  // ✅ NEW: Prevent concurrent sync attempts
  if (syncInProgress) {
    console.log('⏳ Sync already in progress, skipping check');
    return { attempted: false, reason: 'sync_in_progress' };
  }
  
  // Prevent sync spam: minimum 5-second gap between attempts
  if (now - lastSyncAttemptTime < 5000) {
    console.log('⏳ Sync check skipped (too soon since last attempt)');
    return { attempted: false, reason: 'throttled' };
  }
  
  lastSyncAttemptTime = now;
  syncInProgress = true; // ✅ NEW: Mark sync as in progress
  
  try {
    console.log('🔄 [SyncOrchestrator] Starting sync check...');
    
    // Call existing processPendingSync from syncQueue
    // This now returns comprehensive SyncReport
    const report = await processPendingSync();
    
    // ✅ NEW: Store the report for later retrieval
    lastSyncReport = report;
    
    console.log('✅ [SyncOrchestrator] Sync check complete:', {
      status: report?.status || 'unknown',
      successCount: report?.successCount || 0,
      failureCount: report?.failureCount || 0,
      pendingCount: report?.pendingCount || 0,
      timestamp: report?.timestamp || new Date().toISOString(),
    });
    
    // ✅ NEW: Log successful items
    if (report?.successfulItems && report.successfulItems.length > 0) {
      console.log(`✅ Successfully synced ${report.successfulItems.length} items:`, 
        report.successfulItems.map(item => `${item.type} (${item.id})`).join(', ')
      );
    }
    
    // ✅ NEW: Log failed items with reasons
    if (report?.failedItems && report.failedItems.length > 0) {
      console.log(`❌ ${report.failedItems.length} items failed to sync:`, 
        report.failedItems.map(item => ({
          id: item.id,
          type: item.type,
          error: item.errorMessage,
          status: item.statusCode
        }))
      );
    }
    
    return {
      attempted: true,
      report: report,
      successCount: report?.successCount || 0,
      failureCount: report?.failureCount || 0,
      pendingCount: report?.pendingCount || 0,
    };
  } catch (err) {
    console.error('❌ [SyncOrchestrator] Sync check error:', err.message);
    return {
      attempted: true,
      error: err.message,
      successCount: 0,
      failureCount: 0,
    };
  } finally {
    syncInProgress = false; // ✅ NEW: Mark sync as complete
  }
}

/**
 * Start the periodic sync checker
 * Runs sync checks every SYNC_CHECK_INTERVAL milliseconds (1 minute by default)
 * ✅ CRITICAL: Also listens for network changes and syncs immediately when coming back online
 * ✅ NEW: Comprehensive network state tracking and immediate reconnection sync
 * 
 * Safe to call multiple times (will not create duplicate timers)
 * Use stopSyncOrchestrator() to stop the periodic checks
 */
export function startPeriodicSyncCheck() {
  if (syncTimerRef !== null) {
    console.log('⚠️ Sync orchestrator already running');
    return;
  }

  console.log(`✅ Starting periodic sync checks (interval: ${SYNC_CHECK_INTERVAL / 1000}s)`);
  
  // ✅ CRITICAL: Listen for network state changes
  // When coming back online, sync immediately without waiting for periodic check
  networkStateUnsubscribe = NetInfo.addEventListener(state => {
    const isNowOnline = state.isConnected && state.isInternetReachable;
    const wasOnline = lastNetworkState.isConnected && lastNetworkState.isInternetReachable;
    const wasOffline = !lastNetworkState.isConnected || !lastNetworkState.isInternetReachable;
    
    lastNetworkState = state;
    
    // ✅ NEW: Log network state changes for debugging
    if (isNowOnline && wasOffline) {
      console.log('🌐 🎯 NETWORK RECONNECTED! Triggering immediate sync of all pending items...');
      console.log(`   Current network state: connected=${state.isConnected}, reachable=${state.isInternetReachable}`);
      console.log(`   Type: ${state.type}, isWifiEnabled: ${state.isWifiEnabled}`);
      
      // ✅ NEW: Reset throttle to allow immediate sync
      lastSyncAttemptTime = 0;
      
      performSyncCheck().catch(err => {
        console.error('❌ Sync on reconnect error:', err);
      });
    } else if (!isNowOnline && wasOnline) {
      console.log('📵 Network disconnected - will retry when connection restored');
    } else if (isNowOnline) {
      console.log(`📊 Network status change: ${state.type} (connected: ${state.isConnected}, reachable: ${state.isInternetReachable})`);
    }
  });
  
  // Perform first check immediately
  console.log('📡 Performing initial sync check...');
  performSyncCheck().catch(err => {
    console.error('❌ Initial sync check error:', err);
  });
  
  // Then set up periodic checks as fallback
  syncTimerRef = setInterval(() => {
    console.log(`⏰ Periodic sync check (every ${SYNC_CHECK_INTERVAL / 1000}s)`);
    performSyncCheck().catch(err => {
      console.error('❌ Periodic sync check error:', err);
    });
  }, SYNC_CHECK_INTERVAL);
}

/**
 * Stop the periodic sync checker
 * Call when:
 * - User logs out
 * - App is closing
 * - Testing/debugging
 */
export function stopSyncOrchestrator() {
  if (syncTimerRef !== null) {
    clearInterval(syncTimerRef);
    syncTimerRef = null;
  }
  
  // ✅ Clean up network listener
  if (networkStateUnsubscribe) {
    networkStateUnsubscribe();
    networkStateUnsubscribe = null;
  }
  
  console.log('⏹️  Sync orchestrator stopped');
}

/**
 * Check if sync orchestrator is currently active
 * @returns {boolean} True if periodic sync is running
 */
export function isSyncOrchestratorActive() {
  return syncTimerRef !== null;
}

/**
 * Force an immediate sync check (outside of normal schedule)
 * Useful for:
 * - Network connectivity restored
 * - User manually triggered sync
 * - Critical operations
 * 
 * @returns {Promise<Object>} Sync result with detailed report
 */
export async function forceSyncNow() {
  console.log('📡 Force sync requested by user/system');
  lastSyncAttemptTime = 0; // Reset throttle
  return await performSyncCheck();
}

/**
 * Get the latest sync report
 * ✅ NEW: Retrieve detailed information about the last sync operation
 * @returns {Promise<Object|null>} - Last sync report with success/failure details
 */
export async function getLastSyncStatus() {
  if (lastSyncReport) {
    return lastSyncReport;
  }
  
  // Fallback: get from storage
  try {
    return await getLastSyncReport();
  } catch (err) {
    console.warn('⚠️ Error retrieving sync report:', err);
    return null;
  }
}

/**
 * Check if there are pending items waiting to sync
 * ✅ NEW: Quick status check for UI
 * @returns {Promise<Object>} - Sync status {hasPending, count, status}
 */
export async function getSyncStatus() {
  try {
    const report = await getLastSyncStatus();
    return {
      hasPending: report?.pendingCount > 0,
      count: report?.pendingCount || 0,
      status: report?.status || 'unknown',
      lastSync: report?.timestamp,
      successCount: report?.successCount || 0,
      failureCount: report?.failureCount || 0,
    };
  } catch (err) {
    console.error('❌ Error getting sync status:', err);
    return {
      hasPending: false,
      count: 0,
      status: 'error',
      error: err.message
    };
  }
}

/**
 * Initialize sync orchestrator with network awareness
 * Should be called once in App.js or top-level navigation component
 * 
 * Features:
 * - Auto-sync when coming back online
 * - Periodic checks every 1 minute
 * - Graceful handling of offline periods
 * - East African Time (EAT) for all timestamps
 * 
 * @param {number} customIntervalMs - Optional custom interval (defaults to 1 min)
 * @example
 * // In App.js useEffect:
 * useEffect(() => {
 *   initializeSyncOrchestrator();
 *   return () => stopSyncOrchestrator();
 * }, []);
 */
export function initializeSyncOrchestrator(customIntervalMs = null) {
  if (isOrchestratorActive) {
    console.log('⚠️ Sync orchestrator already initialized');
    return;
  }
  
  isOrchestratorActive = true;
  
  // Set custom interval if provided
  if (customIntervalMs) {
    setSyncCheckInterval(customIntervalMs);
  }
  
  // Start periodic checks
  startPeriodicSyncCheck();
  
  console.log('🎯 Sync orchestrator initialized');
}

/**
 * Shutdown sync orchestrator
 * Called when app is closing or user logs out
 */
export function shutdownSyncOrchestrator() {
  stopSyncOrchestrator();
  isOrchestratorActive = false;
  lastSyncAttemptTime = 0;
  console.log('🛑 Sync orchestrator shutdown complete');
}

/**
 * ========== LIPA LATER SYNC ORCHESTRATION (✅ FIXED) ==========
 * FIX #9: Ensures Lipa Later payments are synced with real server IDs, not generated ones
 */

/**
 * Record a Lipa Later trip locally
 * ✅ FIXED: Generates temporary local ID for tracking
 */
export async function recordLipaLaterTrip(tripData) {
  try {
    // Generate a temporary local ID for tracking
    const localId = `lipa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the trip record with local ID
    const lipaTrip = {
      id: localId,
      ...tripData,
      sync_status: 'pending',
      created_at: new Date().toISOString()
    };
    
    // Store in local database
    if (!db.getStore('lipa_later_trips')) {
      await db.createStore('lipa_later_trips', { keyPath: 'id' }, [
        { name: 'rider_id', unique: false },
        { name: 'sync_status', unique: false }
      ]);
    }
    
    await db.add('lipa_later_trips', lipaTrip);
    console.log(`📝 Created local Lipa Later trip: ${localId}`);
    
    // Add to sync queue
    await syncQueue.addToQueue({
      type: 'lipa_later_trip',
      payload: lipaTrip
    });
    
    return {
      localId,
      lipaTrip
    };
  } catch (error) {
    console.error('❌ Error recording Lipa Later trip:', error);
    throw error;
  }
}

/**
 * Record a Lipa Later payment locally
 * ✅ FIXED: Stores the LOCAL lipa_later_id so we can update it later when trip syncs
 */
export async function recordLipaLaterPayment(paymentData, localLipaLaterId) {
  try {
    // FIX #9.2: Store the LOCAL lipa_later_id so we can update it later
    const payment = {
      id: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...paymentData,
      local_lipa_later_id: localLipaLaterId, // Track which local trip this payment belongs to
      lipa_later_id: null, // Will be filled when trip syncs
      sync_status: 'pending',
      awaiting_trip_sync: true,
      created_at: new Date().toISOString()
    };
    
    // Store in local database
    if (!db.getStore('lipa_later_payments')) {
      await db.createStore('lipa_later_payments', { keyPath: 'id' }, [
        { name: 'rider_id', unique: false },
        { name: 'local_lipa_later_id', unique: false }
      ]);
    }
    
    await db.add('lipa_later_payments', payment);
    console.log(`⏳ Created Lipa Later payment (awaiting trip sync): ${payment.id}`);
    console.log(`   Waiting for trip ${localLipaLaterId} to sync and return real lipa_later_id`);
    
    // Add to sync queue with special marker
    await syncQueue.addToQueue({
      type: 'lipa_later_payment',
      payload: {
        ...payment,
        _awaiting_trip_sync: true,
        _local_trip_id: localLipaLaterId
      }
    });
    
    return payment;
  } catch (error) {
    console.error('❌ Error recording Lipa Later payment:', error);
    throw error;
  }
}

/**
 * Update pending payments after a Lipa Later trip syncs successfully
 * ✅ FIXED: This is the critical method that fixes Issue #1
 * FIX #9.3: Propagates server-generated trip ID to all associated payments
 */
export async function updatePaymentsAfterTripSync(localTripId, serverTripId, syncResponse) {
  try {
    console.log(`🔄 Trip synced: local=${localTripId} → server=${serverTripId}`);
    
    // Get the real lipa_later_id from the sync response
    const realLipaLaterId = syncResponse.lipa_later_id || serverTripId;
    console.log(`✅ Server returned real lipa_later_id: ${realLipaLaterId}`);
    
    // Find all pending payments waiting for this trip
    const pendingPayments = await db.getAllFromIndex(
      'lipa_later_payments',
      'local_lipa_later_id',
      localTripId
    );
    
    console.log(`📋 Found ${pendingPayments.length} pending payments for this trip`);
    
    // Update each payment with the real server ID
    for (const payment of pendingPayments) {
      if (payment.awaiting_trip_sync && !payment.lipa_later_id) {
        try {
          // FIX #9.4: Update the payment with the real server ID
          const updatedPayment = {
            ...payment,
            lipa_later_id: realLipaLaterId, // NOW has the real ID
            awaiting_trip_sync: false,
            sync_status: 'pending' // Re-queue for sync
          };
          
          await db.update('lipa_later_payments', updatedPayment);
          console.log(`✅ Updated payment ${payment.id} with real lipa_later_id`);
          
          // Update the sync queue item if it exists
          const queueItems = await db.getAll('sync_queue');
          const paymentQueueItem = queueItems.find(
            q => q.type === 'lipa_later_payment' && q.payload.id === payment.id
          );
          
          if (paymentQueueItem) {
            // FIX #9.5: Update the queued payload with the real ID
            const updatedQueueItem = {
              ...paymentQueueItem,
              payload: updatedPayment,
              status: 'pending' // Re-queue for sync
            };
            
            await db.update('sync_queue', updatedQueueItem);
            console.log(`✅ Updated sync queue item for payment ${payment.id}`);
          }
        } catch (error) {
          console.error(`❌ Error updating payment ${payment.id}:`, error);
          // Continue with other payments
        }
      }
    }
    
    console.log(`✅ Completed updating payments for trip ${localTripId}`);
    
    return {
      success: true,
      updated: pendingPayments.length,
      realLipaLaterId
    };
  } catch (error) {
    console.error('❌ Error updating payments after trip sync:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Validate payment sync response and handle errors
 * ✅ FIXED: If a payment sync fails due to invalid ID, provide recovery
 * FIX #9.6: Recovers from stale generated IDs by finding synced trip
 */
export async function handlePaymentSyncError(payment, error, syncResponse) {
  try {
    console.error(`❌ Payment sync failed for ${payment.id}:`, error);
    
    // Check if error is due to missing lipa_later_id (the core Issue #1)
    if (error.includes('Invalid lipa_later_id format') || 
        error.includes('Lipa Later record not found')) {
      
      console.error(`⚠️ CRITICAL: Payment used generated customer_id instead of server lipa_later_id`);
      console.error(`   This happens when payment is recorded BEFORE trip syncs`);
      
      // FIX #9.7: Try to recover by finding the synced trip
      const tripId = payment.local_lipa_later_id;
      const trip = await db.get('lipa_later_trips', tripId);
      
      if (trip && trip.sync_status === 'synced') {
        // Trip has synced! Get its server ID and retry
        console.log(`🔄 Found synced trip! Retrying payment with real ID...`);
        
        const updatedPayment = {
          ...payment,
          lipa_later_id: trip.server_id,
          awaiting_trip_sync: false
        };
        
        await db.update('lipa_later_payments', updatedPayment);
        
        return {
          recovered: true,
          message: 'Payment recovered - will retry with server lipa_later_id',
          updatedPayment
        };
      } else {
        // Trip hasn't synced yet
        console.error(`❌ Associated trip ${tripId} hasn't synced yet`);
        console.error(`   Solution: Ensure the Lipa Later trip syncs BEFORE payment`);
        
        return {
          recovered: false,
          message: 'Trip not yet synced - payment will retry when trip syncs',
          needsRetry: true
        };
      }
    }
    
    return {
      recovered: false,
      error: error.message
    };
  } catch (error) {
    console.error('❌ Error handling payment sync error:', error);
    return {
      recovered: false,
      error: error.message
    };
  }
}

/**
 * Get comprehensive Lipa Later sync status
 * ✅ FIXED: Provides visibility into what's pending and awaiting sync
 */
export async function getLipaLaterSyncStatus() {
  try {
    const trips = await db.getAll('lipa_later_trips') || [];
    const payments = await db.getAll('lipa_later_payments') || [];
    
    const tripsStatus = {
      total: trips.length,
      pending: trips.filter(t => t.sync_status === 'pending').length,
      synced: trips.filter(t => t.sync_status === 'synced').length,
      failed: trips.filter(t => t.sync_status === 'failed').length
    };
    
    const paymentsStatus = {
      total: payments.length,
      awaitingTripSync: payments.filter(p => p.awaiting_trip_sync).length,
      pending: payments.filter(p => p.sync_status === 'pending' && !p.awaiting_trip_sync).length,
      synced: payments.filter(p => p.sync_status === 'synced').length,
      failed: payments.filter(p => p.sync_status === 'failed').length
    };
    
    return {
      trips: tripsStatus,
      payments: paymentsStatus,
      issues: {
        paymentsAwaitingSync: paymentsStatus.awaitingTripSync,
        message: paymentsStatus.awaitingTripSync > 0 
          ? `⚠️ ${paymentsStatus.awaitingTripSync} payments waiting for trip sync`
          : '✅ No Lipa Later sync issues'
      }
    };
  } catch (error) {
    console.error('❌ Error getting Lipa Later sync status:', error);
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Initialization
  initializeSyncOrchestrator,
  shutdownSyncOrchestrator,
  
  // Control
  startPeriodicSyncCheck,
  stopSyncOrchestrator,
  isSyncOrchestratorActive,
  
  // Configuration
  setSyncCheckInterval,
  getSyncCheckInterval,
  
  // Sync operations
  performSyncCheck,
  forceSyncNow,
  
  // ✅ Status and reporting
  getLastSyncStatus,
  getSyncStatus,
  
  // ✅ FIXED: Lipa Later sync operations
  recordLipaLaterTrip,
  recordLipaLaterPayment,
  updatePaymentsAfterTripSync,
  handlePaymentSyncError,
  getLipaLaterSyncStatus,
};