// rider-app/src/screens/financialHistory/TransactionListScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors trip screens)
// ✅ SEAMLESS ONLINE/OFFLINE: Aggregates all transaction types from IndexedDB
// ✅ UNIFIED ARCHITECTURE: Removed repository dependencies
// ✅ INSTANT UPDATES: useFocusEffect ensures current data on screen focus
// ✅ RETENTION POLICY: 6-month rolling window enforced
// ✅ UI/UX: 100% preserved from original

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import { getLocalRiderId } from '../../offline/db';
import { getTransactionList } from '../../offline/financialHistoryUtils';

export default function TransactionListScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const hasLoadedRef = useRef(false);
  const { rangeStart, rangeEnd, selectedPeriod } = route.params || {
    rangeStart: Date.now(),
    rangeEnd: Date.now(),
    selectedPeriod: 'thisMonth',
  };

  const [riderId, setRiderId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  // ✅ Load rider ID on mount
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
          console.log('✅ TransactionList: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
        showToast('Error loading rider information', 'error');
      }
    };
    loadRiderId();
  }, [showToast]);

  const loadTransactions = useCallback(async () => {
    if (!riderId) return;

    try {
      setLoading(true);
      console.log(`📋 Loading transactions for rider ${riderId}, range: ${rangeStart} - ${rangeEnd}`);

      const txList = await getTransactionList(riderId, rangeStart, rangeEnd);
      setTransactions(txList);

      console.log(`✅ Loaded ${txList.length} transactions`);
    } catch (err) {
      console.error('❌ Error loading transactions:', err);
      showToast('Error loading transactions', 'error');
    } finally {
      setLoading(false);
    }
  }, [riderId, rangeStart, rangeEnd, showToast]);

  // ✅ Load data on mount (single execution)
  useEffect(() => {
    if (riderId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadTransactions();
    }
  }, [riderId, loadTransactions]);

  // ✅ Refresh on screen focus - ensures current data
  useFocusEffect(
    useCallback(() => {
      if (riderId && hasLoadedRef.current) {
        loadTransactions();
      }
    }, [riderId, loadTransactions])
  );

  if (!riderId || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink label="‹ Back" onPress={() => navigation.goBack()} />
        <Text style={styles.screenTitle}>My Transactions</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  const periodLabels = {
    thisMonth: 'for This Month',
    lastMonth: 'for Last Month',
    last3: 'for the Last 3 Months',
    last6: 'for the Last 6 Months',
    sinceJoining: 'Since Joining',
  };

  const periodLabel = periodLabels[selectedPeriod] || 'for the Selected Period';

  // Filter transactions by type
  const filteredTransactions = typeFilter === 'all' 
    ? transactions 
    : transactions.filter(t => t.type === typeFilter);

  const renderTransaction = ({ item, index }) => {
    const isIncome = item.category === 'Income';
    const date = new Date(item.date);
    const dateStr = date.toLocaleString();
    const isLastItem = index === filteredTransactions.length - 1;

    return (
      <View style={[
        styles.tripRow,
        item.voided && styles.tripRowVoided,
        !isLastItem && styles.tripRowWithBorder
      ]}>
        <View style={styles.tripRowLeft}>
          <Text style={styles.tripRowType}>{item.description}</Text>
          <Text style={styles.tripRowTime}>{dateStr}</Text>
        </View>
        <View style={styles.tripRowRight}>
          <Text style={[
            styles.tripRowAmount,
            isIncome ? styles.amountIncome : styles.amountExpense
          ]}>
            KSh {Math.abs(item.amount).toLocaleString()}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <BackLink label="‹ Back" onPress={() => navigation.goBack()} />
      <Text style={styles.screenTitle}>My Transactions {periodLabel}</Text>
      <Text style={styles.screenSub}>
        {new Date(rangeStart).toLocaleDateString()} — {new Date(rangeEnd).toLocaleDateString()} · RA-17-C · Transaction-Level Drill-Down
      </Text>

      {/* Type Filter Row */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.typeFilterRow}
      >
        {[
          { key: 'all', label: 'All' },
          { key: 'trip', label: 'Trips' },
          { key: 'fuel', label: 'Fuel' },
          { key: 'maintenance', label: 'Service' },
          { key: 'other', label: 'Other Expense' },
        ].map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.typeChip,
              typeFilter === filter.key && styles.typeChipActive,
            ]}
            onPress={() => setTypeFilter(filter.key)}
          >
            <Text style={[
              styles.typeChipText,
              typeFilter === filter.key && styles.typeChipTextActive,
            ]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.card}>
        {filteredTransactions.length > 0 ? (
          <FlatList
            data={filteredTransactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => `${item.type}_${item.id}`}
            scrollEnabled={false}
          />
        ) : (
          <Text style={styles.emptyText}>No transactions match this filter.</Text>
        )}
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
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 13,
    color: '#5b606c',
    marginBottom: 14,
  },
  typeFilterRow: {
    marginBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: '#fff',
    marginRight: 6,
  },
  typeChipActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1c20',
  },
  typeChipTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    overflow: 'hidden',
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 2,
  },
  tripRowWithBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  tripRowVoided: {
    opacity: 0.5,
  },
  tripRowLeft: {
    flex: 1,
  },
  tripRowType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 4,
  },
  tripRowTime: {
    fontSize: 11,
    color: '#5b606c',
  },
  tripRowRight: {
    alignItems: 'flex-end',
  },
  tripRowAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },
  amountIncome: {
    color: '#1e9e6f',
  },
  amountExpense: {
    color: '#e0453f',
  },
  emptyText: {
    fontSize: 12,
    color: '#5b606c',
    paddingVertical: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});