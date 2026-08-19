import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { addToSyncQueue } from '../../offline/syncQueue';

const BatteryEntryScreen = ({ route, navigation }) => {
  const { t } = useTranslation();
  const { state: riderState } = useRider();
  const [duration, setDuration] = useState('');
  const [cost, setCost] = useState('');
  const [batteryPercent, setBatteryPercent] = useState('');
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
    if (!duration || isNaN(parseFloat(duration)) || parseFloat(duration) <= 0) {
      Alert.alert(t('error'), t('please_enter_valid_duration'));
      return false;
    }
    if (!cost || isNaN(parseFloat(cost)) || parseFloat(cost) <= 0) {
      Alert.alert(t('error'), t('please_enter_valid_cost'));
      return false;
    }
    return true;
  }, [duration, cost, t]);

  // Save battery entry
  const handleSaveCharge = useCallback(async () => {
    if (!validateInputs()) return;

    const riderId = getRiderId();
    if (!riderId) {
      Alert.alert(t('error'), t('unable_to_identify_rider'));
      return;
    }

    try {
      setLoading(true);
      
      const batteryEntry = {
        id: `battery_${Date.now()}`,
        rider_id: riderId,
        duration: parseFloat(duration),
        cost: parseFloat(cost),
        battery_percent: batteryPercent ? parseFloat(batteryPercent) : null,
        notes: notes,
        date: new Date().toISOString(),
        synced: false,
      };

      // ✅ OFFLINE: Save to offline database first
      try {
        const existingEntries = LocalStore.get(`battery_entries_${riderId}`);
        const entries = existingEntries ? JSON.parse(existingEntries) : [];
        entries.push(batteryEntry);
        LocalStore.set(`battery_entries_${riderId}`, JSON.stringify(entries));
        console.log('✅ Battery entry saved to offline database');
      } catch (offlineErr) {
        console.error('Error saving to offline database:', offlineErr);
      }

      // Try to sync immediately
      try {
        const response = await api.post('/battery/entry', batteryEntry);
        
        if (response.data) {
          // Success - update local record as synced
          try {
            const entries = JSON.parse(LocalStore.get(`battery_entries_${riderId}`) || '[]');
            const updated = entries.map(e => 
              e.id === batteryEntry.id ? { ...e, synced: true, server_id: response.data.id } : e
            );
            LocalStore.set(`battery_entries_${riderId}`, JSON.stringify(updated));
          } catch (e) {
            console.warn('Failed to update sync status:', e);
          }

          // Clear form and navigate back
          setDuration('');
          setCost('');
          setBatteryPercent('');
          setNotes('');
          Alert.alert(t('success'), t('battery_charge_saved'));
          navigation.goBack();
        }
      } catch (syncErr) {
        // Network error - will sync later
        if (isNetworkError(syncErr)) {
          setIsOffline(true);
          
          // ✅ Queue for later sync
          try {
            addToSyncQueue({
              type: 'battery_entry',
              data: batteryEntry,
              endpoint: '/battery/entry',
              timestamp: new Date(),
            });
          } catch (queueErr) {
            console.error('Error adding to sync queue:', queueErr);
          }

          Alert.alert(
            t('success'),
            t('battery_entry_saved_offline') + '\n' + t('will_sync_when_online')
          );
          setDuration('');
          setCost('');
          setBatteryPercent('');
          setNotes('');
          navigation.goBack();
        } else {
          throw syncErr;
        }
      }
    } catch (err) {
      console.error('Error saving battery entry:', err);
      Alert.alert(t('error'), t('failed_to_save_battery_entry') + '\n' + err.message);
    } finally {
      setLoading(false);
    }
  }, [validateInputs, getRiderId, duration, cost, batteryPercent, notes, navigation, t]);

  return (
    <ScrollView style={styles.container}>
      <BackLink title={t('record_battery_cost')} />

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📶 {t('working_offline')} - {t('entry_will_sync')}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔋 {t('battery_charge_details')}</Text>

        {/* Duration */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('charging_duration_minutes')}</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 45"
            keyboardType="decimal-pad"
            value={duration}
            onChangeText={setDuration}
            editable={!loading}
            placeholderTextColor="#999"
          />
        </View>

        {/* Cost */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('cost_kes')}</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 100"
            keyboardType="decimal-pad"
            value={cost}
            onChangeText={setCost}
            editable={!loading}
            placeholderTextColor="#999"
          />
        </View>

        {/* Battery Percent (Optional) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('battery_charged_percent')} ({t('optional')})</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 80"
            keyboardType="decimal-pad"
            value={batteryPercent}
            onChangeText={setBatteryPercent}
            editable={!loading}
            placeholderTextColor="#999"
            maxLength={3}
          />
          {batteryPercent && (
            <Text style={styles.helpText}>
              Battery: {batteryPercent}%
            </Text>
          )}
        </View>

        {/* Cost per minute */}
        {duration && cost && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('cost_per_minute')}</Text>
            <Text style={styles.infoValue}>
              KES {(parseFloat(cost) / parseFloat(duration)).toFixed(2)}
            </Text>
          </View>
        )}

        {/* Notes */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('notes')} ({t('optional')})</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('add_notes_about_battery')}
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
          onPress={handleSaveCharge}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>💾 {t('save_battery_entry')}</Text>
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
            ? t('battery_saved_offline_syncs_automatically')
            : t('battery_entry_saved_immediately')}
        </Text>
      </View>
    </ScrollView>
  );
};

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
  helpText: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 5,
    fontWeight: '500',
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

export default BatteryEntryScreen;