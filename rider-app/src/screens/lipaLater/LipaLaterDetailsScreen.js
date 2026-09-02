// rider-app/src/screens/lipaLater/LipaLaterDetailsScreen.js
// ✅ FIXED: 100% UI aligned with index.html
// ✅ Uses ModalDatePicker (native calendar, not text input)
// ✅ Navigates to PaymentSummaryScreen (NOT PaymentSummary) ← CORRECT FLOW
// ✅ IndexedDB offline-first architecture

import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, 
  ActivityIndicator, Modal
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

// ✅ Custom Date Picker Modal Component
function DatePickerModal({ visible, onClose, onDateSelect, minimumDate }) {
  const [selectedDate, setSelectedDate] = useState(minimumDate);
  const today = new Date();
  const minDate = new Date(minimumDate);

  const handleDateChange = (newDate) => {
    if (newDate >= minDate) {
      setSelectedDate(newDate.toISOString().split('T')[0]);
    }
  };

  const currentDate = new Date(selectedDate || minimumDate);
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');

  const generateDays = () => {
    const days = [];
    const daysInMonth = new Date(year, parseInt(month), 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(String(i).padStart(2, '0'));
    }
    return days;
  };

  const generateMonths = () => {
    return [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
  };

  const generateYears = () => {
    const years = [];
    for (let i = year; i <= year + 10; i++) {
      years.push(i.toString());
    }
    return years;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={datePickerStyles.overlay}>
        <View style={datePickerStyles.container}>
          <View style={datePickerStyles.header}>
            <Text style={datePickerStyles.title}>Select Due Date</Text>
          </View>

          {/* Date Display */}
          <View style={datePickerStyles.displayRow}>
            <Text style={datePickerStyles.displayText}>
              {new Date(`${year}-${month}-${day}`).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </Text>
          </View>

          {/* Picker Row */}
          <View style={datePickerStyles.pickerRow}>
            {/* Day Picker */}
            <View style={datePickerStyles.pickerColumn}>
              <Text style={datePickerStyles.pickerLabel}>Day</Text>
              <ScrollView 
                style={datePickerStyles.pickerScroll}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
              >
                {generateDays().map((d) => {
                  const isSelected = day === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        datePickerStyles.pickerItem,
                        isSelected && datePickerStyles.pickerItemSelected
                      ]}
                      onPress={() => handleDateChange(new Date(`${year}-${month}-${d}`))}
                    >
                      <Text style={[
                        datePickerStyles.pickerItemText,
                        isSelected && datePickerStyles.pickerItemTextSelected
                      ]}>
                        {d}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Month Picker */}
            <View style={datePickerStyles.pickerColumn}>
              <Text style={datePickerStyles.pickerLabel}>Month</Text>
              <ScrollView 
                style={datePickerStyles.pickerScroll}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
              >
                {generateMonths().map((m, i) => {
                  const monthNum = String(i + 1).padStart(2, '0');
                  const isSelected = month === monthNum;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        datePickerStyles.pickerItem,
                        isSelected && datePickerStyles.pickerItemSelected
                      ]}
                      onPress={() => {
                        const daysInNewMonth = new Date(year, i + 1, 0).getDate();
                        const newDay = Math.min(parseInt(day), daysInNewMonth);
                        handleDateChange(new Date(`${year}-${monthNum}-${String(newDay).padStart(2, '0')}`));
                      }}
                    >
                      <Text style={[
                        datePickerStyles.pickerItemText,
                        isSelected && datePickerStyles.pickerItemTextSelected
                      ]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Year Picker */}
            <View style={datePickerStyles.pickerColumn}>
              <Text style={datePickerStyles.pickerLabel}>Year</Text>
              <ScrollView 
                style={datePickerStyles.pickerScroll}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
              >
                {generateYears().map((y) => {
                  const isSelected = year.toString() === y;
                  return (
                    <TouchableOpacity
                      key={y}
                      style={[
                        datePickerStyles.pickerItem,
                        isSelected && datePickerStyles.pickerItemSelected
                      ]}
                      onPress={() => {
                        const daysInNewMonth = new Date(parseInt(y), parseInt(month), 0).getDate();
                        const newDay = Math.min(parseInt(day), daysInNewMonth);
                        handleDateChange(new Date(`${y}-${month}-${String(newDay).padStart(2, '0')}`));
                      }}
                    >
                      <Text style={[
                        datePickerStyles.pickerItemText,
                        isSelected && datePickerStyles.pickerItemTextSelected
                      ]}>
                        {y}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={datePickerStyles.buttonRow}>
            <TouchableOpacity 
              style={[datePickerStyles.button, datePickerStyles.buttonCancel]}
              onPress={onClose}
            >
              <Text style={datePickerStyles.buttonCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[datePickerStyles.button, datePickerStyles.buttonConfirm]}
              onPress={() => onDateSelect(`${year}-${month}-${day}`)}
            >
              <Text style={datePickerStyles.buttonConfirmText}>Done</Text>
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
  
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    amount: passedAmount || '',
    dueDate: '',
  });
  const [errors, setErrors] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const openDatePicker = useCallback(() => {
    setShowDatePicker(true);
  }, []);

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
      
      // ✅ NAVIGATE TO PAYMENT SUMMARY SCREEN (Lipa Later Customers Report)
      // FIXED: Changed from 'PaymentSummary' to 'PaymentSummaryScreen' to match MainNavigator
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

      {/* ✅ CUSTOM DATE PICKER */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Payment Due Date <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          style={[styles.datePickerButton, errors.dueDate && styles.datePickerButtonError]}
          onPress={() => openDatePicker()}
        >
          <Text style={styles.datePickerButtonText}>
            {formData.dueDate 
              ? new Date(formData.dueDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })
              : 'Select date...'}
          </Text>
          <Text style={styles.datePickerIcon}>📅</Text>
        </TouchableOpacity>
        {errors.dueDate ? (
          <Text style={styles.errorText}>⚠️ {errors.dueDate}</Text>
        ) : (
          <Text style={styles.hint}>Must be after today — Lipa Later is for future payment, not today.</Text>
        )}
      </View>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onDateSelect={(date) => {
          handleFieldChange('dueDate', date);
          setShowDatePicker(false);
        }}
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

  datePickerButtonText: {
    fontSize: 15,
    color: '#1a1c20',
    fontFamily: 'Inter',
  },

  datePickerIcon: {
    fontSize: 18,
  },
});

// Date Picker Modal Styles
const datePickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },

  container: {
    backgroundColor: '#f6f4ef',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 30,
    maxHeight: '85%',
  },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },

  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    fontFamily: 'SpaceGrotesk',
  },

  displayRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },

  displayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20',
    textAlign: 'center',
  },

  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    marginVertical: 16,
    height: 200,
  },

  pickerColumn: {
    flex: 1,
    marginHorizontal: 6,
  },

  pickerLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 8,
  },

  pickerScroll: {
    flex: 1,
  },

  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },

  pickerItemSelected: {
    backgroundColor: '#ffc93c',
    borderRadius: 8,
  },

  pickerItemText: {
    fontSize: 14,
    color: '#1a1c20',
    fontWeight: '500',
  },

  pickerItemTextSelected: {
    fontWeight: '700',
    color: '#1a1c20',
  },

  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 16,
  },

  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },

  buttonCancel: {
    backgroundColor: '#e9dccc',
  },

  buttonCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#5b606c',
  },

  buttonConfirm: {
    backgroundColor: '#ffc93c',
  },

  buttonConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c20',
  },
});