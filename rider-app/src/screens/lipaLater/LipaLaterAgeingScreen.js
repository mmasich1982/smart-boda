/**
 * rider-app/src/screens/lipaLater/LipaLaterAgeingScreen.js
 * RA-03-G: Lipa Later Ageing Report
 * 
 * ✅ SEAMLESS ONLINE/OFFLINE: Cache-first loading with API fallback
 * ✅ MULTILINGUAL: Uses i18n for all UI text
 * ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
 * ✅ NETWORK AWARE: Real-time connectivity detection
 * ✅ NO STATUS BANNERS: Only critical errors shown
 * 
 * Displays ageing analysis with categorization:
 * - Upcoming (Due within 7 days)
 * - Due Today
 * - Overdue 1-30 days
 * - Overdue 31-60 days
 * - Overdue 61-90 days
 * - Overdue 90+ days
 */

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
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

export default function LipaLaterAgeingScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [ageingData, setAgeingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedBucket, setExpandedBucket] = useState('all');

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ LipaLaterAgeing: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // Load ageing data on focus
  useFocusEffect(
    React.useCallback(() => {
      if (!effectiveRiderId || !isInitialized) return;
      loadAgeingReport();
    }, [effectiveRiderId, isInitialized])
  );

  const loadAgeingReport = async () => {
    try {
      setLoading(true);
      clearCriticalError();

      let data = null;

      // Try API first if connected
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Fetching ageing report from API...');
          const response = await api.get(`/trips/lipa-later/ageing-report/${effectiveRiderId}`);

          if (response.data) {
            data = response.data;
            console.log('✅ Loaded ageing report from API');

            // ✅ Cache the data using IndexedDB
            await indexedDbAdapter.kvSet(
              `lipa_ageing_${effectiveRiderId}`,
              JSON.stringify(data)
            );
          }
        } catch (apiErr) {
          console.warn('⚠️ API fetch failed, falling back to cache:', apiErr.message);
          data = await loadAgeingFromCache();
        }
      } else {
        // Offline mode - use cache
        console.log('📴 Offline mode: Loading from cache');
        data = await loadAgeingFromCache();
      }

      if (data) {
        setAgeingData(data);
      } else {
        setAgeingData(getDefaultAgeingStructure());
      }
    } catch (err) {
      console.error('❌ Error loading ageing report:', err);
      showCriticalError(t('error_loadAgeingReport') || 'Unable to load ageing report. Please try again.', 'data_load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAgeingFromCache = async () => {
    try {
      // ✅ Use IndexedDB adapter instead of LocalStore
      const cached = await indexedDbAdapter.kvGet(`lipa_ageing_${effectiveRiderId}`);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        console.log('✅ Loaded ageing report from IndexedDB cache');
        return data;
      }
    } catch (err) {
      console.warn('⚠️ Cache load failed:', err);
    }
    return null;
  };

  const getDefaultAgeingStructure = () => {
    return {
      upcoming: { count: 0, total_amount: 0, records: [] },
      due_today: { count: 0, total_amount: 0, records: [] },
      overdue_1_30: { count: 0, total_amount: 0, records: [] },
      overdue_31_60: { count: 0, total_amount: 0, records: [] },
      overdue_61_90: { count: 0, total_amount: 0, records: [] },
      overdue_90_plus: { count: 0, total_amount: 0, records: [] },
      total_outstanding: 0
    };
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAgeingReport();
  };

  const toggleBucket = (bucket) => {
    setExpandedBucket(expandedBucket === bucket ? null : bucket);
  };

  const renderBucket = (bucketKey, bucketLabel, bucketColor, bucketIcon) => {
    if (!ageingData || !ageingData[bucketKey]) return null;

    const bucket = ageingData[bucketKey];
    const isExpanded = expandedBucket === bucketKey;

    if (bucket.count === 0) return null;

    return (
      <View key={bucketKey} style={styles.bucketContainer}>
        <TouchableOpacity
          onPress={() => toggleBucket(bucketKey)}
          style={[styles.bucketHeader, { borderLeftColor: bucketColor }]}
          activeOpacity={0.7}
        >
          <View style={styles.bucketHeaderLeft}>
            <Text style={styles.bucketIcon}>{bucketIcon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.bucketLabel}>{bucketLabel}</Text>
              <Text style={styles.bucketCount}>
                {bucket.count} {bucket.count === 1 ? t('customer') || 'customer' : t('customers') || 'customers'}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.bucketAmount, { color: bucketColor }]}>
              KSh {(bucket.total_amount || 0).toLocaleString()}
            </Text>
            <Text style={styles.expandIndicator}>{isExpanded ? '▼' : '▶'}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.bucketContent}>
            {bucket.records && bucket.records.length > 0 ? (
              <FlatList
                data={bucket.records}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      navigation.navigate('LipaLaterDetails', {
                        recordId: item.id,
                        record: item
                      });
                    }}
                    activeOpacity={0.6}
                  >
                    <View style={styles.recordItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recordName}>{item.customer_name}</Text>
                        <Text style={styles.recordPhone}>{item.customer_mobile}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.recordAmount}>
                          KSh {(item.remaining_balance || 0).toLocaleString()}
                        </Text>
                        {item.days_overdue && item.days_overdue > 0 && (
                          <Text style={styles.daysOverdue}>
                            {item.days_overdue} {t('days') || 'days'}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id}
              />
            ) : (
              <Text style={styles.nothingInBucketText}>{t('noRecords') || 'No records'}</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('ageingReport') || 'Ageing Report'}</Text>
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
      <Text style={styles.title}>{t('ageingReport') || 'Ageing Report'}</Text>

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
          <Text style={styles.loadingText}>{t('loadingAgeingReport') || 'Loading ageing report...'}</Text>
        </View>
      ) : ageingData ? (
        <>
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('totalOutstanding') || 'TOTAL OUTSTANDING'}</Text>
            <Text style={styles.summaryAmount}>
              KSh {(ageingData.total_outstanding || 0).toLocaleString()}
            </Text>
            <Text style={styles.summarySubtext}>
              {t('totalOutstandingDescription') || 'Total amount outstanding across all customers'}
            </Text>
          </View>

          {/* Ageing Buckets */}
          <View style={styles.bucketsSection}>
            {renderBucket(
              'upcoming',
              t('upcoming') || 'Upcoming',
              '#2196F3',
              '📅'
            )}
            {renderBucket(
              'due_today',
              t('dueToday') || 'Due Today',
              '#FFA500',
              '⚠️'
            )}
            {renderBucket(
              'overdue_1_30',
              t('overdue1to30') || 'Overdue 1-30 Days',
              '#FF6B6B',
              '🔴'
            )}
            {renderBucket(
              'overdue_31_60',
              t('overdue31to60') || 'Overdue 31-60 Days',
              '#FF4444',
              '🔴'
            )}
            {renderBucket(
              'overdue_61_90',
              t('overdue61to90') || 'Overdue 61-90 Days',
              '#DD0000',
              '🔴'
            )}
            {renderBucket(
              'overdue_90_plus',
              t('overdue90plus') || 'Overdue 90+ Days',
              '#BB0000',
              '⛔'
            )}
          </View>

          {/* Empty State */}
          {(!ageingData.upcoming?.count &&
            !ageingData.due_today?.count &&
            !ageingData.overdue_1_30?.count &&
            !ageingData.overdue_31_60?.count &&
            !ageingData.overdue_61_90?.count &&
            !ageingData.overdue_90_plus?.count) && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>{t('noPendingRecords') || 'No pending records'}</Text>
              <Text style={styles.emptySubtitle}>
                {t('allLipaLaterPaidUp') || 'All Lipa Later accounts are paid up. Great job!'}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('LipaLaterCustomers')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>{t('viewAllCustomers') || 'View All Customers →'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('PaymentSummary')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>{t('viewSummary') || 'View Summary →'}</Text>
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

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#ff7a1a'
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#a8a196',
    marginBottom: 6,
    letterSpacing: 0.4
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1c20',
    marginBottom: 4
  },
  summarySubtext: {
    fontSize: 11,
    color: '#a8a196'
  },

  bucketsSection: {
    marginBottom: 24
  },

  bucketContainer: {
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderLeftWidth: 4
  },

  bucketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14
  },
  bucketHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center'
  },
  bucketIcon: {
    fontSize: 18,
    marginRight: 12
  },
  bucketLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 2
  },
  bucketCount: {
    fontSize: 11,
    color: '#a8a196'
  },
  bucketAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4
  },
  expandIndicator: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#a8a196'
  },

  bucketContent: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 14,
    paddingVertical: 10
  },

  recordItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  recordName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 2
  },
  recordPhone: {
    fontSize: 10,
    color: '#a8a196'
  },
  recordAmount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1a1c20',
    marginBottom: 2
  },
  daysOverdue: {
    fontSize: 10,
    color: '#d32f2f',
    fontWeight: '600'
  },

  nothingInBucketText: {
    fontSize: 12,
    color: '#a8a196',
    textAlign: 'center',
    paddingVertical: 10,
    fontStyle: 'italic'
  },

  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1c20',
    marginBottom: 8
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#a8a196',
    textAlign: 'center'
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