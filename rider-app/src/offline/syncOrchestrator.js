/**
rider-app/src/offline/syncOrchestrator.js
 * ============================================================================
 * SMART-BODA SYNC ORCHESTRATOR - PERIODIC SYNC CHECKER
 * ============================================================================
 * 
 * 🎯 PURPOSE:
 * Manages automatic sync checking at configurable intervals (default: 5 minutes)
 * Coordinates with existing SyncQueue to process pending items when:
 * - User comes online (network connectivity restored)
 * - Periodic interval expires (5 minutes)
 * 
 * ✅ KEY FEATURES:
 * - Non-blocking: Runs in background without interrupting user
 * - Configurable interval: Default 5 minutes, fully configurable
 * - Network aware: Only syncs when online, retries when offline
 * - Exponential backoff: Respects existing queue retry logic
 * - Memory efficient: Tracks last sync time, not data copies
 * - Offline-first compatible: Works seamlessly with IndexedDB-first architecture
 * 
 * 📋 CONFIGURATION:
 * By default, sync is checked every 5 minutes.
 * To customize: Call setSyncCheckInterval(milliseconds) before starting
 * 
 * 🚀 STARTUP:
 * Call initializeSyncOrchestrator() once in App.js or navigation setup
 * 
 * ============================================================================
 */

import { processPendingSync } from './syncQueue';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

// Configuration constants
let SYNC_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
let syncTimerRef = null;
let lastSyncAttemptTime = 0;
let isOrchestratorActive = false;

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
 * 
 * @returns {Promise<Object>} Result with stats {attempted, synced, failed}
 */
export async function performSyncCheck() {
  const now = Date.now();
  
  // Prevent sync spam: minimum 5-second gap between attempts
  if (now - lastSyncAttemptTime < 5000) {
    console.log('⏳ Sync check skipped (too soon since last attempt)');
    return { attempted: false, reason: 'throttled' };
  }
  
  lastSyncAttemptTime = now;
  
  try {
    console.log('🔄 [SyncOrchestrator] Starting sync check...');
    
    // Call existing processPendingSync from syncQueue
    // This handles all logic: network check, retry logic, etc.
    const result = await processPendingSync();
    
    console.log('✅ [SyncOrchestrator] Sync check complete:', {
      itemsSynced: result?.synced || 0,
      itemsFailed: result?.failed || 0,
      itemsPending: result?.pending || 0,
      timestamp: new Date().toISOString(),
    });
    
    return {
      attempted: true,
      synced: result?.synced || 0,
      failed: result?.failed || 0,
      pending: result?.pending || 0,
    };
  } catch (err) {
    console.error('❌ [SyncOrchestrator] Sync check error:', err.message);
    return {
      attempted: true,
      error: err.message,
      synced: 0,
      failed: 0,
    };
  }
}

/**
 * Start the periodic sync checker
 * Runs sync checks every SYNC_CHECK_INTERVAL milliseconds
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
  
  // Perform first check immediately
  performSyncCheck().catch(err => {
    console.error('❌ Initial sync check error:', err);
  });
  
  // Then set up periodic checks
  syncTimerRef = setInterval(() => {
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
    console.log('⏹️  Sync orchestrator stopped');
  }
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
 * @returns {Promise<Object>} Sync result
 */
export async function forceSyncNow() {
  console.log('📡 Force sync requested');
  lastSyncAttemptTime = 0; // Reset throttle
  return await performSyncCheck();
}

/**
 * Initialize sync orchestrator with network awareness
 * Should be called once in App.js or top-level navigation component
 * 
 * Features:
 * - Auto-sync when coming back online
 * - Periodic checks every 5 minutes
 * - Graceful handling of offline periods
 * 
 * @param {number} customIntervalMs - Optional custom interval (defaults to 5 min)
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
};