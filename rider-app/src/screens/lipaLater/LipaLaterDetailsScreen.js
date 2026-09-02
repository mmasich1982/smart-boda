// rider-app/src/screens/lipaLater/LipaLaterDetailsScreen.js
// ✅ UPDATED: IndexedDB offline-first architecture for Lipa Later entry
// - Records new Lipa Later trip to IndexedDB cache
// - Creates customer record and queues for sync
// - Network-aware with graceful offline handling
// - UI/UX preserved exactly as original

import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, 
  Alert, Modal, ActivityIndicator
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

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

  const formatDateToDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const y = String(date.getFullYear()).slice(-2);
    return `${m}/${d}/${y}`;
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

  const handleDateSelect = (day) => {
    const newDate = new Date(calendarDate);
    newDate.setDate(day);
    const dateStr = newDate.toISOString().split('T')[0];
    handleFieldChange('dueDate', dateStr);
    setShowDatePicker(false);
  };

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

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>Record Lipa Later Trip</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay();
  const today = new Date().toISOString().split('T')[0];
  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>Record Lipa Later Trip</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {successMessage && !saving && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✅ {successMessage}</Text>
        </View>
      )}

      {/* Customer Name */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Customer Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, errors.customerName && styles.inputError]}
          placeholder="e.g. John Kariuki"
          value={formData.customerName}
          onChangeText={(val) => handleFieldChange('customerName', val)}
          editable={!saving}
        />
        {errors.customerName && <Text style={styles.errorText}>{errors.customerName}</Text>}
      </View>

      {/* Customer Phone */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Customer Phone <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, errors.customerPhone && styles.inputError]}
          placeholder="e.g. 0712 345 678"
          value={formData.customerPhone}
          onChangeText={(val) => handleFieldChange('customerPhone', val)}
          keyboardType="phone-pad"
          editable={!saving}
        />
        {errors.customerPhone && <Text style={styles.errorText}>{errors.customerPhone}</Text>}
      </View>

      {/* Amount */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Amount (KSh) <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, errors.amount && styles.inputError]}
          placeholder="e.g. 500"
          value={formData.amount}
          onChangeText={(val) => handleFieldChange('amount', val)}
          keyboardType="decimal-pad"
          editable={!saving}
        />
        {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
      </View>

      {/* Due Date */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Due Date <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          style={[styles.input, styles.dateInput, errors.dueDate && styles.inputError]}
          onPress={() => setShowDatePicker(true)}
          disabled={saving}
        >
          <Text style={formData.dueDate ? styles.dateText : styles.dateTextPlaceholder}>
            {formData.dueDate ? formatDateToDisplay(formData.dueDate) : 'Select due date'}
          </Text>
        </TouchableOpacity>
        {errors.dueDate && <Text style={styles.errorText}>{errors.dueDate}</Text>}
      </View>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.datePickerOverlay}>
          <View style={styles.datePickerContainer}>
            <View style={styles.datePickerHeader}>
              <TouchableOpacity
                onPress={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1))}
              >
                <Text style={styles.datePickerNavButton}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.datePickerTitle}>
                {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                onPress={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1))}
              >
                <Text style={styles.datePickerNavButton}>▶</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendar}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <Text key={day} style={styles.calendarDayHeader}>{day}</Text>
              ))}
              {days.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.calendarDayEmpty} />;
                }
                const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = formData.dueDate === dateStr;
                const isBeforeToday = dateStr <= today;

                return (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.calendarDay,
                      isSelected && styles.calendarDaySelected,
                      isBeforeToday && styles.calendarDayDisabled,
                    ]}
                    onPress={() => handleDateSelect(day)}
                    disabled={isBeforeToday}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        isSelected && styles.calendarDayTextSelected,
                        isBeforeToday && styles.calendarDayTextDisabled,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.datePickerClose}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.datePickerCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.primaryBtn, (saving || !formData.amount) && styles.primaryBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !formData.amount}
        activeOpacity={0.8}
      >
        <View style={styles.btnContent}>
          {saving && (
            <ActivityIndicator size="small" color="#fff" style={styles.btnSpinner} />
          )}
          <Text style={styles.primaryBtnText}>
            {saving ? 'Recording...' : 'Record Lipa Later Trip →'}
          </Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { 
    fontFamily: 'SpaceGrotesk-Bold', 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#1a1c20', 
    marginBottom: 20 
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

  field: { marginBottom: 20 },
  label: { 
    fontSize: 11.5, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    color: '#5b606c', 
    marginBottom: 8 
  },
  required: { color: '#e5650a' },
  input: { 
    padding: 14, 
    borderRadius: 12, 
    borderWidth: 1.5, 
    borderColor: '#e7e4db', 
    fontSize: 16, 
    backgroundColor: '#fff', 
    color: '#1a1c20',
  },
  inputError: { borderColor: '#e0453f' },
  errorText: { 
    fontSize: 12, 
    color: '#e0453f', 
    marginTop: 6, 
    fontWeight: '500' 
  },

  dateInput: { justifyContent: 'center' },
  dateText: { fontSize: 16, color: '#1a1c20', fontWeight: '600' },
  dateTextPlaceholder: { fontSize: 16, color: '#b0a89d' },

  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '90%',
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
  },
  datePickerNavButton: {
    fontSize: 20,
    color: '#ff7a1a',
    fontWeight: '700',
    paddingHorizontal: 12,
  },
  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  calendarDayHeader: {
    width: '14.28%',
    textAlign: 'center',
    fontWeight: '700',
    color: '#5b606c',
    marginBottom: 8,
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  calendarDayEmpty: {
    width: '14.28%',
    aspectRatio: 1,
  },
  calendarDaySelected: {
    backgroundColor: '#ffc107',
  },
  calendarDayDisabled: {
    opacity: 0.4,
  },
  calendarDayText: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '600',
  },
  calendarDayTextSelected: {
    color: '#fff',
  },
  calendarDayTextDisabled: {
    color: '#c7c9ce',
  },
  datePickerClose: {
    backgroundColor: '#ffc107',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  datePickerCloseText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },

  primaryBtn: { 
    backgroundColor: '#ffc107', 
    borderRadius: 14, 
    paddingVertical: 16, 
    alignItems: 'center', 
    marginBottom: 16,
    marginTop: 20,
  },
  primaryBtnDisabled: { 
    backgroundColor: '#e9dccc', 
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
  }
});