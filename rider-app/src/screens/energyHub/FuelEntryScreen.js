// rider-app/src/screens/energyHub/FuelEntryScreen.js
// ✅ COMPLETE REWRITE: Proper UI/UX alignment + Robust offline functionality
// Features:
// - Records save to offline storage regardless of network
// - Guaranteed navigation to history after offline save
// - SyncQueue integration for pending records
// - Proper error handling throughout

import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import SyncQueue from '../../offline/SyncQueue';
import { useTranslation } from '../../i18n/LocalizationProvider';

const FuelEntryScreen = ({ route, navigation }) => {
  const { t } = useTranslation();
  const { state: riderState } = useRider();
  
  // State management
  const [litres, setLitres] = useState('');
  const [cost, setCost] = useState('');
  const [station, setStation] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Get rider ID with fallback
  const getRiderId = useCallback(() => {
    try {
      return getLocalRiderId();
    } catch (err) {
      return riderState?.riderId;
    }
  }, [riderState]);

  // Validate inputs
  const validateInputs = useCallback(() => {
    if (!litres || isNaN(parseFloat(litres)) || parseFloat(litres) <= 0) {
      Alert.alert(
        t('error') || 'Error',
        t('please_enter_valid_litres') || 'Please enter a valid number of litres'
      );
      return false;
    }
    if (!cost || isNaN(parseFloat(cost)) || parseFloat(cost) <= 0) {
      Alert.alert(
        t('error') || 'Error',
        t('please_enter_valid_cost') || 'Please enter a valid cost'
      );
      return false;
    }
    return true;
  }, [litres, cost, t]);

  // ✅ CRITICAL: Save with guaranteed offline support + guaranteed history navigation
  const handleSaveFuel = useCallback(async () => {
    if (!validateInputs()) return;

    const riderId = getRiderId();
    if (!riderId) {
      Alert.alert(
        t('error') || 'Error',
        t('unable_to_identify_rider') || 'Unable to identify rider'
      );
      return;
    }

    try {
      setLoading(true);
      
      // Create fuel entry with unique ID
      const fuelEntry = {
        id: `fuel_${Date.now()}`,
        rider_id: riderId,
        litres: parseFloat(litres),
        cost: parseFloat(cost),
        station: station || 'Not specified',
        notes: notes,
        date: new Date().toISOString(),
        synced: false,
        serverId: null,
      };

      // ✅ STEP 1: ALWAYS save to offline storage first
      let offlineSaveSuccess = false;
      try {
        const existingEntriesJson = LocalStore.get(`fuel_entries_${riderId}`);
        const entries = existingEntriesJson ? JSON.parse(existingEntriesJson) : [];
        
        // Add new entry to the front (newest first)
        entries.unshift(fuelEntry);
        
        offlineSaveSuccess = LocalStore.set(
          `fuel_entries_${riderId}`,
          JSON.stringify(entries)
        );
        
        if (offlineSaveSuccess) {
          console.log('✅ Fuel entry saved to offline storage');
        } else {
          console.error('Failed to save to offline storage');
          Alert.alert(
            t('error') || 'Error',
            t('failed_to_save_offline') || 'Failed to save offline'
          );
          setLoading(false);
          return;
        }
      } catch (offlineErr) {
        console.error('Offline save error:', offlineErr);
        Alert.alert(
          t('error') || 'Error',
          t('failed_to_save_offline') || 'Failed to save offline'
        );
        setLoading(false);
        return;
      }

      // ✅ STEP 2: Try to sync immediately (doesn't block offline success)
      let syncedOnline = false;
      try {
        const response = await api.post('/fuel/entry', fuelEntry);
        
        if (response.data?.id) {
          // Update local record to mark as synced
          const entriesJson = LocalStore.get(`fuel_entries_${riderId}`);
          const entries = entriesJson ? JSON.parse(entriesJson) : [];
          const updated = entries.map(e => 
            e.id === fuelEntry.id 
              ? { ...e, synced: true, serverId: response.data.id } 
              : e
          );
          LocalStore.set(`fuel_entries_${riderId}`, JSON.stringify(updated));
          syncedOnline = true;
          console.log('✅ Fuel entry synced to server');
        }
      } catch (syncErr) {
        // Network error - will sync later
        if (isNetworkError(syncErr)) {
          console.warn('Offline: Queuing fuel entry for sync');
          setIsOffline(true);
          
          // Queue for later sync
          try {
            SyncQueue.addEntry('fuel', fuelEntry, '/fuel/entry');
            console.log('✅ Entry queued for later sync');
          } catch (queueErr) {
            console.error('Error adding to sync queue:', queueErr);
          }
        } else {
          // Other error (not network) - still don't fail since offline save succeeded
          console.warn('Sync error (will retry later):', syncErr.message);
        }
      }

      // ✅ STEP 3: Clear form
      setLitres('');
      setCost('');
      setStation('');
      setNotes('');

      // ✅ STEP 4: GUARANTEED navigation to history
      // This ALWAYS happens, regardless of sync status
      Alert.alert(
        t('success') || 'Success',
        syncedOnline 
          ? (t('fuel_entry_saved') || 'Fuel entry saved')
          : (t('fuel_entry_saved_offline') || 'Fuel entry saved (will sync when online)'),
        [{
          text: t('ok') || 'OK',
          onPress: () => {
            // Navigate to fuel history - GUARANTEED
            navigation.navigate('FuelHistory');
          }
        }]
      );

    } catch (err) {
      console.error('Unexpected error:', err);
      Alert.alert(
        t('error') || 'Error',
        t('failed_to_save_fuel_entry') || 'Failed to save fuel entry'
      );
    } finally {
      setLoading(false);
    }
  }, [validateInputs, getRiderId, litres, cost, station, notes, navigation, t]);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <BackLink title={t('record_fuel_cost') || 'Record Fuel Cost'} />
      </View>

      {/* Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📶 {t('working_offline') || 'Working offline'} - {t('will_sync') || 'will sync'}
          </Text>
        </View>
      )}

      {/* Main Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⛽ {t('fuel_details') || 'Fuel Details'}</Text>

        {/* Litres Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {t('litres_purchased') || 'Litres Purchased'} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 3.5"
            keyboardType="decimal-pad"
            value={litres}
            onChangeText={setLitres}
            editable={!loading}
            placeholderTextColor="#b0a89d"
          />
        </View>

        {/* Cost Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {t('total_cost') || 'Total Cost (KES)'} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 630"
            keyboardType="decimal-pad"
            value={cost}
            onChangeText={setCost}
            editable={!loading}
            placeholderTextColor="#b0a89d"
          />
        </View>

        {/* Cost per litre hint */}
        {litres && cost && (
          <View style={styles.hintRow}>
            <Text style={styles.hintLabel}>{t('cost_per_litre') || 'Cost per litre'}</Text>
            <Text style={styles.hintValue}>
              KES {(parseFloat(cost) / parseFloat(litres)).toFixed(2)}
            </Text>
          </View>
        )}

        {/* Station Field (Optional) */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {t('station_name') || 'Station Name'} 
            <Text style={styles.optional}> ({t('optional') || 'optional'})</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Shell Ngong Rd"
            value={station}
            onChangeText={setStation}
            editable={!loading}
            placeholderTextColor="#b0a89d"
          />
        </View>

        {/* Notes Field (Optional) */}
        <View style={styles.field}>
          <Text style={styles.label}>
            {t('notes') || 'Notes'} 
            <Text style={styles.optional}> ({t('optional') || 'optional'})</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('add_notes') || 'Add notes...'}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            editable={!loading}
            placeholderTextColor="#b0a89d"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.buttonDisabled]}
          onPress={handleSaveFuel}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              💾 {t('save_fuel_entry') || 'Record Fuel Cost'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelButtonText}>{t('cancel') || 'Cancel'}</Text>
        </TouchableOpacity>
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 {t('tip') || 'Tip'}</Text>
        <Text style={styles.infoMessage}>
          {isOffline
            ? (t('fuel_offline_sync') || 'Your entry is saved offline and will sync automatically when you\'re back online.')
            : (t('fuel_saves_immediately') || 'Your fuel entry will be saved immediately and appear in your history.')}
        </Text>
      </View>
    </ScrollView>
  );
};

// ✅ Helper: Detect network errors
const isNetworkError = (err) => {
  return !err.response || err.code === 'ERR_NETWORK' || err.message.includes('Network');
};

// ✅ Styles: Aligned with cleaned.html design system
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef', // cream background
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  headerContainer: {
    marginTop: 16,
    marginBottom: 12,
  },
  offlineBanner: {
    backgroundColor: '#FFA500', // orange for offline
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
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db', // design system border color
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: 'SpaceGrotesk-Bold', // design system font
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    color: '#1a1c20', // ink color
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c', // ink-soft
    marginBottom: 8,
  },
  required: {
    color: '#e5650a', // boda-orange-dark
    fontWeight: '700',
  },
  optional: {
    color: '#5b606c',
    fontWeight: '500',
    textTransform: 'none',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1c20',
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    marginBottom: 16,
  },
  hintLabel: {
    fontSize: 13,
    color: '#5b606c',
  },
  hintValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ff7a1a', // boda-orange
  },
  saveButton: {
    backgroundColor: '#ff7a1a', // boda-orange primary button
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#1a1c20',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoBox: {
    backgroundColor: '#e6f5ef', // signal-green-bg
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f', // signal-green
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

export default FuelEntryScreen;