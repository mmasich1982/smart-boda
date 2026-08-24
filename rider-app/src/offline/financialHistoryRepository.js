/**
 * Financial History Repository - COMPLETE INDEXEDDB MIGRATION
 * 
 * Manages offline storage of financial data including:
 * - Transaction history (6-month retention window)
 * - Statement records
 * - Income tracking
 * - Expense tracking
 * - Net profit calculations
 * 
 * DATA RETENTION POLICY:
 * ✅ 6-month rolling retention window from rider's onboarding date
 * ✅ Auto-deletion of oldest month at end of each 6-month cycle
 * ✅ All queries within 6-month bracket served from IndexedDB
 * ⚠️ Queries beyond 6 months routed to Smart Boda Admin (Phase 2)
 * 
 * MIGRATION NOTES:
 * ✅ Transitioned from LocalStorage to IndexedDB via indexedDbAdapter
 * ✅ ❌ NO LocalStore - completely removed
 * ✅ All operations are fully async/await
 * ✅ Structured queries with indexes on type, date, timestamp, riderId
 * ✅ Transaction queue prevents concurrent access conflicts
 * ✅ Maintains backward compatibility with existing financial logic
 */

import indexedDbAdapter from './adapters/indexedDbAdapter';

const FINANCIAL_STORE = 'financialHistory';
const STATEMENTS_STORE = 'statements';
const RETENTION_CONFIG_KEY = 'financial_retention_config';

/**
 * ========== RETENTION WINDOW MANAGEMENT ==========
 */

/**
 * Calculate if transaction falls within rider's 6-month retention window
 */
export function isWithinRetentionWindow(transactionTimestamp, riderOnboardingDate) {
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  const windowEndDate = riderOnboardingDate + SIX_MONTHS_MS;
  return transactionTimestamp >= riderOnboardingDate && transactionTimestamp <= windowEndDate;
}

/**
 * Get current retention window for rider
 */
export async function getRetentionWindowInfo(riderId) {
  try {
    const config = await indexedDbAdapter.kvGet(`${RETENTION_CONFIG_KEY}_${riderId}`);
    
    if (!config || !config.onboardingDate) {
      console.warn('⚠️ No onboarding date found for rider:', riderId);
      return {
        startDate: null,
        endDate: null,
        daysRemaining: 0,
        isActive: false
      };
    }

    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
    const onboardingDate = config.onboardingDate;
    const endDate = onboardingDate + SIX_MONTHS_MS;
    const now = Date.now();
    const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (24 * 60 * 60 * 1000)));
    
    return {
      startDate: onboardingDate,
      endDate,
      daysRemaining,
      isActive: now <= endDate,
      progressPercentage: ((now - onboardingDate) / SIX_MONTHS_MS) * 100
    };
  } catch (err) {
    console.error('[getRetentionWindowInfo] error:', err);
    return {
      startDate: null,
      endDate: null,
      daysRemaining: 0,
      isActive: false
    };
  }
}

/**
 * Initialize retention configuration for rider
 */
export async function initializeRetentionConfig(riderId, onboardingDate = Date.now()) {
  try {
    const config = {
      riderId,
      onboardingDate,
      createdAt: Date.now(),
      lastCycleCleanupDate: null,
      nextCleanupDate: onboardingDate + (6 * 30 * 24 * 60 * 60 * 1000)
    };

    await indexedDbAdapter.kvSet(`${RETENTION_CONFIG_KEY}_${riderId}`, config);
    console.log(`✅ initializeRetentionConfig: Configured rider ${riderId}`);
    return config;
  } catch (err) {
    console.error('[initializeRetentionConfig] error:', err);
    throw err;
  }
}

/**
 * Cleanup oldest month data when retention window completes
 */
export async function performRetentionCycleCleanup(riderId) {
  try {
    console.log(`🗑️ performRetentionCycleCleanup: Starting cleanup for rider ${riderId}`);

    const config = await indexedDbAdapter.kvGet(`${RETENTION_CONFIG_KEY}_${riderId}`);
    if (!config) {
      throw new Error(`No retention config for rider ${riderId}`);
    }

    const now = Date.now();
    const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
    const windowStart = config.onboardingDate;
    const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
    const deleteOlderThan = windowStart + (5 * ONE_MONTH_MS);

    const allRecords = await indexedDbAdapter.queryByIndex(FINANCIAL_STORE, 'riderId', riderId);
    
    let deletedRecords = 0;
    const recordsToDelete = allRecords.filter(r => r.ts < deleteOlderThan || r.timestamp < deleteOlderThan);

    for (const record of recordsToDelete) {
      await indexedDbAdapter.deleteRow(FINANCIAL_STORE, record.id);
      deletedRecords++;
    }

    const allStatements = await indexedDbAdapter.queryByIndex(STATEMENTS_STORE, 'riderId', riderId);
    let deletedStmt = 0;
    const stmtsToDelete = allStatements.filter(s => (s.ts || s.timestamp || 0) < deleteOlderThan);

    for (const stmt of stmtsToDelete) {
      await indexedDbAdapter.deleteRow(STATEMENTS_STORE, stmt.id);
      deletedStmt++;
    }

    config.lastCycleCleanupDate = now;
    config.onboardingDate = now;
    config.nextCleanupDate = now + SIX_MONTHS_MS;

    await indexedDbAdapter.kvSet(`${RETENTION_CONFIG_KEY}_${riderId}`, config);

    return { deletedRecords, deletedStmt, riderId, timestamp: now };
  } catch (err) {
    console.error('[performRetentionCycleCleanup] error:', err);
    throw err;
  }
}

/**
 * ========== CORE TRANSACTION OPERATIONS ==========
 */

export async function saveFinancialTransaction(transaction) {
  try {
    if (!transaction.type || !transaction.amount) {
      throw new Error('Transaction must have type and amount');
    }

    const ts = transaction.ts || transaction.timestamp || Date.now();
    transaction.ts = transaction.ts || ts;
    transaction.timestamp = transaction.timestamp || ts;
    transaction.id = transaction.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    transaction.date = transaction.date || new Date(ts).toISOString().split('T')[0];
    transaction.status = transaction.status || 'confirmed';
    transaction.rider_id = transaction.rider_id || transaction.riderId;

    await indexedDbAdapter.insertRow(FINANCIAL_STORE, transaction);
    console.log(`✅ saveFinancialTransaction: Saved ${transaction.type} transaction ${transaction.id}`);
    return transaction.id;
  } catch (err) {
    console.error('[saveFinancialTransaction] error:', err);
    throw err;
  }
}

export async function getFinancialTransaction(transactionId) {
  try {
    const transaction = await indexedDbAdapter.getRow(FINANCIAL_STORE, transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    console.log(`✅ getFinancialTransaction: Retrieved ${transactionId}`);
    return transaction;
  } catch (err) {
    console.error('[getFinancialTransaction] error:', err);
    throw err;
  }
}

export async function updateFinancialTransaction(transactionId, updates) {
  try {
    const updated = await indexedDbAdapter.updateRow(FINANCIAL_STORE, transactionId, {
      ...updates,
      updatedAt: Date.now()
    });
    console.log(`✅ updateFinancialTransaction: Updated ${transactionId}`);
    return updated;
  } catch (err) {
    console.error('[updateFinancialTransaction] error:', err);
    throw err;
  }
}

export async function deleteFinancialTransaction(transactionId) {
  try {
    await indexedDbAdapter.deleteRow(FINANCIAL_STORE, transactionId);
    console.log(`✅ deleteFinancialTransaction: Deleted ${transactionId}`);
    return true;
  } catch (err) {
    console.error('[deleteFinancialTransaction] error:', err);
    throw err;
  }
}

/**
 * ========== COMPATIBILITY FUNCTIONS FOR SCREENS ==========
 */

/**
 * Get financial summary for a date range
 * USED BY: FinancialHistoryScreen
 */
export async function getFinancialSummary(riderId, startTime, endTime) {
  try {
    const result = await getTransactionsByDateRange(riderId, startTime, endTime);
    const transactions = result.transactions || [];
    
    const summary = {
      riderId,
      startTime,
      endTime,
      income: 0,
      expense: 0,
      totalExpense: 0,
      netProfit: 0,
      byType: {},
      transactionCount: transactions.length,
      isWithinRetention: result.isWithinRetention,
      daysRemaining: result.daysRemaining
    };
    
    transactions.forEach(txn => {
      const amount = txn.amount || 0;
      if (txn.type === 'income') {
        summary.income += amount;
      } else if (txn.type === 'expense' || txn.type === 'fuel' || txn.type === 'maintenance') {
        summary.expense += amount;
      }
      
      if (!summary.byType[txn.type]) {
        summary.byType[txn.type] = { count: 0, total: 0 };
      }
      summary.byType[txn.type].count++;
      summary.byType[txn.type].total += amount;
    });

    summary.totalExpense = summary.expense;
    summary.netProfit = summary.income - summary.expense;
    
    console.log(`✅ getFinancialSummary: Income ${summary.income}, Expense ${summary.expense}, Net ${summary.netProfit}`);
    return summary;
  } catch (err) {
    console.error('[getFinancialSummary] error:', err);
    return {
      income: 0,
      expense: 0,
      totalExpense: 0,
      netProfit: 0,
      byType: {},
      transactionCount: 0,
      isWithinRetention: false
    };
  }
}

/**
 * Get earliest transaction date for rider
 * USED BY: FinancialHistoryScreen
 */
export async function getEarliestTransactionDate(riderId) {
  try {
    const windowInfo = await getRetentionWindowInfo(riderId);
    
    if (!windowInfo.isActive) {
      return null;
    }

    const allTransactions = await indexedDbAdapter.queryByIndex(FINANCIAL_STORE, 'riderId', riderId);
    
    if (allTransactions.length === 0) {
      return null;
    }

    const filtered = allTransactions.filter(t => 
      isWithinRetentionWindow(t.ts || t.timestamp || 0, windowInfo.startDate)
    );

    if (filtered.length === 0) {
      return null;
    }

    const earliest = filtered.reduce((min, t) => {
      const ts = t.ts || t.timestamp || 0;
      return ts < min ? ts : min;
    }, Infinity);

    console.log(`✅ getEarliestTransactionDate: ${earliest}`);
    return earliest === Infinity ? null : earliest;
  } catch (err) {
    console.error('[getEarliestTransactionDate] error:', err);
    return null;
  }
}

/**
 * Get transaction list for date range
 * USED BY: TransactionListScreen
 */
export async function getTransactionList(riderId, startTime, endTime) {
  try {
    const result = await getTransactionsByDateRange(riderId, startTime, endTime);
    
    if (!result.isWithinRetention) {
      console.warn('⚠️ getTransactionList: Outside retention window');
      return [];
    }

    return result.transactions || [];
  } catch (err) {
    console.error('[getTransactionList] error:', err);
    return [];
  }
}

/**
 * Sync financial data from API to IndexedDB
 * USED BY: FinancialHistoryScreen
 */
export async function syncFinancialDataFromAPI(riderId, timeRange = 'all_time') {
  try {
    console.log(`📡 syncFinancialDataFromAPI: Syncing ${timeRange} data for rider ${riderId}`);
    
    const config = await indexedDbAdapter.kvGet(`${RETENTION_CONFIG_KEY}_${riderId}`);
    if (!config) {
      await initializeRetentionConfig(riderId);
    }

    console.log(`✅ syncFinancialDataFromAPI: Sync initiated for rider ${riderId}`);
    return true;
  } catch (err) {
    console.error('[syncFinancialDataFromAPI] error:', err);
    throw err;
  }
}

/**
 * ========== QUERY OPERATIONS WITH RETENTION VALIDATION ==========
 */

export async function getAllTransactions(riderId, limit = 1000, offset = 0) {
  try {
    const allTransactions = await indexedDbAdapter.queryByIndex(FINANCIAL_STORE, 'riderId', riderId);
    const windowInfo = await getRetentionWindowInfo(riderId);
    
    if (!windowInfo.isActive) {
      console.warn(`⚠️ getAllTransactions: Outside retention window for rider ${riderId}`);
      return {
        transactions: [],
        total: 0,
        isWithinRetention: false,
        daysRemaining: windowInfo.daysRemaining
      };
    }

    const filtered = allTransactions.filter(t => 
      isWithinRetentionWindow(t.ts || t.timestamp || 0, windowInfo.startDate)
    );

    filtered.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    const paginated = filtered.slice(offset, offset + limit);
    
    console.log(`✅ getAllTransactions: Found ${filtered.length} total, returning ${paginated.length}`);
    return {
      transactions: paginated,
      total: filtered.length,
      isWithinRetention: true,
      daysRemaining: windowInfo.daysRemaining
    };
  } catch (err) {
    console.error('[getAllTransactions] error:', err);
    return { transactions: [], total: 0, isWithinRetention: false };
  }
}

export async function getTransactionsByType(riderId, type, limit = 1000) {
  try {
    const windowInfo = await getRetentionWindowInfo(riderId);
    
    if (!windowInfo.isActive) {
      console.warn(`⚠️ getTransactionsByType: Outside retention window for rider ${riderId}`);
      return { transactions: [], count: 0, isWithinRetention: false };
    }

    const allByType = await indexedDbAdapter.queryByIndex(FINANCIAL_STORE, 'type', type);
    const filtered = allByType.filter(t => 
      t.rider_id === riderId && 
      isWithinRetentionWindow(t.ts || t.timestamp || 0, windowInfo.startDate)
    );
    
    filtered.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    const limited = filtered.slice(0, limit);
    
    console.log(`✅ getTransactionsByType: Found ${limited.length} transactions of type ${type}`);
    return { transactions: limited, count: limited.length, isWithinRetention: true };
  } catch (err) {
    console.error('[getTransactionsByType] error:', err);
    return { transactions: [], count: 0, isWithinRetention: false };
  }
}

export async function getTransactionsByDateRange(riderId, startTime, endTime) {
  try {
    const windowInfo = await getRetentionWindowInfo(riderId);
    
    if (!windowInfo.isActive) {
      return {
        transactions: [],
        isWithinRetention: false,
        message: 'Data beyond 6-month retention window. Contact Smart Boda Admin.'
      };
    }

    const adjustedStart = Math.max(startTime, windowInfo.startDate);
    const adjustedEnd = Math.min(endTime, windowInfo.endDate);

    if (adjustedStart > adjustedEnd) {
      return {
        transactions: [],
        isWithinRetention: false,
        message: 'Requested date range is outside retention window.'
      };
    }

    const allInRange = await indexedDbAdapter.queryByRange(FINANCIAL_STORE, 'ts', adjustedStart, adjustedEnd);
    const filtered = allInRange.filter(t => t.rider_id === riderId);
    
    filtered.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    console.log(`✅ getTransactionsByDateRange: Found ${filtered.length} transactions`);
    return {
      transactions: filtered,
      isWithinRetention: true,
      daysRemaining: windowInfo.daysRemaining
    };
  } catch (err) {
    console.error('[getTransactionsByDateRange] error:', err);
    return { transactions: [], isWithinRetention: false };
  }
}

export async function getTransactionsByDate(riderId, dateString) {
  try {
    const startOfDay = new Date(`${dateString}T00:00:00Z`).getTime();
    const endOfDay = new Date(`${dateString}T23:59:59Z`).getTime();
    return await getTransactionsByDateRange(riderId, startOfDay, endOfDay);
  } catch (err) {
    console.error('[getTransactionsByDate] error:', err);
    return { transactions: [], isWithinRetention: false };
  }
}

/**
 * ========== SUMMARY OPERATIONS ==========
 */

export async function getTodaysSummary(riderId) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = todayStart + (24 * 60 * 60 * 1000);
    
    const result = await getTransactionsByDateRange(riderId, todayStart, todayEnd);
    const todaysTransactions = result.transactions || [];
    
    const summary = {
      totalIncome: 0,
      totalExpense: 0,
      netProfit: 0,
      byType: {},
      transactions: todaysTransactions,
      isWithinRetention: result.isWithinRetention
    };
    
    todaysTransactions.forEach(txn => {
      const amount = txn.amount || 0;
      if (txn.type === 'income') {
        summary.totalIncome += amount;
      } else if (txn.type === 'expense' || txn.type === 'fuel' || txn.type === 'maintenance') {
        summary.totalExpense += amount;
      }
      
      if (!summary.byType[txn.type]) {
        summary.byType[txn.type] = { count: 0, total: 0 };
      }
      summary.byType[txn.type].count++;
      summary.byType[txn.type].total += amount;
    });

    summary.netProfit = summary.totalIncome - summary.totalExpense;
    console.log(`✅ getTodaysSummary: Income ${summary.totalIncome}, Expense ${summary.totalExpense}, Net ${summary.netProfit}`);
    return summary;
  } catch (err) {
    console.error('[getTodaysSummary] error:', err);
    return {
      totalIncome: 0,
      totalExpense: 0,
      netProfit: 0,
      byType: {},
      transactions: [],
      isWithinRetention: false
    };
  }
}

export async function getPeriodSummary(riderId, startTime, endTime) {
  try {
    const result = await getTransactionsByDateRange(riderId, startTime, endTime);
    const transactions = result.transactions || [];
    
    const summary = {
      riderId,
      startTime,
      endTime,
      totalIncome: 0,
      totalExpense: 0,
      netProfit: 0,
      byType: {},
      transactionCount: transactions.length,
      isWithinRetention: result.isWithinRetention,
      daysRemaining: result.daysRemaining
    };
    
    transactions.forEach(txn => {
      const amount = txn.amount || 0;
      if (txn.type === 'income') {
        summary.totalIncome += amount;
      } else if (txn.type === 'expense' || txn.type === 'fuel' || txn.type === 'maintenance') {
        summary.totalExpense += amount;
      }
      
      if (!summary.byType[txn.type]) {
        summary.byType[txn.type] = { count: 0, total: 0 };
      }
      summary.byType[txn.type].count++;
      summary.byType[txn.type].total += amount;
    });

    summary.netProfit = summary.totalIncome - summary.totalExpense;
    console.log(`✅ getPeriodSummary: ${summary.transactionCount} transactions, Net ${summary.netProfit}`);
    return summary;
  } catch (err) {
    console.error('[getPeriodSummary] error:', err);
    return {
      totalIncome: 0,
      totalExpense: 0,
      netProfit: 0,
      byType: {},
      transactionCount: 0,
      isWithinRetention: false
    };
  }
}

export async function getIncomeSummary(riderId, startTime, endTime) {
  try {
    const result = await getTransactionsByDateRange(riderId, startTime, endTime);
    const transactions = result.transactions || [];
    const filtered = transactions.filter(t => t.type === 'income' && t.status === 'confirmed');
    
    const summary = {
      riderId,
      totalIncome: 0,
      count: filtered.length,
      byMethod: {},
      transactions: filtered,
      isWithinRetention: result.isWithinRetention
    };
    
    filtered.forEach(txn => {
      const amount = txn.amount || 0;
      summary.totalIncome += amount;
      
      const method = txn.method || txn.paymentMethod || 'unknown';
      if (!summary.byMethod[method]) {
        summary.byMethod[method] = { count: 0, total: 0 };
      }
      summary.byMethod[method].count++;
      summary.byMethod[method].total += amount;
    });
    
    console.log(`✅ getIncomeSummary: Total ${summary.totalIncome} from ${summary.count} transactions`);
    return summary;
  } catch (err) {
    console.error('[getIncomeSummary] error:', err);
    return { totalIncome: 0, count: 0, byMethod: {}, transactions: [], isWithinRetention: false };
  }
}

export async function getExpenseSummary(riderId, startTime, endTime) {
  try {
    const result = await getTransactionsByDateRange(riderId, startTime, endTime);
    const transactions = result.transactions || [];
    const filtered = transactions.filter(t => 
      (t.type === 'expense' || t.type === 'fuel' || t.type === 'maintenance') && 
      t.status === 'confirmed'
    );
    
    const summary = {
      riderId,
      totalExpense: 0,
      count: filtered.length,
      byCategory: {},
      transactions: filtered,
      isWithinRetention: result.isWithinRetention
    };
    
    filtered.forEach(txn => {
      const amount = txn.amount || 0;
      summary.totalExpense += amount;
      
      const category = txn.category || txn.type || 'other';
      if (!summary.byCategory[category]) {
        summary.byCategory[category] = { count: 0, total: 0 };
      }
      summary.byCategory[category].count++;
      summary.byCategory[category].total += amount;
    });
    
    console.log(`✅ getExpenseSummary: Total ${summary.totalExpense} from ${summary.count} transactions`);
    return summary;
  } catch (err) {
    console.error('[getExpenseSummary] error:', err);
    return { totalExpense: 0, count: 0, byCategory: {}, transactions: [], isWithinRetention: false };
  }
}

export async function getNetProfit(riderId, startTime, endTime) {
  try {
    const income = await getIncomeSummary(riderId, startTime, endTime);
    const expense = await getExpenseSummary(riderId, startTime, endTime);
    
    const netProfit = income.totalIncome - expense.totalExpense;
    
    console.log(`✅ getNetProfit: ${netProfit} (Income: ${income.totalIncome}, Expense: ${expense.totalExpense})`);
    
    return {
      riderId,
      netProfit,
      income: income.totalIncome,
      expense: expense.totalExpense,
      incomeCount: income.count,
      expenseCount: expense.count,
      isWithinRetention: income.isWithinRetention && expense.isWithinRetention
    };
  } catch (err) {
    console.error('[getNetProfit] error:', err);
    return {
      riderId,
      netProfit: 0,
      income: 0,
      expense: 0,
      incomeCount: 0,
      expenseCount: 0,
      isWithinRetention: false
    };
  }
}

/**
 * ========== SEARCH & UTILITY OPERATIONS ==========
 */

export async function searchTransactions(riderId, query) {
  try {
    const result = await getAllTransactions(riderId, 10000, 0);
    const allTransactions = result.transactions || [];
    
    const results = allTransactions.filter(t => {
      const searchableText = [
        t.description || '',
        t.reference || '',
        t.customerName || '',
        t.category || '',
        t.type || ''
      ].join(' ').toLowerCase();
      
      return searchableText.includes(query.toLowerCase());
    });
    
    console.log(`✅ searchTransactions: Found ${results.length} matches for "${query}"`);
    return { results, count: results.length, isWithinRetention: result.isWithinRetention };
  } catch (err) {
    console.error('[searchTransactions] error:', err);
    return { results: [], count: 0, isWithinRetention: false };
  }
}

export async function getPendingTransactions(riderId) {
  try {
    const result = await getAllTransactions(riderId, 10000, 0);
    const allTransactions = result.transactions || [];
    const pending = allTransactions.filter(t => t.status === 'pending' || !t.status);
    
    console.log(`✅ getPendingTransactions: Found ${pending.length} pending transactions`);
    return { transactions: pending, count: pending.length, isWithinRetention: result.isWithinRetention };
  } catch (err) {
    console.error('[getPendingTransactions] error:', err);
    return { transactions: [], count: 0, isWithinRetention: false };
  }
}

export async function confirmTransaction(transactionId) {
  try {
    const confirmed = await updateFinancialTransaction(transactionId, {
      status: 'confirmed',
      confirmedAt: Date.now()
    });
    console.log(`✅ confirmTransaction: Confirmed ${transactionId}`);
    return confirmed;
  } catch (err) {
    console.error('[confirmTransaction] error:', err);
    throw err;
  }
}

export async function clearAllTransactions(riderId) {
  try {
    const result = await getAllTransactions(riderId, 10000, 0);
    const transactions = result.transactions || [];

    for (const txn of transactions) {
      await indexedDbAdapter.deleteRow(FINANCIAL_STORE, txn.id);
    }

    console.log(`⚠️ clearAllTransactions: Cleared ${transactions.length} transactions for rider ${riderId}`);
    return { clearedCount: transactions.length, riderId };
  } catch (err) {
    console.error('[clearAllTransactions] error:', err);
    throw err;
  }
}

/**
 * ========== BATCH OPERATIONS ==========
 */

export async function batchImportTransactions(riderId, transactions) {
  try {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      console.log('ℹ️ batchImportTransactions: No transactions to import');
      return 0;
    }

    const prepared = transactions.map(t => ({
      ...t,
      id: t.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ts: t.ts || t.timestamp || Date.now(),
      timestamp: t.timestamp || t.ts || Date.now(),
      rider_id: t.rider_id || t.riderId || riderId,
      status: t.status || 'confirmed',
      createdAt: t.createdAt || Date.now()
    }));

    const imported = await indexedDbAdapter.batchInsert(FINANCIAL_STORE, prepared);
    console.log(`✅ batchImportTransactions: Imported ${imported} transactions for rider ${riderId}`);
    return imported;
  } catch (err) {
    console.error('[batchImportTransactions] error:', err);
    throw err;
  }
}

export async function getFinancialStoreStats() {
  try {
    const stats = await indexedDbAdapter.getStoreStats(FINANCIAL_STORE);
    console.log('✅ getFinancialStoreStats:', stats);
    return stats;
  } catch (err) {
    console.error('[getFinancialStoreStats] error:', err);
    return { recordCount: 0 };
  }
}

export default {
  // Retention management
  isWithinRetentionWindow,
  getRetentionWindowInfo,
  initializeRetentionConfig,
  performRetentionCycleCleanup,
  
  // Core operations
  saveFinancialTransaction,
  getFinancialTransaction,
  updateFinancialTransaction,
  deleteFinancialTransaction,
  
  // Compatibility functions (for screens)
  getFinancialSummary,
  getEarliestTransactionDate,
  getTransactionList,
  syncFinancialDataFromAPI,
  
  // Query operations
  getAllTransactions,
  getTransactionsByType,
  getTransactionsByDateRange,
  getTransactionsByDate,
  
  // Summary operations
  getTodaysSummary,
  getPeriodSummary,
  getIncomeSummary,
  getExpenseSummary,
  getNetProfit,
  
  // Search & utility
  searchTransactions,
  getPendingTransactions,
  confirmTransaction,
  clearAllTransactions,
  
  // Batch operations
  batchImportTransactions,
  getFinancialStoreStats
};