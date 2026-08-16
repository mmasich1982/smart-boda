// rider-app/src/screens/savings/SavingsTypeListScreen.js
// ✅ CORRECTED: Using getLocalRiderId() pattern from working modules

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { useToast } from '../../components/Toast';
import api from '../../api/client';
import { calculateSavingsProgress, getPeriodRange, PERIOD_LABELS, formatDateTime } from '../../utils/savingsUtils';

const PERIODS = ['thisMonth', 'lastMonth', 'last6', 'sinceJoining'];

export default function SavingsTypeListScreen({ route, navigation }) {
  const { state } = useRider();
  const { showToast } = useToast();
  const savingsType = route?.params?.type || 'sacco';

  const [accounts, setAccounts] = useState([]);
  const [localRiderId, setLocalRiderId] = useState(null);
  const [period, setPeriod] = useState('thisMonth');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const label = savingsType === 'sacco' ? 'SACCO' : 'Chama';
  const emoji = savingsType === 'sacco' ? '🤝' : '👥';

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        console.log('[SavingsTypeListScreen] Loaded riderId from storage:', id);
        setLocalRiderId(id);
        
        if (!id) {
          setError('Rider information not found. Please return to Home.');
        }
      } catch (err) {
        console.error('[SavingsTypeListScreen] Error loading riderId:', err);
        setError('Error loading rider information.');
      }
    }
    
    loadRiderId();
  }, []);

  // ✅ FETCH ACCOUNTS WITH FALLBACK RIDER ID
  const fetchAccounts = useCallback(async () => {
    const effectiveRiderId = localRiderId || state?.riderId;

    if (!effectiveRiderId) {
      console.error('[SavingsTypeListScreen] No riderId available');
      setError('Rider information not found. Please return to Home.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      console.log('[SavingsTypeListScreen] Fetching accounts for type:', savingsType, 'rider:', effectiveRiderId);
      const response = await api.get('/savings/accounts', {
        params: { rider_id: effectiveRiderId },
      });

      // Filter by type locally
      const typeAccounts = (response.data?.accounts || []).filter(a => a.type === savingsType);
      console.log('[SavingsTypeListScreen] Accounts response:', typeAccounts);
      setAccounts(typeAccounts);
      setError('');
    } catch (err) {
      console.error('[SavingsTypeListScreen] Fetch accounts error:', err);
      const errorMsg = err.response?.data?.detail || 'Failed to load accounts';
      setError(errorMsg);
      if (refreshing) {
        showToast(errorMsg, 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [localRiderId, state?.riderId, savingsType, refreshing, showToast]);

  // ✅ FETCH ACCOUNTS ON MOUNT AND WHEN RIDER ID OR TYPE CHANGES
  useEffect(() => {
    if (localRiderId || state?.riderId) {
      fetchAccounts();
    }
  }, [localRiderId, state?.riderId, savingsType, fetchAccounts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAccounts();
  }, [fetchAccounts]);

  const handleAddSavings = (account) => {
    navigation.navigate('AddSavingsContribution', { 
      accountId: account.id,
      account: account  // ✅ Pass account object so we don't need to fetch again
    });
  };

  const handleRegisterNew = () => {
    navigation.navigate('SavingsEntry', { type: savingsType });
  };

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

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.backLink}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.screenTitle}>{label} Savings</Text>
      <Text style={styles.screenSub}>
        Your linked {label} account{accounts.length === 1 ? '' : 's'} — add savings any time.
      </Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

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

      {/* Accounts */}
      {accountsWithData.map(account => (
        <View key={account.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {emoji} {account.name}{' '}
              <Text style={styles.badge}>{account.frequency}</Text>
            </Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Saved so far</Text>
            <Text style={styles.kvValue}>KSh {account.progress.totalSaved.toLocaleString()}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Saved — {PERIOD_LABELS[period]}</Text>
            <Text style={styles.kvValue}>KSh {account.periodSaved.toLocaleString()}</Text>
          </View>

          {account.periodContribs.length > 0 ? (
            <>
              <Text style={styles.contributionsHeader}>
                Contributions — {PERIOD_LABELS[period]}
              </Text>
              {account.periodContribs.map((contrib, idx) => (
                <View key={idx} style={styles.ledgerRow}>
                  <Text style={styles.ledgerDate}>
                    {new Date(contrib.ts).toLocaleDateString()} · {formatDateTime(contrib.ts)}
                  </Text>
                  <Text style={styles.ledgerAmount}>KSh {contrib.amount.toLocaleString()}</Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.noContributions}>
              No contributions logged for {PERIOD_LABELS[period].toLowerCase()}.
            </Text>
          )}

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => handleAddSavings(account)}
          >
            <Text style={styles.addBtnText}>+ Add Savings</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Register Another */}
      <TouchableOpacity style={styles.registerBtn} onPress={handleRegisterNew}>
        <Text style={styles.registerBtnText}>+ Register Another {label}</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
    backgroundColor: '#f6f4ef',
  },
  backLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff7a1a',
    marginBottom: 16,
  },
  screenTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
    marginBottom: 16,
  },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 11.5,
    color: '#a5312c',
    fontWeight: '600',
  },

  periodTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  periodTab: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  periodTabActive: {
    borderBottomColor: '#ff7a1a',
  },
  periodTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b606c',
  },
  periodTabTextActive: {
    color: '#ff7a1a',
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
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  badge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5b606c',
    backgroundColor: '#f0ede8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  kvKey: {
    fontSize: 11.5,
    color: '#5b606c',
    fontWeight: '600',
  },
  kvValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
  },

  contributionsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1c20',
    marginTop: 8,
    marginBottom: 2,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  ledgerDate: {
    fontSize: 10.5,
    color: '#5b606c',
  },
  ledgerAmount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1c20',
  },

  noContributions: {
    fontSize: 11,
    color: '#5b606c',
    paddingVertical: 8,
  },

  addBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  registerBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  registerBtnText: {
    color: '#ff7a1a',
    fontSize: 12,
    fontWeight: '700',
  },
});