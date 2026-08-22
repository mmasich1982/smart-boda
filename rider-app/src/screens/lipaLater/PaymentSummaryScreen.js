/**
 * rider-app/src/screens/lipaLater/PaymentSummaryScreen.js
 * RA-03-E: Lipa Later Payment Summary Dashboard
 * 
 * ✅ SEAMLESS ONLINE/OFFLINE: Cache-first loading with API fallback
 * ✅ MULTILINGUAL: Uses i18n for all UI text
 * ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
 * ✅ NETWORK AWARE: Real-time connectivity detection
 * ✅ MINIMAL UI: Title + Summary Cards + Statistics
 * ✅ NO STATUS BANNERS: Only critical errors shown
 * 
 * Displays payment summary statistics:
 * - Total customers
 * - Total outstanding amount
 * - Collection rate
 * - Breakdown by status (Pending, Partial, Paid)
 */

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import BackLink from '../../components/BackLink';
import { useFocusEffect } from '@react-navigation/native';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function PaymentSummaryScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ PaymentSummary: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // Load summary on focus
  useFocusEffect(
    React.useCallback(() => {
      if (!effectiveRiderId || !isInitialized) return;
      loadSummary();
    }, [effectiveRiderId, isInitialized])
  );

  const loadSummary = async () => {
    try {
      setLoading(true);
      clearCriticalError();

      let data = null;

      // Try API first if connected
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Fetching payment summary from API...');
          const response = await api.get('/trips/lipa-later/summary', {
            params: { rider_id: effectiveRiderId }
          });

          if (response.data) {
            data = response.data;
            console.log('✅ Loaded summary from API');

            // ✅ Cache the data using IndexedDB
            await indexedDbAdapter.kvSet(
              `lipa_summary_${effectiveRiderId}`,
              JSON.stringify(data)
            );
          }
        } catch (apiErr) {
          console.warn('⚠️ API fetch failed, falling back to cache:', apiErr.message);
          data = await loadSummaryFromCache();
        }
      } else {
        // Offline mode - use cache
        console.log('📴 Offline mode: Loading from cache');
        data = await loadSummaryFromCache();
      }

      if (data) {
        setSummary(data);
      } else {
        // Provide default structure
        setSummary({
          total_customers: 0,
          total_outstanding: 0,
          total_received: 0,
          collection_rate: 0,
          pending_count: 0,
          partial_count: 0,
          paid_count: 0
        });
      }
    } catch (err) {
      console.error('❌ Error loading summary:', err);
      showCriticalError(t('error_loadSummary') || 'Unable to load summary. Please try again.', 'data_load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSummaryFromCache = async () => {
    try {
      // ✅ Use IndexedDB adapter instead of LocalStore
      const cached = await indexedDbAdapter.kvGet(`lipa_summary_${effectiveRiderId}`);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        console.log('✅ Loaded summary from IndexedDB cache');
        return data;
      }
    } catch (err) {
      console.warn('⚠️ Cache load failed:', err);
    }
    return null;
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSummary();
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('paymentSummary') || 'Payment Summary'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#ff7a1a']}
        />
      }
    >
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('paymentSummary') || 'Payment Summary'}</Text>

      {/* Error Banner */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ff7a1a" />
          <Text style={styles.loadingText}>{t('loadingSummary') || 'Loading summary...'}</Text>
        </View>
      ) : summary ? (
        <>
          {/* Key Metrics */}
          <View style={styles.metricsGrid}>
            {/* Total Customers */}
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>{t('customers') || 'CUSTOMERS'}</Text>
              <Text style={styles.metricValue}>{summary.total_customers || 0}</Text>
              <Text style={styles.metricSubtext}>{t('totalAccounts') || 'Total accounts'}</Text>
            </View>

            {/* Total Outstanding */}
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>{t('outstanding') || 'OUTSTANDING'}</Text>
              <Text style={[styles.metricValue, { color: '#FFA500' }]}>
                KSh {(summary.total_outstanding || 0).toLocaleString()}
              </Text>
              <Text style={styles.metricSubtext}>{t('amountDue') || 'Amount due'}</Text>
            </View>

            {/* Total Received */}
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>{t('received') || 'RECEIVED'}</Text>
              <Text style={[styles.metricValue, { color: '#4CAF50' }]}>
                KSh {(summary.total_received || 0).toLocaleString()}
              </Text>
              <Text style={styles.metricSubtext}>{t('collectedToday') || 'Collected today'}</Text>
            </View>

            {/* Collection Rate */}
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>{t('collectionRate') || 'COLLECTION RATE'}</Text>
              <Text style={styles.metricValue}>
                {Math.round(summary.collection_rate || 0)}%
              </Text>
              <Text style={styles.metricSubtext}>{t('successRate') || 'Success rate'}</Text>
            </View>
          </View>

          {/* Status Breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('statusBreakdown') || 'Status Breakdown'}</Text>

            <View style={styles.statusGrid}>
              {/* Pending */}
              <TouchableOpacity
                onPress={() => navigation.navigate('LipaLaterCustomers', { filter: 'pending' })}
                style={styles.statusCard}
                activeOpacity={0.7}
              >
                <View style={styles.statusIconContainer}>
                  <Text style={styles.statusIcon}>⏳</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusCardLabel}>{t('pending') || 'Pending'}</Text>
                  <Text style={styles.statusCardCount}>{summary.pending_count || 0}</Text>
                </View>
                <Text style={styles.statusArrow}>→</Text>
              </TouchableOpacity>

              {/* Partial */}
              <TouchableOpacity
                onPress={() => navigation.navigate('LipaLaterCustomers', { filter: 'partial' })}
                style={styles.statusCard}
                activeOpacity={0.7}
              >
                <View style={styles.statusIconContainer}>
                  <Text style={styles.statusIcon}>⚠️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusCardLabel}>{t('partial') || 'Partial'}</Text>
                  <Text style={styles.statusCardCount}>{summary.partial_count || 0}</Text>
                </View>
                <Text style={styles.statusArrow}>→</Text>
              </TouchableOpacity>

              {/* Paid */}
              <TouchableOpacity
                onPress={() => navigation.navigate('LipaLaterCustomers', { filter: 'paid' })}
                style={styles.statusCard}
                activeOpacity={0.7}
              >
                <View style={styles.statusIconContainer}>
                  <Text style={styles.statusIcon}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusCardLabel}>{t('paid') || 'Paid'}</Text>
                  <Text style={styles.statusCardCount}>{summary.paid_count || 0}</Text>
                </View>
                <Text style={styles.statusArrow}>→</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Collection Progress */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('collectionProgress') || 'Collection Progress'}</Text>

            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>{t('todaysCollections') || "Today's Collections"}</Text>
                <Text style={[styles.progressValue, { color: '#4CAF50' }]}>
                  KSh {(summary.total_received || 0).toLocaleString()}
                </Text>
              </View>

              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, ((summary.total_received || 0) / Math.max(1, summary.total_outstanding || 1)) * 100)}%`
                    }
                  ]}
                />
              </View>

              <View style={styles.progressFooter}>
                <Text style={styles.progressFooterText}>
                  {Math.round((summary.total_received || 0) / Math.max(1, summary.total_outstanding || 1) * 100)}% {t('ofOutstandingCollected') || 'of outstanding amount collected'}
                </Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('LipaLaterCustomers')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>{t('viewAllCustomers') || 'View All Customers'} →</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('LipaLaterAgeing')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>{t('viewAgeingReport') || 'View Ageing Report'} →</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 20,
    paddingTop: 12
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 16
  },

  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  criticalErrorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1
  },
  dismissText: {
    fontSize: 11,
    color: '#a5312c',
    fontWeight: '700',
    marginLeft: 12
  },

  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  loadingText: {
    marginTop: 12,
    color: '#a8a196',
    fontSize: 14
  },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24
  },
  metricCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#ff7a1a'
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#a8a196',
    marginBottom: 6,
    letterSpacing: 0.4
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1c20',
    marginBottom: 4
  },
  metricSubtext: {
    fontSize: 10,
    color: '#a8a196'
  },

  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12
  },

  statusGrid: {
    gap: 10
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#ff7a1a'
  },
  statusIconContainer: {
    marginRight: 12
  },
  statusIcon: {
    fontSize: 20
  },
  statusCardLabel: {
    fontSize: 12,
    color: '#a8a196',
    fontWeight: '600',
    marginBottom: 2
  },
  statusCardCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1c20'
  },
  statusArrow: {
    fontSize: 16,
    color: '#ff7a1a',
    fontWeight: 'bold'
  },

  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  progressLabel: {
    fontSize: 12,
    color: '#a8a196',
    fontWeight: '600'
  },
  progressValue: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50'
  },
  progressFooter: {
    alignItems: 'center'
  },
  progressFooterText: {
    fontSize: 11,
    color: '#a8a196'
  },

  actionSection: {
    marginBottom: 40
  },
  primaryButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.02
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#ff7a1a',
    fontSize: 15,
    fontWeight: '700'
  }
});