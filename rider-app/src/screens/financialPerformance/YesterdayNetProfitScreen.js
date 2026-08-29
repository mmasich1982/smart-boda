/**
 * Yesterday Net Profit Dashboard Screen - INDEXEDDB-FIRST ARCHITECTURE
 * ✅ MIRRORS: NetProfitDashboardScreen logic but for YESTERDAY only
 * ✅ EXCLUSIVE: Shows ONLY yesterday's complete financial breakdown
 * ✅ IndexedDB-FIRST: Reads from IndexedDB caches directly
 * ✅ RETENTION POLICY: 6-month rolling window for all expense data
 * ✅ SEAMLESS SYNC: Uses IndexedDB for background data availability
 * ✅ UI/UX: Consistent with NetProfitDashboardScreen design
 * 
 * Yesterday's Net Profit = Yesterday's Trip Income - Yesterday's Operational Costs
 * Operational Costs = Fuel + Battery + Maintenance + Other Expenses
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';

/**
 * Helper: Get yesterday's trading day boundaries
 * Trading day: 4 AM to 4 AM (typical for gig economy)
 */
function getYesterdayTradingDayBoundaries() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 4, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  
  return { start, end };
}

/**
 * ✅ EXCLUSIVE: Calculate yesterday's trip income from IndexedDB cache
 * Uses direct trip_history cache instead of API
 */
async function calculateYesterdayTripIncome(riderId) {
  try {
    const { start, end } = getYesterdayTradingDayBoundaries();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toDateString();

    // Load trip cache
    const cacheKey = `trip_history_${riderId}`;
    const cachedData = await indexedDbAdapter.kvGet(cacheKey);
    
    let trips = [];
    if (cachedData) {
      try {
        trips = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
        if (!Array.isArray(trips)) trips = [];
      } catch (parseErr) {
        console.warn('⚠️ Trip cache parse error');
        trips = [];
      }
    }

    // Filter to YESTERDAY's active trips only
    let tripIncome = 0;
    trips.forEach(trip => {
      if (trip.status === 'active') {
        const tripDate = new Date(trip.ts || trip.timestamp || 0).toDateString();
        if (tripDate === yesterdayString) {
          const method = trip.paymentMethod || trip.method;
          
          if (method === 'LipaLater') {
            // Only count if settled yesterday
            if (trip.lipaLater?.settled) {
              const paymentDate = trip.lipaLater.paymentDate
                ? new Date(trip.lipaLater.paymentDate).toDateString()
                : null;
              if (paymentDate === yesterdayString) {
                tripIncome += trip.amount || 0;
              }
            }
          } else {
            // Cash/M-Pesa: count on trip date
            tripIncome += trip.amount || 0;
          }
        }
      }
    });

    console.log(`✅ Yesterday income from ${trips.length} trips: KSh ${tripIncome}`);
    return tripIncome;
  } catch (err) {
    console.warn('⚠️ Error calculating yesterday trip income:', err);
    return 0;
  }
}

/**
 * Calculate YESTERDAY's totals from all data sources
 * Uses IndexedDB-first approach for all expense types
 */
async function calculateYesterdaysTotals(riderId) {
  try {
    const { start, end } = getYesterdayTradingDayBoundaries();
    const startMs = start.getTime();
    const endMs = end.getTime();
    
    console.log('📊 Calculating Yesterday Net Profit');
    
    // ✅ 1. GET YESTERDAY TRIP INCOME (from IndexedDB cache)
    const tripIncome = await calculateYesterdayTripIncome(riderId);
    
    // ✅ 2. GET YESTERDAY FUEL EXPENSES (from IndexedDB)
    let fuelExpense = 0;
    try {
      const fuelCache = await indexedDbAdapter.kvGet(`fuel_history_${riderId}`);
      if (fuelCache) {
        let fuelEntries = [];
        try {
          fuelEntries = typeof fuelCache === 'string' ? JSON.parse(fuelCache) : fuelCache;
          if (!Array.isArray(fuelEntries)) fuelEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Fuel cache parse error');
          fuelEntries = [];
        }
        
        fuelEntries.forEach(f => {
          const ts = f.ts || f.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            fuelExpense += f.cost || 0;
          }
        });
      }
      console.log(`✅ Yesterday fuel expense: KSh ${fuelExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating yesterday fuel expense:', err);
    }
    
    // ✅ 3. GET YESTERDAY BATTERY EXPENSES (from IndexedDB)
    let batteryExpense = 0;
    try {
      const batteryCache = await indexedDbAdapter.kvGet(`battery_history_${riderId}`);
      if (batteryCache) {
        let batteryEntries = [];
        try {
          batteryEntries = typeof batteryCache === 'string' ? JSON.parse(batteryCache) : batteryCache;
          if (!Array.isArray(batteryEntries)) batteryEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Battery cache parse error');
          batteryEntries = [];
        }
        
        batteryEntries.forEach(b => {
          const ts = b.ts || b.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            batteryExpense += b.cost || 0;
          }
        });
      }
      console.log(`✅ Yesterday battery expense: KSh ${batteryExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating yesterday battery expense:', err);
    }
    
    // ✅ 4. GET YESTERDAY MAINTENANCE EXPENSES (from IndexedDB)
    let maintenanceExpense = 0;
    try {
      const maintenanceCache = await indexedDbAdapter.kvGet(`maintenance_history_${riderId}`);
      if (maintenanceCache) {
        let maintenanceEntries = [];
        try {
          maintenanceEntries = typeof maintenanceCache === 'string' ? JSON.parse(maintenanceCache) : maintenanceCache;
          if (!Array.isArray(maintenanceEntries)) maintenanceEntries = [];
        } catch (parseErr) {
          console.warn('⚠️ Maintenance cache parse error');
          maintenanceEntries = [];
        }
        
        maintenanceEntries.forEach(m => {
          const ts = m.ts || m.timestamp || 0;
          if (ts >= startMs && ts <= endMs) {
            maintenanceExpense += m.cost || 0;
          }
        });
      }
      console.log(`✅ Yesterday maintenance expense: KSh ${maintenanceExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating yesterday maintenance expense:', err);
    }
    
    // ✅ 5. GET YESTERDAY OTHER EXPENSES (from IndexedDB)
    let otherExpense = 0;
    try {
      const otherCache = await indexedDbAdapter.kvGet(`other_expenses_summary_${riderId}`);
      if (otherCache) {
        const data = typeof otherCache === 'string' ? JSON.parse(otherCache) : otherCache;
        // Filter by yesterday only
        if (data.entries && Array.isArray(data.entries)) {
          data.entries.forEach(e => {
            const ts = e.ts || e.timestamp || 0;
            if (ts >= startMs && ts <= endMs) {
              otherExpense += e.amount || 0;
            }
          });
        }
      }
      console.log(`✅ Yesterday other expenses: KSh ${otherExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating yesterday other expenses:', err);
    }
    
    // ✅ CALCULATE YESTERDAY NET PROFIT
    const totalExpenses = fuelExpense + batteryExpense + maintenanceExpense + otherExpense;
    const netProfit = tripIncome - totalExpenses;
    
    console.log('📊 YESTERDAY NET PROFIT SUMMARY:', {
      tripIncome,
      fuelExpense,
      batteryExpense,
      maintenanceExpense,
      otherExpense,
      totalExpenses,
      netProfit
    });
    
    return {
      tripIncome,
      fuelExpense,
      batteryExpense,
      maintenanceExpense,
      otherExpense,
      totalExpenses,
      netProfit
    };
  } catch (err) {
    console.error('❌ Error calculating yesterday totals:', err);
    return {
      tripIncome: 0,
      fuelExpense: 0,
      batteryExpense: 0,
      maintenanceExpense: 0,
      otherExpense: 0,
      totalExpenses: 0,
      netProfit: 0
    };
  }
}

export default function YesterdayNetProfitScreen({ navigation }) {
  const { t } = useTranslation();
  const [riderId, setRiderId] = useState(null);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const id = await getLocalRiderId();
        setRiderId(id);
        
        if (id) {
          const calculatedTotals = await calculateYesterdaysTotals(id);
          setTotals(calculatedTotals);
        }
      } catch (err) {
        console.error('❌ Error loading yesterday data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // ✅ Refresh on focus - ensures data is current
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      if (riderId) {
        const calculatedTotals = await calculateYesterdaysTotals(riderId);
        setTotals(calculatedTotals);
      }
    });
    
    return unsubscribe;
  }, [navigation, riderId]);

  if (loading || !totals) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  const profitColor = totals.netProfit >= 0 ? '#2e7d32' : '#c62828';

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      
      <Text style={styles.title}>Yesterday's Net Profit</Text>
      <Text style={styles.subtitle}>Complete Financial Breakdown</Text>

      {/* NET PROFIT HERO CARD */}
      <View style={[styles.heroCard, { borderColor: profitColor }]}>
        <Text style={styles.heroLabel}>Yesterday's Net Profit</Text>
        <Text style={[styles.heroAmount, { color: profitColor }]}>
          KSh {totals.netProfit.toLocaleString()}
        </Text>
      </View>

      {/* INCOME CARD */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Income</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Trip Income</Text>
          <Text style={styles.amount}>+KSh {totals.tripIncome.toLocaleString()}</Text>
        </View>
      </View>

      {/* EXPENSES CARD */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Expenses</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Fuel</Text>
          <Text style={styles.expenseAmount}>-KSh {totals.fuelExpense.toLocaleString()}</Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Battery</Text>
          <Text style={styles.expenseAmount}>-KSh {totals.batteryExpense.toLocaleString()}</Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Maintenance</Text>
          <Text style={styles.expenseAmount}>-KSh {totals.maintenanceExpense.toLocaleString()}</Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Other Expenses</Text>
          <Text style={styles.expenseAmount}>-KSh {totals.otherExpense.toLocaleString()}</Text>
        </View>
        
        <View style={[styles.row, styles.totalExpenseRow]}>
          <Text style={styles.totalLabel}>Total Expenses</Text>
          <Text style={styles.totalExpenseAmount}>-KSh {totals.totalExpenses.toLocaleString()}</Text>
        </View>
      </View>

      {/* FORMULA */}
      <View style={styles.formulaCard}>
        <Text style={styles.formulaText}>
          Yesterday's Net Profit = Trip Income - (Fuel + Battery + Maintenance + Other)
        </Text>
        <Text style={styles.formulaText}>
          = KSh {totals.tripIncome.toLocaleString()} - KSh {totals.totalExpenses.toLocaleString()}
        </Text>
        <Text style={[styles.formulaText, { fontWeight: '700', color: profitColor, marginTop: 8 }]}>
          = KSh {totals.netProfit.toLocaleString()}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 16,
  },
  heroCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 14,
    color: '#5b606c',
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  label: {
    fontSize: 13,
    color: '#5b606c',
  },
  amount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2e7d32',
  },
  expenseAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c62828',
  },
  totalExpenseRow: {
    borderBottomWidth: 0,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#e7e4db',
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  totalExpenseAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c62828',
  },
  formulaCard: {
    backgroundColor: '#fff9f8',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  formulaText: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
  },
});