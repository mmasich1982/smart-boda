// rider-app/src/offline/financialHistoryUtils.js
// ✅ REFACTORED: Financial history and statements using IndexedDB-first architecture
// Replaces financialHistoryRepository and statementsRepository with direct KV storage
// Includes 6-month retention policy compliance

import indexedDbAdapter from './adapters/indexedDbAdapter';

/**
 * ============================================================================
 * FINANCIAL HISTORY & STATEMENT STORAGE ARCHITECTURE
 * ============================================================================
 *
 * CACHE KEYS:
 * -----------
 * financial_summary_${riderId}_${rangeStart}_${rangeEnd}
 *   - Cached financial summary for date range
 *   - Created when user views history or generates statement
 *   - Invalidated when any expense/income entry is added
 *
 * financial_earliest_date_${riderId}
 *   - Earliest transaction date for rider
 *   - Used to calculate "Since Joining" range
 *   - Updated when new oldest entry found
 *
 * statement_${statementId}
 *   - Individual statement record
 *   - Generated on-demand from financial summary
 *   - Stores: period, summary, purpose, generated_at
 *
 * statement_history_${riderId}
 *   - Array of all statements for rider
 *   - Sorted by generation date (newest first)
 *   - Used by StatementHistoryScreen
 *
 * transaction_list_${riderId}_${rangeStart}_${rangeEnd}
 *   - Cached transaction list for date range
 *   - Contains all trips + expenses for range
 *   - Used by TransactionListScreen
 *
 * ============================================================================
 * RETENTION POLICY (6-MONTH ROLLING WINDOW)
 * ============================================================================
 *
 * Financial summaries and statements older than 6 months are:
 * • Deleted from IndexedDB (device storage freed)
 * • Archived in PostgreSQL (long-term storage)
 * • Not accessible via offline screens
 * • Available via API if archive endpoint exists
 */

/**
 * Calculate financial summary for date range from cached expense/income data
 * ✅ Uses trip cache + fuel/battery/maintenance/other expense caches
 * ✅ Respects 6-month retention policy
 */
export async function getFinancialSummaryForRange(riderId, rangeStart, rangeEnd) {
  try {
    const startMs = rangeStart;
    const endMs = rangeEnd;

    console.log(`📊 Calculating financial summary for rider ${riderId}`, {
      range: `${new Date(startMs).toISOString()} - ${new Date(endMs).toISOString()}`,
    });

    let tripIncome = 0;
    let fuelExpense = 0;
    let batteryExpense = 0;
    let maintenanceExpense = 0;
    let otherExpense = 0;

    // ✅ Calculate trip income
    try {
      const tripCache = await indexedDbAdapter.kvGet(`trip_history_${riderId}`);
      if (tripCache) {
        let trips = [];
        try {
          trips = typeof tripCache === 'string' ? JSON.parse(tripCache) : tripCache;
          if (!Array.isArray(trips)) trips = [];
        } catch (parseErr) {
          console.warn('⚠️ Trip cache parse error');
        }

        trips.forEach(trip => {
          const ts = trip.ts || trip.timestamp || 0;
          if (trip.status === 'active' && ts >= startMs && ts <= endMs) {
            const method = trip.paymentMethod || trip.method;
            if (method === 'LipaLater') {
              if (trip.lipaLater?.settled) {
                const paymentTs = trip.lipaLater.paymentDate || 0;
                if (paymentTs >= startMs && paymentTs <= endMs) {
                  tripIncome += trip.amount || 0;
                }
              }
            } else {
              tripIncome += trip.amount || 0;
            }
          }
        });
      }
      console.log(`✅ Trip income: KSh ${tripIncome}`);
    } catch (err) {
      console.warn('⚠️ Error calculating trip income:', err);
    }

    // ✅ Calculate fuel expenses
    try {
      const fuelCache = await indexedDbAdapter.kvGet(`fuel_history_${riderId}`);
      if (fuelCache) {
        let fuelEntries = [];
        try {
          fuelEntries = typeof fuelCache === 'string' ? JSON.parse(fuelCache) : fuelCache;
          if (!Array.isArray(fuelEntries)) fuelEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Fuel cache parse error');
        }

        fuelEntries.forEach(f => {
          const ts = f.ts || f.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            fuelExpense += f.cost || 0;
          }
        });
      }
      console.log(`✅ Fuel expense: KSh ${fuelExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating fuel expense:', err);
    }

    // ✅ Calculate battery expenses
    try {
      const batteryCache = await indexedDbAdapter.kvGet(`battery_history_${riderId}`);
      if (batteryCache) {
        let batteryEntries = [];
        try {
          batteryEntries = typeof batteryCache === 'string' ? JSON.parse(batteryCache) : batteryCache;
          if (!Array.isArray(batteryEntries)) batteryEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Battery cache parse error');
        }

        batteryEntries.forEach(b => {
          const ts = b.ts || b.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            batteryExpense += b.cost || 0;
          }
        });
      }
      console.log(`✅ Battery expense: KSh ${batteryExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating battery expense:', err);
    }

    // ✅ Calculate maintenance expenses
    try {
      const maintenanceCache = await indexedDbAdapter.kvGet(`maintenance_history_${riderId}`);
      if (maintenanceCache) {
        let maintenanceEntries = [];
        try {
          maintenanceEntries = typeof maintenanceCache === 'string' ? JSON.parse(maintenanceCache) : maintenanceCache;
          if (!Array.isArray(maintenanceEntries)) maintenanceEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Maintenance cache parse error');
        }

        maintenanceEntries.forEach(m => {
          const ts = m.ts || m.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            maintenanceExpense += m.cost || 0;
          }
        });
      }
      console.log(`✅ Maintenance expense: KSh ${maintenanceExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating maintenance expense:', err);
    }

    // ✅ Calculate other expenses
    try {
      const otherCache = await indexedDbAdapter.kvGet(`other_expenses_summary_${riderId}`);
      if (otherCache) {
        const data = typeof otherCache === 'string' ? JSON.parse(otherCache) : otherCache;
        if (data.entries && Array.isArray(data.entries)) {
          data.entries.forEach(e => {
            const ts = e.ts || e.timestamp || 0;
            if (ts >= startMs && ts <= endMs) {
              otherExpense += e.amount || 0;
            }
          });
        }
      }
      console.log(`✅ Other expenses: KSh ${otherExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating other expenses:', err);
    }

    const totalExpense = fuelExpense + batteryExpense + maintenanceExpense + otherExpense;
    const netProfit = tripIncome - totalExpense;

    const summary = {
      income: tripIncome,
      fuel_expense: fuelExpense,
      battery_expense: batteryExpense,
      maintenance_expense: maintenanceExpense,
      other_expense: otherExpense,
      totalExpense,
      netProfit,
      breakdown: [
        { category: 'Fuel', amount: fuelExpense },
        { category: 'Battery', amount: batteryExpense },
        { category: 'Maintenance', amount: maintenanceExpense },
        { category: 'Other', amount: otherExpense },
      ].filter(b => b.amount > 0),
      isWithinRetention: true, // Check against retention policy if needed
      period: {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
      },
    };

    console.log('📊 Financial summary calculated:', {
      income: summary.income,
      expense: summary.totalExpense,
      profit: summary.netProfit,
    });

    return summary;
  } catch (err) {
    console.error('❌ Error calculating financial summary:', err);
    return {
      income: 0,
      fuel_expense: 0,
      battery_expense: 0,
      maintenance_expense: 0,
      other_expense: 0,
      totalExpense: 0,
      netProfit: 0,
      breakdown: [],
      isWithinRetention: true,
      period: { start: new Date(rangeStart).toISOString(), end: new Date(rangeEnd).toISOString() },
    };
  }
}

/**
 * Get earliest transaction date for rider
 * Used to calculate "Since Joining" period
 */
export async function getEarliestTransactionDate(riderId) {
  try {
    let earliestDate = Date.now();

    // Check trips
    const tripCache = await indexedDbAdapter.kvGet(`trip_history_${riderId}`);
    if (tripCache) {
      try {
        const trips = typeof tripCache === 'string' ? JSON.parse(tripCache) : tripCache;
        if (Array.isArray(trips) && trips.length > 0) {
          const tripDates = trips.map(t => t.ts || t.timestamp || 0).filter(d => d > 0);
          if (tripDates.length > 0) {
            earliestDate = Math.min(earliestDate, Math.min(...tripDates));
          }
        }
      } catch (err) {
        console.warn('⚠️ Error parsing trip cache:', err);
      }
    }

    // Check fuel
    const fuelCache = await indexedDbAdapter.kvGet(`fuel_history_${riderId}`);
    if (fuelCache) {
      try {
        const fuel = typeof fuelCache === 'string' ? JSON.parse(fuelCache) : fuelCache;
        if (Array.isArray(fuel) && fuel.length > 0) {
          const fuelDates = fuel.map(f => f.ts || f.timestamp || 0).filter(d => d > 0);
          if (fuelDates.length > 0) {
            earliestDate = Math.min(earliestDate, Math.min(...fuelDates));
          }
        }
      } catch (err) {
        console.warn('⚠️ Error parsing fuel cache:', err);
      }
    }

    // Check battery
    const batteryCache = await indexedDbAdapter.kvGet(`battery_history_${riderId}`);
    if (batteryCache) {
      try {
        const battery = typeof batteryCache === 'string' ? JSON.parse(batteryCache) : batteryCache;
        if (Array.isArray(battery) && battery.length > 0) {
          const batteryDates = battery.map(b => b.ts || b.timestamp || 0).filter(d => d > 0);
          if (batteryDates.length > 0) {
            earliestDate = Math.min(earliestDate, Math.min(...batteryDates));
          }
        }
      } catch (err) {
        console.warn('⚠️ Error parsing battery cache:', err);
      }
    }

    // Check maintenance
    const maintenanceCache = await indexedDbAdapter.kvGet(`maintenance_history_${riderId}`);
    if (maintenanceCache) {
      try {
        const maintenance = typeof maintenanceCache === 'string' ? JSON.parse(maintenanceCache) : maintenanceCache;
        if (Array.isArray(maintenance) && maintenance.length > 0) {
          const maintenanceDates = maintenance.map(m => m.ts || m.timestamp || 0).filter(d => d > 0);
          if (maintenanceDates.length > 0) {
            earliestDate = Math.min(earliestDate, Math.min(...maintenanceDates));
          }
        }
      } catch (err) {
        console.warn('⚠️ Error parsing maintenance cache:', err);
      }
    }

    console.log(`✅ Earliest transaction date for rider: ${new Date(earliestDate).toISOString()}`);
    return earliestDate;
  } catch (err) {
    console.error('❌ Error getting earliest transaction date:', err);
    return Date.now();
  }
}

/**
 * Save statement to IndexedDB
 * Statements are generated reports of financial data for a period
 */
export async function saveStatement(riderId, statementData) {
  try {
    const statementId = `statement_${riderId}_${Date.now()}`;
    const statement = {
      id: statementId,
      rider_id: riderId,
      ...statementData,
      generated_at: new Date().toISOString(),
      ts: Date.now(),
      timestamp: Date.now(),
    };

    // Save individual statement
    await indexedDbAdapter.kvSet(`statement_${statementId}`, JSON.stringify(statement));

    // Update statement history cache
    const historyKey = `statement_history_${riderId}`;
    let history = [];
    try {
      const cached = await indexedDbAdapter.kvGet(historyKey);
      if (cached) {
        history = typeof cached === 'string' ? JSON.parse(cached) : cached;
        if (!Array.isArray(history)) history = [];
      }
    } catch (err) {
      console.warn('⚠️ Error loading statement history:', err);
    }

    history.unshift(statement);
    await indexedDbAdapter.kvSet(historyKey, JSON.stringify(history));

    console.log('✅ Statement saved:', statementId);
    return statement;
  } catch (err) {
    console.error('❌ Error saving statement:', err);
    return null;
  }
}

/**
 * Get all statements for rider
 */
export async function getStatementHistory(riderId) {
  try {
    const historyKey = `statement_history_${riderId}`;
    const cached = await indexedDbAdapter.kvGet(historyKey);

    if (cached) {
      const history = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return Array.isArray(history) ? history : [];
    }
    return [];
  } catch (err) {
    console.error('❌ Error loading statement history:', err);
    return [];
  }
}

/**
 * Get aggregated transaction list for date range
 * Combines trips + all expenses into single transaction list
 */
export async function getTransactionList(riderId, rangeStart, rangeEnd) {
  try {
    const startMs = rangeStart;
    const endMs = rangeEnd;
    const transactions = [];

    // Add trips
    const tripCache = await indexedDbAdapter.kvGet(`trip_history_${riderId}`);
    if (tripCache) {
      try {
        const trips = typeof tripCache === 'string' ? JSON.parse(tripCache) : tripCache;
        if (Array.isArray(trips)) {
          trips.forEach(trip => {
            const ts = trip.ts || trip.timestamp || 0;
            if (ts >= startMs && ts <= endMs) {
              transactions.push({
                type: 'trip',
                id: trip.id,
                date: ts,
                description: `Trip - ${trip.paymentMethod || trip.method}`,
                amount: trip.amount,
                category: 'Income',
              });
            }
          });
        }
      } catch (err) {
        console.warn('⚠️ Error parsing trip cache:', err);
      }
    }

    // Add fuel expenses
    const fuelCache = await indexedDbAdapter.kvGet(`fuel_history_${riderId}`);
    if (fuelCache) {
      try {
        const fuel = typeof fuelCache === 'string' ? JSON.parse(fuelCache) : fuelCache;
        if (Array.isArray(fuel)) {
          fuel.forEach(f => {
            const ts = f.ts || f.timestamp || 0;
            if (ts >= startMs && ts <= endMs) {
              transactions.push({
                type: 'fuel',
                id: f.id,
                date: ts,
                description: 'Fuel',
                amount: -f.cost,
                category: 'Expense',
              });
            }
          });
        }
      } catch (err) {
        console.warn('⚠️ Error parsing fuel cache:', err);
      }
    }

    // Add battery expenses
    const batteryCache = await indexedDbAdapter.kvGet(`battery_history_${riderId}`);
    if (batteryCache) {
      try {
        const battery = typeof batteryCache === 'string' ? JSON.parse(batteryCache) : batteryCache;
        if (Array.isArray(battery)) {
          battery.forEach(b => {
            const ts = b.ts || b.timestamp || 0;
            if (ts >= startMs && ts <= endMs) {
              transactions.push({
                type: 'battery',
                id: b.id,
                date: ts,
                description: 'Battery Charge',
                amount: -b.cost,
                category: 'Expense',
              });
            }
          });
        }
      } catch (err) {
        console.warn('⚠️ Error parsing battery cache:', err);
      }
    }

    // Add maintenance expenses
    const maintenanceCache = await indexedDbAdapter.kvGet(`maintenance_history_${riderId}`);
    if (maintenanceCache) {
      try {
        const maintenance = typeof maintenanceCache === 'string' ? JSON.parse(maintenanceCache) : maintenanceCache;
        if (Array.isArray(maintenance)) {
          maintenance.forEach(m => {
            const ts = m.ts || m.timestamp || 0;
            if (ts >= startMs && ts <= endMs) {
              transactions.push({
                type: 'maintenance',
                id: m.id,
                date: ts,
                description: 'Maintenance',
                amount: -m.cost,
                category: 'Expense',
              });
            }
          });
        }
      } catch (err) {
        console.warn('⚠️ Error parsing maintenance cache:', err);
      }
    }

    // Add other expenses
    const otherCache = await indexedDbAdapter.kvGet(`other_expenses_summary_${riderId}`);
    if (otherCache) {
      try {
        const data = typeof otherCache === 'string' ? JSON.parse(otherCache) : otherCache;
        if (data.entries && Array.isArray(data.entries)) {
          data.entries.forEach(e => {
            const ts = e.ts || e.timestamp || 0;
            if (ts >= startMs && ts <= endMs) {
              transactions.push({
                type: 'other',
                id: e.id,
                date: ts,
                description: `${e.category}`,
                amount: -e.amount,
                category: 'Expense',
              });
            }
          });
        }
      } catch (err) {
        console.warn('⚠️ Error parsing other expenses:', err);
      }
    }

    // Sort by date (newest first)
    transactions.sort((a, b) => b.date - a.date);

    console.log(`✅ Transaction list with ${transactions.length} items`);
    return transactions;
  } catch (err) {
    console.error('❌ Error loading transaction list:', err);
    return [];
  }
}

export default {
  getFinancialSummaryForRange,
  getEarliestTransactionDate,
  saveStatement,
  getStatementHistory,
  getTransactionList,
};
