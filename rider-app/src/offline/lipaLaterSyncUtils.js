/**
 * rider-app/src/offline/lipaLaterSync.js
 * MIGRATED: Offline-First Lipa Later Payment Recording & Sync (IndexedDB Edition)
 * 
 * ✅ MIGRATED FROM: localStorage via LocalStore
 * ✅ NOW USING: IndexedDB for proper async, non-blocking operations
 * 
 * Records payments to local DB immediately (offline-capable)
 * Maintains sync_status='pending' for offline tracking
 * Updates financial metrics optimistically (no wait for network)
 * Syncs to backend when online
 * Retry logic for failed syncs
 */

import * as db from './adapters/indexedDbAdapter';

// ============= State Management =============

class LipaLaterOfflineManager {
  constructor(apiClient) {
    this.api = apiClient;      // API client
    this.syncQueue = [];       // Queue of pending operations
    this.optimisticUpdates = {}; // Local cache for immediate display
  }

  /**
   * Initialize the manager with IndexedDB
   */
  async init() {
    await db.getDB();
    console.log('✅ LipaLaterOfflineManager initialized with IndexedDB');
    return db;
  }

  /**
   * Record a Lipa Later payment offline
   * 
   * WORKFLOW (Offline-First Pattern):
   * 1. Save payment to LOCAL DB immediately (sync_status='pending')
   * 2. Update LOCAL financial metrics optimistically
   * 3. Add to sync queue for background sync
   * 4. Return success to UI immediately (no network wait)
   */
  async recordPaymentOffline(tripId, paymentData) {
    if (!this.api) throw new Error('API client not initialized');

    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const payment = {
      id: paymentId,
      trip_id: tripId,
      amount_paid: paymentData.amount,
      payment_date: paymentData.date || new Date().toISOString().split('T')[0],
      reference: paymentData.reference || '',
      notes: paymentData.notes || '',
      sync_status: 'pending',  // CRITICAL: marks as not yet synced
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3
    };

    try {
      // Step 1: Save to local DB immediately (no network)
      await db.insertRow('lipa_payments', payment);

      // Step 2: Update local financial metrics optimistically
      await this.updateFinancialMetricsLocal(tripId, payment);

      // Step 3: Queue for sync
      await this.queuePaymentSync(payment);

      // Step 4: Return success immediately
      return {
        success: true,
        paymentId: paymentId,
        syncStatus: 'pending',
        message: `✓ Payment KSh ${payment.amount_paid.toLocaleString()} recorded. Syncing when online...`,
        amount: payment.amount_paid
      };
    } catch (error) {
      console.error('❌ Error recording payment locally:', error);
      throw new Error(`Failed to record payment: ${error.message}`);
    }
  }

  /**
   * Step 2: Update financial metrics LOCAL
   * Makes UI updates immediately without waiting for backend
   */
  async updateFinancialMetricsLocal(tripId, payment) {
    // Update optimistic cache for hero banner
    const today = new Date().toDateString();
    const cacheKey = `lipaLaterCollections_${today}`;
    
    this.optimisticUpdates[cacheKey] = 
      (this.optimisticUpdates[cacheKey] || 0) + payment.amount_paid;

    console.log(`✅ Updated optimistic metrics for ${cacheKey}: KSh ${this.optimisticUpdates[cacheKey]}`);
  }

  /**
   * Step 3: Queue payment for background sync
   */
  async queuePaymentSync(payment) {
    const operation = {
      id: `sync_${payment.id}`,
      type: 'LIPA_PAYMENT',
      paymentId: payment.id,
      tripId: payment.trip_id,
      payload: payment,
      queuedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      status: 'pending'  // pending, in_progress, completed, failed
    };

    await db.insertRow('sync_queue', operation);
    console.log(`✅ Queued payment ${payment.id} for sync`);
    return operation;
  }

  /**
   * Background sync: Process pending Lipa Later payments
   * Called by SyncManager when online
   */
  async syncPendingPayments() {
    const operations = await db.queryRows('sync_queue', op => 
      op.type === 'LIPA_PAYMENT' && op.status === 'pending'
    );

    console.log(`[LipaLaterSync] Found ${operations.length} pending payments to sync`);

    for (const op of operations) {
      await this.syncPaymentToBackend(op);
    }
  }

  /**
   * Sync individual payment to backend
   * Handles retry logic for failed attempts
   */
  async syncPaymentToBackend(operation) {
    try {
      // Mark as in-progress
      operation.status = 'in_progress';
      await db.updateRow('sync_queue', operation.id, operation);

      // Call backend endpoint
      const response = await this.api.post(
        `/trips/lipa-later/${operation.tripId}/payment`,
        {
          amount_paid: operation.payload.amount_paid,
          payment_date: operation.payload.payment_date,
          reference: operation.payload.reference,
          notes: operation.payload.notes,
          sync_status: 'synced'  // Mark as synced on backend
        }
      );

      // Update payment sync_status to 'synced'
      const payments = await db.queryRows('lipa_payments', p => p.id === operation.paymentId);
      if (payments && payments.length > 0) {
        await db.updateRow('lipa_payments', operation.paymentId, {
          sync_status: 'synced',
          backend_id: response.id,
          backend_response: response
        });
      }

      // Mark operation as completed
      operation.status = 'completed';
      operation.completedAt = Date.now();
      await db.updateRow('sync_queue', operation.id, operation);

      console.log(`✓ Payment ${operation.paymentId} synced successfully`);
      return { success: true };

    } catch (error) {
      console.error(`✗ Failed to sync payment ${operation.paymentId}:`, error);

      // Retry logic
      operation.retryCount++;
      if (operation.retryCount >= operation.maxRetries) {
        operation.status = 'failed';
        operation.error = error.message;
        console.warn(`✗ Payment ${operation.paymentId} failed after ${operation.maxRetries} retries`);
      } else {
        // Keep as pending for retry
        operation.status = 'pending';
        operation.nextRetryAt = Date.now() + (Math.pow(2, operation.retryCount) * 5000); // Exponential backoff
      }

      await db.updateRow('sync_queue', operation.id, operation);
      return { success: false, retry: operation.retryCount < operation.maxRetries };
    }
  }

  /**
   * Get financial metrics (with offline optimism)
   * Shows local values + optimistic updates if offline
   */
  async getTodaysCollections(riderId) {
    const today = new Date().toDateString();
    const cacheKey = `lipaLaterCollections_${today}`;

    // If online, fetch from backend
    if (navigator.onLine) {
      try {
        const response = await this.api.get(
          `/financial-performance/hero-banner?rider_id=${riderId}`
        );
        return response.today_collections;
      } catch (error) {
        console.warn('⚠️ Failed to fetch collections from backend, using offline cache');
      }
    }

    // Offline or backend error: calculate locally
    const synced = await db.queryRows('lipa_payments', p => 
      p.sync_status === 'synced' && p.payment_date === today
    );

    const syncedTotal = synced.reduce((sum, p) => sum + p.amount_paid, 0);
    const optimisticTotal = (this.optimisticUpdates[cacheKey] || 0);

    return {
      cash_payments: 0,
      mpesa_payments: 0,
      lipa_later_payments: optimisticTotal,
      pochi_la_biashara: 0,
      send_money: 0,
      total_today: optimisticTotal
    };
  }

  /**
   * Get payment status for UI display
   * Shows "synced" or "pending" indicator
   */
  async getPaymentSyncStatus(paymentId) {
    const payments = await db.queryRows('lipa_payments', p => p.id === paymentId);
    if (!payments || payments.length === 0) return null;

    const payment = payments[0];

    return {
      paymentId: paymentId,
      syncStatus: payment.sync_status,
      syncedAt: payment.backend_response?.payment_date || null,
      isIndicator: payment.sync_status === 'pending' ? '⧖ Syncing...' : '✓ Synced'
    };
  }
}

// ============= Integration with Sync Queue =============

/**
 * Extend SyncManager to handle Lipa Later payments
 */

const PENDING_OPERATIONS = {
  TRIP_CREATE: 'trip:create',
  FUEL_LOG: 'fuel:log',
  LIPA_LATER_ENTRY: 'lipa:entry',
  LIPA_LATER_PAYMENT: 'lipa:payment',
};

async function processSyncQueue(manager) {
  const operations = await db.queryRows('sync_queue');
  
  for (const op of operations) {
    if (op.status === 'completed') continue; // Skip already done

    try {
      switch (op.type) {
        case PENDING_OPERATIONS.LIPA_LATER_PAYMENT:
          await manager.syncPaymentToBackend(op);
          break;
        // Handle other operation types as needed
      }
    } catch (error) {
      console.error(`[SyncQueue] Error processing ${op.type}:`, error);
      op.retryCount = (op.retryCount || 0) + 1;
      if (op.retryCount >= 3) {
        op.status = 'failed';
      }
      await db.updateRow('sync_queue', op.id, op);
    }
  }
}

// ============= Export =============

export {
  LipaLaterOfflineManager,
  PENDING_OPERATIONS,
  processSyncQueue
};

export default {
  LipaLaterOfflineManager,
  PENDING_OPERATIONS,
  processSyncQueue
};