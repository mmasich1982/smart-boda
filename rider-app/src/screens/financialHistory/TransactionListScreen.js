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
        <BackLink label="← Back" onPress={() => navigation.goBack()} />
        <Text style={styles.screenTitle}>All Transactions</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  const renderTransaction = ({ item }) => {
    const isIncome = item.category === 'Income';
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={styles.transactionRow}>
        <View style={styles.transactionLeft}>
          <Text style={styles.transactionType}>{item.description}</Text>
          <Text style={styles.transactionTime}>
            {dateStr} · {timeStr}
          </Text>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[styles.transactionAmount, isIncome ? styles.amountIncome : styles.amountExpense]}>
            {isIncome ? '+' : '-'}KSh {Math.abs(item.amount).toLocaleString()}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Text style={styles.screenTitle}>All Transactions</Text>
      <Text style={styles.screenSubtitle}>{selectedPeriod} · {transactions.length} transactions</Text>

      <View style={styles.card}>
        {transactions.length > 0 ? (
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => `${item.type}_${item.id}`}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <Text style={styles.emptyText}>No transactions in this period</Text>
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
  screenSubtitle: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 12,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  transactionLeft: {
    flex: 1,
  },
  transactionType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 4,
  },
  transactionTime: {
    fontSize: 11,
    color: '#5b606c',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  amountIncome: {
    color: '#2e7d32',
  },
  amountExpense: {
    color: '#c62828',
  },
  separator: {
    height: 1,
    backgroundColor: '#e7e4db',
  },
  emptyText: {
    fontSize: 12,
    color: '#5b606c',
    paddingVertical: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});