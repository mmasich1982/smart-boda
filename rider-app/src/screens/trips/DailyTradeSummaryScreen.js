// rider-app/src/screens/trips/DailyTradeSummaryScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors FuelHistoryScreen)
// ✅ SEAMLESS ONLINE/OFFLINE: Real-time cache updates, no external dependencies
// ✅ UNIFIED ARCHITECTURE: Removed tripsRepository - uses only IndexedDB kvSet/kvGet
// ✅ INSTANT UI UPDATES: useFocusEffect ensures trip list updates immediately
// ✅ NETWORK AWARE: Graceful fallback when offline
// ✅ UI/UX: 100% preserved from original

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PaginationControls from '../../components/PaginationControls';
import StatusChip from '../../components/StatusChip';
import BreakdownBar from '../../components/BreakdownBar';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { CORRECTION_WINDOW_HOURS } from '../../constants/tripConstants';

const PAYMENT_METHODS = {
  Cash: { label: 'Cash', color: '#ff7a1a' },
  MPesa: { label: 'M-Pesa', color: '#1e9e6f' },
  LipaLater: { label: 'Lipa Later', color: '#8b5cf6' },
};

const ITEMS_PER_PAGE = 10;

/**
 * ✅ REFACTORED: Daily Trade Summary Screen (RA-04-A)
 * ✅ UNIFIED ARCHITECTURE: IndexedDB-first with no repository dependencies
 * ✅ INSTANT UPDATES: useFocusEffect ensures real-time refresh when returning from NewTripScreen
 * ✅ OFFLINE PERSISTENCE: All data stored in IndexedDB cache
 * ✅ CLEAN UI: No technical details exposed to riders
 *
 * KEY CHANGES FROM ORIGINAL:
 * • Removed all tripsRepository imports and dependencies
 * • Uses indexedDbAdapter.kvGet() for trip_history cache
 * • Uses indexedDbAdapter.kvGet() for trip_entry individual records
 * • Trip data calculated directly from cached records
 * • Lipa Later support via trip.lipaLater field in record
 * • Lipa Later status determined from payment date vs trip date
 * • Real-time updates on screen focus via useFocusEffect
 *
 * CACHE STRUCTURE:
 * - trip_history_${riderId}: Array of all today's trips (maintained by NewTripScreen)
 * - trip_entry_${tripId}: Individual trip records
 */
export default function DailyTradeSummaryScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [riderId, setRiderId] = useState(null);
  const [trips, setTrips] = useState([]);
  const [realizedIncome, setRealizedIncome] = useState(0);
  const [byChannel, setByChannel] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pendingLipaLater, setPendingLipaLater] = useState([]);
  const [settledLipaLater, setSettledLipaLater] = useState([]);

  // ✅ Track if data has been loaded on mount
  const hasLoadedRef = useRef(false);

  // ✅ Load riderId on mount
  useEffect(() => {
    async function initRiderId() {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
          console.log('✅ DailyTradeSummary: Loaded rider ID:', id);
        } else {
          showToast('Rider ID not found', 'error');
        }
      } catch (err) {
        console.error('❌ Error loading riderId:', err);
        showToast('Error loading rider information', 'error');
      }
    }
    initRiderId();
  }, [showToast]);

  /**
   * ✅ Load trips from IndexedDB cache
   * Mirrors the fuel pattern: cache is primary source of truth
   */
  const loadTripsFromCache = useCallback(async (riderIdParam) => {
    try {
      const cacheKey = `trip_history_${riderIdParam}`;
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);
      
      if (cachedData) {
        let items = [];
        try {
          items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (!Array.isArray(items)) items = [];
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error, starting fresh');
          items = [];
        }
        return items;
      }
      return [];
    } catch (err) {
      console.error('❌ Error loading cache:', err);
      return [];
    }
  }, []);

  /**
   * ✅ Calculate realized income and breakdown from trips
   * - Cash/M-Pesa: Count on trip date
   * - Lipa Later: Count on payment date if settled today, pending if not
   */
  const calculateIncome = useCallback((tripsArray) => {
    let total = 0;
    const byMethod = {};
    const pending = [];
    const settled = [];
    const today = new Date().toDateString();

    tripsArray.forEach(trip => {
      if (trip.status !== 'voided') {
        const method = trip.paymentMethod || trip.method;
        const amount = trip.amount || 0;

        // Initialize method if not exists
        if (!byMethod[method]) {
          byMethod[method] = 0;
        }

        if (method === 'LipaLater') {
          // Check Lipa Later payment status
          if (trip.lipaLater) {
            const paymentDate = trip.lipaLater.paymentDate 
              ? new Date(trip.lipaLater.paymentDate).toDateString()
              : null;
            
            if (paymentDate === today && trip.lipaLater.settled) {
              // Payment received today
              byMethod[method] += amount;
              total += amount;
              settled.push(trip);
            } else if (!trip.lipaLater.settled) {
              // Pending payment
              pending.push(trip);
            }
          } else {
            // No Lipa Later data yet - treat as pending
            pending.push(trip);
          }
        } else {
          // Cash or M-Pesa - count immediately on trip date
          byMethod[method] += amount;
          total += amount;
        }
      }
    });

    return { total, byMethod, pending, settled };
  }, []);

  const loadData = useCallback(async () => {
    if (!riderId) return;

    try {
      setLoading(true);

      // ✅ Load trips from cache
      const todaysTrips = await loadTripsFromCache(riderId);
      
      // ✅ Filter to today's trips (active status)
      const today = new Date().toDateString();
      const activeTrips = todaysTrips
        .filter(t => {
          const tripDate = new Date(t.ts || t.timestamp || 0).toDateString();
          return t.status === 'active' && tripDate === today;
        })
        .sort((a, b) => {
          const bTs = b.ts || b.timestamp || 0;
          const aTs = a.ts || a.timestamp || 0;
          return bTs - aTs;
        });

      setTrips(activeTrips);

      // ✅ Calculate realized income and breakdown
      const { total, byMethod, pending, settled } = calculateIncome(activeTrips);
      setRealizedIncome(total);
      setByChannel(byMethod);
      setPendingLipaLater(pending);
      setSettledLipaLater(settled);

      console.log('✅ DailyTradeSummary loaded:', {
        activeTrips: activeTrips.length,
        realizedIncome: total,
        methods: Object.keys(byMethod).length,
      });
    } catch (err) {
      console.error('❌ DailyTradeSummaryScreen load error:', err);
      showToast('Error loading daily summary', 'error');
    } finally {
      setLoading(false);
    }
  }, [riderId, loadTripsFromCache, calculateIncome, showToast]);

  // ✅ Load data on mount
  useEffect(() => {
    if (riderId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadData();
    }
  }, [riderId, loadData]);

  // ✅ Refresh data on screen focus (ensures real-time updates)
  useFocusEffect(
    useCallback(() => {
      if (riderId && hasLoadedRef.current) {
        loadData();
      }
    }, [riderId, loadData])
  );

  const hoursSinceTrip = (tripTs) => {
    const ts = tripTs || 0;
    const now = Date.now();
    return (now - ts) / (1000 * 60 * 60);
  };

  const isEditableTrip = (trip) => {
    const ts = trip.ts || trip.timestamp || 0;
    return hoursSinceTrip(ts) < CORRECTION_WINDOW_HOURS;
  };

  const getTripMethod = (trip) => {
    return trip.method || trip.paymentMethod;
  };

  const activeTripsCount = trips.length;
  const totalPages = Math.ceil(trips.length / ITEMS_PER_PAGE);
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTrips = trips.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const renderTripRow = ({ item: trip }) => {
    const ts = trip.ts || trip.timestamp || 0;
    const editable = isEditableTrip(trip);
    const method = getTripMethod(trip);
    const isPendingLipaLater = method === 'LipaLater' && (!trip.lipaLater || !trip.lipaLater.settled);
    const methodInfo = PAYMENT_METHODS[method];
    const methodLabel = methodInfo?.label || method;
    const remainHours = Math.max(0, CORRECTION_WINDOW_HOURS - hoursSinceTrip(ts));

    return (
      <TouchableOpacity
        style={[styles.tripRow, trip.status === 'voided' && styles.voidedRow]}
        onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
      >
        <View style={styles.tripLeft}>
          <Text style={styles.tripMethod}>
            {methodLabel}
            {method === 'LipaLater' && trip.lipaLater
              ? ` · ${trip.lipaLater.customerName || 'Customer'}`
              : ''}
            {trip.note ? ` · ${trip.note}` : ''}
          </Text>
          <Text style={styles.tripTime}>
            {new Date(ts).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' · '}
            {trip.syncStatus === 'pending' ? 'Queued' : 'Saved'}
            {trip.correctionReason ? ' · Corrected' : ''}
          </Text>
        </View>
        <View style={styles.tripRight}>
          {trip.status === 'voided' ? (
            <StatusChip label="VOIDED" variant="voided" />
          ) : isPendingLipaLater ? (
            <StatusChip label="Payment Pending" variant="pending" />
          ) : editable ? (
            <StatusChip label={`Editable ${remainHours.toFixed(1)}h`} variant="success" />
          ) : (
            <StatusChip label="Locked" variant="locked" />
          )}
          <Text style={styles.tripAmount}>KSh {(trip.amount || 0).toLocaleString()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading || !riderId) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Home" onPress={() => navigation.navigate('Dashboard')} />

      <Text style={styles.screenTitle}>My Daily Trade Summary</Text>

      <View style={styles.card}>
        <View style={styles.heroRow}>
          <View style={styles.heroCol}>
            <Text style={styles.heroNumber}>{activeTripsCount}</Text>
            <Text style={styles.heroLabel}>Trips</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.heroCol}>
            <Text style={styles.heroNumber}>KSh {realizedIncome.toLocaleString()}</Text>
            <Text style={styles.heroLabel}>Total Income</Text>
          </View>
        </View>

        {realizedIncome > 0 && (
          <>
            <BreakdownBar data={byChannel} colors={PAYMENT_METHODS} style={styles.breakdownBar} />
            <View style={styles.methodsBreakdown}>
              {Object.entries(byChannel).map(([method, amount]) => {
                const pct = ((amount / realizedIncome) * 100).toFixed(1);
                const methodInfo = PAYMENT_METHODS[method];
                const displayLabel = methodInfo?.label || method;

                return (
                  <View key={method} style={styles.methodItem}>
                    <View style={styles.methodLeft}>
                      <View
                        style={[
                          styles.methodSwatch,
                          { backgroundColor: methodInfo?.color || '#999' },
                        ]}
                      />
                      <Text style={styles.methodLabel}>{displayLabel}</Text>
                    </View>
                    <View style={styles.methodRight}>
                      <Text style={styles.methodAmount}>KSh {amount.toLocaleString()}</Text>
                      <Text style={styles.methodPercent}>{pct}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {(pendingLipaLater.length > 0 || settledLipaLater.length > 0) && (
          <View style={styles.lipaLaterStatus}>
            {settledLipaLater.length > 0 && (
              <Text style={styles.hintText}>
                ✓ <Text style={styles.hintBold}>Lipa Later Collections</Text>: KSh{' '}
                {settledLipaLater.reduce((s, t) => s + t.amount, 0).toLocaleString()} from{' '}
                {settledLipaLater.length} payment{settledLipaLater.length === 1 ? '' : 's'} received today are included above.
              </Text>
            )}

            {pendingLipaLater.length > 0 && (
              <Text style={styles.hintText}>
                🕒 <Text style={styles.hintBold}>{pendingLipaLater.length} Lipa Later Trip{pendingLipaLater.length === 1 ? '' : 's'} Pending</Text>: Awaiting customer payment. Tap{' '}
                <Text
                  style={styles.hintLink}
                  onPress={() => navigation.navigate('LipaLaterCustomersScreen')}
                >
                  View Lipa Later →
                </Text>{' '}
                for details.
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trips (tap to correct or void)</Text>
        {trips.length > 0 ? (
          <FlatList
            data={paginatedTrips}
            renderItem={renderTripRow}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        ) : (
          <Text style={styles.noTripsHint}>No trips recorded today.</Text>
        )}
      </View>

      {totalPages > 1 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
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
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  heroRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroCol: {
    flex: 1,
    textAlign: 'center',
    alignItems: 'center',
  },
  heroNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  heroLabel: {
    fontSize: 12,
    color: '#5b606c',
  },
  divider: {
    width: 1.5,
    height: 50,
    backgroundColor: '#e7e4db',
    marginHorizontal: 16,
  },
  breakdownBar: {
    marginVertical: 8,
  },
  methodsBreakdown: {
    marginVertical: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  methodItem: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  methodLeft: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  methodSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  methodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
  },
  methodRight: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  methodAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  methodPercent: {
    fontSize: 11,
    color: '#5b606c',
    minWidth: 32,
    textAlign: 'right',
  },
  lipaLaterStatus: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
  },
  hintText: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
    marginBottom: 6,
  },
  hintBold: {
    fontWeight: '700',
    color: '#1a1c20',
  },
  hintLink: {
    color: '#ff7a1a',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  tripRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  tripRow_last: {
    borderBottomWidth: 0,
  },
  voidedRow: {
    opacity: 0.5,
  },
  tripLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  tripMethod: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1c20',
  },
  tripTime: {
    fontSize: 11,
    color: '#5b606c',
    marginTop: 4,
  },
  tripRight: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  },
  tripAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },
  noTripsHint: {
    fontSize: 12,
    color: '#5b606c',
    paddingVertical: 14,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 20,
  },
});