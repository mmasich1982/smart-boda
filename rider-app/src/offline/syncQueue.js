// rider-app/src/offline/syncQueue.js
// ✅ Offline-First: Sync queue for managing offline operations
// Fixed: Uses LocalStore.remove() which is aliased to delete()

import LocalStore from './LocalStore';

const SYNC_QUEUE_KEY = 'sync_queue';
const LAST_SYNC_TIME_KEY = 'last_sync_time';

/**
 * Get all queued records from localStorage
 * @returns {array} - Array of queued records
 */
export const getQueuedRecords = () => {
  try {
    const queuedData = LocalStore.get(SYNC_QUEUE_KEY);
    if (!queuedData) {
      return [];
    }
    const parsed = JSON.parse(queuedData);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading sync queue:', err);
    return [];
  }
};

/**
 * Add record to sync queue
 * @param {object} record - Record to add {id, type, endpoint, data, timestamp}
 * @returns {Promise<boolean>} - True if successful
 */
export const addToSyncQueue = async (record) => {
  try {
    if (!record || !record.id) {
      console.error('Invalid record for sync queue');
      return false;
    }

    const queued = getQueuedRecords();
    
    // Check for duplicates
    const isDuplicate = queued.some(r => r.id === record.id);
    if (isDuplicate) {
      console.log(`Record ${record.id} already in queue, skipping duplicate`);
      return true;
    }

    const newRecord = {
      id: record.id,
      type: record.type,
      endpoint: record.endpoint,
      data: record.data,
      timestamp: record.timestamp || new Date().toISOString(),
      retries: 0,
    };

    queued.push(newRecord);
    LocalStore.set(SYNC_QUEUE_KEY, JSON.stringify(queued));
    console.log(`✅ Added to sync queue: ${record.id} (${record.type})`);
    return true;
  } catch (err) {
    console.error('Error adding to sync queue:', err);
    return false;
  }
};

/**
 * Remove record from sync queue
 * @param {string} recordId - ID of record to remove
 * @returns {boolean} - True if successful
 */
export const removeFromSyncQueue = (recordId) => {
  try {
    const queued = getQueuedRecords();
    const filtered = queued.filter(r => r.id !== recordId);
    LocalStore.set(SYNC_QUEUE_KEY, JSON.stringify(filtered));
    console.log(`✅ Removed from sync queue: ${recordId}`);
    return true;
  } catch (err) {
    console.error('Error removing from sync queue:', err);
    return false;
  }
};

/**
 * Get record from queue by ID
 * @param {string} recordId - ID to retrieve
 * @returns {object|null} - Record or null
 */
export const getQueuedRecord = (recordId) => {
  try {
    const queued = getQueuedRecords();
    return queued.find(r => r.id === recordId);
  } catch (err) {
    console.error('Error fetching queued record:', err);
    return null;
  }
};

/**
 * Update sync status/retry count for a queued record
 * @param {string} recordId - ID of record to update
 * @param {object} updates - Updates to apply
 * @returns {boolean} - True if successful
 */
export const updateQueuedRecord = (recordId, updates) => {
  try {
    const queued = getQueuedRecords();
    const index = queued.findIndex(r => r.id === recordId);
    
    if (index === -1) {
      console.warn(`Record ${recordId} not found in queue`);
      return false;
    }

    queued[index] = { ...queued[index], ...updates };
    LocalStore.set(SYNC_QUEUE_KEY, JSON.stringify(queued));
    console.log(`✅ Updated sync queue record: ${recordId}`);
    return true;
  } catch (err) {
    console.error('Error updating queued record:', err);
    return false;
  }
};

/**
 * Get records pending sync (with retry limit)
 * @param {number} maxRetries - Maximum number of retries before giving up
 * @returns {array} - Pending records
 */
export const getPendingRecords = (maxRetries = 3) => {
  try {
    const queued = getQueuedRecords();
    return queued.filter(r => (r.retries || 0) < maxRetries);
  } catch (err) {
    console.error('Error getting pending records:', err);
    return [];
  }
};

/**
 * Update last sync time in localStorage
 * @returns {boolean} - True if successful
 */
export const updateLastSyncTime = () => {
  try {
    const now = new Date().toISOString();
    LocalStore.set(LAST_SYNC_TIME_KEY, now);
    console.log(`✅ Updated last sync time: ${now}`);
    return true;
  } catch (err) {
    console.error('Error updating sync time:', err);
    return false;
  }
};

/**
 * Get hours since last sync
 * @returns {number} - Hours since last sync, 0 if never synced
 */
export const hoursSinceLastSync = () => {
  try {
    const lastSyncStr = LocalStore.get(LAST_SYNC_TIME_KEY);
    
    if (!lastSyncStr) {
      // If no sync time recorded, app just came online or is new
      return 0;
    }

    const lastSync = new Date(lastSyncStr);
    const now = new Date();
    const hours = Math.round((now - lastSync) / (1000 * 60 * 60));
    return Math.max(0, hours);
  } catch (err) {
    console.error('Error calculating hours since sync:', err);
    return 0;
  }
};

/**
 * Clear entire sync queue
 * @returns {boolean} - True if successful
 */
export const clearSyncQueue = () => {
  try {
    // ✅ FIXED: Use LocalStore.remove() which is aliased to delete()
    LocalStore.remove(SYNC_QUEUE_KEY);
    console.log('✅ Sync queue cleared');
    return true;
  } catch (err) {
    console.error('Error clearing sync queue:', err);
    return false;
  }
};

/**
 * Get sync statistics
 * @returns {object} - {queuedCount, lastSyncTime, hoursSinceSync, isOffline}
 */
export const getSyncStats = () => {
  try {
    const queued = getQueuedRecords();
    const lastSync = LocalStore.get(LAST_SYNC_TIME_KEY);
    const hoursSince = hoursSinceLastSync();

    return {
      queuedCount: queued.length,
      lastSyncTime: lastSync,
      hoursSinceSync: hoursSince,
      isOffline: queued.length > 0 || hoursSince > 0,
    };
  } catch (err) {
    console.error('Error getting sync stats:', err);
    return {
      queuedCount: 0,
      lastSyncTime: null,
      hoursSinceSync: 0,
      isOffline: false,
    };
  }
};

/**
 * ✅ ENQUEUE FUNCTION: Main entry point for queuing offline operations
 * Used by screens like FuelEntryScreen, SendMoneyHomeScreen, etc.
 * Signature: enqueue(type, data) -> creates record with auto-generated id
 * 
 * @param {string} type - Type of record (fuel_entry, compliance_document, etc.)
 * @param {object} data - Data object to enqueue
 * @returns {Promise<boolean>} - True if queued successfully
 */
export const enqueue = async (type, data) => {
  try {
    if (!type || !data) {
      console.error('enqueue: Missing type or data');
      return false;
    }

    // Generate unique ID based on type and timestamp
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Map type to endpoint (if needed by backend)
    const endpointMap = {
      'fuel_entry': '/api/fuel-entries',
      'battery_entry': '/api/battery-entries',
      'odometer_reading': '/api/odometer-readings',
      'maintenance_entry': '/api/maintenance-entries',
      'compliance_document': '/api/compliance-documents',
      'remittance': '/api/remittances',
      'trip': '/api/trips',
    };

    const endpoint = endpointMap[type] || `/api/${type}`;

    const record = {
      id,
      type,
      endpoint,
      data,
      timestamp: new Date().toISOString(),
      retries: 0,
    };

    // Add to queue
    const result = await addToSyncQueue(record);
    
    if (result) {
      console.log(`✅ enqueue: Queued ${type} for sync`);
    } else {
      console.error(`❌ enqueue: Failed to queue ${type}`);
    }

    return result;
  } catch (err) {
    console.error('enqueue error:', err);
    return false;
  }
};