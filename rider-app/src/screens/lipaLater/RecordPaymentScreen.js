// rider-app/src/screens/lipaLater/RecordPaymentScreen.js
// ✅ UPDATED: 100% UI alignment with index.html
// - Record Lipa Later Payment screen (RA-03-F)
// - Records payments to IndexedDB cache immediately
// - Queues for sync with background sync retry logic
// - Network-aware with graceful offline handling
// - Payment Type selector (Full vs Partial)
// - Amount validation based on remaining balance

import React, { useState, useEffect } from 'react';
import { 
  ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ActivityIndicator, Alert 
} from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import {
  loadCustomerPaymentHistory,
  saveCustomerPaymentHistory,
  updateCustomerAfterPayment,
} from '../../offline/lipaLaterUtils';

export default function RecordPaymentScreen({ route, navigation }) {
  const { customerId, customerData } = route.params || {};
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [paymentType, setPaymentType] = useState('full');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ RecordPayment: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // Calculate remaining balance
  const totalPaid = customerData?.totalPaid || 0;
  const remaining = (customerData?.totalOutstanding || 0);
  const originalAmount = totalPaid + remaining;

  // ✅ AUTO-FILL TOTAL OUTSTANDING AMOUNT ON MOUNT
  useEffect(() => {
    if (remaining > 0 && !paymentAmount) {
      setPaymentAmount(remaining.toString());
    }
  }, [remaining, paymentAmount]);

  const handleSave = async () => {
    try {
      // Validation
      const amount = parseFloat(paymentAmount);
      if (!paymentAmount || amount <= 0) {
        showCriticalError(
          t('validationError_enterValidCost') || 'Please enter a valid payment amount greater than zero.',
          'validation'
        );
        return;
      }

      if (paymentType === 'full' && amount < remaining) {
        showCriticalError(
          `Full settlement must be at least KSh ${remaining.toLocaleString()}`,
          'validation'
        );
        return;
      }

      if (paymentType === 'partial' && amount >= remaining) {
        showCriticalError(
          `Partial payment must be less than KSh ${remaining.toLocaleString()}`,
          'validation'
        );
        return;
      }

      if (!customerId) {
        showCriticalError(
          t('error_noCustomer') || 'Customer not found.',
          'validation'
        );
        return;
      }

      if (!effectiveRiderId) {
        showCriticalError(
          t('authError_riderIdNotAvailable') || 'Rider ID not available. Please restart the app.',
          'auth'
        );
        return;
      }

      setSaving(true);
      clearCriticalError();
      setSuccessMessage('');

      const now = Date.now();
      const paymentRecord = {
        amount: amount,
        date: new Date().toISOString(),
        paymentMethod: 'Manual', // Default method
        status: 'completed',
        paymentType: paymentType,
        notes: notes.trim(),
      };

      const recordId = `payment_${customerId}_${now}`;

      // ✅ ALWAYS SAVE LOCALLY FIRST USING INDEXED DB
      // 1. Load customer payment history
      const paymentHistory = await loadCustomerPaymentHistory(customerId);
      paymentHistory.unshift(paymentRecord);

      // 2. Save payment history back to IndexedDB
      await saveCustomerPaymentHistory(customerId, paymentHistory);

      // 3. Update customer record in lipaLaterCustomers cache
      const isFullySettled = remaining - amount <= 0;
      
      await updateCustomerAfterPayment(
        effectiveRiderId,
        customerId,
        amount,
        isFullySettled
      );

      console.log('💾 Recorded payment locally:', { 
        recordId, 
        customerId, 
        amount: paymentAmount 
      });

      // Add to sync queue for background sync
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'lipa_later_payment',
        endpoint: `/lipa-later/record-payment?rider_id=${effectiveRiderId}&customer_id=${customerId}`,
        data: paymentRecord,
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to queue, but local save succeeded');
      }

      // Try to sync immediately only if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync payment to API...');
          const response = await api.post(
            `/lipa-later/record-payment?rider_id=${effectiveRiderId}&customer_id=${customerId}`,
            paymentRecord
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Synced payment successfully to API');
            const successMsg = isFullySettled
              ? (t('success_paymentRecorded') || 'Payment recorded! Account settled.')
              : (t('success_paymentRecorded') || 'Payment recorded successfully!');
            setSuccessMessage(successMsg);
            
            // Navigate after brief success message
            setTimeout(() => {
              navigation.navigate('PaymentSummary', { customerId, customerData });
            }, 800);
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry later):', {
            status: apiErr.response?.status,
            message: apiErr.message,
          });
        }
      }

      // Either offline or API sync failed - but data is safely stored
      const syncingMsg = isFullySettled
        ? (t('success_paymentSaving') || 'Payment saved. Account settling...')
        : (t('success_paymentSaving') || 'Payment saved. Syncing...');
      setSuccessMessage(syncingMsg);
      
      setTimeout(() => {
        navigation.navigate('PaymentSummary', { customerId, customerData });
      }, 800);

    } catch (err) {
      console.error('❌ Save error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to record payment. Please try again.',
        'save_error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>Record Payment</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink 
        onPress={() => navigation.navigate('PaymentSummary', { customerId, customerData })} 
        label={t('backLabel') || '← Back'} 
      />
      <Text style={styles.title}>Record Payment</Text>
      
      {/* Customer Info Banner */}
      {customerData && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            📊 <Text style={{ fontWeight: '700' }}>{customerData.customerName}</Text>
            {' · Original: '}
            <Text style={{ fontWeight: '700' }}>KSh {originalAmount.toLocaleString()}</Text>
            {totalPaid > 0 && (
              <Text>
                {' · Already paid: '}
                <Text style={{ fontWeight: '700' }}>KSh {totalPaid.toLocaleString()}</Text>
              </Text>
            )}
            {' · '}
            <Text style={{ fontWeight: '700' }}>Remaining: KSh {remaining.toLocaleString()}</Text>
          </Text>
        </View>
      )}

      {/* Error Banner */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Success Message */}
      {successMessage && !saving && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✅ {successMessage}</Text>
        </View>
      )}

      {/* Payment Type Selection */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('paymentType') || 'Payment Type'} <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.radioGroup}>
          <TouchableOpacity
            style={[
              styles.radioOption,
              paymentType === 'full' && styles.radioOptionSelected
            ]}
            onPress={() => setPaymentType('full')}
            disabled={saving}
          >
            <View style={[
              styles.radioCircle,
              paymentType === 'full' && styles.radioCircleSelected
            ]} />
            <Text style={[
              styles.radioLabel,
              paymentType === 'full' && styles.radioLabelSelected
            ]}>
              Full Payment (complete settlement)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.radioOption,
              paymentType === 'partial' && styles.radioOptionSelected
            ]}
            onPress={() => setPaymentType('partial')}
            disabled={saving}
          >
            <View style={[
              styles.radioCircle,
              paymentType === 'partial' && styles.radioCircleSelected
            ]} />
            <Text style={[
              styles.radioLabel,
              paymentType === 'partial' && styles.radioLabelSelected
            ]}>
              Partial Payment
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Payment Amount */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('paymentAmount') || 'Amount Received (KSh)'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={paymentAmount}
          onChangeText={(val) => {
            setPaymentAmount(val);
            clearCriticalError();
          }}
          editable={!saving}
        />
        <Text style={styles.hint}>
          {paymentType === 'full' 
            ? `Full settlement must be at least KSh ${remaining.toLocaleString()}`
            : `Partial payment must be less than KSh ${remaining.toLocaleString()}`
          }
        </Text>
      </View>

      {/* Notes */}
      <View style={styles.field}>
        <Text style={styles.label}>{t('notes') || 'Notes (optional)'}</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="e.g. Received via M-Pesa, promised balance tomorrow…"
          placeholderTextColor="#b0a89d"
          value={notes}
          onChangeText={setNotes}
          editable={!saving}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Offline Status */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📱 Offline Mode: Payment will sync when connection is restored.
          </Text>
        </View>
      )}

      {/* Record Payment Button */}
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          saving && styles.primaryBtnDisabled
        ]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        <View style={styles.btnContent}>
          {saving && (
            <ActivityIndicator 
              size="small" 
              color="#fff" 
              style={styles.btnSpinner}
            />
          )}
          <Text style={styles.primaryBtnText}>
            {saving 
              ? (t('saving') || 'Saving...') 
              : (t('recordPaymentButton') || 'Record Payment →')
            }
          </Text>
        </View>
      </TouchableOpacity>
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11.5,
    color: '#5b606c',
    marginBottom: 16,
    fontWeight: '500',
  },

  infoBanner: {
    backgroundColor: '#e6f5ef',
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
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

  successBanner: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1.5,
    borderColor: '#a5d6a7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16
  },
  successBannerText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600'
  },

  field: {
    marginBottom: 24
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 8
  },
  required: {
    color: '#e5650a'
  },

  radioGroup: {
    gap: 12,
    marginBottom: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
  },
  radioOptionSelected: {
    backgroundColor: '#fffbf5',
    borderColor: '#ff7a1a',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#e7e4db',
    marginRight: 12,
  },
  radioCircleSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#ff7a1a',
  },
  radioLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b606c',
  },
  radioLabelSelected: {
    color: '#1a1c20',
  },

  input: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1a1c20',
    marginBottom: 8
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 11.5,
    color: '#5b606c',
    fontWeight: '500'
  },

  offlineBanner: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff7a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  offlineText: {
    fontSize: 12,
    color: '#e65100',
    fontWeight: '500',
  },

  primaryBtn: {
    backgroundColor: '#ffc107',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ffc107',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  primaryBtnDisabled: {
    backgroundColor: '#e9dccc',
    shadowOpacity: 0
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSpinner: {
    marginRight: 10
  },
  primaryBtnText: {
    color: '#1a1c20',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.02
  }
});