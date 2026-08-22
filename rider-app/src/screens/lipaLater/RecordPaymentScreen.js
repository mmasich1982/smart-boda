/**
 * rider-app/src/screens/lipaLater/RecordPaymentScreen.js
 * RA-03-F: Record Lipa Later Payment
 * 
 * ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, immediate local save
 * ✅ MULTILINGUAL: Uses i18n for all UI text
 * ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
 * ✅ NETWORK AWARE: Real-time connectivity detection
 * ✅ MINIMAL UI: Title + Error + Input + Button ONLY
 * ✅ NO STATUS BANNERS: Only critical errors shown
 * 
 * Records full or partial payment against a Lipa Later customer record.
 * Saves locally immediately, queues for sync, updates financial metrics.
 */

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function RecordPaymentScreen({ route, navigation }) {
  const { recordId, record } = route.params;
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [formState, setFormState] = useState({
    amount: '',
    paymentDate: getTodayDate(),
    reference: '',
    notes: '',
    saving: false
  });

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const remaining = parseFloat(record.remaining_balance || record.amount || 0);
  const original = parseFloat(record.amount || 0);

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

  const updateCustomerCache = async (paymentData) => {
    try {
      const cacheKey = `lipa_customers_${effectiveRiderId}`;
      
      // ✅ Use IndexedDB adapter instead of LocalStore
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);
      let customers = [];

      if (cachedData) {
        try {
          customers = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (!Array.isArray(customers)) customers = [];
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error, starting fresh');
          customers = [];
        }
      }

      // Find and update the customer record
      const recordIndex = customers.findIndex(c => c.id === recordId);
      if (recordIndex !== -1) {
        const amount = parseFloat(paymentData.amount_paid);
        const newRemaining = remaining - amount;

        customers[recordIndex].remaining_balance = Math.max(0, newRemaining);
        customers[recordIndex].status = newRemaining <= 0 ? 'paid' : 'partial';

        if (!customers[recordIndex].payments) {
          customers[recordIndex].payments = [];
        }
        customers[recordIndex].payments.push({
          amount: amount,
          date: paymentData.payment_date,
          reference: paymentData.reference || '',
          sync_status: 'pending'
        });

        // ✅ Save updated cache to IndexedDB
        await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(customers));
        console.log('✅ Updated customer cache with payment');
      }
    } catch (err) {
      console.error('❌ Error updating customer cache:', err);
    }
  };

  const handleInputChange = (field, value) => {
    setFormState(prev => ({
      ...prev,
      [field]: value
    }));
    clearCriticalError();
  };

  const validatePayment = () => {
    const amount = parseFloat(formState.amount);

    if (!formState.amount || isNaN(amount) || amount <= 0) {
      showCriticalError(t('error_validPaymentAmount') || 'Please enter a valid payment amount', 'validation');
      return false;
    }

    if (amount > remaining) {
      showCriticalError(
        t('error_paymentExceedsBalance', { balance: remaining.toLocaleString() }) || `Payment cannot exceed remaining balance of KSh ${remaining.toLocaleString()}`,
        'validation'
      );
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    try {
      if (!validatePayment()) {
        return;
      }

      if (!effectiveRiderId) {
        showCriticalError(t('authError_riderIdNotAvailable') || 'Rider ID not available. Please restart the app.', 'auth');
        return;
      }

      setFormState(prev => ({ ...prev, saving: true }));
      clearCriticalError();

      const amount = parseFloat(formState.amount);
      const paymentId = `payment_${effectiveRiderId}_${Date.now()}`;

      const payload = {
        amount_paid: amount,
        payment_date: formState.paymentDate,
        reference: formState.reference || '',
        notes: formState.notes || '',
        sync_status: 'pending'
      };

      const offlinePayment = {
        ...payload,
        id: paymentId,
        rider_id: effectiveRiderId,
        lipa_later_record_id: recordId,
        created_at: new Date().toISOString()
      };

      console.log('💾 Saving payment:', {
        paymentId,
        recordId,
        amount: amount,
        sync_status: 'pending'
      });

      // ✅ ALWAYS save locally first using IndexedDB
      await indexedDbAdapter.kvSet(
        `lipa_payment_${paymentId}`,
        JSON.stringify(offlinePayment)
      );
      console.log('✅ Payment saved to IndexedDB');

      // Update customer cache immediately for instant UI feedback
      await updateCustomerCache(payload);

      // Add to sync queue for background sync
      const queueSuccess = await addToSyncQueue({
        id: paymentId,
        type: 'lipa_payment',
        endpoint: `/trips/lipa-later/${recordId}/payment?rider_id=${effectiveRiderId}`,
        data: payload,
        timestamp: new Date()
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to queue, but local save succeeded');
      }

      // Try to sync immediately only if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync payment to API...');
          const response = await api.post(
            `/trips/lipa-later/${recordId}/payment?rider_id=${effectiveRiderId}`,
            payload
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Payment synced successfully to API');

            const newRemaining = remaining - amount;
            const message = newRemaining <= 0
              ? t('success_accountSettled', { 
                  name: record.customer_name, 
                  amount: amount.toLocaleString() 
                }) || `✓ ${record.customer_name}'s account fully settled — KSh ${amount.toLocaleString()} received, now counted in today's income.`
              : t('success_partialPayment', { 
                  amount: amount.toLocaleString(), 
                  remaining: newRemaining.toLocaleString() 
                }) || `✓ Recorded KSh ${amount.toLocaleString()} partial payment. KSh ${newRemaining.toLocaleString()} still outstanding.`;

            Alert.alert(t('success') || 'Success', message, [
              {
                text: t('ok') || 'OK',
                onPress: () => {
                  navigation.navigate('LipaLaterCustomers');
                }
              }
            ]);
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry later):', {
            status: apiErr.response?.status,
            message: apiErr.message
          });
        }
      }

      // Either offline or API sync failed - but data is safely stored
      const newRemaining = remaining - amount;
      const message = newRemaining <= 0
        ? t('success_paymentSavedSyncing') || `✓ Payment saved. Syncing...`
        : t('success_paymentSyncingBackground') || `✓ Payment saved and syncing in background...`;

      Alert.alert(t('success') || 'Success', message, [
        {
          text: t('ok') || 'OK',
          onPress: () => {
            navigation.navigate('LipaLaterCustomers');
          }
        }
      ]);

    } catch (err) {
      console.error('❌ Save error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to record payment. Please try again.',
        'save_error'
      );
      setFormState(prev => ({ ...prev, saving: false }));
    }
  };

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('recordPayment') || 'Record Payment'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('recordPayment') || 'Record Payment'}</Text>

      {/* Customer Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.customerNameLarge}>{record.customer_name}</Text>
        <View style={styles.amountRow}>
          <View>
            <Text style={styles.amountLabelSmall}>{t('originalAmount') || 'ORIGINAL AMOUNT'}</Text>
            <Text style={styles.amountValueLarge}>
              KSh {original.toLocaleString()}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.amountLabelSmall, { color: '#FFA500' }]}>{t('remaining') || 'REMAINING'}</Text>
            <Text style={[styles.amountValueLarge, { color: '#FFA500' }]}>
              KSh {remaining.toLocaleString()}
            </Text>
          </View>
        </View>
      </View>

      {/* Error Banner */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Payment Amount Field */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('paymentAmount') || 'Payment Amount'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={formState.amount}
          onChangeText={(val) => handleInputChange('amount', val)}
          editable={!formState.saving}
        />
        <Text style={styles.hint}>{t('max') || 'Max'}: KSh {remaining.toLocaleString()}</Text>
      </View>

      {/* Payment Date Field */}
      <View style={styles.field}>
        <Text style={styles.label}>{t('paymentDate') || 'Payment Date'}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_dateFormat') || "YYYY-MM-DD"}
          placeholderTextColor="#b0a89d"
          value={formState.paymentDate}
          onChangeText={(val) => handleInputChange('paymentDate', val)}
          editable={!formState.saving}
          maxLength={10}
        />
      </View>

      {/* Reference Field */}
      <View style={styles.field}>
        <Text style={styles.label}>{t('reference') || 'Reference'} ({t('optional') || 'Optional'})</Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_reference') || "e.g., M-Pesa ref, cash receipt..."}
          placeholderTextColor="#b0a89d"
          value={formState.reference}
          onChangeText={(val) => handleInputChange('reference', val)}
          editable={!formState.saving}
          maxLength={255}
        />
      </View>

      {/* Notes Field */}
      <View style={styles.field}>
        <Text style={styles.label}>{t('notes') || 'Notes'} ({t('optional') || 'Optional'})</Text>
        <TextInput
          style={[styles.input, { height: 80, paddingTop: 12, textAlignVertical: 'top' }]}
          placeholder={t('placeholder_notes') || "Additional notes..."}
          placeholderTextColor="#b0a89d"
          value={formState.notes}
          onChangeText={(val) => handleInputChange('notes', val)}
          editable={!formState.saving}
          multiline
          maxLength={500}
        />
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (formState.saving || !formState.amount) && styles.primaryBtnDisabled
        ]}
        onPress={handleSave}
        disabled={formState.saving || !formState.amount}
        activeOpacity={0.8}
      >
        <View style={styles.btnContent}>
          {formState.saving && (
            <ActivityIndicator
              size="small"
              color="#fff"
              style={styles.btnSpinner}
            />
          )}
          <Text style={styles.primaryBtnText}>
            {formState.saving ? (t('recordingPayment') || 'Recording Payment...') : (t('recordPaymentButton') || 'Record Payment →')}
          </Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
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
    marginBottom: 20
  },

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#ff7a1a'
  },
  customerNameLarge: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  amountLabelSmall: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a8a196',
    marginBottom: 4
  },
  amountValueLarge: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1c20'
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

  field: {
    marginBottom: 20
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
  hint: {
    fontSize: 11.5,
    color: '#5b606c',
    fontWeight: '500'
  },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ff7a1a',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.02
  }
});