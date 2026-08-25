/**
 * Net Profit Dashboard Screen - FIXED WITH TRIP INCOME
 * ✅ FIXED: Now properly queries trip income using tripsRepository
 * ✅ FIXED: Calculates net profit as: Income - (Fuel + Battery + Maintenance + Other Expenses)
 * ✅ FIXED: Loads from IndexedDB with all data sources
 * 
 * Net Profit = Trip Income - Operational Costs
 * Operational Costs = Fuel + Battery + Maintenance + Other Expenses
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getTodaysTrips, getTodaysRealizedIncome } from '../../offline/tripsRepository';

/**
 * Helper: Get today's trading day boundaries
 */
function getTradingDayBoundaries() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
  
  if (now < start) {
    start.setDate(start.getDate() - 1);
  }
  
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  
  return { start, end };
}

/**
 * Calculate today's totals from all data sources
 */
async function calculateTodaysTotals(riderId) {
  try {
    const { start, end } = getTradingDayBoundaries();
    const startMs = start.getTime();
    const endMs = end.getTime();
    
    console.log('📊 Calculating Net Profit for today:', { start: start.toISOString(), end: end.toISOString() });
    
    // ✅ 1. GET TRIP INCOME
    let tripIncome = 0;
    try {
      const trips = await getTodaysTrips(riderId);
      const realizedIncome = await getTodaysRealizedIncome(riderId);
      tripIncome = realizedIncome.total || 0;
      console.log(`✅ Income from ${trips.length} trips: KSh ${tripIncome}`);
    } catch (err) {
      console.warn('⚠️ Error calculating trip income:', err);
      tripIncome = 0;
    }
    
    // ✅ 2. GET FUEL EXPENSES
    let fuelExpense = 0;
    try {
      const fuelEntries = await indexedDbAdapter.queryRows('fuelEntry', (f) => {
        const ts = f.ts || f.timestamp || 0;
        return f.rider_id === riderId && ts >= startMs && ts <= endMs;
      });
      fuelExpense = fuelEntries.reduce((sum, f) => sum + (f.amount || 0), 0);
      console.log(`✅ Fuel expense: KSh ${fuelExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating fuel expense:', err);
    }
    
    // ✅ 3. GET BATTERY EXPENSES
    let batteryExpense = 0;
    try {
      const batteryEntries = await indexedDbAdapter.queryRows('batteryEntry', (b) => {
        const ts = b.ts || b.timestamp || 0;
        return b.rider_id === riderId && ts >= startMs && ts <= endMs;
      });
      batteryExpense = batteryEntries.reduce((sum, b) => sum + (b.amount || 0), 0);
      console.log(`✅ Battery expense: KSh ${batteryExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating battery expense:', err);
    }
    
    // ✅ 4. GET MAINTENANCE EXPENSES
    let maintenanceExpense = 0;
    try {
      const maintenanceEntries = await indexedDbAdapter.queryRows('maintenanceEntry', (m) => {
        const ts = m.ts || m.timestamp || 0;
        return m.rider_id === riderId && ts >= startMs && ts <= endMs;
      });
      maintenanceExpense = maintenanceEntries.reduce((sum, m) => sum + (m.amount || 0), 0);
      console.log(`✅ Maintenance expense: KSh ${maintenanceExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating maintenance expense:', err);
    }
    
    // ✅ 5. GET OTHER EXPENSES
    let otherExpense = 0;
    try {
      const otherExpenses = await indexedDbAdapter.kvGet(`other_expenses_${riderId}_today`);
      otherExpense = otherExpenses ? (otherExpenses.amount || 0) : 0;
      console.log(`✅ Other expenses: KSh ${otherExpense}`);
    } catch (err) {
      console.warn('⚠️ Error calculating other expenses:', err);
    }
    
    // ✅ CALCULATE NET PROFIT
    const totalExpenses = fuelExpense + batteryExpense + maintenanceExpense + otherExpense;
    const netProfit = tripIncome - totalExpenses;
    
    console.log('📊 NET PROFIT SUMMARY:', {
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
    console.error('❌ Error calculating totals:', err);
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

export default function NetProfitDashboardScreen({ navigation }) {
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
          const calculatedTotals = await calculateTodaysTotals(id);
          setTotals(calculatedTotals);
        }
      } catch (err) {
        console.error('❌ Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      if (riderId) {
        const calculatedTotals = await calculateTodaysTotals(riderId);
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
      <Text style={styles.title}>My Net Profit</Text>
      <Text style={styles.subtitle}>Daily Financial Overview</Text>

      {/* NET PROFIT HERO CARD */}
      <View style={[styles.heroCard, { borderColor: profitColor }]}>
        <Text style={styles.heroLabel}>Net Profit Today</Text>
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
          Net Profit = Trip Income - (Fuel + Battery + Maintenance + Other)
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