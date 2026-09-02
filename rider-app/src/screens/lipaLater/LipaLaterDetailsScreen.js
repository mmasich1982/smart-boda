// rider-app/src/screens/lipaLater/LipaLaterDetailsScreen.js
// ✅ FIXED: 100% UI aligned with index.html
// ✅ Uses simple date picker with calendar icon
// ✅ Navigates to PaymentSummaryScreen correctly
// ✅ IndexedDB offline-first architecture

import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, 
  ActivityIndicator, Modal, FlatList
} from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import {
  saveLipaLaterTripToDb,
  getOrCreateCustomer,
} from '../../offline/lipaLaterUtils';

// Simple Date Picker Modal Component
function SimpleDatePickerModal({ visible, onClose, onDateSelect, minimumDate }) {
  const [currentDate, setCurrentDate] = useState(minimumDate);
  const minDate = new Date(minimumDate);
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 5);

  const handleDateChange = (offset) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + offset);
    if (newDate >= minDate && newDate <= maxDate) {
      setCurrentDate(newDate.toISOString().split('T')[0]);
    }
  };

  const displayDate = new Date(currentDate);
  const dateString = displayDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={dpStyles.overlay}>
        <View style={dpStyles.container}>
          {/* Header */}
          <View style={dpStyles.header}>
            <Text style={dpStyles.headerText}>Select Due Date</Text>
          </View>

          {/* Date Display */}
          <View style={dpStyles.displayBox}>
            <Text style={dpStyles.displayDate}>{dateString}</Text>
          </View>

          {/* Navigation */}
          <View style={dpStyles.navigationRow}>
            <TouchableOpacity 
              style={dpStyles.navButton}
              onPress={() => handleDateChange(-7)}
            >
              <Text style={dpStyles.navButtonText}>← Prev Week</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={dpStyles.navButton}
              onPress={() => handleDateChange(7)}
            >
              <Text style={dpStyles.navButtonText}>Next Week →</Text>
            </TouchableOpacity>
          </View>

          {/* Quick shortcuts */}
          <View style={dpStyles.shortcutsContainer}>
            <TouchableOpacity 
              style={dpStyles.shortcutButton}
              onPress={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setCurrentDate(tomorrow.toISOString().split('T')[0]);
              }}
            >
              <Text style={dpStyles.shortcutText}>Tomorrow</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={dpStyles.shortcutButton}
              onPress={() => {
                const nextWeek = new Date();
                nextWeek.setDate(nextWeek.getDate() + 7);
                setCurrentDate(nextWeek.toISOString().split('T')[0]);
              }}
            >
              <Text style={dpStyles.shortcutText}>+7 days</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={dpStyles.shortcutButton}
              onPress={() => {
                const nextMonth = new Date();
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                setCurrentDate(nextMonth.toISOString().split('T')[0]);
              }}
            >
              <Text style={dpStyles.shortcutText}>+30 days</Text>
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={dpStyles.actionRow}>
            <TouchableOpacity 
              style={[dpStyles.actionButton, dpStyles.cancelButton]}
              onPress={onClose}
            >
              <Text style={dpStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[dpStyles.actionButton, dpStyles.confirmButton]}
              onPress={() => {
                onDateSelect(currentDate);
                onClose();
              }}
            >
              <Text style={dpStyles.confirmButtonText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function LipaLaterDetailsScreen({ navigation, route }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const passedAmount = route?.params?.amount || '';
  const [localRiderId, setLocalRiderId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  
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
        ts: now,
        timestamp: now,
        created_at: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
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

      console.log('💾 Recording Lipa Later trip:', { tripId, customerId });

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
      await addToSyncQueue({
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

      // Try to sync immediately if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Syncing to API...');
          await api.post(
            `/lipa-later/record-trip?rider_id=${effectiveRiderId}`,
            {
              amount: parseFloat(formData.amount),
              paymentMethod: 'LipaLater',
              customerName: formData.customerName.trim(),
              customerPhone: formData.customerPhone.trim(),
              dueDate: formData.dueDate,
            }
          );
          console.log('✅ Synced to API');
        } catch (apiErr) {
          console.warn('⚠️ API sync will retry:', apiErr.message);
        }
      }

      setSuccessMessage('Trip recorded! 🎉');
      
      // ✅ NAVIGATE TO PAYMENT SUMMARY SCREEN
      setTimeout(() => {
        navigation.replace('PaymentSummaryScreen');
      }, 600);

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

      {/* Date Picker Field */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Payment Due Date <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          style={[styles.datePickerButton, errors.dueDate && styles.datePickerButtonError]}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.datePickerText}>
            {formData.dueDate
              ? new Date(formData.dueDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })
              : 'Select date...'}
          </Text>
          <Text style={styles.calendarIcon}>📅</Text>
        </TouchableOpacity>
        {errors.dueDate ? (
          <Text style={styles.errorText}>⚠️ {errors.dueDate}</Text>
        ) : (
          <Text style={styles.hint}>Must be after today — Lipa Later is for future payment, not today.</Text>
        )}
      </View>

      {/* Date Picker Modal */}
      <SimpleDatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onDateSelect={(date) => handleFieldChange('dueDate', date)}
        minimumDate={minDueDate}
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

  datePickerButton: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  datePickerButtonError: {
    borderColor: '#e0453f',
  },

  datePickerText: {
    fontSize: 15,
    color: '#1a1c20',
    fontFamily: 'Inter',
  },

  calendarIcon: {
    fontSize: 18,
  },

  errorText: {
    fontSize: 11.5,
    color: '#e0453f',
    marginTop: 6,
    fontWeight: '600',
  },

  hint: {
    fontSize: 12,
    color: '#5b606c',
    marginTop: 6,
    fontWeight: '500',
  },

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

// Date Picker Modal Styles
const dpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },

  container: {
    backgroundColor: '#f6f4ef',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    paddingTop: 20,
  },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
    marginBottom: 16,
  },

  headerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    fontFamily: 'SpaceGrotesk',
  },

  displayBox: {
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },

  displayDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1c20',
    textAlign: 'center',
  },

  navigationRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  navButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e7e4db',
    alignItems: 'center',
  },

  navButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5b606c',
  },

  shortcutsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 20,
  },

  shortcutButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#ffc93c',
    borderRadius: 8,
    alignItems: 'center',
  },

  shortcutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
  },

  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },

  cancelButton: {
    backgroundColor: '#e9dccc',
  },

  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#5b606c',
  },

  confirmButton: {
    backgroundColor: '#ffc93c',
  },

  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c20',
  },
});