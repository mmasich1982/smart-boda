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


export default function LipaLaterDetailsScreen({ navigation, route }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const passedAmount = route?.params?.amount || '';
  const [localRiderId, setLocalRiderId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  
  
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

  // Calendar generation helper
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const calendarDays = [];
  const firstDay = getFirstDayOfMonth(calendarDate);
  const daysInMonth = getDaysInMonth(calendarDate);
  
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  const today = new Date().toISOString().split('T')[0];

  // ✅ FORMAT DATE FOR DISPLAY
  const formatDateToDisplay = (isoDateStr) => {
    if (!isoDateStr) return 'mm/dd/yy';
    const date = new Date(isoDateStr + 'T00:00:00Z');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const year = String(date.getUTCFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  };

  // ✅ HANDLE DATE SELECTION FROM CALENDAR
  const handleDateSelect = (day) => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    handleFieldChange('dueDate', iso);
    setShowDatePicker(false);
  };

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

      {/* Due Date with Calendar Picker */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Payment Due Date <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity 
          style={[styles.datePickerButton, errors.dueDate && styles.datePickerButtonError]}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={[styles.datePickerText, !formData.dueDate && { color: '#b0a89d' }]}>
            {formData.dueDate ? formatDateToDisplay(formData.dueDate) : 'Select a date…'}
          </Text>
          <Text style={styles.calendarIcon}>📅</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Must be after today — Lipa Later is for future payment, not today.</Text>
        {errors.dueDate && <Text style={styles.errorText}>⚠️ {errors.dueDate}</Text>}
      </View>

      {/* Calendar Modal */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={dpStyles.overlay}>
          <View style={dpStyles.container}>
            {/* Header */}
            <View style={dpStyles.header}>
              <Text style={dpStyles.headerText}>Select Payment Due Date</Text>
            </View>

            {/* Display Box */}
            <View style={dpStyles.displayBox}>
              <Text style={dpStyles.displayDate}>
                {formData.dueDate ? formatDateToDisplay(formData.dueDate) : 'No date selected'}
              </Text>
            </View>

            {/* Navigation */}
            <View style={dpStyles.navigationRow}>
              <TouchableOpacity 
                style={dpStyles.navButton}
                onPress={() => {
                  const prev = new Date(calendarDate);
                  prev.setMonth(prev.getMonth() - 1);
                  setCalendarDate(prev);
                }}
              >
                <Text style={dpStyles.navButtonText}>← Prev</Text>
              </TouchableOpacity>
              <Text style={{ ...dpStyles.navButtonText, flex: 1, textAlign: 'center' }}>
                {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity 
                style={dpStyles.navButton}
                onPress={() => {
                  const next = new Date(calendarDate);
                  next.setMonth(next.getMonth() + 1);
                  setCalendarDate(next);
                }}
              >
                <Text style={dpStyles.navButtonText}>Next →</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday Headers & Calendar Grid */}
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              {/* Weekday Headers */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                  <Text key={day} style={{ width: '14.3%', textAlign: 'center', fontWeight: '600', color: '#5b606c', fontSize: 12 }}>{day}</Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View>
                {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIdx) => (
                  <View key={`week-${weekIdx}`} style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 }}>
                    {calendarDays.slice(weekIdx * 7, (weekIdx + 1) * 7).map((day, dayIdx) => {
                      if (day === null) {
                        return <View key={`empty-${dayIdx}`} style={{ width: '14.3%' }} />;
                      }
                      const year = calendarDate.getFullYear();
                      const month = calendarDate.getMonth();
                      const cellISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const isSelected = cellISO === formData.dueDate;
                      const isDisabled = cellISO <= today;

                      return (
                        <TouchableOpacity
                          key={`day-${day}`}
                          style={{
                            width: '14.3%',
                            aspectRatio: 1,
                            borderRadius: 8,
                            justifyContent: 'center',
                            alignItems: 'center',
                            backgroundColor: isSelected ? '#ffc93c' : isDisabled ? '#f0f0f0' : '#fff',
                            borderWidth: 1,
                            borderColor: isSelected ? '#ffc93c' : '#e7e4db',
                          }}
                          onPress={() => !isDisabled && handleDateSelect(day)}
                          disabled={isDisabled}
                        >
                          <Text style={{
                            fontWeight: isSelected ? '700' : '500',
                            color: isSelected ? '#1a1c20' : isDisabled ? '#b0b0b0' : '#1a1c20',
                            fontSize: 14,
                          }}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={dpStyles.actionRow}>
              <TouchableOpacity 
                style={[dpStyles.actionButton, dpStyles.cancelButton]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={dpStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[dpStyles.actionButton, dpStyles.confirmButton]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={dpStyles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.primaryBtn, (saving) && styles.primaryBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
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