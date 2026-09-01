// rider-app/src/screens/trips/NewTripScreen.js
// ✅ UPDATED: Offline-first with enqueue() for trip submissions
// - Validates trip data locally
// - Queues trip for sync using enqueue()
// - Navigates immediately without waiting for sync
// - No network errors shown to user
// - UI/UX design preserved exactly

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Picker, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderStatus } from '../../offline/db';
import { enqueue } from '../../offline/syncQueue';
import colors from '../../theme/colors';

export default function NewTripScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider status:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  const handleSave = async () => {
    setError('');

    if (!effectiveRiderId) {
      setError('Rider ID not found. Please return to Home and try again.');
      return;
    }

    const amt = parseFloat(amount || '0');
    if (!amt || amt <= 0) {
      setError('Please enter an amount greater than zero.');
      return;
    }

    if (!paymentMethod) {
      setError('Select a payment method.');
      return;
    }

    setSaving(true);
    try {
      // ✅ QUEUE FOR SYNC INSTEAD OF DIRECT API CALL
      const trip = {
        rider_id: effectiveRiderId,
        amount: amt,
        method: paymentMethod,
        note: note || '',
        ts: Date.now(),
        status: 'active',
      };

      const queued = await enqueue('trip', trip);

      if (queued) {
        // ✅ NAVIGATE IMMEDIATELY WITHOUT WAITING FOR SYNC
        navigation.navigate('DailyTradeSummary', { refreshData: true });
      } else {
        setError('Failed to record trip. Please try again.');
      }
    } catch (err) {
      setError('Could not save trip. Please try again.');
      console.error('Save trip error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Record New Trip</Text>
      <Text style={styles.subtitle}>Enter trip details</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Amount (KSh) *</Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          editable={!saving}
        />
        {error.includes('amount') && <Text style={styles.errorText}>{error}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Payment Method *</Text>
        <View style={styles.selectContainer}>
          <Picker
            selectedValue={paymentMethod}
            onValueChange={setPaymentMethod}
            style={styles.picker}
            enabled={!saving}
          >
            <Picker.Item label="Cash" value="Cash" />
            <Picker.Item label="M-Pesa" value="MPesa" />
            <Picker.Item label="Lipa Later" value="LipaLater" />
          </Picker>
        </View>
        {error.includes('payment') && <Text style={styles.errorText}>{error}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Add any notes..."
          placeholderTextColor="#b0a89d"
          multiline
          numberOfLines={3}
          value={note}
          onChangeText={setNote}
          editable={!saving}
        />
      </View>

      {error && !error.includes('amount') && !error.includes('payment') && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <PrimaryButton
        label={saving ? 'Saving...' : 'Record Trip →'}
        onPress={handleSave}
        disabled={saving || !amount || !paymentMethod}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  loading: { fontSize: 14, color: '#5b606c', textAlign: 'center', marginTop: 20 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.inkSoft, marginBottom: 18, lineHeight: 20 },

  field: { marginBottom: 16 },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.04, color: '#5b606c', marginBottom: 7 },

  input: {
    width: '100%',
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    fontSize: 15,
    fontFamily: 'Inter',
    backgroundColor: '#fff',
    color: '#1a1c20',
  },
  textarea: { height: 90, paddingTop: 13, textAlignVertical: 'top' },

  selectContainer: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: { height: 50, color: '#1a1c20' },

  errorText: { fontSize: 11.5, color: '#e0453f', marginTop: 6, fontWeight: '600' },
  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },
});
