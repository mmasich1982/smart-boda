// rider-app/src/screens/lipaLater/LipaLaterDetailsScreen.js
// ✅ UPDATED: UI 100% aligned with index.html · Uses DatePickerField component
// - Records new Lipa Later trip to IndexedDB cache
// - Creates customer record and queues for sync
// - Network-aware with graceful offline handling
// - Text-based date picker (matches cleaned.html styling)

import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, 
  Alert, ActivityIndicator
} from 'react-native';
import BackLink from '../../components/BackLink';
import DatePickerField from '../../components/DatePickerField';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import {
  saveLipaLaterTripToDb,
  getOrCreateCustomer,
  loadLipaLaterCustomersCache,
  saveLipaLaterCustomersCache,
} from '../../offline/lipaLaterUtils';

export default function LipaLaterDetailsScreen({ navigation, route }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const passedAmount = route?.params?.amount || '';
  const [localRiderId, setLocalRiderId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    amount: passedAmount || '',
    dueDate: '',
  });
  const [errors, setErrors] = useState({});

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ LipaLaterDetails: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  const validatePhone = (phone) => {
    const cleaned = phone.replace(/\s+/g, '');
    // Kenyan number validation: starts with 07 or +2547
    return /^(?:0?7|(?:\+?254)?7)\d{8}$/.test(cleaned);
  };

  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!formData.customerName || !formData.customerName.trim()) {
      newErrors.customerName = "Enter the customer's name.";
    }

    if (!formData.customerPhone || !formData.customerPhone.trim()) {
      newErrors.customerPhone = "Enter the customer's mobile number.";
    } else if (!validatePhone(formData.customerPhone)) {
      newErrors.customerPhone = "That doesn't look like a valid Kenyan mobile number (e.g. 0712 345 678).";
    }

    const amtStr = (formData.amount || '').toString().trim();
    const amt = parseFloat(amtStr);
    if (!amtStr) {
      newErrors.amount = 'Enter the amount to be paid later.';
    } else if (!/^\d+(\.\d{1,2})?$/.test(amtStr) || !amt || amt <= 0) {
      newErrors.amount = 'Enter a valid amount greater than zero (numbers only).';
    }

    const today = new Date().toISOString().split('T')[0];
    if (!formData.dueDate) {
      newErrors.dueDate = 'Select a payment due date.';
    } else if (formData.dueDate <= today) {
      newErrors.dueDate = 'Due date must be after today.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleFieldChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const handleSave = async () => {
    try {
      if (!validateForm()) {
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
      const customerId = `cust_${formData.customerPhone.replace(/\D/g, '')}_${now}`;
      const tripId = `trip_${effectiveRiderId}_${now}`;

      // ✅ CREATE TRIP RECORD WITH LIPA LATER METADATA
      const lipaLaterTrip = {
        id: tripId,
        rider_id: effectiveRiderId,
        amount: parseFloat(formData.amount),
        paymentMethod: 'LipaLater',
        method: 'LipaLater',
        status: 'active',
        syncStatus: 'pending',
        
        // Timestamps
        ts: now,
        timestamp: now,
        created_at: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        
        // Lipa Later metadata
        lipaLater: {
          customerId: customerId,
          customerName: formData.customerName.trim(),
          customerPhone: formData.customerPhone.trim(),
          originalAmount: parseFloat(formData.amount),
          dueDate: formData.dueDate,
          settled: false,
          settledDate: null,
          payments: [],
          createdAt: new Date().toISOString(),
          lastPaymentDate: null,
          daysOverdue: 0,
        }
      };

      console.log('💾 Recording Lipa Later trip locally:', { tripId, customerId });

      // ✅ SAVE TRIP TO INDEXED DB
      await saveLipaLaterTripToDb(tripId, lipaLaterTrip);

      // ✅ CREATE OR UPDATE CUSTOMER RECORD
      await getOrCreateCustomer(
        effectiveRiderId,
        {
          customerId: customerId,
          customerName: formData.customerName.trim(),
          customerPhone: formData.customerPhone.trim(),
        },
        parseFloat(formData.amount)
      );

      // ✅ ADD TO SYNC QUEUE
      const queueSuccess = await addToSyncQueue({
        id: tripId,
        type: 'lipa_later_trip',
        endpoint: `/lipa-later/record-trip?rider_id=${effectiveRiderId}`,
        data: {
          amount: parseFloat(formData.amount),
          paymentMethod: 'LipaLater',
          customerName: formData.customerName.trim(),
          customerPhone: formData.customerPhone.trim(),
          dueDate: formData.dueDate,
        },
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to queue, but local save succeeded');
      }

      // Try to sync immediately if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync Lipa Later trip to API...');
          const response = await api.post(
            `/lipa-later/record-trip?rider_id=${effectiveRiderId}`,
            {
              amount: parseFloat(formData.amount),
              paymentMethod: 'LipaLater',
              customerName: formData.customerName.trim(),
              customerPhone: formData.customerPhone.trim(),
              dueDate: formData.dueDate,
            }
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Synced Lipa Later trip to API');
            setSuccessMessage(t('success_recordedLipaLater') || 'Lipa Later trip recorded!');
            
            setTimeout(() => {
              navigation.navigate('PaymentSummaryScreen', { 
                customerId: customerId, 
                customerData: formData 
              });
            }, 800);
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry later):', apiErr.message);
          // Data is saved and queued - that's okay
        }
      }

      // Data is safely stored locally
      setSuccessMessage(t('success_savedLipaLater') || 'Trip saved. Syncing...');
      
      setTimeout(() => {
        navigation.navigate('PaymentSummaryScreen', { 
          customerId: customerId, 
          customerData: formData 
        });
      }, 800);

    } catch (err) {
      console.error('❌ Save error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to record trip. Please try again.',
        'save_error'
      );
    } finally {
      setSaving(false);
    }
  };

  const minDueDate = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <BackLink onPress={() => navigation.goBack()} />

      {/* Title & Trace */}
      <Text style={styles.screenTitle}>Lipa Later Details</Text>
      <Text style={styles.screenSub}>RA-03-D · Lipa Later Customer Entry</Text>

      {/* Info Banner */}
      {!criticalError && (
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerIcon}>🕒</Text>
          <Text style={styles.bannerText}>
            Record who owes you and when it's due — it'll show up on your Lipa Later Customers Report so you never lose track of a follow-up.
          </Text>
        </View>
      )}

      {/* Critical Error Banner */}
      {criticalError && (
        <View style={styles.bannerError}>
          <Text style={styles.bannerErrorText}>⚠️ {criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.bannerErrorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Success Banner */}
      {successMessage && (
        <View style={styles.bannerSuccess}>
          <Text style={styles.bannerSuccessText}>✅ {successMessage}</Text>
        </View>
      )}

      {/* Customer Name Field */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Customer Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, errors.customerName && styles.inputError]}
          placeholder="e.g. Wanjiru Kamau"
          placeholderTextColor="#b0a89d"
          value={formData.customerName}
          onChangeText={(val) => handleFieldChange('customerName', val)}
        />
        {errors.customerName && (
          <Text style={styles.errorText}>⚠️ {errors.customerName}</Text>
        )}
      </View>

      {/* Customer Phone Field */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Customer Mobile Number <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, errors.customerPhone && styles.inputError]}
          placeholder="e.g. 0712 345 678"
          placeholderTextColor="#b0a89d"
          keyboardType="phone-pad"
          value={formData.customerPhone}
          onChangeText={(val) => handleFieldChange('customerPhone', val)}
        />
        {errors.customerPhone && (
          <Text style={styles.errorText}>⚠️ {errors.customerPhone}</Text>
        )}
      </View>

      {/* Amount Field */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Amount to be Paid Later (KSh) <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, errors.amount && styles.inputError]}
          placeholder="0"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={formData.amount}
          onChangeText={(val) => handleFieldChange('amount', val)}
        />
        {errors.amount && (
          <Text style={styles.errorText}>⚠️ {errors.amount}</Text>
        )}
      </View>

      {/* Date Picker Field Component */}
      <DatePickerField
        label="Payment Due Date"
        value={formData.dueDate}
        onChange={(val) => handleFieldChange('dueDate', val)}
        placeholder="YYYY-MM-DD"
        required={true}
        hint="Must be after today — Lipa Later is for future payment, not today."
        error={errors.dueDate}
      />

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.primaryBtn, (saving || !formData.amount) && styles.primaryBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !formData.amount}
        activeOpacity={0.8}
      >
        <View style={styles.btnContent}>
          {saving && (
            <ActivityIndicator size="small" color="#1a1c20" style={styles.btnSpinner} />
          )}
          <Text style={styles.primaryBtnText}>
            {saving ? 'Recording...' : 'Save →'}
          </Text>
        </View>
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

  screenTitle: {
    fontFamily: 'SpaceGrotesk',
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 6,
    marginTop: 8,
  },

  screenSub: {
    fontSize: 12.5,
    color: '#8b5cf6',
    fontWeight: '600',
    marginBottom: 14,
    fontFamily: 'JetBrains Mono',
  },

  // Banner Styles (Info)
  bannerInfo: {
    flexDirection: 'row',
    backgroundColor: '#f0f8ff',
    borderWidth: 1.5,
    borderColor: '#c8e6f5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },

  bannerIcon: {
    fontSize: 18,
    marginRight: 12,
    marginTop: 2,
  },

  bannerText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#0d47a1',
    fontWeight: '500',
  },

  // Banner Styles (Error)
  bannerError: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  bannerErrorText: {
    flex: 1,
    fontSize: 13,
    color: '#a5312c',
    fontWeight: '600',
  },

  bannerErrorDismiss: {
    fontSize: 18,
    color: '#a5312c',
    marginLeft: 12,
  },

  // Banner Styles (Success)
  bannerSuccess: {
    backgroundColor: '#e6f5ef',
    borderWidth: 1.5,
    borderColor: '#a8d5c4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },

  bannerSuccessText: {
    fontSize: 13,
    color: '#1e9e6f',
    fontWeight: '600',
  },

  // Field Styles
  field: {
    marginBottom: 18,
  },

  label: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#5b606c',
    marginBottom: 8,
  },

  required: {
    color: '#e5650a',
  },

  input: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#1a1c20',
    fontFamily: 'Inter',
  },

  inputError: {
    borderColor: '#e0453f',
  },

  errorText: {
    fontSize: 11.5,
    color: '#e0453f',
    marginTop: 6,
    fontWeight: '600',
  },

  // Button Styles
  primaryBtn: {
    backgroundColor: '#ffc93c',
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 24,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryBtnDisabled: {
    backgroundColor: '#e9dccc',
    opacity: 0.6,
  },

  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  btnSpinner: {
    marginRight: 8,
  },

  primaryBtnText: {
    color: '#1a1c20',
    fontSize: 15,
    fontWeight: '700',
  },
});