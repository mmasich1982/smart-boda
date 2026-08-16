// rider-app/src/screens/savings/SavingsReportScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import api from '../../api/client';
import { calculateSavingsProgress, getPeriodRange, PERIOD_LABELS, formatDateTime } from '../../utils/savingsUtils';

const PERIODS = ['thisMonth', 'lastMonth', 'last6', 'sinceJoining'];

export default function SavingsReportScreen({ riderId, navigation }) {
  const { showToast } = useToast();
  
  const [accounts, setAccounts] = useState([]);
  const [period, setPeriod] = useState('thisMonth');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/savings/accounts', {
        params: { rider_id: riderId }
      });

      setAccounts(response.data?.accounts || []);
    } catch (err) {
      console.error('Fetch accounts error:', err);
      showToast('Failed to load accounts', 'error');
    } finally {
      setLoading(false);
    }
  }, [riderId, showToast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAccounts();
    setRefreshing(false);
  }, [fetchAccounts]);

  useEffect(() => {
    fetchAccounts();
    const unsubscribe = navigation.addListener('focus', fetchAccounts);
    return unsubscribe;
  }, [navigation, fetchAccounts]);

  const { start, end } = getPeriodRange(period);

  const accountsWithData = accounts.map(account => {
    const progress = calculateSavingsProgress(account);
    const contributions = account.contributions || [];
    const periodContribs = contributions
      .filter(c => c.ts >= start && c.ts <= end)
      .sort((a, b) => b.ts - a.ts);
    const periodSaved = periodContribs.reduce((sum, c) => sum + c.amount, 0);

    return {
      ...account,
      progress,
      periodContribs: periodContribs.slice(0, 5),
      periodSaved,
    };
  });

  const saccoAccounts = accountsWithData.filter(a => a.type === 'sacco');
  const chamaAccounts = accountsWithData.filter(a => a.type === 'chama');

  const saccoTotal = saccoAccounts.reduce((sum, a) => sum + a.progress.totalSaved, 0);
  const chamaTotal = chamaAccounts.reduce((sum, a) => sum + a.progress.totalSaved, 0);
  const saccoPeriodTotal = saccoAccounts.reduce((sum, a) => sum + a.periodSaved, 0);
  const chamaPeriodTotal = chamaAccounts.reduce((sum, a) => sum + a.periodSaved, 0);
  const combinedTotal = saccoTotal + chamaTotal;
  const combinedPeriodTotal = saccoPeriodTotal + chamaPeriodTotal;

  const handleAddSavings = (accountId) => {
    navigation.navigate('AddSavingsContribution', { accountId });
  };

  const handleRegisterSacco = () => {
    navigation.navigate('SavingsEntry', { type: 'sacco' });
  };

  const handleRegisterChama = () => {
    navigation.navigate('SavingsEntry', { type: 'chama' });
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <BackLink onPress={() => navigation.goBack()} label="← Back" />

      <Text style={styles.title}>Savings Report</Text>
      <Text style={styles.subtitle}>
        Combined progress across your SACCO and Chama accounts.
      </Text>

      {/* Period Tabs */}
      <View style={styles.periodTabs}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, period === p && styles.periodTabActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Combined Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Combined Savings</Text>
          <Text style={styles.summaryAmount}>KSh {combinedTotal.toLocaleString()}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>🤝 SACCO total</Text>
          <Text style={styles.kvValue}>KSh {saccoTotal.toLocaleString()}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>👥 Chama total</Text>
          <Text style={styles.kvValue}>KSh {chamaTotal.toLocaleString()}</Text>
        </View>
        <View style={[styles.kvRow, styles.kvRowLast]}>
          <Text style={styles.kvKey}>Saved — {PERIOD_LABELS[period]}</Text>
          <Text style={styles.kvValue}>KSh {combinedPeriodTotal.toLocaleString()}</Text>
        </View>
      </View>

      {/* Individual Accounts */}
      {accounts.length > 0 ? (
        accountsWithData.map(account => (
          <View key={account.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Text style={styles.cardEmoji}>{account.type === 'sacco' ? '🤝' : '👥'}</Text>
                <Text style={styles.cardTitle}>{account.name}</Text>
              </View>
              <View style={styles.frequencyBadge}>
                <Text style={styles.frequencyBadgeText}>{account.frequency}</Text>
              </View>
            </View>

            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Saved so far</Text>
              <Text style={styles.kvValue}>KSh {account.progress.totalSaved.toLocaleString()}</Text>
            </View>

            <View style={[styles.kvRow, styles.kvRowLast]}>
              <Text style={styles.kvKey}>Saved — {PERIOD_LABELS[period]}</Text>
              <Text style={styles.kvValue}>KSh {account.periodSaved.toLocaleString()}</Text>
            </View>

            {/* Contributions */}
            {account.periodContribs.length > 0 ? (
              <>
                <Text style={styles.contributionsTitle}>
                  Contributions — {PERIOD_LABELS[period]}
                </Text>
                {account.periodContribs.map((contrib, idx) => (
                  <View key={idx} style={styles.ledgerRow}>
                    <Text style={styles.ledgerDate}>{formatDateTime(contrib.ts)}</Text>
                    <Text style={styles.ledgerAmount}>KSh {contrib.amount.toLocaleString()}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.noContribs}>
                No contributions logged for {PERIOD_LABELS[period].toLowerCase()}.
              </Text>
            )}

            {/* Add Savings Button */}
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => handleAddSavings(account.id)}
            >
              <Text style={styles.addBtnText}>+ Add Savings</Text>
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            ℹ️ No savings accounts yet. Add a SACCO or Chama to start tracking.
          </Text>
        </View>
      )}

      {/* Register Buttons */}
      <TouchableOpacity style={styles.registerBtn} onPress={handleRegisterSacco}>
        <Text style={styles.registerBtnText}>+ Register Another SACCO</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.registerBtn, styles.registerBtnSecond]} onPress={handleRegisterChama}>
        <Text style={styles.registerBtnText}>+ Register Another Chama</Text>
      </TouchableOpacity>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f6f4ef',
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
    marginBottom: 14,
  },

  periodTabs: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#eee',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: 'center',
  },
  periodTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  periodTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5b606c',
  },
  periodTabTextActive: {
    color: '#1a1c20',
  },

  summaryCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e9e6f',
  },

  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  kvRowLast: {
    borderBottomWidth: 0,
  },
  kvKey: {
    fontSize: 11.5,
    color: '#5b606c',
  },
  kvValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },

  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardEmoji: {
    fontSize: 16,
  },
  cardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
  },
  frequencyBadge: {
    backgroundColor: '#eee',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  frequencyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5b606c',
  },

  contributionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1c20',
    marginTop: 8,
    marginBottom: 6,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede6',
  },
  ledgerDate: {
    fontSize: 11,
    color: '#5b606c',
  },
  ledgerAmount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1c20',
  },

  noContribs: {
    fontSize: 11,
    color: '#5b606c',
    paddingVertical: 8,
  },

  addBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  infoBanner: {
    backgroundColor: '#e8f0ff',
    borderWidth: 1.5,
    borderColor: '#d4e2ff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#5b7ac5',
    lineHeight: 18,
  },

  registerBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  registerBtnSecond: {
    marginTop: 8,
  },
  registerBtnText: {
    color: '#ff7a1a',
    fontSize: 12,
    fontWeight: '700',
  },
});