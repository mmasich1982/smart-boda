/**
 * statementRetentionPolicy.js
 * ✅ Smart Boda 6-Month Retention Policy Implementation
 * 
 * KEY RULES:
 * 1. All customer data is stored in IndexedDB upon onboarding
 * 2. IndexedDB retains data for 6 months from onboarding date
 * 3. If statement request is within 6-month window → Generate locally from IndexedDB
 * 4. If statement request extends beyond 6-month window → Route to Smart Boda Admin
 * 5. At end of 6 months, IndexedDB is cleared for next cycle
 */

import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getLocalRiderStatus } from '../../offline/db';

/**
 * Get rider's onboarding date from IndexedDB
 * Fallback: use current date if not found
 */
export const getRiderOnboardingDate = async () => {
  try {
    const riderStatus = await getLocalRiderStatus();
    
    if (riderStatus?.onboarded_at) {
      return new Date(riderStatus.onboarded_at);
    }
    
    // Fallback: try to get from local cache
    const cachedOnboarding = await indexedDbAdapter.kvGet('rider_onboarding_date');
    if (cachedOnboarding) {
      const date = typeof cachedOnboarding === 'string' 
        ? new Date(cachedOnboarding) 
        : cachedOnboarding;
      return date;
    }
    
    // If still not found, assume today is onboarding date
    console.warn('⚠️ Onboarding date not found, defaulting to today');
    return new Date();
  } catch (err) {
    console.error('❌ Error getting onboarding date:', err);
    return new Date();
  }
};

/**
 * Check if a date range is within the 6-month IndexedDB retention window
 * 
 * @param {Date} startDate - Start of the requested date range
 * @param {Date} endDate - End of the requested date range
 * @returns {Promise<boolean>} - true if fully within window, false if extends beyond
 */
export const isWithinRetentionWindow = async (startDate, endDate) => {
  try {
    const onboardingDate = await getRiderOnboardingDate();
    const sixMonthsLater = new Date(onboardingDate);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    
    // Both start and end must be before 6-month cutoff
    const isWithinWindow = endDate <= sixMonthsLater;
    
    console.log('📅 Retention Window Check:', {
      onboardingDate: onboardingDate.toISOString(),
      sixMonthsCutoff: sixMonthsLater.toISOString(),
      requestStartDate: startDate.toISOString(),
      requestEndDate: endDate.toISOString(),
      isWithinWindow,
    });
    
    return isWithinWindow;
  } catch (err) {
    console.error('❌ Error checking retention window:', err);
    // Default to false (route to admin) if uncertain
    return false;
  }
};

/**
 * Get days remaining in 6-month retention window
 * @returns {Promise<number>} - Days remaining (negative if window closed)
 */
export const getDaysRemainingInWindow = async () => {
  try {
    const onboardingDate = await getRiderOnboardingDate();
    const sixMonthsLater = new Date(onboardingDate);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    
    const now = new Date();
    const daysRemaining = Math.ceil((sixMonthsLater - now) / (1000 * 60 * 60 * 24));
    
    return daysRemaining;
  } catch (err) {
    console.error('❌ Error calculating days remaining:', err);
    return 0;
  }
};

/**
 * Generate SUMMARY statement from IndexedDB transactions
 * Returns null if data insufficient or outside retention window
 */
export const generateSummaryStatementFromIndexedDB = async (
  riderId,
  month,
  year
) => {
  try {
    // Validate month/year are within retention window
    const startDate = new Date(year, parseInt(month) - 1, 1);
    const endDate = new Date(year, parseInt(month), 0, 23, 59, 59);
    
    const isWithinWindow = await isWithinRetentionWindow(startDate, endDate);
    if (!isWithinWindow) {
      console.log('⏱️ Statement request outside 6-month retention window');
      return null;
    }
    
    // Get all transactions for this rider from IndexedDB
    const cacheKey = `financial_history_${riderId}`;
    const cachedTransactions = await indexedDbAdapter.kvGet(cacheKey);
    
    if (!cachedTransactions) {
      console.warn('⚠️ No transaction data in IndexedDB');
      return null;
    }
    
    let transactions = [];
    if (typeof cachedTransactions === 'string') {
      transactions = JSON.parse(cachedTransactions);
    } else {
      transactions = Array.isArray(cachedTransactions) 
        ? cachedTransactions 
        : cachedTransactions.transactions || [];
    }
    
    // Filter transactions for the requested month/year
    const monthTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.date || tx.created_at || 0);
      return (
        txDate.getFullYear() === parseInt(year) &&
        txDate.getMonth() === parseInt(month) - 1
      );
    });
    
    // Calculate totals
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalTransactions = monthTransactions.length;
    
    monthTransactions.forEach(tx => {
      if (tx.type === 'credit' || tx.type === 'income') {
        totalIncome += tx.amount || 0;
      } else if (tx.type === 'debit' || tx.type === 'expense') {
        totalExpenses += tx.amount || 0;
      }
    });
    
    const netProfit = totalIncome - totalExpenses;
    
    const statement = {
      id: `summary_${riderId}_${month}_${year}_${Date.now()}`,
      type: 'summary',
      month: String(month).padStart(2, '0'),
      year: String(year),
      rider_id: riderId,
      generated_at: new Date().toISOString(),
      generated_locally: true, // Mark as locally generated
      
      // Summary data
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      total_transactions: totalTransactions,
      
      // Metadata
      data_source: 'indexeddb',
      retention_status: 'within_window',
    };
    
    console.log('✅ Generated summary statement from IndexedDB:', statement);
    return statement;
  } catch (err) {
    console.error('❌ Error generating summary statement from IndexedDB:', err);
    return null;
  }
};

/**
 * Generate DETAILED statement from IndexedDB transactions
 * Returns null if data insufficient or outside retention window
 */
export const generateDetailedStatementFromIndexedDB = async (
  riderId,
  month,
  year
) => {
  try {
    // Validate month/year are within retention window
    const startDate = new Date(year, parseInt(month) - 1, 1);
    const endDate = new Date(year, parseInt(month), 0, 23, 59, 59);
    
    const isWithinWindow = await isWithinRetentionWindow(startDate, endDate);
    if (!isWithinWindow) {
      console.log('⏱️ Detailed statement request outside 6-month retention window');
      return null;
    }
    
    // Get all transactions for this rider from IndexedDB
    const cacheKey = `financial_history_${riderId}`;
    const cachedTransactions = await indexedDbAdapter.kvGet(cacheKey);
    
    if (!cachedTransactions) {
      console.warn('⚠️ No transaction data in IndexedDB');
      return null;
    }
    
    let transactions = [];
    if (typeof cachedTransactions === 'string') {
      transactions = JSON.parse(cachedTransactions);
    } else {
      transactions = Array.isArray(cachedTransactions) 
        ? cachedTransactions 
        : cachedTransactions.transactions || [];
    }
    
    // Filter transactions for the requested month/year
    const monthTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.date || tx.created_at || 0);
      return (
        txDate.getFullYear() === parseInt(year) &&
        txDate.getMonth() === parseInt(month) - 1
      );
    }).sort((a, b) => {
      const dateA = new Date(a.date || a.created_at).getTime();
      const dateB = new Date(b.date || b.created_at).getTime();
      return dateB - dateA; // Newest first
    });
    
    // Calculate totals and build breakdown
    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryBreakdown = {};
    
    monthTransactions.forEach(tx => {
      const amount = tx.amount || 0;
      const category = tx.category || tx.type || 'Other';
      
      if (tx.type === 'credit' || tx.type === 'income') {
        totalIncome += amount;
        categoryBreakdown['Income'] = (categoryBreakdown['Income'] || 0) + amount;
      } else if (tx.type === 'debit' || tx.type === 'expense') {
        totalExpenses += amount;
        categoryBreakdown[category] = (categoryBreakdown[category] || 0) + amount;
      }
    });
    
    const netProfit = totalIncome - totalExpenses;
    
    const statement = {
      id: `detailed_${riderId}_${month}_${year}_${Date.now()}`,
      type: 'detailed',
      month: String(month).padStart(2, '0'),
      year: String(year),
      rider_id: riderId,
      generated_at: new Date().toISOString(),
      generated_locally: true, // Mark as locally generated
      
      // Summary totals
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      
      // Detailed breakdown
      breakdown: categoryBreakdown,
      transaction_count: monthTransactions.length,
      transactions: monthTransactions.slice(0, 100), // Include recent 100 transactions
      
      // Metadata
      data_source: 'indexeddb',
      retention_status: 'within_window',
      includes_all_transactions: monthTransactions.length <= 100,
    };
    
    console.log('✅ Generated detailed statement from IndexedDB:', statement);
    return statement;
  } catch (err) {
    console.error('❌ Error generating detailed statement from IndexedDB:', err);
    return null;
  }
};

/**
 * Cache a generated statement in IndexedDB for offline access
 */
export const cacheGeneratedStatement = async (statement) => {
  try {
    const cacheKey = `cached_statement_${statement.id}`;
    await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(statement));
    console.log('✅ Cached generated statement:', statement.id);
    return true;
  } catch (err) {
    console.error('❌ Error caching statement:', err);
    return false;
  }
};

/**
 * Determine whether to generate locally or route to admin team
 * Returns: { shouldGenerateLocally: boolean, reason: string }
 */
export const determineStatementRoute = async (month, year) => {
  try {
    const startDate = new Date(year, parseInt(month) - 1, 1);
    const endDate = new Date(year, parseInt(month), 0, 23, 59, 59);
    
    const isWithinWindow = await isWithinRetentionWindow(startDate, endDate);
    
    if (isWithinWindow) {
      return {
        shouldGenerateLocally: true,
        reason: 'Statement is within 6-month IndexedDB retention window',
      };
    } else {
      return {
        shouldGenerateLocally: false,
        reason: 'Statement extends beyond 6-month retention window - routing to Smart Boda Admin team',
      };
    }
  } catch (err) {
    console.error('❌ Error determining statement route:', err);
    // Default to admin route if uncertain
    return {
      shouldGenerateLocally: false,
      reason: 'Unable to determine retention status - routing to admin team for safety',
    };
  }
};
