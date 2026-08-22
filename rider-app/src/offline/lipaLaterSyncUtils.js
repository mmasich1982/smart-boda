/**
 * rider-app/src/offline/lipaLaterSyncUtils.js
 * MIGRATED: Lipa Later Offline Sync Utilities - IndexedDB Edition
 * 
 * ✅ MIGRATED FROM: LocalStorage
 * ✅ NOW USING: IndexedDB for persistent offline storage
 * 
 * This file manages Lipa Later offline caching with proper async/await
 * using IndexedDB's structured storage capabilities.
 */

import { getIndexedDBStore } from './IndexedDBStore';
import { addToSyncQueue } from './syncQueue';

/**
 * Store Pattern:
 * - lipa_customers_{riderId}: Customer list
 * - lipa_detail_{recordId}: Individual customer details
 * - lipa_summary_{riderId}: Payment summary statistics
 * - lipa_ageing_{riderId}: Ageing report data
 * - lipa_payment_{paymentId}: Individual payment record
 */

// ============= CUSTOMER CACHE OPERATIONS =============

export const lipaCustomerCache = {
  /**
   * Get customer list from IndexedDB
   */
  getList: async (riderId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_customers_${riderId}`;
      const cached = await store.kvGet(key);
      if (cached) {
        console.log(`✅ Retrieved customer list for rider ${riderId}`);
        return cached;
      }
      return null;
    } catch (err) {
      console.warn('⚠️ Failed to parse customer cache:', err);
    }
    return null;
  },

  /**
   * Set customer list in IndexedDB
   */
  setList: async (riderId, customers) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_customers_${riderId}`;
      await store.kvSet(key, customers);
      console.log(`✅ Cached ${customers.length} customers for rider ${riderId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to cache customers:', err);
      return false;
    }
  },

  /**
   * Update single customer in cache
   */
  updateCustomer: async (riderId, customerId, updates) => {
    try {
      const customers = (await lipaCustomerCache.getList(riderId)) || [];
      const index = customers.findIndex(c => c.id === customerId);
      
      if (index !== -1) {
        customers[index] = { ...customers[index], ...updates, updated_at: new Date().toISOString() };
        return await lipaCustomerCache.setList(riderId, customers);
      }
      return false;
    } catch (err) {
      console.error('❌ Failed to update customer:', err);
      return false;
    }
  },

  /**
   * Add payment to customer's payment history
   */
  addPayment: async (riderId, customerId, payment) => {
    try {
      const customers = (await lipaCustomerCache.getList(riderId)) || [];
      const customer = customers.find(c => c.id === customerId);
      
      if (customer) {
        if (!customer.payments) {
          customer.payments = [];
        }
        customer.payments.push({ ...payment, added_at: new Date().toISOString() });
        
        // Update remaining balance and status
        const newRemaining = Math.max(0, 
          (customer.remaining_balance || customer.amount) - payment.amount
        );
        customer.remaining_balance = newRemaining;
        customer.status = newRemaining <= 0 ? 'paid' : 'partial';
        customer.updated_at = new Date().toISOString();
        
        return await lipaCustomerCache.setList(riderId, customers);
      }
      return false;
    } catch (err) {
      console.error('❌ Failed to add payment:', err);
      return false;
    }
  },

  /**
   * Clear customer cache
   */
  clear: async (riderId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_customers_${riderId}`;
      await store.kvSet(key, null);
      console.log(`✅ Cleared customer cache for rider ${riderId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to clear customer cache:', err);
      return false;
    }
  }
};

// ============= DETAIL CACHE OPERATIONS =============

export const lipaDetailCache = {
  /**
   * Get customer detail from IndexedDB
   */
  get: async (recordId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_detail_${recordId}`;
      const cached = await store.kvGet(key);
      if (cached) {
        return cached;
      }
    } catch (err) {
      console.warn('⚠️ Failed to retrieve detail cache:', err);
    }
    return null;
  },

  /**
   * Set customer detail in IndexedDB
   */
  set: async (recordId, detail) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_detail_${recordId}`;
      await store.kvSet(key, { ...detail, cached_at: new Date().toISOString() });
      console.log(`✅ Cached detail for record ${recordId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to cache detail:', err);
      return false;
    }
  },

  /**
   * Clear detail cache
   */
  clear: async (recordId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_detail_${recordId}`;
      await store.kvSet(key, null);
      console.log(`✅ Cleared detail cache for record ${recordId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to clear detail cache:', err);
      return false;
    }
  }
};

// ============= SUMMARY CACHE OPERATIONS =============

export const lipaSummaryCache = {
  /**
   * Get summary from IndexedDB
   */
  get: async (riderId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_summary_${riderId}`;
      const cached = await store.kvGet(key);
      if (cached) {
        return cached;
      }
    } catch (err) {
      console.warn('⚠️ Failed to retrieve summary cache:', err);
    }
    return null;
  },

  /**
   * Set summary in IndexedDB
   */
  set: async (riderId, summary) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_summary_${riderId}`;
      await store.kvSet(key, { ...summary, cached_at: new Date().toISOString() });
      console.log(`✅ Cached summary for rider ${riderId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to cache summary:', err);
      return false;
    }
  },

  /**
   * Update summary metrics
   */
  updateMetrics: async (riderId, updates) => {
    try {
      const summary = (await lipaSummaryCache.get(riderId)) || {};
      const updated = { ...summary, ...updates, updated_at: new Date().toISOString() };
      return await lipaSummaryCache.set(riderId, updated);
    } catch (err) {
      console.error('❌ Failed to update metrics:', err);
      return false;
    }
  },

  /**
   * Clear summary cache
   */
  clear: async (riderId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_summary_${riderId}`;
      await store.kvSet(key, null);
      console.log(`✅ Cleared summary cache for rider ${riderId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to clear summary cache:', err);
      return false;
    }
  }
};

// ============= AGEING CACHE OPERATIONS =============

export const lipaAgeingCache = {
  /**
   * Get ageing report from IndexedDB
   */
  get: async (riderId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_ageing_${riderId}`;
      const cached = await store.kvGet(key);
      if (cached) {
        return cached;
      }
    } catch (err) {
      console.warn('⚠️ Failed to retrieve ageing cache:', err);
    }
    return null;
  },

  /**
   * Set ageing report in IndexedDB
   */
  set: async (riderId, ageing) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_ageing_${riderId}`;
      await store.kvSet(key, { ...ageing, cached_at: new Date().toISOString() });
      console.log(`✅ Cached ageing report for rider ${riderId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to cache ageing:', err);
      return false;
    }
  },

  /**
   * Clear ageing cache
   */
  clear: async (riderId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_ageing_${riderId}`;
      await store.kvSet(key, null);
      console.log(`✅ Cleared ageing cache for rider ${riderId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to clear ageing cache:', err);
      return false;
    }
  }
};

// ============= PAYMENT CACHE OPERATIONS =============

export const lipaPaymentCache = {
  /**
   * Get payment from IndexedDB
   */
  get: async (paymentId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_payment_${paymentId}`;
      const cached = await store.kvGet(key);
      if (cached) {
        return cached;
      }
    } catch (err) {
      console.warn('⚠️ Failed to retrieve payment cache:', err);
    }
    return null;
  },

  /**
   * Save payment to IndexedDB
   */
  save: async (paymentId, payment) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_payment_${paymentId}`;
      await store.kvSet(key, { ...payment, saved_at: new Date().toISOString() });
      console.log(`✅ Saved payment ${paymentId} to cache`);
      return true;
    } catch (err) {
      console.error('❌ Failed to save payment:', err);
      return false;
    }
  },

  /**
   * Get all pending payments for a rider
   */
  getPending: async (riderId) => {
    try {
      const store = await getIndexedDBStore();
      const keys = await store.listKeys('lipa_payment_');
      const payments = [];
      
      for (const key of keys) {
        const cached = await store.kvGet(key);
        if (cached && cached.rider_id === riderId && cached.sync_status === 'pending') {
          payments.push(cached);
        }
      }
      console.log(`✅ Found ${payments.length} pending payments for rider ${riderId}`);
      return payments;
    } catch (err) {
      console.warn('⚠️ Failed to get pending payments:', err);
      return [];
    }
  },

  /**
   * Clear payment cache
   */
  clear: async (paymentId) => {
    try {
      const store = await getIndexedDBStore();
      const key = `lipa_payment_${paymentId}`;
      await store.kvSet(key, null);
      console.log(`✅ Cleared payment cache for ${paymentId}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to clear payment cache:', err);
      return false;
    }
  }
};

// ============= BULK CACHE OPERATIONS =============

/**
 * Clear all Lipa Later caches for a rider
 */
export const clearAllLipaCache = async (riderId) => {
  try {
    await lipaCustomerCache.clear(riderId);
    await lipaSummaryCache.clear(riderId);
    await lipaAgeingCache.clear(riderId);
    
    // Clear all detail caches (pattern: lipa_detail_*)
    const store = await getIndexedDBStore();
    const detailKeys = await store.listKeys('lipa_detail_');
    for (const key of detailKeys) {
      await store.kvSet(key, null);
    }
    
    console.log('✅ Cleared all Lipa Later cache for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Failed to clear all caches:', err);
    return false;
  }
};

/**
 * Refresh all Lipa Later caches after sync
 * (Call this after successful background sync)
 */
export const invalidateAllLipaCache = async (riderId) => {
  console.log('🔄 Invalidating Lipa Later cache for rider:', riderId);
  return await clearAllLipaCache(riderId);
};

// ============= SYNC QUEUE OPERATIONS =============

/**
 * Queue a new Lipa Later customer entry for sync
 */
export const queueLipaLaterEntry = async (riderId, recordId, payload) => {
  try {
    const success = await addToSyncQueue({
      id: recordId,
      type: 'lipa_entry',
      endpoint: `/trips/lipa-later/?rider_id=${riderId}`,
      data: payload,
      timestamp: new Date()
    });

    if (success) {
      console.log('✅ Queued Lipa Later entry:', recordId);
    } else {
      console.warn('⚠️ Failed to queue entry');
    }
    return success;
  } catch (err) {
    console.error('❌ Failed to queue entry:', err);
    return false;
  }
};

/**
 * Queue a payment for sync
 */
export const queuePayment = async (riderId, recordId, paymentId, payload) => {
  try {
    const success = await addToSyncQueue({
      id: paymentId,
      type: 'lipa_payment',
      endpoint: `/trips/lipa-later/${recordId}/payment?rider_id=${riderId}`,
      data: payload,
      timestamp: new Date()
    });

    if (success) {
      console.log('✅ Queued payment:', paymentId);
    } else {
      console.warn('⚠️ Failed to queue payment');
    }
    return success;
  } catch (err) {
    console.error('❌ Failed to queue payment:', err);
    return false;
  }
};

// ============= UTILITY FUNCTIONS =============

/**
 * Calculate days until/overdue for due date
 */
export const calculateDaysUntilDue = (dueDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Get ageing category for a due date
 */
export const getAgeingCategory = (dueDate) => {
  const days = calculateDaysUntilDue(dueDate);
  
  if (days < 0 && days >= -7) return 'upcoming';
  if (days === 0) return 'due_today';
  if (days < 0 && days >= -30) return 'overdue_1_30';
  if (days < -30 && days >= -60) return 'overdue_31_60';
  if (days < -60 && days >= -90) return 'overdue_61_90';
  if (days < -90) return 'overdue_90_plus';
  
  return 'unknown';
};

/**
 * Format currency for display
 */
export const formatCurrency = (amount) => {
  return `KSh ${parseFloat(amount || 0).toLocaleString()}`;
};

/**
 * Format date for display
 */
export const formatDate = (dateString) => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (err) {
    return dateString;
  }
};