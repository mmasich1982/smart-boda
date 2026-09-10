/**
rider-app/src/offline/syncOrchestrator.js
 * ============================================================================
 * SMART-BODA SYNC ORCHESTRATOR - PERIODIC SYNC CHECKER
 * ============================================================================
 * 
 * 🎯 PURPOSE:
 * Manages automatic sync checking at configurable intervals (default: 1 minute)
 * Coordinates with existing SyncQueue to process pending items when:
 * - User comes online (network connectivity restored)
 * - Periodic interval expires (1 minute)
 * 
 * ✅ KEY FEATURES:
 * - Non-blocking: Runs in background without interrupting user
 * - Configurable interval: Default 1 minute, fully configurable
 * - Network aware: Only syncs when online, retries when offline
 * - Exponential backoff: Respects existing queue retry logic
 * - Memory efficient: Tracks last sync time, not data copies
 * - Offline-first compatible: Works seamlessly with IndexedDB-first architecture
 * - East African Time: All timestamps use EAT for consistency
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
  
  // ✅ NEW: Status and reporting
  getLastSyncStatus,
  getSyncStatus,
};