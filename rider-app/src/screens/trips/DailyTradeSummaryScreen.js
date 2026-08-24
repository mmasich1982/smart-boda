import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList, Alert } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PaginationControls from '../../components/PaginationControls';
import StatusChip from '../../components/StatusChip';
import BreakdownBar from '../../components/BreakdownBar';
import { getLocalRiderId } from '../../offline/db';
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
 * CORRECTED: Daily Trade Summary Screen (RA-04-A)
 * ✅ MIGRATED: Uses IndexedDB via updated tripsRepository
 * ✅ UPDATED: Passes riderId to all repository functions
 * ✅ CLEAN UI: No technical details exposed to riders
 * 
 * Key improvements:
 * - Uses tripRealizedIncome() pattern for proper income extraction
 * - Supports both 'method' and 'paymentMethod' field names
 * - Supports both 'ts' and 'timestamp' field names
 * - Proper Lipa Later payment date attribution
 * - Clear pending/settled status display
 * - Fast, low-latency UI (no retention status calls)
 * - Data retention managed server-side (hidden from riders)
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

  // ✅ UPDATED: Load riderId first
  useEffect(() => {
    async function initRiderId() {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
        } else {
          showToast('Rider ID not found', 'error');
        }
      } catch (err) {
        console.error('Error loading riderId:', err);
        showToast('Error loading rider information', 'error');
      }
    }
    initRiderId();
  }, [showToast]);

  const loadData = useCallback(async () => {
    if (!riderId) return;

    try {
      setLoading(true);
      
      // ✅ UPDATED: Pass riderId to all functions
      // Get today's trips
      const todaysTrips = await getTodaysTrips(riderId);
      const activeTrips = todaysTrips
        .filter(t => t.status === 'active')
        .sort((a, b) => {
          const bTs = b.ts || b.timestamp || 0;
          const aTs = a.ts || a.timestamp || 0;
          return bTs - aTs;
        });
      setTrips(activeTrips);

      // Calculate realized income including Lipa Later payments received today
      const realized = await getTodaysRealizedIncome(riderId);
      setRealizedIncome(realized.total || 0);

      // Build channel breakdown with all payment methods
      // Lipa Later payments are counted by their payment date, not trip date
      const channels = {};
      (realized.byMethod || []).forEach(item => {
        channels[item.method] = item.amount;
      });
      
      // Ensure all payment methods are shown if they have any amount
      if (realized.breakdown) {
        Object.entries(realized.breakdown).forEach(([method, amount]) => {
          if (amount > 0 && !channels[method]) {
            channels[method] = amount;
          }
        });
      }
      setByChannel(channels);

      // Get pending and settled Lipa Later trips
      const pending = await getPendingLipaLaterTrips(riderId);
      const settled = await getSettledLipaLaterToday(riderId);
      setPendingLipaLater(pending);
      setSettledLipaLater(settled);
    } catch (err) {
      console.error('DailyTradeSummaryScreen load error:', err);
      showToast('Error loading daily summary', 'error');
    } finally {
      setLoading(false);
    }
  }, [riderId, showToast]);

  useEffect(() => {
    if (riderId) {
      loadData();
    }
  }, [riderId, loadData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (route?.params?.refreshData && riderId) {
        loadData();
      }
    });
    return unsubscribe;
  }, [navigation, loadData, route, riderId]);

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
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />

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
                🕒 <Text style={styles.hintBold}>{pendingLipaLater.length} Lipa Later Trip{pendingLipaLater.length === 1 ? '' : 's'} Pending</Text>: Awaiting customer payment. Tap <Text
                  style={styles.hintLink}
                  onPress={() => navigation.navigate('LipaLaterCustomers')}
                >
                  View Lipa Later →
                </Text>{' '}for details.
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
          <Text style={styles.noTripsHint}>No trips recorded this day.</Text>
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