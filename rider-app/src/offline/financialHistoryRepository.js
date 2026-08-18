/**
 * financialHistoryRepository.js - FIXED VERSION 2.0
 * ✅ FIXED: Now properly retrieves fuel, battery, and service costs from API and local storage
 * ✅ FIXED: Syncs expense data from backend to local store
 * ✅ FIXED: Consistent type naming - Trip, Fuel, Service (capitalized)
 * ✅ FIXED: Newly onboarded riders show empty history until first transaction
 * ✅ FIXED: Handles both legacy and new OtherExpense format
 * 
 * Manages offline storage and querying of financial data
 * Handles trips, fuel, maintenance, and other expenses
 */

import { getLocalStore, kvGet, kvSet } from './LocalStore';
import api from '../api/client';

const TRADING_DAY_START_HOUR = 4; // 4 AM local time

// ============================================================================
// DATA SYNC FROM API
// ============================================================================

/**
 * ✅ FIXED: Sync financial data from backend API to local storage
 * This is called periodically to ensure expense data is cached locally
 * @param {string} riderId - Current rider ID
 * @param {string} period - Period to sync (all_time, this_month, etc.)
 */
export async function syncFinancialDataFromAPI(riderId, period = 'all_time') {
  try {
    console.log(`[syncFinancialDataFromAPI] Syncing financial data for rider ${riderId}, period: ${period}`);
    
    if (!riderId) {
      console.warn('[syncFinancialDataFromAPI] No rider ID provided');
      return false;
    }

    // Fetch financial summary from API
    try {
      const response = await api.get('/api/v1/financial/summary', {
        params: {
          rider_id: riderId,
          period: period,
        }
      });

      if (response.data && response.data.summary) {
        // Cache the summary data
        await kvSet(`financial_summary_${period}`, {
          summary: response.data.summary,
          period_start: response.data.period_start,
          period_end: response.data.period_end,
          synced_at: new Date().toISOString(),
        });
        
        console.log(`[syncFinancialDataFromAPI] Successfully synced financial summary for period: ${period}`);
      }
    } catch (err) {
      console.warn('[syncFinancialDataFromAPI] Failed to fetch summary:', err.message);
    }

    // Fetch transaction list from API
    try {
      const response = await api.get('/api/v1/financial/transactions', {
        params: {
          rider_id: riderId,
          period: period,
          page: 1,
          page_size: 1000, // Fetch more for offline availability
        }
      });

      if (response.data && response.data.items) {
        // Extract and cache different expense types
        const fuelExpenses = response.data.items.filter(t => t.type === 'Fuel');
        const serviceExpenses = response.data.items.filter(t => t.type === 'Service');
        const otherExpenses = response.data.items.filter(t => t.type === 'Other');
        const tripIncome = response.data.items.filter(t => t.type === 'Trip');

        // Store categorized expenses
        await kvSet('cached_fuel_expenses', {
          items: fuelExpenses,
          synced_at: new Date().toISOString(),
        });

        await kvSet('cached_service_expenses', {
          items: serviceExpenses,
          synced_at: new Date().toISOString(),
        });

        await kvSet('cached_other_expenses', {
          items: otherExpenses,
          synced_at: new Date().toISOString(),
        });

        await kvSet('cached_trip_income', {
          items: tripIncome,
          synced_at: new Date().toISOString(),
        });

        console.log(`[syncFinancialDataFromAPI] Cached transactions - Fuel: ${fuelExpenses.length}, Service: ${serviceExpenses.length}, Other: ${otherExpenses.length}, Trips: ${tripIncome.length}`);
      }
    } catch (err) {
      console.warn('[syncFinancialDataFromAPI] Failed to fetch transactions:', err.message);
    }

    return true;
  } catch (err) {
    console.error('[syncFinancialDataFromAPI] Error:', err);
    return false;
  }
}

// ============================================================================
// DATA RETRIEVAL WITH FALLBACK STRATEGY
// ============================================================================

/**
 * ✅ FIXED: Get earliest transaction date from local store
 * First tries API cache, then falls back to local data
 * Returns null if no transactions exist (newly onboarded customers)
 */
export async function getEarliestTransactionDate() {
  try {
    const store = await getLocalStore();
    
    // Try to get from local store (prefer kvGet for persistence)
    let allDates = [];

    // Collect dates from cached API data
    const cachedFuel = await kvGet('cached_fuel_expenses');
    if (cachedFuel && cachedFuel.items) {
      allDates.push(...cachedFuel.items.map(t => new Date(t.timestamp).getTime()));
    }

    const cachedService = await kvGet('cached_service_expenses');
    if (cachedService && cachedService.items) {
      allDates.push(...cachedService.items.map(t => new Date(t.timestamp).getTime()));
    }

    const cachedOther = await kvGet('cached_other_expenses');
    if (cachedOther && cachedOther.items) {
      allDates.push(...cachedOther.items.map(t => new Date(t.timestamp).getTime()));
    }

    const cachedTrips = await kvGet('cached_trip_income');
    if (cachedTrips && cachedTrips.items) {
      allDates.push(...cachedTrips.items.map(t => new Date(t.timestamp).getTime()));
    }

    // Fallback to local in-memory arrays (if they exist)
    if (store && typeof store.trips === 'object' && Array.isArray(store.trips)) {
      allDates.push(...store.trips.map((t) => t.timestamp));
    }
    if (store && typeof store.fuelEntries === 'object' && Array.isArray(store.fuelEntries)) {
      allDates.push(...store.fuelEntries.map((f) => f.timestamp));
    }
    if (store && typeof store.maintenanceEntries === 'object' && Array.isArray(store.maintenanceEntries)) {
      allDates.push(...store.maintenanceEntries.map((m) => m.timestamp));
    }
    if (store && typeof store.otherExpenses === 'object' && Array.isArray(store.otherExpenses)) {
      allDates.push(...store.otherExpenses.map((e) => e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0)));
    }

    if (allDates.length === 0) {
      console.log('[getEarliestTransactionDate] No transactions found - newly onboarded user');
      return null; // ✅ FIXED: Newly onboarded riders return null
    }

    const earliest = Math.min(...allDates);
    console.log(`[getEarliestTransactionDate] Found earliest date: ${new Date(earliest).toISOString()}`);
    return earliest;
  } catch (err) {
    console.error('[getEarliestTransactionDate] error:', err);
    return null;
  }
}

/**
 * ✅ FIXED: Calculate financial summary for a date range
 * Properly aggregates fuel, battery, and service costs from cached API data and local storage
 * Returns zeros for newly onboarded customers with no transactions
 */
export async function getFinancialSummary(rangeStart, rangeEnd) {
  try {
    console.log(`[getFinancialSummary] Fetching summary for range: ${new Date(rangeStart).toISOString()} to ${new Date(rangeEnd).toISOString()}`);
    
    const store = await getLocalStore();
    let income = 0;
    let fuel = 0;
    let maintenance = 0;
    const otherByCat = {};

    // ✅ FIXED: Try cached API data first
    const cachedTrips = await kvGet('cached_trip_income');
    if (cachedTrips && cachedTrips.items) {
      console.log(`[getFinancialSummary] Using ${cachedTrips.items.length} cached trip records`);
      cachedTrips.items.forEach((trip) => {
        const ts = new Date(trip.timestamp).getTime();
        if (ts >= rangeStart && ts <= rangeEnd && trip.type === 'Trip') {
          income += parseFloat(trip.amount) || 0;
        }
      });
    }

    const cachedFuel = await kvGet('cached_fuel_expenses');
    if (cachedFuel && cachedFuel.items) {
      console.log(`[getFinancialSummary] Using ${cachedFuel.items.length} cached fuel records`);
      cachedFuel.items.forEach((fuelItem) => {
        const ts = new Date(fuelItem.timestamp).getTime();
        if (ts >= rangeStart && ts <= rangeEnd) {
          fuel += parseFloat(fuelItem.amount) || 0;
        }
      });
    }

    const cachedService = await kvGet('cached_service_expenses');
    if (cachedService && cachedService.items) {
      console.log(`[getFinancialSummary] Using ${cachedService.items.length} cached service records`);
      cachedService.items.forEach((serviceItem) => {
        const ts = new Date(serviceItem.timestamp).getTime();
        if (ts >= rangeStart && ts <= rangeEnd) {
          maintenance += parseFloat(serviceItem.amount) || 0;
        }
      });
    }

    const cachedOther = await kvGet('cached_other_expenses');
    if (cachedOther && cachedOther.items) {
      console.log(`[getFinancialSummary] Using ${cachedOther.items.length} cached other expense records`);
      cachedOther.items.forEach((otherItem) => {
        const ts = new Date(otherItem.timestamp).getTime();
        if (ts >= rangeStart && ts <= rangeEnd) {
          const cat = otherItem.category || 'Miscellaneous';
          const amount = parseFloat(otherItem.amount) || 0;
          otherByCat[cat] = (otherByCat[cat] || 0) + amount;
        }
      });
    }

    // ✅ FIXED: Fallback to local in-memory arrays if they exist (for backward compatibility)
    // Calculate income from active trips
    if (store && Array.isArray(store.trips)) {
      store.trips.forEach((trip) => {
        if (
          trip.status === 'active' &&
          trip.timestamp >= rangeStart &&
          trip.timestamp <= rangeEnd
        ) {
          income += trip.amount || 0;
        }
      });
    }

    // Calculate fuel and battery costs from legacy fuelEntries
    if (store && Array.isArray(store.fuelEntries)) {
      store.fuelEntries
        .filter((f) => f.timestamp >= rangeStart && f.timestamp <= rangeEnd)
        .forEach((f) => {
          fuel += f.cost || 0;
        });
    }

    // Calculate maintenance/service costs from legacy maintenanceEntries
    if (store && Array.isArray(store.maintenanceEntries)) {
      store.maintenanceEntries
        .filter((m) => m.timestamp >= rangeStart && m.timestamp <= rangeEnd)
        .forEach((m) => {
          maintenance += m.cost || 0;
        });
    }

    // Calculate other expenses
    if (store && Array.isArray(store.otherExpenses)) {
      store.otherExpenses
        .filter((e) => {
          const ts = e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0);
          return ts >= rangeStart && ts <= rangeEnd;
        })
        .forEach((e) => {
          const cat = e.category || 'Miscellaneous';
          const amount = e.amount_ksh || e.amount || 0;
          otherByCat[cat] = (otherByCat[cat] || 0) + amount;
        });
    }

    const otherTotal = Object.values(otherByCat).reduce((s, v) => s + v, 0);
    const totalExpense = fuel + maintenance + otherTotal;

    const result = {
      income,
      fuel,
      service: maintenance,  // Renamed from 'maintenance' for better naming
      maintenance,  // Keep for backward compatibility
      other: otherTotal,
      otherByCategory: otherByCat,
      totalExpense,
      netProfit: income - totalExpense,
    };

    console.log(`[getFinancialSummary] Result - Income: ${income}, Expenses: ${totalExpense}, Net Profit: ${result.netProfit}`);
    return result;
  } catch (err) {
    console.error('[getFinancialSummary] error:', err);
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
 * ✅ FIXED: Get transaction list for a date range with optional filtering
 * Fetches from cached API data first, falls back to local storage
 * Consistent type naming - Trip, Fuel, Service (capitalized)
 */
export async function getTransactionList(rangeStart, rangeEnd, typeFilter = 'all') {
  try {
    console.log(`[getTransactionList] Fetching transactions for range: ${new Date(rangeStart).toISOString()} to ${new Date(rangeEnd).toISOString()}, filter: ${typeFilter}`);
    
    const store = await getLocalStore();
    let transactions = [];

    // Try cached data first
    if (typeFilter === 'all' || typeFilter === 'Trip') {
      const cachedTrips = await kvGet('cached_trip_income');
      if (cachedTrips && cachedTrips.items) {
        const trips = cachedTrips.items
          .filter((t) => {
            const ts = new Date(t.timestamp).getTime();
            return ts >= rangeStart && ts <= rangeEnd;
          })
          .map((t) => ({
            id: t.id,
            type: 'Trip',
            timestamp: new Date(t.timestamp).getTime(),
            amount: t.amount,
            status: t.voided ? 'voided' : 'active',
          }));
        transactions.push(...trips);
      }
    }

    if (typeFilter === 'all' || typeFilter === 'Fuel') {
      const cachedFuel = await kvGet('cached_fuel_expenses');
      if (cachedFuel && cachedFuel.items) {
        const fuel = cachedFuel.items
          .filter((f) => {
            const ts = new Date(f.timestamp).getTime();
            return ts >= rangeStart && ts <= rangeEnd;
          })
          .map((f) => ({
            id: f.id,
            type: 'Fuel',
            timestamp: new Date(f.timestamp).getTime(),
            amount: f.amount,
            category: 'Fuel/Energy',
            description: f.description,
          }));
        transactions.push(...fuel);
      }
    }

    if (typeFilter === 'all' || typeFilter === 'Service') {
      const cachedService = await kvGet('cached_service_expenses');
      if (cachedService && cachedService.items) {
        const service = cachedService.items
          .filter((s) => {
            const ts = new Date(s.timestamp).getTime();
            return ts >= rangeStart && ts <= rangeEnd;
          })
          .map((s) => ({
            id: s.id,
            type: 'Service',
            timestamp: new Date(s.timestamp).getTime(),
            amount: s.amount,
            category: 'Service',
            description: s.description,
          }));
        transactions.push(...service);
      }
    }

    if (typeFilter === 'all' || typeFilter === 'Other') {
      const cachedOther = await kvGet('cached_other_expenses');
      if (cachedOther && cachedOther.items) {
        const otherExpenses = cachedOther.items
          .filter((e) => {
            const ts = new Date(e.timestamp).getTime();
            return ts >= rangeStart && ts <= rangeEnd;
          })
          .map((e) => ({
            id: e.id,
            type: 'Other',
            timestamp: new Date(e.timestamp).getTime(),
            amount: -(parseFloat(e.amount) || 0),  // Negative for expenses
            category: e.category || 'Miscellaneous',
            description: e.notes || e.description,
          }));
        transactions.push(...otherExpenses);
      }
    }

    // Fallback to local in-memory data if cache is empty
    if (transactions.length === 0) {
      console.log('[getTransactionList] No cached data, falling back to local store');
      
      // Add trips
      if ((typeFilter === 'all' || typeFilter === 'Trip') && store && Array.isArray(store.trips)) {
        const trips = store.trips
          .filter((t) => t.timestamp >= rangeStart && t.timestamp <= rangeEnd)
          .map((t) => ({
            id: t.id,
            type: 'Trip',
            timestamp: t.timestamp,
            amount: t.amount,
            status: t.status,
          }));
        transactions.push(...trips);
      }

      // Add fuel entries (legacy)
      if ((typeFilter === 'all' || typeFilter === 'Fuel') && store && Array.isArray(store.fuelEntries)) {
        const fuel = store.fuelEntries
          .filter((f) => f.timestamp >= rangeStart && f.timestamp <= rangeEnd)
          .map((f) => ({
            id: f.id,
            type: 'Fuel',
            timestamp: f.timestamp,
            amount: f.cost,
            category: 'Fuel/Energy',
          }));
        transactions.push(...fuel);
      }

      // Add maintenance entries (legacy)
      if ((typeFilter === 'all' || typeFilter === 'Service') && store && Array.isArray(store.maintenanceEntries)) {
        const maintenance = store.maintenanceEntries
          .filter((m) => m.timestamp >= rangeStart && m.timestamp <= rangeEnd)
          .map((m) => ({
            id: m.id,
            type: 'Service',
            timestamp: m.timestamp,
            amount: m.cost,
            category: 'Service',
          }));
        transactions.push(...maintenance);
      }

      // Add other expenses
      if ((typeFilter === 'all' || typeFilter === 'Other') && store && Array.isArray(store.otherExpenses)) {
        const otherExpenses = store.otherExpenses
          .filter((e) => {
            const eventTs = e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0);
            return eventTs >= rangeStart && eventTs <= rangeEnd;
          })
          .map((e) => ({
            id: e.id,
            type: 'Other',
            timestamp: e.timestamp || (e.created_at ? new Date(e.created_at).getTime() : 0),
            amount: -(e.amount_ksh || e.amount || 0),  // Negative for expenses
            category: e.category || 'Miscellaneous',
            description: e.notes || e.description,
          }));
        transactions.push(...otherExpenses);
      }
    }

    // Sort by timestamp descending (most recent first)
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[getTransactionList] Returned ${transactions.length} transactions`);
    return transactions;
  } catch (err) {
    console.error('[getTransactionList] error:', err);
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
    console.error('[getExpensesByCategory] error:', err);
    return {};
  }
}
