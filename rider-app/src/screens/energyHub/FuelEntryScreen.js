import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { addToSyncQueue } from '../../offline/syncQueue';

const FuelEntryScreen = ({ route, navigation }) => {
  const { t } = useTranslation();
  const { state: riderState } = useRider();
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Get rider ID
  const getRiderId = useCallback(() => {
    try {
      return getLocalRiderId();
    } catch (err) {
      return riderState?.riderId;
    }
  }, [riderState]);

  // Validate inputs
  const validateInputs = useCallback(() => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert(t('error'), t('please_enter_valid_fuel_amount'));
      return false;
    }
    if (!cost || isNaN(parseFloat(cost)) || parseFloat(cost) <= 0) {
      Alert.alert(t('error'), t('please_enter_valid_cost'));
      return false;
    }
    return true;
  }, [amount, cost, t]);

  // Save fuel entry with offline support
  const handleSaveFuel = useCallback(async () => {
    if (!validateInputs()) return;

    const riderId = getRiderId();
    if (!riderId) {
      Alert.alert(t('error'), t('unable_to_identify_rider'));
      return;
    }

    try {
      setLoading(true);
      
      const fuelEntry = {
        id: `fuel_${Date.now()}`,
        rider_id: riderId,
        amount: parseFloat(amount),
        cost: parseFloat(cost),
        notes: notes,
        date: new Date().toISOString(),
        synced: false,
      };

      // ✅ OFFLINE: Save to offline database first
      try {
        const existingEntries = LocalStore.get(`fuel_entries_${riderId}`);
        const entries = existingEntries ? JSON.parse(existingEntries) : [];
        entries.push(fuelEntry);
        LocalStore.set(`fuel_entries_${riderId}`, JSON.stringify(entries));
        console.log('✅ Fuel entry saved to offline database');
      } catch (offlineErr) {
        console.error('Error saving to offline database:', offlineErr);
      }

      // Try to sync immediately
      try {
        const response = await api.post('/fuel/entry', fuelEntry);
        
        if (response.data) {
          // Success - update local record as synced
          try {
            const entries = JSON.parse(LocalStore.get(`fuel_entries_${riderId}`) || '[]');
            const updated = entries.map(e => 
              e.id === fuelEntry.id ? { ...e, synced: true, server_id: response.data.id } : e
            );
            LocalStore.set(`fuel_entries_${riderId}`, JSON.stringify(updated));
          } catch (e) {
            console.warn('Failed to update sync status:', e);
          }

          // Clear form and navigate back
          setAmount('');
          setCost('');
          setNotes('');
          Alert.alert(t('success'), t('fuel_entry_saved'));
          navigation.goBack();
        }
      } catch (syncErr) {
        // Network error - will sync later
        if (isNetworkError(syncErr)) {
          setIsOffline(true);
          
          // ✅ Queue for later sync
          try {
            addToSyncQueue({
              type: 'fuel_entry',
              data: fuelEntry,
              endpoint: '/fuel/entry',
              timestamp: new Date(),
            });
          } catch (queueErr) {
            console.error('Error adding to sync queue:', queueErr);
          }

          Alert.alert(
            t('success'),
            t('fuel_entry_saved_offline') + '\n' + t('will_sync_when_online')
          );
          setAmount('');
          setCost('');
          setNotes('');
          navigation.goBack();
        } else {
          // Other error
          throw syncErr;
        }
      }
    } catch (err) {
      console.error('Error saving fuel entry:', err);
      Alert.alert(t('error'), t('failed_to_save_fuel_entry') + '\n' + err.message);
    } finally {
      setLoading(false);
    }
  }, [validateInputs, getRiderId, amount, cost, notes, navigation, t]);

  return (
    <ScrollView style={styles.container}>
      <BackLink title={t('record_fuel_cost')} />

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📶 {t('working_offline')} - {t('entry_will_sync')}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('fuel_entry_details')}</Text>

        {/* Fuel Amount */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('fuel_amount_liters')}</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 10.5"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            editable={!loading}
            placeholderTextColor="#999"
          />
        </View>

        {/* Cost */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('cost_kes')}</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 1500"
            keyboardType="decimal-pad"
            value={cost}
            onChangeText={setCost}
            editable={!loading}
            placeholderTextColor="#999"
          />
        </View>

        {/* Calculate rate */}
        {amount && cost && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('cost_per_liter')}</Text>
            <Text style={styles.infoValue}>
              KES {(parseFloat(cost) / parseFloat(amount)).toFixed(2)}
            </Text>
          </View>
        )}

        {/* Notes */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('notes')} ({t('optional')})</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('add_notes_about_fuel')}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            editable={!loading}
            placeholderTextColor="#999"
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
            <Text style={styles.buttonText}>💾 {t('save_fuel_entry')}</Text>
          )}
        </TouchableOpacity>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
        </TouchableOpacity>
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 {t('tip')}</Text>
        <Text style={styles.infoMessage}>
          {isOffline
            ? t('fuel_saved_offline_syncs_automatically')
            : t('fuel_entry_saved_immediately')}
        </Text>
      </View>
    </ScrollView>
  );
};

// Helper to detect network errors
const isNetworkError = (err) => {
  return !err.response || err.code === 'ERR_NETWORK' || err.message.includes('Network');
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  offlineBanner: {
    backgroundColor: '#FFA500',
    padding: 12,
    margin: 10,
    borderRadius: 8,
  },
  offlineText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
    color: '#333',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  textArea: {
    paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F0F8FF',
    borderRadius: 6,
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoBox: {
    backgroundColor: '#E8F4F8',
    margin: 10,
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#00BCD4',
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00695C',
    marginBottom: 5,
  },
  infoMessage: {
    fontSize: 13,
    color: '#00695C',
    lineHeight: 20,
  },
});

export default FuelEntryScreen;