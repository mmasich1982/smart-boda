/**
 * Financial History Repository - COMPLETE INDEXEDDB MIGRATION
 * Manages offline storage of financial data including:
 * - Transaction history
 * - Statement records
 * - Income tracking
 * - Expense tracking
 * 
 * MIGRATION NOTES:
 * ✅ Transitioned from LocalStorage to IndexedDB
 * ✅ All operations are fully async/await
 * ✅ Structured queries with indexes on type, date, timestamp
 * ✅ Maintains backward compatibility with existing financial logic
 */

import * as db from './adapters/indexedDbAdapter';

const FINANCIAL_STORE = 'financialHistory';

/**
 * Save financial transaction
 * Types: 'income', 'expense', 'fuel', 'maintenance', 'savings', 'lipa_later'
 */
export async function saveFinancialTransaction(transaction) {
  try {
    // Validate required fields
    if (!transaction.type || !transaction.amount) {
      throw new Error('Transaction must have type and amount');
    }

    // Ensure timestamps and IDs
    const ts = transaction.ts || transaction.timestamp || Date.now();
    transaction.ts = transaction.ts || ts;
    transaction.timestamp = transaction.timestamp || ts;
    transaction.id = transaction.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    transaction.date = transaction.date || new Date(ts).toISOString().split('T')[0];
    
    // Ensure status
    transaction.status = transaction.status || 'confirmed';

    const saved = await db.insertRow(FINANCIAL_STORE, transaction);
    console.log(`✅ saveFinancialTransaction: Saved ${transaction.type} transaction ${transaction.id}`);
    return transaction.id;
  } catch (err) {
    console.error('[saveFinancialTransaction] error:', err);
    throw err;
  }
}

/**
 * Get financial transaction by ID
 */
export async function getFinancialTransaction(transactionId) {
  try {
    const transaction = await db.getRow(FINANCIAL_STORE, transactionId);
    
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

/**
 * Update financial transaction
 */
export async function updateFinancialTransaction(transactionId, updates) {
  try {
    const updated = await db.updateRow(FINANCIAL_STORE, transactionId, {
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

/**
 * Delete financial transaction
 */
export async function deleteFinancialTransaction(transactionId) {
  try {
    await db.deleteRow(FINANCIAL_STORE, transactionId);
    console.log(`✅ deleteFinancialTransaction: Deleted ${transactionId}`);
    return true;
  } catch (err) {
    console.error('[deleteFinancialTransaction] error:', err);
    throw err;
  }
}

/**
 * Get all transactions (paginated for performance)
 */
export async function getAllTransactions(limit = 1000, offset = 0) {
  try {
    const allTransactions = await db.queryRows(FINANCIAL_STORE);
    
    // Sort by timestamp descending (most recent first)
    allTransactions.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    // Paginate
    const paginated = allTransactions.slice(offset, offset + limit);
    
    console.log(`✅ getAllTransactions: Found ${allTransactions.length} total, returning ${paginated.length}`);
    return paginated;
  } catch (err) {
    console.error('[getAllTransactions] error:', err);
    return [];
  }
}

/**
 * Get transactions by type using IndexedDB index
 * Types: 'income', 'expense', 'fuel', 'maintenance', 'savings', 'lipa_later'
 */
export async function getTransactionsByType(type, limit = 1000) {
  try {
    const transactions = await db.queryByIndex(FINANCIAL_STORE, 'type', type);
    
    // Sort by timestamp descending
    transactions.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    // Apply limit
    const limited = transactions.slice(0, limit);
    
    console.log(`✅ getTransactionsByType: Found ${limited.length} transactions of type ${type}`);
    return limited;
  } catch (err) {
    console.error('[getTransactionsByType] error:', err);
    return [];
  }
}

/**
 * Get transactions by date range
 * Returns transactions where ts/timestamp falls within [startTime, endTime]
 */
export async function getTransactionsByDateRange(startTime, endTime) {
  try {
    const transactions = await db.queryByRange(FINANCIAL_STORE, 'ts', startTime, endTime);
    
    // Sort by timestamp descending
    transactions.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    console.log(`✅ getTransactionsByDateRange: Found ${transactions.length} transactions`);
    return transactions;
  } catch (err) {
    console.error('[getTransactionsByDateRange] error:', err);
    return [];
  }
}

/**
 * Get transactions for a specific date (YYYY-MM-DD)
 */
export async function getTransactionsByDate(dateString) {
  try {
    // dateString format: "2024-01-15"
    const startOfDay = new Date(`${dateString}T00:00:00Z`).getTime();
    const endOfDay = new Date(`${dateString}T23:59:59Z`).getTime();
    
    const transactions = await db.queryByRange(FINANCIAL_STORE, 'ts', startOfDay, endOfDay);
    
    // Sort by timestamp descending
    transactions.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    console.log(`✅ getTransactionsByDate: Found ${transactions.length} transactions for ${dateString}`);
    return transactions;
  } catch (err) {
    console.error('[getTransactionsByDate] error:', err);
    return [];
  }
}

/**
 * Get today's financial summary
 * Returns income, expense totals by category
 */
export async function getTodaysSummary() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEnd = todayStart + (24 * 60 * 60 * 1000);
    
    const todaysTransactions = await db.queryByRange(FINANCIAL_STORE, 'ts', todayStart, todayEnd);
    
    const summary = {
      totalIncome: 0,
      totalExpense: 0,
      byType: {},
      transactions: todaysTransactions
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
    
    console.log(`✅ getTodaysSummary: Income ${summary.totalIncome}, Expense ${summary.totalExpense}`);
    return summary;
  } catch (err) {
    console.error('[getTodaysSummary] error:', err);
    return { totalIncome: 0, totalExpense: 0, byType: {}, transactions: [] };
  }
}

/**
 * Get period summary (e.g., weekly, monthly)
 */
export async function getPeriodSummary(startTime, endTime) {
  try {
    const transactions = await db.queryByRange(FINANCIAL_STORE, 'ts', startTime, endTime);
    
    const summary = {
      startTime,
      endTime,
      totalIncome: 0,
      totalExpense: 0,
      byType: {},
      transactionCount: transactions.length
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
      startTime,
      endTime,
      totalIncome: 0,
      totalExpense: 0,
      byType: {},
      transactionCount: 0,
      netProfit: 0
    };
  }
}

/**
 * Get income summary
 */
export async function getIncomeSummary(startTime, endTime) {
  try {
    const incomeTransactions = await db.queryByRange(FINANCIAL_STORE, 'ts', startTime, endTime);
    const filtered = incomeTransactions.filter(t => t.type === 'income' && t.status === 'confirmed');
    
    const summary = {
      totalIncome: 0,
      count: filtered.length,
      byMethod: {},
      transactions: filtered
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
    return { totalIncome: 0, count: 0, byMethod: {}, transactions: [] };
  }
}

/**
 * Get expense summary
 */
export async function getExpenseSummary(startTime, endTime) {
  try {
    const expenseTransactions = await db.queryByRange(FINANCIAL_STORE, 'ts', startTime, endTime);
    const filtered = expenseTransactions.filter(t => 
      (t.type === 'expense' || t.type === 'fuel' || t.type === 'maintenance') && 
      t.status === 'confirmed'
    );
    
    const summary = {
      totalExpense: 0,
      count: filtered.length,
      byCategory: {},
      transactions: filtered
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
    return { totalExpense: 0, count: 0, byCategory: {}, transactions: [] };
  }
}

/**
 * Get net profit for a period
 */
export async function getNetProfit(startTime, endTime) {
  try {
    const income = await getIncomeSummary(startTime, endTime);
    const expense = await getExpenseSummary(startTime, endTime);
    
    const netProfit = income.totalIncome - expense.totalExpense;
    
    console.log(`✅ getNetProfit: ${netProfit} (Income: ${income.totalIncome}, Expense: ${expense.totalExpense})`);
    
    return {
      netProfit,
      income: income.totalIncome,
      expense: expense.totalExpense,
      incomeCount: income.count,
      expenseCount: expense.count
    };
  } catch (err) {
    console.error('[getNetProfit] error:', err);
    return { netProfit: 0, income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };
  }
}

/**
 * Search transactions by description/reference
 */
export async function searchTransactions(query) {
  try {
    const allTransactions = await db.queryRows(FINANCIAL_STORE);
    
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
    return results;
  } catch (err) {
    console.error('[searchTransactions] error:', err);
    return [];
  }
}

/**
 * Get pending transactions (not yet confirmed)
 */
export async function getPendingTransactions() {
  try {
    const allTransactions = await db.queryRows(FINANCIAL_STORE);
    
    const pending = allTransactions.filter(t => t.status === 'pending' || !t.status);
    
    console.log(`✅ getPendingTransactions: Found ${pending.length} pending transactions`);
    return pending;
  } catch (err) {
    console.error('[getPendingTransactions] error:', err);
    return [];
  }
}

/**
 * Confirm transaction
 */
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

/**
 * Clear all financial history (use with caution!)
 */
export async function clearAllTransactions() {
  try {
    await db.clearStore(FINANCIAL_STORE);
    console.log(`⚠️ clearAllTransactions: Cleared all financial transactions`);
  } catch (err) {
    console.error('[clearAllTransactions] error:', err);
    throw err;
  }
}

export default {
  saveFinancialTransaction,
  getFinancialTransaction,
  updateFinancialTransaction,
  deleteFinancialTransaction,
  getAllTransactions,
  getTransactionsByType,
  getTransactionsByDateRange,
  getTransactionsByDate,
  getTodaysSummary,
  getPeriodSummary,
  getIncomeSummary,
  getExpenseSummary,
  getNetProfit,
  searchTransactions,
  getPendingTransactions,
  confirmTransaction,
  clearAllTransactions
};