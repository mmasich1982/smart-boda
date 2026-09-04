// rider-app/src/offline/lipaLaterUtils.js
// ✅ COMPLETE LIPA LATER UTILITY: IndexedDB-first architecture
// ✅ COMPREHENSIVE: Centralizes all Lipa Later operations with offline persistence
// ✅ FOLLOWS PATTERN: Established in tripUtils.js and financialHistoryUtils.js
// ✅ FEATURES: All customer operations, payment tracking, analytics, ageing reports

import indexedDbAdapter from './adapters/indexedDbAdapter';

/**
 * ============================================================================
 * LIPA LATER STORAGE ARCHITECTURE (IndexedDB-First Pattern)
 * ============================================================================
 *
 * CACHE KEYS:
 * -----------
 * lipa_later_entry_${tripId}
 *   - Individual Lipa Later transaction record (JSON)
 *   - Created when a trip is recorded with LipaLater payment method
 *   - Updated when payment is recorded or settled
 *   - Format: { id, tripId, rider_id, customerId, customerName, customerPhone,
 *              originalAmount, lipaLater: { dueDate, payments: [...], settled },
 *              ts, timestamp, status, syncStatus, ... }
 *
 * lipa_later_customers_${riderId}
 *   - Cache of all pending Lipa Later customers (array)
 *   - Maintained for quick customer list display
 *   - Updated after payment recording or settlement
 *   - Contains most recent customers first (unshift pattern)
 *   - Format: [{ customerId, customerName, customerPhone, totalOutstanding,
 *              pendingTrips, overdueCount, lastTransactionDate }, ...]
 *
 * lipa_later_summary_${riderId}
 *   - Aggregate summary for dashboard display
 *   - Contains: totalOutstanding, totalSettled, overdueCount, dueTodayCount
 *   - Updated on periodic sync or after payments
 *
 * lipa_later_payments_${customerId}
 *   - Payment history for a specific customer (array)
 *   - Sorted by date (newest first)
 *   - Format: [{ id, amount, date, paymentMethod, status }, ...]
 *
 * ============================================================================
 * LIPA LATER RECORD STRUCTURE
 * ============================================================================
 *
 * Trip with Lipa Later Payment Method:
 * {
 *   id: 'trip_${riderId}_${timestamp}',         // Trip ID
 *   rider_id: 'rider123',                        // Rider ownership
 *   amount: 350,                                 // Fare amount (KSh)
 *   paymentMethod: 'LipaLater',                  // Payment method
 *   status: 'active',                            // 'active' | 'voided'
 *   syncStatus: 'pending',                       // 'pending' | 'synced'
 *   
 *   // Timestamps
 *   ts: 1724080000000,                           // Trip timestamp (ms)
 *   timestamp: 1724080000000,                    // Backup timestamp (ms)
 *   created_at: '2026-08-25T10:00:00Z',         // ISO timestamp
 *   date: '2026-08-25',                          // Date string
 *   
 *   // Lipa Later metadata
 *   lipaLater: {
 *     customerId: 'cust123',                     // Customer ID
 *     customerName: 'John Doe',                  // Customer name
 *     customerPhone: '+254712345678',            // Customer phone
 *     originalAmount: 350,                       // Original fare amount
 *     dueDate: '2026-09-25',                     // Payment due date (30 days default)
 *     settled: false,                            // Payment fully received?
 *     settledDate: null,                         // When payment was settled
 *     
 *     // Payment tracking
 *     payments: [
 *       { amount: 150, date: '2026-08-30', paymentMethod: 'Cash', status: 'completed' },
 *       { amount: 200, date: '2026-09-05', paymentMethod: 'MPesa', status: 'completed' }
 *     ],
 *     
 *     // Ageing information
 *     createdAt: '2026-08-25T10:00:00Z',
 *     lastPaymentDate: '2026-09-05T15:30:00Z',
 *     daysOverdue: 0,
 *   }
 * }
 *
 * ============================================================================
 * USAGE PATTERNS
 * ============================================================================
 *
 * RECORD NEW LIPA LATER TRIP (NewTripScreen):
 *   1. Create trip record with paymentMethod='LipaLater'
 *   2. Populate lipaLater object with customer info
 *   3. Save to lipa_later_entry_${tripId} using kvSet
 *   4. Load lipa_later_customers_${riderId} cache
 *   5. Add/update customer record (unshift if new customer)
 *   6. Save updated cache back
 *   7. Queue for sync and attempt immediate sync if online
 *   8. Navigate to Home
 *
 * RECORD PAYMENT (RecordPaymentScreen):
 *   1. Load trip from lipa_later_entry_${tripId}
 *   2. Add payment entry to lipaLater.payments
 *   3. Check if fully settled (remaining balance = 0)
 *   4. Save updated trip back
 *   5. Update lipa_later_customers_${riderId} cache
 *   6. Update lipa_later_payments_${customerId} history
 *   7. Queue payment for sync
 *   8. Try immediate sync if online
 *   9. Navigate to PaymentSummary
 *
 * VIEW PENDING CUSTOMERS (LipaLaterCustomersScreen):
 *   1. Load lipa_later_customers_${riderId} from cache
 *   2. Filter for settled=false
 *   3. Sort by dueDate (overdue first)
 *   4. Display with pagination
 *   5. On focus: reload cache (soft refresh)
 *   6. On sync: update with fresh data from API
 *
 * VIEW AGEING REPORT (LipaLaterAgeingScreen):
 *   1. Load lipa_later_customers_${riderId}
 *   2. Filter and group by age buckets (Current, 30+, 60+, 90+)
 *   3. Calculate totals per bucket
 *   4. Display with visual indicators
 *
 * SETTLE CUSTOMER (mark as settled):
 *   1. Load trip from lipa_later_entry_${tripId}
 *   2. Set lipaLater.settled = true, settledDate = now
 *   3. Save updated trip
 *   4. Update customer record to mark as settled
 *   5. Queue settlement for sync
 *   6. Try immediate sync
 */

// ============================================================================
// CORE OPERATIONS
// ============================================================================

/**
 * Load a Lipa Later trip from IndexedDB
 * @param {string} tripId - Trip ID (e.g., 'trip_rider123_1724080000000')
 * @returns {Promise<Object|null>} - Trip record or null if not found
 */
export async function loadLipaLaterTripFromDb(tripId) {
  try {
    const recordKey = `lipa_later_entry_${tripId}`;
    const tripData = await indexedDbAdapter.kvGet(recordKey);

    if (tripData) {
      return typeof tripData === 'string' ? JSON.parse(tripData) : tripData;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading Lipa Later trip from db:', err);
    return null;
  }
}

/**
 * Save a Lipa Later trip to IndexedDB
 * @param {string} tripId - Trip ID
 * @param {Object} tripData - Trip record with lipaLater metadata
 * @returns {Promise<boolean>} - Success status
 */
export async function saveLipaLaterTripToDb(tripId, tripData) {
  try {
    const recordKey = `lipa_later_entry_${tripId}`;
    await indexedDbAdapter.kvSet(recordKey, JSON.stringify(tripData));
    console.log('✅ Lipa Later trip saved to IndexedDB:', tripId);
    return true;
  } catch (err) {
    console.error('❌ Error saving Lipa Later trip:', err);
    return false;
  }
}

/**
 * Normalize customer data to ensure all required fields are present
 * ✅ FIXED: Ensures dueDate, tripDate, totalPaid, originalAmount, and payments array exist
 * @param {Object} customer - Customer object
 * @returns {Object} - Normalized customer object
 */
function normalizeCustomerData(customer) {
  if (!customer) return customer;
  
  // If dueDate is missing, calculate it from lastTransactionDate or createdAt
  if (!customer.dueDate && (customer.lastTransactionDate || customer.createdAt)) {
    const baseDate = new Date(customer.lastTransactionDate || customer.createdAt);
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + 30);
    customer.dueDate = dueDate.toISOString().split('T')[0];
  }
  
  // Ensure tripDate is set
  if (!customer.tripDate && customer.createdAt) {
    const tripDate = new Date(customer.createdAt);
    customer.tripDate = tripDate.toISOString().split('T')[0];
  }
  
  // Ensure totalPaid is set
  if (typeof customer.totalPaid !== 'number') {
    customer.totalPaid = customer.totalSettled || 0;
  }
  
  // ✅ FIXED: Ensure originalAmount is set (sum of totalOutstanding + totalPaid)
  if (typeof customer.originalAmount !== 'number' || customer.originalAmount === 0) {
    customer.originalAmount = (customer.totalOutstanding || 0) + (customer.totalPaid || 0);
  }
  
  // Ensure payments array exists
  if (!Array.isArray(customer.payments)) {
    customer.payments = [];
  }
  
  return customer;
}

/**
 * Load all pending Lipa Later customers for a rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Array of customer records
 */
export async function loadLipaLaterCustomersCache(riderId) {
  try {
    const cacheKey = `lipa_later_customers_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    let items = [];

    if (cachedData) {
      try {
        items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (!Array.isArray(items)) items = [];
        // ✅ NORMALIZE ALL CUSTOMER DATA TO ENSURE dueDate IS PRESENT
        items = items.map(normalizeCustomerData);
      } catch (parseErr) {
        console.warn('⚠️ Customers cache parse error, starting fresh');
        items = [];
      }
    }
    return items;
  } catch (err) {
    console.error('❌ Error loading Lipa Later customers cache:', err);
    return [];
  }
}

/**
 * Save Lipa Later customers cache
 * @param {string} riderId - Rider ID
 * @param {Array} customers - Array of customer records
 * @returns {Promise<boolean>} - Success status
 */
export async function saveLipaLaterCustomersCache(riderId, customers) {
  try {
    const cacheKey = `lipa_later_customers_${riderId}`;
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(customers));
    console.log('✅ Lipa Later customers cache saved:', { riderId, count: customers.length });
    return true;
  } catch (err) {
    console.error('❌ Error saving Lipa Later customers cache:', err);
    return false;
  }
}

/**
 * Load Lipa Later summary (totals and counts)
 * @param {string} riderId - Rider ID
 * @returns {Promise<Object|null>} - Summary with totalOutstanding, overdueCount, etc.
 */
export async function loadLipaLaterSummary(riderId) {
  try {
    const cacheKey = `lipa_later_summary_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);

    if (cachedData) {
      return typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
    }
    return null;
  } catch (err) {
    console.error('❌ Error loading Lipa Later summary:', err);
    return null;
  }
}

/**
 * Save Lipa Later summary
 * @param {string} riderId - Rider ID
 * @param {Object} summary - Summary object
 * @returns {Promise<boolean>} - Success status
 */
export async function saveLipaLaterSummary(riderId, summary) {
  try {
    const cacheKey = `lipa_later_summary_${riderId}`;
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(summary));
    console.log('✅ Lipa Later summary saved:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error saving Lipa Later summary:', err);
    return false;
  }
}

/**
 * Load payment history for a specific customer
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>} - Array of payment records
 */
export async function loadCustomerPaymentHistory(customerId) {
  try {
    const cacheKey = `lipa_later_payments_${customerId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    let payments = [];

    if (cachedData) {
      try {
        payments = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (!Array.isArray(payments)) payments = [];
      } catch (parseErr) {
        console.warn('⚠️ Payment history parse error');
        payments = [];
      }
    }
    return payments;
  } catch (err) {
    console.error('❌ Error loading payment history:', err);
    return [];
  }
}

/**
 * Save payment history for a customer
 * @param {string} customerId - Customer ID
 * @param {Array} payments - Array of payment records
 * @returns {Promise<boolean>} - Success status
 */
export async function saveCustomerPaymentHistory(customerId, payments) {
  try {
    const cacheKey = `lipa_later_payments_${customerId}`;
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(payments));
    console.log('✅ Customer payment history saved:', customerId);
    return true;
  } catch (err) {
    console.error('❌ Error saving payment history:', err);
    return false;
  }
}

// ============================================================================
// CUSTOMER OPERATIONS
// ============================================================================

/**
 * Get or create customer record
 * @param {string} riderId - Rider ID
 * @param {Object} customerData - Customer info { customerId, customerName, customerPhone }
 * @param {number} amount - Trip amount
 * @returns {Promise<Object>} - Customer record
 */
export async function getOrCreateCustomer(riderId, customerData, amount) {
  try {
    const customers = await loadLipaLaterCustomersCache(riderId);
    const existing = customers.find(c => c.customerId === customerData.customerId);

    if (existing) {
      // Update pending trip count
      existing.pendingTrips = (existing.pendingTrips || 0) + 1;
      // ✅ FIXED: Accumulate originalAmount from all trips for this customer
      existing.originalAmount = (existing.originalAmount || 0) + amount;
      existing.totalOutstanding = (existing.totalOutstanding || 0) + amount;
      // Update due date if the new transaction has a different due date
      if (customerData.dueDate && customerData.dueDate > (existing.dueDate || '')) {
        existing.dueDate = customerData.dueDate;
      }
      existing.lastTransactionDate = new Date().toISOString();
      await saveLipaLaterCustomersCache(riderId, customers);
      return existing;
    }

    // Create new customer record
    const newCustomer = {
      customerId: customerData.customerId,
      customerName: customerData.customerName,
      customerPhone: customerData.customerPhone,
      customerMobile: customerData.customerPhone, // Alias for compatibility
      originalAmount: amount, // ✅ FIXED: Set originalAmount for new customer
      totalOutstanding: amount,
      totalPaid: 0,
      totalSettled: 0,
      pendingTrips: 1,
      settledTrips: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      lastTransactionDate: new Date().toISOString(),
      createdAt: customerData.createdAt || new Date().toISOString(),
      tripDate: customerData.tripDate || new Date().toISOString().split('T')[0],
      dueDate: customerData.dueDate || new Date().toISOString().split('T')[0],
      settled: false,
      payments: [],
    };

    customers.unshift(newCustomer);
    await saveLipaLaterCustomersCache(riderId, customers);
    console.log('✅ Created new Lipa Later customer:', customerData.customerId);
    return newCustomer;
  } catch (err) {
    console.error('❌ Error creating customer:', err);
    return null;
  }
}

/**
 * Update customer after payment
 * ✅ FIXED: Removes fully settled customers from pending list
 * @param {string} riderId - Rider ID
 * @param {string} customerId - Customer ID
 * @param {number} paymentAmount - Payment amount
 * @param {boolean} isFullySettled - Is account now settled?
 * @returns {Promise<boolean>} - Success status
 */
export async function updateCustomerAfterPayment(riderId, customerId, paymentAmount, isFullySettled) {
  try {
    const customers = await loadLipaLaterCustomersCache(riderId);
    const customerIndex = customers.findIndex(c => c.customerId === customerId);

    if (customerIndex === -1) {
      console.warn('⚠️ Customer not found:', customerId);
      return false;
    }

    const customer = customers[customerIndex];
    customer.totalOutstanding = Math.max(0, (customer.totalOutstanding || 0) - paymentAmount);
    customer.totalSettled = (customer.totalSettled || 0) + paymentAmount;
    customer.totalPaid = customer.totalSettled; // Keep in sync
    customer.lastTransactionDate = new Date().toISOString();

    if (isFullySettled) {
      customer.settled = true;
      customer.settledDate = new Date().toISOString();
    }

    customers[customerIndex] = customer;
    await saveLipaLaterCustomersCache(riderId, customers);
    console.log('✅ Updated customer after payment:', customerId);
    return true;
  } catch (err) {
    console.error('❌ Error updating customer:', err);
    return false;
  }
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Get pending customers for a rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Pending customer records
 */
export async function getPendingLipaLaterCustomers(riderId) {
  try {
    const customers = await loadLipaLaterCustomersCache(riderId);
    return customers.filter(c => !c.settled && c.totalOutstanding > 0);
  } catch (err) {
    console.error('❌ Error getting pending customers:', err);
    return [];
  }
}

/**
 * Get settled customers for a rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Array>} - Settled customer records
 */
export async function getSettledLipaLaterCustomers(riderId) {
  try {
    const customers = await loadLipaLaterCustomersCache(riderId);
    return customers.filter(c => c.settled || c.totalOutstanding === 0);
  } catch (err) {
    console.error('❌ Error getting settled customers:', err);
    return [];
  }
}

/**
 * Calculate ageing buckets (0-30, 30-60, 60-90, 90+ days)
 * @param {string} riderId - Rider ID
 * @returns {Promise<Object>} - Ageing breakdown
 */
export async function calculateAgeing(riderId) {
  try {
    const customers = await getPendingLipaLaterCustomers(riderId);
    const today = new Date();
    const buckets = {
      current: { count: 0, total: 0, customers: [] },    // 0-30 days
      thirtyPlus: { count: 0, total: 0, customers: [] }, // 30-60 days
      sixtyPlus: { count: 0, total: 0, customers: [] },  // 60-90 days
      ninetyPlus: { count: 0, total: 0, customers: [] }, // 90+ days
    };

    for (const customer of customers) {
      const lastTxDate = new Date(customer.lastTransactionDate || customer.createdAt);
      const daysSince = Math.floor((today - lastTxDate) / (1000 * 60 * 60 * 24));

      const amount = customer.totalOutstanding || 0;
      let bucket = 'current';

      if (daysSince >= 90) bucket = 'ninetyPlus';
      else if (daysSince >= 60) bucket = 'sixtyPlus';
      else if (daysSince >= 30) bucket = 'thirtyPlus';

      buckets[bucket].count += 1;
      buckets[bucket].total += amount;
      buckets[bucket].customers.push(customer);
    }

    console.log('✅ Calculated ageing:', buckets);
    return buckets;
  } catch (err) {
    console.error('❌ Error calculating ageing:', err);
    return {};
  }
}

/**
 * Calculate summary totals for a rider
 * @param {string} riderId - Rider ID
 * @returns {Promise<Object>} - Summary { totalOutstanding, totalSettled, overdueCount, dueTodayCount }
 */
export async function calculateLipaLaterSummary(riderId) {
  try {
    const customers = await loadLipaLaterCustomersCache(riderId);
    const today = new Date().toISOString().split('T')[0];

    let totalOutstanding = 0;
    let totalSettled = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;

    for (const customer of customers) {
      totalOutstanding += customer.totalOutstanding || 0;
      totalSettled += customer.totalSettled || 0;

      // Check if overdue (based on last transaction date + 30 days default)
      if (customer.lastTransactionDate) {
        const dueDate = new Date(customer.lastTransactionDate);
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        if (dueDateStr < today) overdueCount += 1;
        if (dueDateStr === today) dueTodayCount += 1;
      }
    }

    const summary = {
      totalOutstanding,
      totalSettled,
      overdueCount,
      dueTodayCount,
      totalCustomers: customers.length,
      pendingCustomers: customers.filter(c => !c.settled).length,
      settledCustomers: customers.filter(c => c.settled).length,
      lastUpdated: new Date().toISOString(),
    };

    await saveLipaLaterSummary(riderId, summary);
    console.log('✅ Calculated Lipa Later summary:', summary);
    return summary;
  } catch (err) {
    console.error('❌ Error calculating summary:', err);
    return null;
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all Lipa Later data for a rider (for testing/debugging only)
 * @param {string} riderId - Rider ID
 * @returns {Promise<boolean>} - Success status
 */
export async function clearLipaLaterCacheForRider(riderId) {
  try {
    const customersKey = `lipa_later_customers_${riderId}`;
    const summaryKey = `lipa_later_summary_${riderId}`;
    
    await indexedDbAdapter.delete(customersKey);
    await indexedDbAdapter.delete(summaryKey);
    
    console.log('✅ Lipa Later cache cleared for rider:', riderId);
    return true;
  } catch (err) {
    console.error('❌ Error clearing Lipa Later cache:', err);
    return false;
  }
}

/**
 * Sync Lipa Later data from API to local cache
 * Called periodically by LipaLaterCustomersScreen on screen focus
 * @param {string} riderId - Rider ID
 * @param {Array} trips - Lipa Later trips from API
 * @returns {Promise<boolean>} - Success status
 */
export async function syncLipaLaterFromApi(riderId, trips) {
  try {
    // Group trips by customer
    const customerMap = new Map();

    for (const trip of trips) {
      if (trip.paymentMethod !== 'LipaLater' || !trip.lipaLater) continue;

      const customerId = trip.lipaLater.customerId;
      if (!customerMap.has(customerId)) {
        // Calculate due date (30 days from transaction date)
        const transactionDate = new Date(trip.ts || trip.created_at);
        const dueDate = new Date(transactionDate);
        dueDate.setDate(dueDate.getDate() + 30);
        
        customerMap.set(customerId, {
          customerId,
          customerName: trip.lipaLater.customerName,
          customerPhone: trip.lipaLater.customerPhone,
          customerMobile: trip.lipaLater.customerPhone, // Alias
          originalAmount: 0, // ✅ FIXED: Initialize originalAmount to sum all trip amounts
          totalOutstanding: 0,
          totalSettled: 0,
          pendingTrips: 0,
          settledTrips: 0,
          lastTransactionDate: trip.ts,
          createdAt: trip.created_at,
          settled: false,
          dueDate: dueDate.toISOString().split('T')[0],
          tripDate: transactionDate.toISOString().split('T')[0],
          payments: [],
          totalPaid: 0,
        });
      }

      const customer = customerMap.get(customerId);
      const tripOriginalAmount = trip.lipaLater.originalAmount || 0;
      const remaining = tripOriginalAmount - 
        ((trip.lipaLater.payments || []).reduce((s, p) => s + (p.amount || 0), 0));

      // ✅ FIXED: Accumulate originalAmount from all trips for this customer
      customer.originalAmount += tripOriginalAmount;
      customer.totalOutstanding += Math.max(0, remaining);
      customer.totalSettled += tripOriginalAmount - Math.max(0, remaining);
      customer.totalPaid = customer.totalSettled;

      if (trip.lipaLater.settled) {
        customer.settledTrips += 1;
        customer.settled = true;
      } else {
        customer.pendingTrips += 1;
      }

      customer.lastTransactionDate = Math.max(
        new Date(customer.lastTransactionDate || 0).getTime(),
        trip.ts
      );

      // Update due date to the latest transaction + 30 days
      const transactionDate = new Date(trip.ts || trip.created_at);
      const dueDate = new Date(transactionDate);
      dueDate.setDate(dueDate.getDate() + 30);
      customer.dueDate = dueDate.toISOString().split('T')[0];

      // Store payment history if available
      if (trip.lipaLater.payments && Array.isArray(trip.lipaLater.payments)) {
        customer.payments = trip.lipaLater.payments;
      }

      // Save individual trip
      await saveLipaLaterTripToDb(trip.id, trip);
    }

    // Save customers cache
    const customers = Array.from(customerMap.values()).sort((a, b) => 
      b.lastTransactionDate - a.lastTransactionDate
    );
    
    // ✅ FIXED: Normalize all customer data to ensure originalAmount is present
    const normalizedCustomers = customers.map(c => normalizeCustomerData(c));
    
    await saveLipaLaterCustomersCache(riderId, normalizedCustomers);

    // Update summary
    await calculateLipaLaterSummary(riderId);

    console.log('✅ Synced', trips.length, 'Lipa Later trips from API');
    return true;
  } catch (err) {
    console.error('❌ Error syncing Lipa Later from API:', err);
    return false;
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  loadLipaLaterTripFromDb,
  saveLipaLaterTripToDb,
  loadLipaLaterCustomersCache,
  saveLipaLaterCustomersCache,
  loadLipaLaterSummary,
  saveLipaLaterSummary,
  loadCustomerPaymentHistory,
  saveCustomerPaymentHistory,
  getOrCreateCustomer,
  updateCustomerAfterPayment,
  getPendingLipaLaterCustomers,
  getSettledLipaLaterCustomers,
  calculateAgeing,
  calculateLipaLaterSummary,
  clearLipaLaterCacheForRider,
  syncLipaLaterFromApi,
};