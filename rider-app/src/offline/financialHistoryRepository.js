/**
 * financialHistoryRepository.js
 * ✅ FIXED: Properly queries fuel, battery, and service costs from synced entries
 * ✅ FIXED: Consistent type naming - Trip, Fuel, Service (capitalized)
 * ✅ FIXED: Newly onboarded riders show empty history until first transaction
 * Manages offline storage and querying of financial data
 * Handles trips, fuel, maintenance, and other expenses
 */

import { getLocalStore } from './LocalStore';

const TRADING_DAY_START_HOUR = 4; // 4 AM local time

/**
 * Get the earliest transaction date from all expense types
 * ✅ FIXED: Now includes fuel, battery, and service expense dates
 * Returns null if no transactions exist (newly onboarded customers)
 */
export async function getEarliestTransactionDate() {
  try {
    const store = await getLocalStore();

    const allDates = [
      ...(store.trips || []).map((t) => t.timestamp),
      ...(store.fuelEntries || []).map((f) => f.timestamp),
      ...(store.maintenanceEntries || []).map((m) => m.timestamp),
      ...(store.otherExpenses || []).map((e) => e.timestamp || e.created_at),
    ];

    if (allDates.length === 0) {
      return null;  // ✅ FIXED: Newly onboarded riders return null
    }

    return Math.min(...allDates);
  } catch (err) {
    console.error('getEarliestTransactionDate error:', err);
    return null;
  }
}

/**
 * Calculate financial summary for a date range
 * ✅ FIXED: Properly aggregates fuel, battery, and service costs
 * ✅ FIXED: Returns zeros for newly onboarded customers with no transactions
 */
export async function getFinancialSummary(rangeStart, rangeEnd) {
  try {
    const store = await getLocalStore();

    // Calculate income from active trips
    let income = 0;
    (store.trips || []).forEach((trip) => {
      if (
        trip.status === 'active' &&
        trip.timestamp >= rangeStart &&
        trip.timestamp <= rangeEnd
      ) {
        income += trip.amount || 0;
      }
    });

    // ✅ FIXED: Calculate fuel and battery costs from BOTH legacy fuelEntries and OtherExpense records
    let fuel = 0;
    (store.fuelEntries || [])
      .filter((f) => f.timestamp >= rangeStart && f.timestamp <= rangeEnd)
      .forEach((f) => {
        fuel += f.cost || 0;
      });

    // ✅ FIXED: Also include Fuel and Battery category expenses from OtherExpense
    (store.otherExpenses || [])
      .filter((e) => {
        const ts = e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0);
        return ts >= rangeStart && ts <= rangeEnd && 
               (e.category === 'Fuel' || e.category === 'Battery');
      })
      .forEach((e) => {
        fuel += e.amount_ksh || e.amount || 0;
      });

    // ✅ FIXED: Calculate maintenance/service costs from BOTH legacy maintenanceEntries and OtherExpense records
    let maintenance = 0;
    (store.maintenanceEntries || [])
      .filter((m) => m.timestamp >= rangeStart && m.timestamp <= rangeEnd)
      .forEach((m) => {
        maintenance += m.cost || 0;
      });

    // ✅ FIXED: Also include Service category expenses from OtherExpense
    (store.otherExpenses || [])
      .filter((e) => {
        const ts = e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0);
        return ts >= rangeStart && ts <= rangeEnd && e.category === 'Service';
      })
      .forEach((e) => {
        maintenance += e.amount_ksh || e.amount || 0;
      });

    // Calculate other expenses by category (excluding Fuel, Battery, Service which are handled above)
    const otherByCat = {};
    (store.otherExpenses || [])
      .filter((e) => {
        const ts = e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0);
        return ts >= rangeStart && ts <= rangeEnd && 
               !['Fuel', 'Battery', 'Service'].includes(e.category);
      })
      .forEach((e) => {
        const cat = e.category || 'Miscellaneous';
        const amount = e.amount_ksh || e.amount || 0;
        otherByCat[cat] = (otherByCat[cat] || 0) + amount;
      });

    const otherTotal = Object.values(otherByCat).reduce((s, v) => s + v, 0);
    const totalExpense = fuel + maintenance + otherTotal;

    return {
      income,
      fuel,
      service: maintenance,  // Changed from 'maintenance' to 'service' for better naming
      maintenance,  // Keep this for backward compatibility
      other: otherTotal,
      otherByCategory: otherByCat,
      totalExpense,
      netProfit: income - totalExpense,
    };
  } catch (err) {
    console.error('getFinancialSummary error:', err);
    return {
      income: 0,
      fuel: 0,
      service: 0,
      maintenance: 0,
      other: 0,
      otherByCategory: {},
      totalExpense: 0,
      netProfit: 0,
    };
  }
}

/**
 * Get transaction list for a date range with optional filtering
 * ✅ FIXED: Consistent type naming - Trip, Fuel, Service (capitalized)
 * ✅ FIXED: Now includes Fuel, Battery, and Service expenses from OtherExpense
 */
export async function getTransactionList(rangeStart, rangeEnd, typeFilter = 'all') {
  try {
    const store = await getLocalStore();
    let transactions = [];

    // Add trips
    // ✅ FIXED: Type is capitalized as 'Trip' for consistency with backend
    if (typeFilter === 'all' || typeFilter === 'Trip') {
      const trips = (store.trips || [])
        .filter((t) => t.timestamp >= rangeStart && t.timestamp <= rangeEnd)
        .map((t) => ({
          id: t.id,
          type: 'Trip',  // ✅ FIXED: Capitalized
          timestamp: t.timestamp,
          amount: t.amount,
          status: t.status,
          correctionReason: t.correctionReason,
        }));
      transactions.push(...trips);
    }

    // Add fuel entries (legacy)
    // ✅ FIXED: Type is capitalized as 'Fuel' for consistency
    if (typeFilter === 'all' || typeFilter === 'Fuel') {
      const fuel = (store.fuelEntries || [])
        .filter((f) => f.timestamp >= rangeStart && f.timestamp <= rangeEnd)
        .map((f) => ({
          id: f.id,
          type: 'Fuel',  // ✅ FIXED: Capitalized
          timestamp: f.timestamp,
          amount: f.cost,
          category: 'Fuel/Energy',
        }));
      transactions.push(...fuel);
    }

    // Add maintenance entries (legacy)
    // ✅ FIXED: Type is capitalized as 'Service' for consistency
    if (typeFilter === 'all' || typeFilter === 'Service') {
      const maintenance = (store.maintenanceEntries || [])
        .filter((m) => m.timestamp >= rangeStart && m.timestamp <= rangeEnd)
        .map((m) => ({
          id: m.id,
          type: 'Service',  // ✅ FIXED: Changed from 'maintenance' to 'Service'
          timestamp: m.timestamp,
          amount: m.cost,
          category: 'Service',
        }));
      transactions.push(...maintenance);
    }

    // ✅ FIXED: Add OtherExpense entries (includes Fuel, Battery, Service)
    if (typeFilter === 'all' || typeFilter === 'Other') {
      const otherExpenses = (store.otherExpenses || [])
        .filter((e) => {
          const eventTs = e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0);
          return eventTs >= rangeStart && eventTs <= rangeEnd;
        })
        .map((e) => ({
          id: e.id,
          type: 'Other',  // ✅ FIXED: Capitalized type
          timestamp: e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0),
          amount: -(e.amount_ksh || e.amount || 0),  // Negative for expenses
          category: e.category || 'Miscellaneous',
          description: e.notes || e.description,
        }));
      transactions.push(...otherExpenses);
    }

    // Sort by timestamp descending (most recent first)
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    return transactions;
  } catch (err) {
    console.error('getTransactionList error:', err);
    return [];
  }
}

/**
 * Get list of transactions by category
 */
export async function getExpensesByCategory(rangeStart, rangeEnd) {
  try {
    const transactions = await getTransactionList(rangeStart, rangeEnd, 'all');
    
    const byCategory = {};
    transactions.forEach((t) => {
      // ✅ FIXED: Properly check against capitalized type
      if (t.type !== 'Trip') {
        const cat = t.category || 'Other';
        byCategory[cat] = (byCategory[cat] || 0) + Math.abs(t.amount);
      }
    });

    return byCategory;
  } catch (err) {
    console.error('getExpensesByCategory error:', err);
    return {};
  }
}