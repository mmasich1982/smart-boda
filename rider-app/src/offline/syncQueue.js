// rider-app/src/offline/syncQueue.js
// SYNC QUEUE: Offline-first sync management
// FIXED: Now properly uses LocalStore adapter instead of trying to use Dexie API
// Also exports both `addToQueue` and `enqueue` to support existing screens

import api from '../api/client';
import NetInfo from '@react-native-community/netinfo';
import { queryRows, insertRow, updateRow, deleteRow } from './LocalStore';

const SYNC_BATCH_SIZE = 10;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds

/**
 * Queue types
 */
export const QUEUE_TYPES = {
  TRIP: 'trip',
  FUEL_ENTRY: 'fuel_entry',
  MAINTENANCE_ENTRY: 'maintenance_entry',
  EXPENSE: 'expense',
  LIPA_LATER_PAYMENT: 'lipa_later_payment',
};

/**
 * Add a record to the sync queue
 * FIXED: Now works with LocalStore adapter properly
 * @param {string} recordType - Type of record (from QUEUE_TYPES)
 * @param {Object} recordData - Record data to sync
 * @param {string} recordId - Unique record ID
 * @returns {Promise<Object>} Queue item
 */
export async function addToQueue(recordType, recordData, recordId) {
  try {
    const queueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      record_type: recordType,
      record_id: recordId,
      record_data: recordData,
      synced: false,
      sync_attempts: 0,
      last_sync_attempt: null,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await insertRow('sync_queue', queueItem);
    return queueItem;
  } catch (err) {
    console.error('Error adding to queue:', err);
    throw err;
  }
}

// FIXED: Export enqueue as alias so existing screens don't break
export const enqueue = addToQueue;

/**
 * Get all queued records
 * FIXED: Now works with LocalStore adapter
 * @param {Object} options - Filter options { recordType, synced, limit }
 * @returns {Promise<Array>} Array of queued records
 */
export async function getQueuedRecords(options = {}) {
  try {
    const { recordType = null, synced = false, limit = 100 } = options;
    
    // Use LocalStore queryRows with filter function
    let records = await queryRows('sync_queue', (item) => {
      if (synced !== null && item.synced !== synced) return false;
      if (recordType !== null && item.record_type !== recordType) return false;
      return true;
    });

    return records.slice(0, limit) || [];
  } catch (err) {
    console.error('Error fetching queued records:', err);
    return [];
  }
}

/**
 * Get queue statistics
 * FIXED: Properly queries sync_queue table
 * @returns {Promise<Object>} Stats including pending count, failed count, last sync time
 */
export async function getQueueStats() {
  try {
    const allRecords = await queryRows('sync_queue', () => true);

    const pending = allRecords.filter(r => !r.synced && (r.sync_attempts < MAX_RETRY_ATTEMPTS));
    const failed = allRecords.filter(r => r.sync_attempts >= MAX_RETRY_ATTEMPTS);
    const synced = allRecords.filter(r => r.synced);

    return {
      total: allRecords.length,
      pending: pending.length,
      failed: failed.length,
      synced: synced.length,
      lastSyncTime: getLastSyncTime(),
    };
  } catch (err) {
    console.error('Error fetching queue stats:', err);
    return { total: 0, pending: 0, failed: 0, synced: 0 };
  }
}

/**
 * Get last sync time
 * @returns {string|null} ISO timestamp of last sync or null
 */
function getLastSyncTime() {
  try {
    if (typeof localStorage !== 'undefined') {
      const lastSync = localStorage.getItem('lastSyncTime');
      return lastSync || null;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Set last sync time
 */
function setLastSyncTime() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lastSyncTime', new Date().toISOString());
    }
  } catch (err) {
    console.error('Error setting last sync time:', err);
  }
}

/**
 * Sync queue with backend
 * FIXED: Properly uses LocalStore queryRows and updateRow
 * Processes pending records in batches, retries failed ones
 * @returns {Promise<Object>} Sync result { synced, failed, errors }
 */
export async function syncQueue() {
  try {
    // Check network connectivity
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.warn('No network connection - sync skipped');
      return { synced: 0, failed: 0, errors: ['No network connection'] };
    }

    const pendingRecords = await getQueuedRecords({ synced: false });

    if (pendingRecords.length === 0) {
      setLastSyncTime();
      return { synced: 0, failed: 0, errors: [] };
    }

    const result = { synced: 0, failed: 0, errors: [] };

    // Process in batches
    for (let i = 0; i < pendingRecords.length; i += SYNC_BATCH_SIZE) {
      const batch = pendingRecords.slice(i, i + SYNC_BATCH_SIZE);

      for (const queueItem of batch) {
        try {
          await syncQueueItem(queueItem);
          
          // Mark as synced using updateRow from LocalStore
          await updateRow('sync_queue', queueItem.id, {
            synced: true,
            sync_attempts: queueItem.sync_attempts + 1,
            updated_at: new Date().toISOString(),
          });

          result.synced += 1;
        } catch (err) {
          result.failed += 1;
          const errorMsg = err.message || 'Unknown error';
          result.errors.push(`${queueItem.record_type}: ${errorMsg}`);

          // Update retry count using updateRow
          const attempts = queueItem.sync_attempts + 1;
          await updateRow('sync_queue', queueItem.id, {
            sync_attempts: attempts,
            error_message: errorMsg,
            updated_at: new Date().toISOString(),
          });

          console.error(`Sync failed for ${queueItem.id}:`, err);
        }

        // Small delay between items to avoid overwhelming server
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (result.synced > 0) {
      setLastSyncTime();
    }

    return result;
  } catch (err) {
    console.error('Error syncing queue:', err);
    return { synced: 0, failed: 0, errors: [err.message] };
  }
}

/**
 * Sync individual queue item
 * @param {Object} queueItem - Item from sync queue
 * @returns {Promise<void>}
 */
async function syncQueueItem(queueItem) {
  const { record_type, record_data, record_id } = queueItem;

  // Route to appropriate API endpoint based on record type
  switch (record_type) {
    case QUEUE_TYPES.TRIP:
      return api.post('/trips/create', record_data);

    case QUEUE_TYPES.FUEL_ENTRY:
      return api.post('/fuel/entry', record_data);

    case QUEUE_TYPES.MAINTENANCE_ENTRY:
      const riderId = record_data.rider_id;
      const maintenancePayload = { ...record_data };
      delete maintenancePayload.rider_id;
      return api.post(`/fuel-maintenance/maintenance-entry?rider_id=${riderId}`, maintenancePayload);

    case QUEUE_TYPES.EXPENSE:
      return api.post('/financial/expenses', record_data);

    case QUEUE_TYPES.LIPA_LATER_PAYMENT:
      return api.post('/lipa-later/record-payment', record_data);

    default:
      throw new Error(`Unknown record type: ${record_type}`);
  }
}

/**
 * Retry failed syncs
 * FIXED: Properly uses LocalStore adapter
 * Re-attempts to sync records that have failed previous attempts
 * @returns {Promise<Object>} Retry result
 */
export async function retryFailedSyncs() {
  try {
    const failedRecords = await queryRows('sync_queue', (item) => 
      item.sync_attempts >= 1 && !item.synced
    );

    if (failedRecords.length === 0) {
      return { retried: 0, synced: 0, stillFailing: 0 };
    }

    const result = { retried: 0, synced: 0, stillFailing: 0 };

    for (const queueItem of failedRecords) {
      if (queueItem.sync_attempts >= MAX_RETRY_ATTEMPTS) {
        result.stillFailing += 1;
        continue;
      }

      try {
        result.retried += 1;
        await syncQueueItem(queueItem);

        // Mark as synced
        await updateRow('sync_queue', queueItem.id, {
          synced: true,
          updated_at: new Date().toISOString(),
        });

        result.synced += 1;
      } catch (err) {
        // Just increment attempt, don't mark as synced
        const attempts = queueItem.sync_attempts + 1;
        await updateRow('sync_queue', queueItem.id, {
          sync_attempts: attempts,
          error_message: err.message,
          updated_at: new Date().toISOString(),
        });

        if (attempts >= MAX_RETRY_ATTEMPTS) {
          result.stillFailing += 1;
        }
      }

      // Delay between retries
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }

    return result;
  } catch (err) {
    console.error('Error retrying failed syncs:', err);
    return { retried: 0, synced: 0, stillFailing: 0, error: err.message };
  }
}

/**
 * Clear synced records (cleanup)
 * FIXED: Properly uses LocalStore adapter
 * Removes records that have been successfully synced
 * @param {number} olderThanDays - Only remove records older than X days
 * @returns {Promise<number>} Number of records cleared
 */
export async function clearSyncedRecords(olderThanDays = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const syncedRecords = await queryRows('sync_queue', (item) =>
      item.synced && new Date(item.updated_at) < cutoffDate
    );

    let deletedCount = 0;
    for (const record of syncedRecords) {
      await deleteRow('sync_queue', record.id);
      deletedCount += 1;
    }

    return deletedCount;
  } catch (err) {
    console.error('Error clearing synced records:', err);
    return 0;
  }
}

/**
 * Check if app needs sync
 * @returns {Promise<boolean>} True if there are pending records to sync
 */
export async function needsSync() {
  try {
    const pending = await getQueuedRecords({ synced: false });
    return pending.length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Get hours since last sync
 * @returns {Promise<number>} Hours since last successful sync
 */
export async function hoursSinceLastSync() {
  try {
    const lastSync = getLastSyncTime();
    if (!lastSync) return Infinity; // Never synced

    const lastSyncDate = new Date(lastSync);
    const now = new Date();
    const diffMs = now - lastSyncDate;
    return diffMs / (1000 * 60 * 60); // Convert to hours
  } catch (err) {
    return Infinity;
  }
}

/**
 * Monitor sync status with automatic retries
 * FIXED: Now properly named (was being imported as startSyncWorker)
 * This should be called periodically or when app comes to foreground
 */
export async function startSyncMonitor() {
  try {
    // Check network connectivity
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('Offline - sync monitor paused');
      return;
    }

    console.log('Starting sync monitor...');

    // Initial sync
    const syncResult = await syncQueue();
    console.log('Initial sync result:', syncResult);

    // Retry failed syncs
    const retryResult = await retryFailedSyncs();
    console.log('Retry result:', retryResult);

    // Cleanup old synced records
    const cleared = await clearSyncedRecords(7);
    console.log(`Cleared ${cleared} old synced records`);

    // Get current stats
    const stats = await getQueueStats();
    console.log('Queue stats:', stats);
  } catch (err) {
    console.error('Sync monitor error:', err);
  }
}

export default {
  addToQueue,
  enqueue,
  getQueuedRecords,
  getQueueStats,
  syncQueue,
  retryFailedSyncs,
  clearSyncedRecords,
  needsSync,
  hoursSinceLastSync,
  startSyncMonitor,
  QUEUE_TYPES,
};