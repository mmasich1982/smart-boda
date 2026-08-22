// rider-app/src/screens/trips/TripDetailScreen.js
// ✅ UPDATED: Offline-first with cache-first trip loading
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ NETWORK AWARE: Real-time connectivity detection
// - Loads trip from local storage immediately
// - No API calls for trip data (data in local repository)
// - Supports trip editing and void operations via enqueue()
// - No network errors shown to user
// - UI/UX design preserved exactly

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { getTripById, updateTripLocally } from '../../offline/tripsRepository';
import { enqueue } from '../../offline/syncQueue';

const CORRECTION_WINDOW_HOURS = 3;
const PAYMENT_METHODS = {
  Cash: { label: 'Cash', color: '#ff7a1a' },
  MPesa: { label: 'M-Pesa', color: '#1e9e6f' },
  LipaLater: { label: 'Lipa Later', color: '#8b5cf6' },
};

export default function TripDetailScreen({ navigation, route }) {
  const { tripId } = route.params;
  const { t } = useTranslation();
  const { isConnected, isInitialized } = useNetworkStatus();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ✅ CACHE-FIRST: Load trip from local storage
  useEffect(() => {
    async function loadTrip() {
      try {
        setLoading(true);
        const tripData = await getTripById(tripId);
        
        if (!tripData) {
          setError(t('error_tripNotFound') || 'Trip not found.');
          return;
        }

        setTrip(tripData);
        setError('');
      } catch (err) {
        console.error('Error loading trip:', err);
        setError(t('error_loadTripDetails') || 'Could not load trip details.');
      } finally {
        setLoading(false);
      }
    }

    loadTrip();
  }, [tripId, t]);

  const hoursSinceTrip = () => {
    const ts = trip?.ts || trip?.timestamp || 0;
    const now = Date.now();
    return (now - ts) / (1000 * 60 * 60);
  };

  const canEdit = hoursSinceTrip() < CORRECTION_WINDOW_HOURS;
  const remainHours = Math.max(0, CORRECTION_WINDOW_HOURS - hoursSinceTrip());

  const handleEdit = () => {
    if (!canEdit) {
      Alert.alert(
        t('error_cannotEdit') || 'Cannot Edit', 
        t('error_tripLocked', { hours: remainHours.toFixed(1) }) || `This trip is locked and can no longer be edited. (${remainHours.toFixed(1)}h remaining)`
      );
      return;
    }
    navigation.navigate('EditTrip', { tripId });
  };

  const handleVoid = () => {
    if (trip?.status === 'voided') {
      Alert.alert(
        t('error_alreadyVoided') || 'Already Voided', 
        t('error_tripAlreadyVoided') || 'This trip has already been voided.'
      );
      return;
    }

    Alert.alert(
      t('confirmVoid') || 'Void Trip?',
      t('confirmVoidMessage') || 'This action cannot be undone. The trip will be recorded as voided.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('void') || 'Void',
          style: 'destructive',
          onPress: async () => {
            try {
              // ✅ QUEUE VOID OPERATION
              await enqueue('trip_void', {
                tripId,
                voidedAt: Date.now(),
                reason: t('voidReason_userInitiated') || 'User initiated void',
              });

              // Update local state
              setTrip({ ...trip, status: 'voided' });
              
              // Navigate back
              navigation.goBack();
            } catch (err) {
              console.error('Error voiding trip:', err);
              Alert.alert(t('error') || 'Error', t('error_voidFailed') || 'Could not void trip. Please try again.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} />
        <Text style={styles.loading}>{t('loading') || 'Loading...'}</Text>
      </View>
    );
  }

  if (!trip || error) {
    return (
      <View style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{t('tripDetails') || 'Trip Details'}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  const method = trip.method || trip.paymentMethod || 'Unknown';
  const methodInfo = PAYMENT_METHODS[method];
  const methodLabel = methodInfo?.label || method;
  const tripTime = new Date(trip.ts || trip.timestamp || 0);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={styles.title}>{t('tripDetails') || 'Trip Details'}</Text>

      <View style={[styles.card, trip.status === 'voided' && styles.voidedCard]}>
        <View style={styles.heroSection}>
          <Text style={styles.heroAmount}>KSh {(trip.amount || 0).toLocaleString()}</Text>
          <Text style={styles.heroMethod}>{methodLabel}</Text>
          {trip.status === 'voided' && (
            <Text style={styles.voidedLabel}>{t('voided') || 'VOIDED'}</Text>
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('dateTime') || 'Date & Time'}</Text>
            <Text style={styles.infoValue}>
              {tripTime.toLocaleDateString()} {tripTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          {trip.lipaLater && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('customerName') || 'Customer Name'}</Text>
                <Text style={styles.infoValue}>{trip.lipaLater.customerName || 'N/A'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('status') || 'Status'}</Text>
                <Text style={[styles.infoValue, { color: trip.lipaLater.settled ? '#1e9e6f' : '#ff7a1a' }]}>
                  {trip.lipaLater.settled ? (t('settled') || 'Settled') : (t('pendingPayment') || 'Pending Payment')}
                </Text>
              </View>
            </>
          )}

          {trip.note && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('notes') || 'Notes'}</Text>
              <Text style={styles.infoValue}>{trip.note}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('status') || 'Status'}</Text>
            <Text style={styles.infoValue}>
              {trip.syncStatus === 'pending' ? '⏳ ' + (t('queuedForSync') || 'Queued for sync') : '✓ ' + (t('saved') || 'Saved')}
            </Text>
          </View>

          {trip.correctionReason && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('correctionReason') || 'Correction Reason'}</Text>
              <Text style={styles.infoValue}>{trip.correctionReason}</Text>
            </View>
          )}
        </View>
      </View>

      {!canEdit && trip.status !== 'voided' && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedText}>
            {t('tripLocked') || 'This trip is locked and can no longer be edited.'}
          </Text>
        </View>
      )}

      {trip.status !== 'voided' && canEdit && (
        <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
          <Text style={styles.editBtnText}>✏️ {t('editTrip') || 'Edit Trip'}</Text>
        </TouchableOpacity>
      )}

      {trip.status !== 'voided' && (
        <TouchableOpacity style={styles.voidBtn} onPress={handleVoid}>
          <Text style={styles.voidBtnText}>🗑 {t('voidTrip') || 'Void Trip'}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.closeBtnText}>{t('close') || 'Close'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f6f4ef' },
  loading: { fontSize: 14, color: '#5b606c', textAlign: 'center', marginTop: 20 },
  title: { fontSize: 20, fontWeight: '700', marginVertical: 12, color: '#1a1c20' },
  error: { fontSize: 13, color: '#e0453f', marginTop: 12, padding: 12, backgroundColor: '#fdecea', borderRadius: 8 },

  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 12, padding: 16, marginBottom: 16 },
  voidedCard: { opacity: 0.7, backgroundColor: '#fafafa' },

  heroSection: { alignItems: 'center', marginBottom: 20 },
  heroAmount: { fontSize: 32, fontWeight: '700', color: '#ff7a1a', marginBottom: 6 },
  heroMethod: { fontSize: 16, fontWeight: '600', color: '#1a1c20', marginBottom: 8 },
  voidedLabel: { fontSize: 12, fontWeight: '700', color: '#e0453f', backgroundColor: '#fdecea', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },

  infoSection: { borderTopWidth: 1, borderTopColor: '#e7e4db', paddingTop: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#5b606c' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1a1c20', textAlign: 'right', flex: 1, marginLeft: 16 },

  lockedBanner: { backgroundColor: '#fff3cd', borderWidth: 1, borderColor: '#ffc107', borderRadius: 8, padding: 12, marginBottom: 12 },
  lockedText: { fontSize: 13, color: '#856404', fontWeight: '600' },

  editBtn: { backgroundColor: '#1e9e6f', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  editBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  voidBtn: { backgroundColor: '#e0453f', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  voidBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  closeBtn: { backgroundColor: '#e7e4db', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  closeBtnText: { color: '#1a1c20', fontSize: 15, fontWeight: '700' },
});