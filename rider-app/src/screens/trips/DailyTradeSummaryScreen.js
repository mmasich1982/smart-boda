// rider-app/src/screens/trips/DailyTradeSummaryScreen.js
// ✅ HYBRID SYNC ARCHITECTURE:
// - Localization Provider for multilingual support
// - Network Status hooks for real-time connectivity detection
// - IndexedDB Adapter for offline-first persistent storage
// - Uses local trip repository for immediate cache display
// - No API calls needed (data already in local storage via syncQueue)
// - UI/UX design preserved exactly

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PaginationControls from '../../components/PaginationControls';
import StatusChip from '../../components/StatusChip';
import BreakdownBar from '../../components/BreakdownBar';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import { 
  getTodaysTrips, 
  getTodaysRealizedIncome, 
  getPendingLipaLaterTrips, 
  getSettledLipaLaterToday,
  tripRealizedIncome 
} from '../../offline/tripsRepository';
import { CORRECTION_WINDOW_HOURS } from '../../constants/tripConstants';

const PAYMENT_METHODS = {
  Cash: { label: 'Cash', color: '#ff7a1a' },
  MPesa: { label: 'M-Pesa', color: '#1e9e6f' },
  LipaLater: { label: 'Lipa Later', color: '#8b5cf6' },
};

const ITEMS_PER_PAGE = 10;

/**
 * Daily Trade Summary Screen (RA-04-A)
 * ✅ OFFLINE-FIRST: Uses local trip repository, no API calls needed
 * ✅ MULTILINGUAL: All UI text uses i18n translations
 * ✅ NETWORK AWARE: Real-time connectivity detection
 * Data flows from syncQueue → IndexedDB → UI
 */
export default function DailyTradeSummaryScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();
  
  const [trips, setTrips] = useState([]);
  const [realizedIncome, setRealizedIncome] = useState(0);
  const [byChannel, setByChannel] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pendingLipaLater, setPendingLipaLater] = useState([]);
  const [settledLipaLater, setSettledLipaLater] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ LOAD DATA FROM INDEXEDDB ON MOUNT OR REFRESH
  const loadTodaysData = useCallback(async () => {
    try {
      setLoading(true);

      // Load all data from IndexedDB (local-first)
      const todaysTripsData = await getTodaysTrips();
      const realizedInc = await getTodaysRealizedIncome();
      const pending = await getPendingLipaLaterTrips();
      const settled = await getSettledLipaLaterToday();

      setTrips(todaysTripsData || []);
      setRealizedIncome(realizedInc || 0);
      setPendingLipaLater(pending || []);
      setSettledLipaLater(settled || []);

      // Calculate breakdown by payment method
      const breakdown = {};
      (todaysTripsData || []).forEach((trip) => {
        const method = trip.method || 'Cash';
        if (!breakdown[method]) {
          breakdown[method] = 0;
        }
        breakdown[method] += trip.amount || 0;
      });
      setByChannel(breakdown);

      console.log('✅ Loaded today\'s trips from IndexedDB:', {
        count: (todaysTripsData || []).length,
        realizedIncome: realizedInc,
      });
    } catch (err) {
      console.error('❌ Error loading today\'s data:', err);
      showCriticalError(
        t('error_loadingData') || 'Failed to load data. Please try again.',
        'load_error'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, showCriticalError]);

  // ✅ INITIAL LOAD
  useEffect(() => {
    loadTodaysData();
  }, [loadTodaysData]);

  // ✅ REFRESH WHEN RETURNING FROM TRIP ENTRY SCREEN
  useEffect(() => {
    if (route.params?.refreshData) {
      setRefreshing(true);
      loadTodaysData();
    }
  }, [route.params?.refreshData, loadTodaysData]);

  const paginatedTrips = trips.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalPages = Math.ceil(trips.length / ITEMS_PER_PAGE);

  // ✅ RENDER TRIP ITEM
  const renderTripItem = ({ item }) => {
    const methodConfig = PAYMENT_METHODS[item.method] || PAYMENT_METHODS.Cash;
    const canCorrect = 
      item.status === 'active' && 
      new Date() - new Date(item.created_at) < CORRECTION_WINDOW_HOURS * 60 * 60 * 1000;

    return (
      <View style={styles.tripItem}>
        <View style={styles.tripHeader}>
          <View style={styles.tripMainInfo}>
            <Text style={styles.tripAmount}>KSh {item.amount}</Text>
            <StatusChip 
              status={item.status || 'active'} 
              label={item.status === 'corrected' ? t('corrected') || 'Corrected' : t('active') || 'Active'}
            />
          </View>
          <Text style={styles.tripTime}>
            {new Date(item.created_at).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: true 
            })}
          </Text>
        </View>

        <View style={styles.tripFooter}>
          <View style={[styles.methodBadge, { backgroundColor: methodConfig.color + '20' }]}>
            <Text style={[styles.methodBadgeText, { color: methodConfig.color }]}>
              {methodConfig.label}
            </Text>
          </View>
          {canCorrect && (
            <TouchableOpacity 
              style={styles.correctBtn}
              onPress={() => navigation.navigate('EditTrip', { trip: item })}
            >
              <Text style={styles.correctBtnText}>{t('correctButton') || 'Correct'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('dailyTradeSummary') || 'Daily Trade Summary'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      onScroll={() => clearCriticalError()}
    >
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('dailyTradeSummary') || 'Daily Trade Summary'}</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SUMMARY CARD */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t('totalTrips') || 'Total Trips'}</Text>
          <Text style={styles.summaryValue}>{trips.length}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t('realizedIncome') || 'Realized Income'}</Text>
          <Text style={styles.summaryValue}>KSh {realizedIncome.toLocaleString()}</Text>
        </View>
      </View>

      {/* BREAKDOWN BY CHANNEL */}
      {Object.keys(byChannel).length > 0 && (
        <View style={styles.breakdownSection}>
          <Text style={styles.sectionTitle}>{t('breakdownByPaymentMethod') || 'Breakdown by Payment Method'}</Text>
          <BreakdownBar data={byChannel} colors={PAYMENT_METHODS} />
        </View>
      )}

      {/* PENDING LIPA LATER */}
      {pendingLipaLater.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('pendingLipaLater') || 'Pending Lipa Later'}</Text>
          <View style={styles.lipaLaterCard}>
            <Text style={styles.lipaLaterAmount}>KSh {pendingLipaLater.reduce((sum, t) => sum + (t.amount || 0), 0)}</Text>
            <Text style={styles.lipaLaterText}>{pendingLipaLater.length} {t('transactions') || 'transactions'}</Text>
          </View>
        </View>
      )}

      {/* SETTLED LIPA LATER TODAY */}
      {settledLipaLater.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settledLipaLaterToday') || 'Settled Lipa Later Today'}</Text>
          <View style={[styles.lipaLaterCard, styles.settledCard]}>
            <Text style={styles.lipaLaterAmount}>KSh {settledLipaLater.reduce((sum, t) => sum + (t.amount || 0), 0)}</Text>
            <Text style={styles.lipaLaterText}>{settledLipaLater.length} {t('transactions') || 'transactions'}</Text>
          </View>
        </View>
      )}

      {/* TRIPS LIST */}
      {trips.length > 0 ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('allTrips') || 'All Trips'}</Text>
            <FlatList
              data={paginatedTrips}
              keyExtractor={(item) => item.id}
              renderItem={renderTripItem}
              scrollEnabled={false}
            />
          </View>

          {totalPages > 1 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPreviousPage={() => setCurrentPage(Math.max(1, currentPage - 1))}
              onNextPage={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              t={t}
            />
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t('noTripsToday') || 'No trips today'}</Text>
          <TouchableOpacity 
            style={styles.recordTripBtn}
            onPress={() => navigation.navigate('NewTrip')}
          >
            <Text style={styles.recordTripBtnText}>{t('recordTripButton') || 'Record Your First Trip →'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f6f4ef'
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4
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

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
    marginBottom: 20
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  summaryLabel: {
    fontSize: 13,
    color: '#5b606c',
    fontWeight: '500'
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20'
  },

  breakdownSection: {
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12
  },

  section: {
    marginBottom: 20
  },

  tripItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e4db',
    padding: 14,
    marginBottom: 12
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  tripMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  tripAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20'
  },
  tripTime: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500'
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  methodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  methodBadgeText: {
    fontSize: 11,
    fontWeight: '600'
  },
  correctBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ff7a1a20'
  },
  correctBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ff7a1a'
  },

  lipaLaterCard: {
    backgroundColor: '#f3e8ff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d8b4fe',
    padding: 14,
    marginBottom: 12
  },
  settledCard: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac'
  },
  lipaLaterAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4
  },
  lipaLaterText: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500'
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyStateText: {
    fontSize: 14,
    color: '#5b606c',
    marginBottom: 20
  },
  recordTripBtn: {
    backgroundColor: '#ff7a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  recordTripBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  }
});
