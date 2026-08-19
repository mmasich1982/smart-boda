// rider-app/src/screens/energyHub/FuelHubScreen.js
// ✅ COMPLETE REWRITE: Proper UI/UX alignment + Offline data loading
// Features:
// - Matches backup/cleaned.html design system
// - Shows quick summary stats
// - Navigation to entry and history screens
// - Handles both online and offline modes

import React, { useState, useFocusEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useTranslation } from '../../i18n/LocalizationProvider';

const FuelHubScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { state: riderState } = useRider();
  
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [isOffline, setIsOffline] = useState(false);
  const [stats, setStats] = useState({ totalCost: 0, totalLitres: 0, entryCount: 0 });

  const getRiderId = useCallback(() => {
    try {
      return getLocalRiderId();
    } catch (err) {
      return riderState?.riderId;
    }
  }, [riderState]);

  // Load fuel entries from offline storage
  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const riderId = getRiderId();
      
      if (!riderId) {
        setLoading(false);
        return;
      }

      // Load from offline storage
      const storedJson = LocalStore.get(`fuel_entries_${riderId}`);
      const offlineEntries = storedJson ? JSON.parse(storedJson) : [];
      
      setEntries(offlineEntries);
      setIsOffline(true);

      // Calculate stats
      const totalCost = offlineEntries.reduce((sum, e) => sum + (e.cost || 0), 0);
      const totalLitres = offlineEntries.reduce((sum, e) => sum + (e.litres || 0), 0);
      
      setStats({
        totalCost,
        totalLitres,
        entryCount: offlineEntries.length
      });

    } catch (err) {
      console.error('Error loading entries:', err);
      setIsOffline(false);
    } finally {
      setLoading(false);
    }
  }, [getRiderId]);

  // Reload when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <BackLink title={t('fuel_hub') || 'Fuel Motorcycle'} />
      </View>

      {/* Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📶 {t('working_offline') || 'Working offline'}
          </Text>
        </View>
      )}

      {/* Stats Cards */}
      {!loading && entries.length > 0 && (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('total_cost') || 'Total Cost'}</Text>
            <Text style={styles.statValue}>KES {stats.totalCost.toLocaleString()}</Text>
            <Text style={styles.statSubtext}>{stats.entryCount} {t('entries') || 'entries'}</Text>
          </View>
          
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('total_litres') || 'Total Litres'}</Text>
            <Text style={styles.statValue}>{stats.totalLitres.toFixed(1)} L</Text>
            <Text style={styles.statSubtext}>
              {stats.entryCount > 0 ? (stats.totalLitres / stats.entryCount).toFixed(1) : '0'} L {t('per_entry') || 'per entry'}
            </Text>
          </View>
        </View>
      )}

      {/* Main Actions */}
      <View style={styles.actionsContainer}>
        {/* Record Fuel Entry Button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('FuelEntry')}
        >
          <Text style={styles.primaryButtonText}>
            ⛽ {t('record_fuel_cost') || 'Record Fuel Cost'} →
          </Text>
        </TouchableOpacity>

        {/* View History Button */}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('FuelHistory')}
        >
          <Text style={styles.secondaryButtonText}>
            📜 {t('fuel_history') || 'View Fuel History'} ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* Empty State */}
      {!loading && entries.length === 0 && (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateIcon}>⛽</Text>
          <Text style={styles.emptyStateTitle}>
            {t('no_fuel_entries') || 'No fuel entries yet'}
          </Text>
          <Text style={styles.emptyStateMessage}>
            {t('start_tracking_fuel_costs') || 'Start tracking your fuel costs by recording your first entry'}
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => navigation.navigate('FuelEntry')}
          >
            <Text style={styles.emptyStateButtonText}>
              {t('record_first_entry') || 'Record First Entry'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading State */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff7a1a" />
          <Text style={styles.loadingText}>{t('loading') || 'Loading...'}</Text>
        </View>
      )}

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 {t('tip') || 'Tip'}</Text>
        <Text style={styles.infoMessage}>
          {t('fuel_tracking_helps') || 'Tracking your fuel costs helps you understand your daily expenses and identify savings opportunities.'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  headerContainer: {
    marginTop: 16,
    marginBottom: 12,
  },
  offlineBanner: {
    backgroundColor: '#FFA500',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  offlineText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ff7a1a',
    marginBottom: 4,
  },
  statSubtext: {
    fontSize: 11,
    color: '#5b606c',
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1a1c20',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  emptyStateMessage: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  emptyStateButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    marginTop: 12,
  },
  infoBox: {
    backgroundColor: '#e6f5ef',
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e9e6f',
    marginBottom: 5,
  },
  infoMessage: {
    fontSize: 13,
    color: '#1e9e6f',
    lineHeight: 20,
  },
});

export default FuelHubScreen;