// rider-app/src/screens/lipaLater/RecordPaymentScreen.js
/**
 * Record Lipa Later Payment Screen
 * Allows rider to record full or partial payments for pending Lipa Later customers
 * Aligned to cleaned.html logic
 * 
 * UPDATED: Properly integrates with HomeScreen refresh mechanism
 * When payment is recorded, user returns to LipaLaterCustomers which allows
 * HomeScreen to refresh and immediately show updated income total
 */

import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { getRemainingBalance, getTotalPaid } from '../../rider/RiderContext';

export default function RecordPaymentScreen({ navigation, route }) {
  const { state, dispatch } = useRider();
  const tripId = route?.params?.tripId;
  
  // Find the trip
  const trip = state?.trips?.find(t => t.id === tripId);
  
  if (!trip || !trip.lipaLater) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Trip not found</Text>
      </View>
    );
  }

  const remaining = getRemainingBalance(trip.lipaLater);
  const totalPaid = getTotalPaid(trip.lipaLater);
  
  const [paymentType, setPaymentType] = useState('full');
  const [amount, setAmount] = useState(remaining.toString());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Validate payment
  const validatePayment = useCallback(() => {
    const newErrors = {};
    const amt = parseFloat(amount);

    if (!paymentType) {
      newErrors.paymentType = 'Select payment type';
    }

    if (!amount || amt <= 0) {
      newErrors.amount = 'Enter amount greater than zero';
    } else if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      newErrors.amount = 'Enter valid amount';
    }

    // CRITICAL: Validate that total payment never exceeds original amount
    const totalIfPaid = totalPaid + amt;
    if (totalIfPaid > trip.lipaLater.originalAmount) {
      newErrors.amount = `Total payment cannot exceed original amount of KSh ${trip.lipaLater.originalAmount.toLocaleString()}`;
    } else if (paymentType === 'full' && amt < remaining) {
      newErrors.amount = `Full payment must be at least KSh ${remaining.toLocaleString()} (remaining balance)`;
    } else if (paymentType === 'partial' && amt >= remaining) {
      newErrors.amount = `Partial payment must be less than KSh ${remaining.toLocaleString()} (remaining). Choose Full Payment if settling entire balance`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [amount, paymentType, remaining, totalPaid, trip]);

  // Record payment
  const handleRecordPayment = useCallback(() => {
    if (!validatePayment()) return;

    setLoading(true);
    try {
      const amt = parseFloat(amount);
      
      // Get today's date in YYYY-MM-DD format for income recording
      const today = new Date().toISOString().split('T')[0];

      // Dispatch to record payment
      dispatch({
        type: 'RECORD_PAYMENT',
        payload: {
          tripId,
          amount: amt.toString(),
          paymentType,
          notes,
          paymentDate: today,
        },
      });

      // Show success message
      const isFullySettled = (totalPaid + amt) >= trip.lipaLater.originalAmount;
      if (isFullySettled) {
        Alert.alert(
          'Success',
          `✓ ${trip.lipaLater.customerName}'s account fully settled — KSh ${amt.toLocaleString()} received, now counted in today's income.`
        );
      } else {
        const newRemaining = remaining - amt;
        Alert.alert(
          'Success',
          `✓ Recorded KSh ${amt.toLocaleString()} partial payment for ${trip.lipaLater.customerName}. KSh ${newRemaining.toLocaleString()} still outstanding.`
        );
      }

      // Navigate back to customers report
      // This will allow HomeScreen to refresh when user navigates back to it
      navigation.navigate('LipaLaterCustomers');
    } catch (err) {
      Alert.alert('Error', 'Failed to record payment');
      console.error('[RecordLipaLaterPayment] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [amount, paymentType, notes, validatePayment, dispatch, navigation, tripId, trip, remaining, totalPaid]);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />

      <Text style={styles.title}>Record Payment</Text>
      <Text style={styles.subtitle}>for {trip.lipaLater.customerName}</Text>

      {/* Customer Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Customer</Text>
          <Text style={styles.infoValue}>{trip.lipaLater.customerName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone</Text>
          <Text style={styles.infoValue}>{trip.lipaLater.customerPhone}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Original Amount</Text>
          <Text style={styles.infoValue}>KSh {trip.lipaLater.originalAmount.toLocaleString()}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Already Paid</Text>
          <Text style={[styles.infoValue, { color: '#1e9e6f' }]}>KSh {totalPaid.toLocaleString()}</Text>
        </View>
        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.infoLabel}>Still Owing</Text>
          <Text style={[styles.infoValue, { color: '#ff7a1a', fontWeight: '700' }]}>KSh {remaining.toLocaleString()}</Text>
        </View>
      </View>

      {/* Payment Type Selection */}
      <View style={styles.field}>
        <Text style={styles.label}>Payment Type <Text style={styles.required}>*</Text></Text>
        <View style={styles.typeOptions}>
          <TouchableOpacity
            style={[styles.typeButton, paymentType === 'full' && styles.typeButtonActive]}
            onPress={() => {
              setPaymentType('full');
              setAmount(remaining.toString());
              setErrors({});
            }}
          >
            <Text style={[styles.typeButtonText, paymentType === 'full' && styles.typeButtonTextActive]}>
              ✓ Full Payment
            </Text>
            <Text style={styles.typeButtonHint}>Pay full remaining balance</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeButton, paymentType === 'partial' && styles.typeButtonActive]}
            onPress={() => {
              setPaymentType('partial');
              setAmount('');
              setErrors({});
            }}
          >
            <Text style={[styles.typeButtonText, paymentType === 'partial' && styles.typeButtonTextActive]}>
              ◐ Partial Payment
            </Text>
            <Text style={styles.typeButtonHint}>Pay part of the balance</Text>
          </TouchableOpacity>
        </View>
        {errors.paymentType && <Text style={styles.errorMsg}>{errors.paymentType}</Text>}
      </View>

      {/* Amount Input */}
      <View style={styles.field}>
        <Text style={styles.label}>Amount (KSh) <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, errors.amount && styles.inputError]}
          placeholder="0"
          value={amount}
          onChangeText={(value) => {
            setAmount(value);
            if (errors.amount) setErrors(prev => ({ ...prev, amount: undefined }));
          }}
          keyboardType="decimal-pad"
          placeholderTextColor="#c7c9ce"
          editable={!loading}
        />
        {errors.amount && <Text style={styles.errorMsg}>{errors.amount}</Text>}
      </View>

      {/* Notes */}
      <View style={styles.field}>
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={styles.textarea}
          placeholder="e.g. Cash payment, customer will come back for receipt"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          placeholderTextColor="#c7c9ce"
          editable={!loading}
        />
      </View>

      {/* Record Button */}
      <TouchableOpacity
        style={[styles.recordButton, loading && styles.recordButtonDisabled]}
        onPress={handleRecordPayment}
        disabled={loading}
      >
        <Text style={styles.recordButtonText}>
          {loading ? 'Saving...' : '💳 Record Payment'}
        </Text>
      </TouchableOpacity>

      {/* Cancel Button */}
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => navigation.goBack()}
        disabled={loading}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginTop: 16,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#5b606c',
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '600',
    textAlign: 'right',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 8,
  },
  required: {
    color: '#e0453f',
    fontWeight: '700',
  },
  typeOptions: {
    gap: 8,
    marginBottom: 0,
  },
  typeButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    padding: 12,
  },
  typeButtonActive: {
    backgroundColor: '#fff5f0',
    borderColor: '#ff7a1a',
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 4,
  },
  typeButtonTextActive: {
    color: '#ff7a1a',
  },
  typeButtonHint: {
    fontSize: 11,
    color: '#5b606c',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1c20',
  },
  inputError: {
    borderColor: '#e0453f',
    backgroundColor: '#fdecea',
  },
  textarea: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: '#1a1c20',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorMsg: {
    fontSize: 11.5,
    color: '#e0453f',
    marginTop: 4,
    fontWeight: '500',
  },
  recordButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  recordButtonDisabled: {
    opacity: 0.6,
  },
  recordButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20',
  },
  errorText: {
    fontSize: 14,
    color: '#e0453f',
    textAlign: 'center',
    marginTop: 20,
  },
});