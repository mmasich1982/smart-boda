// rider-app/src/screens/savings/SavingsHubScreen.js
// ✅ FIXED: Proper JSX structure, fixed NaN calculation issue

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
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { useToast } from '../../components/Toast';

// ✅ PROPER CALCULATION: Sum contributions safely
function calculateSavingsTotal(account) {
  if (!account || !Array.isArray(account.contributions)) {
    return 0;
  }
  return account.contributions.reduce((sum, contrib) => {
    const amount = parseFloat(contrib.amount) || 0;
    return sum + amount;
  }, 0);
}

export default function SavingsHubScreen({ navigation }) {
  const { state } = useRider();
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState([]);
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
        if (!id) {
          setError('Rider information not found.');
        }
      } catch (err) {
        console.error('[SavingsHubScreen] Error:', err);
        setError('Error loading rider information.');
      }
    }
    loadRiderId();
  }, []);

  const fetchAccounts = useCallback(async () => {
    const effectiveRiderId = localRiderId || state?.riderId;

    if (!effectiveRiderId) {
      setError('Rider information not found.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const response = await api.get('/savings/accounts', {
        params: { rider_id: effectiveRiderId },
      });
      setAccounts(response.data?.accounts || []);
      setError('');
    } catch (err) {
      console.error('[SavingsHubScreen] Fetch error:', err);
      const errorMsg = err.response?.data?.detail || 'Failed to load accounts';
      setError(errorMsg);
      if (refreshing) {
        showToast(errorMsg, 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [localRiderId, state?.riderId, refreshing, showToast]);

  useEffect(() => {
    if (localRiderId || state?.riderId) {
      fetchAccounts();
    }
  }, [localRiderId, state?.riderId, fetchAccounts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAccounts();
  }, [fetchAccounts]);

  const saccoAccounts = accounts.filter((a) => a.type === 'sacco');
  const chamaAccounts = accounts.filter((a) => a.type === 'chama');

  const saccoTotal = saccoAccounts.reduce((sum, a) => sum + calculateSavingsTotal(a), 0);
  const chamaTotal = chamaAccounts.reduce((sum, a) => sum + calculateSavingsTotal(a), 0);

  const handleSaccoTap = () => {
    if (saccoAccounts.length === 0) {
      navigation.navigate('SavingsEntry', { type: 'sacco' });
    } else {
      navigation.navigate('SavingsTypeList', { type: 'sacco' });
    }
  };

  const handleChamaTap = () => {
    if (chamaAccounts.length === 0) {
      navigation.navigate('SavingsEntry', { type: 'chama' });
    } else {
      navigation.navigate('SavingsTypeList', { type: 'chama' });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Savings</Text>
        <Text style={styles.screenSub}>Track your SACCO and Chama contributions in one place.</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      <View style={styles.tileGrid}>
        <TouchableOpacity style={styles.tile} onPress={handleSaccoTap}>
          <Text style={styles.emoji}>🤝</Text>
          <Text style={styles.tileLabel}>SACCO</Text>
          <Text style={styles.tileSub}>KSh {Math.floor(saccoTotal).toLocaleString()} saved</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tile} onPress={handleChamaTap}>
          <Text style={styles.emoji}>👥</Text>
          <Text style={styles.tileLabel}>Chama</Text>
          <Text style={styles.tileSub}>KSh {Math.floor(chamaTotal).toLocaleString()} saved</Text>
        </TouchableOpacity>
      </View>

      {accounts.length > 0 ? (
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => navigation.navigate('SavingsReport')}
        >
          <Text style={styles.reportBtnText}>View Savings Report →</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.hint}>Add a SACCO or Chama above to start tracking.</Text>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
  },
  container: {
    flex: 1,
    padding: 18,
    backgroundColor: '#f6f4ef',
  },
  header: {
    marginBottom: 20,
  },
  backLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff7a1a',
    marginBottom: 8,
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

  tileGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  tileSub: {
    fontSize: 10.5,
    color: '#5b606c',
    textAlign: 'center',
    lineHeight: 15,
  },

  reportBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reportBtnText: {
    color: '#ff7a1a',
    fontSize: 12,
    fontWeight: '700',
  },

  hint: {
    fontSize: 12,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
});