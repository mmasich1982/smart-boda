// rider-app/src/screens/lipaLater/LipaLaterDetailsScreen.js
// FIXED: Now properly implements cleaned.html logic (RA-03-D)
// - Validates draft data
// - Creates complete trip object with nested lipaLater data
// - ACTUALLY ADDS TRIP TO STATE.TRIPS (was missing before)
// - Clears draft and navigates to payment summary
// - Date picker timezone fix included

import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Modal } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';

export default function LipaLaterDetailsScreen({ navigation, route }) {
  const { state, dispatch } = useRider();
  const passedAmount = route?.params?.amount || '';
  
  const [formData, setFormData] = useState({
    customerName: state?._lipaLaterDraft?.customerName || '',
    customerPhone: state?._lipaLaterDraft?.customerPhone || '',
    amount: state?._lipaLaterDraft?.amount || passedAmount || '',
    dueDate: state?._lipaLaterDraft?.dueDate || '',
  });
  const [errors, setErrors] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

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

  // FIXED: Date selection now uses local timezone correctly
  const handleDateSelect = (day) => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    // Construct date in local timezone and convert to ISO string (YYYY-MM-DD)
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    handleFieldChange('dueDate', isoDate);
    setShowDatePicker(false);
  };

  // FIXED: Now actually creates and saves the trip to state.trips (like cleaned.html)
  const handleSave = useCallback(() => {
    if (!validateForm()) return;

    try {
      // FIXED: Create complete trip object with nested lipaLater data structure
      const amt = parseFloat(formData.amount);
      const newTrip = {
        id: `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: amt,
        paymentMethod: 'LipaLater',
        timestamp: new Date().getTime(),
        ts: new Date().toISOString(),
        bikeIndex: 0,
        status: 'active',
        syncStatus: state?.online ? 'synced' : 'pending',
        channelOrigin: state?.online ? 'App-Online' : 'App-Offline-Queued',
        // FIXED: Nested lipaLater object (was missing before)
        lipaLater: {
          customerName: formData.customerName.trim(),
          customerPhone: formData.customerPhone.trim().replace(/\s+/g, ''),
          dueDate: formData.dueDate,
          originalAmount: amt,
          payments: [], // Array of {amount, date, notes}
          settled: false,
          settledAt: null,
        },
      };

      // FIXED: Actually add the trip to state.trips
      if (dispatch) {
        dispatch({
          type: 'ADD_LIPA_LATER_TRIP',
          payload: newTrip,
        });
      }

      // Clear the draft
      if (dispatch) {
        dispatch({
          type: 'CLEAR_LIPA_LATER_DRAFT',
        });
      }

      Alert.alert('Success', `Lipa Later record created for ${formData.customerName}`);
      
      // Navigate to payment summary (which shows Lipa Later Customers Report)
      navigation.navigate('PaymentSummary');
    } catch (err) {
      Alert.alert('Error', 'Failed to save Lipa Later record. Please try again.');
      console.error('[LipaLaterDetailsScreen] Save error:', err);
    }
  }, [formData, validateForm, dispatch, navigation, state?.online]);

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

  return (
    <ScrollView style={styles.container} scrollEnabled>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      
      <Text style={styles.title}>Lipa Later Details</Text>

      {/* Info Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>🕒 <Text style={styles.bannerContent}>Record who owes you and when it's due — it'll show up on your Lipa Later Customers Report so you never lose track of a follow-up.</Text></Text>
      </View>

      {/* Customer Name */}
      <View style={styles.field}>
        <Text style={styles.label}>Customer Name <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, errors.customerName && styles.inputError]}
          placeholder="e.g. Wanjiru Kamau"
          value={formData.customerName}
          onChangeText={(value) => handleFieldChange('customerName', value)}
          placeholderTextColor="#c7c9ce"
        />
        {errors.customerName && <Text style={styles.errorMsg}>{errors.customerName}</Text>}
      </View>

      {/* Customer Phone */}
      <View style={styles.field}>
        <Text style={styles.label}>Customer Mobile Number <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, errors.customerPhone && styles.inputError]}
          placeholder="e.g. 0712 345 678"
          value={formData.customerPhone}
          onChangeText={(value) => handleFieldChange('customerPhone', value)}
          keyboardType="phone-pad"
          placeholderTextColor="#c7c9ce"
        />
        {errors.customerPhone && <Text style={styles.errorMsg}>{errors.customerPhone}</Text>}
      </View>

      {/* Amount - Auto-populated and Editable */}
      <View style={styles.field}>
        <Text style={styles.label}>Amount to be Paid Later (KSh) <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={[styles.input, errors.amount && styles.inputError]}
          placeholder="0"
          value={formData.amount}
          onChangeText={(value) => handleFieldChange('amount', value)}
          keyboardType="decimal-pad"
          placeholderTextColor="#c7c9ce"
        />
        {errors.amount && <Text style={styles.errorMsg}>{errors.amount}</Text>}
      </View>

      {/* Due Date with Calendar Picker */}
      <View style={styles.field}>
        <Text style={styles.label}>Payment Due Date <Text style={styles.required}>*</Text></Text>
        <TouchableOpacity 
          style={[styles.dateInput, errors.dueDate && styles.inputError]}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={[styles.dateInputText, !formData.dueDate && styles.dateInputPlaceholder]}>
            {formData.dueDate ? formatDateToDisplay(formData.dueDate) : 'mm/dd/yy'}
          </Text>
          <Text style={styles.calendarIcon}>📅</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Must be after today — Lipa Later is for future payment, not today.</Text>
        {errors.dueDate && <Text style={styles.errorMsg}>{errors.dueDate}</Text>}
      </View>

      {/* Calendar Modal */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModal}>
            {/* Month/Year Header */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => {
                const prev = new Date(calendarDate);
                prev.setMonth(prev.getMonth() - 1);
                setCalendarDate(prev);
              }}>
                <Text style={styles.calendarNav}>← Prev</Text>
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>
                {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => {
                const next = new Date(calendarDate);
                next.setMonth(next.getMonth() + 1);
                setCalendarDate(next);
              }}>
                <Text style={styles.calendarNav}>Next →</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday Headers */}
            <View style={styles.weekdayRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <Text key={day} style={styles.weekday}>{day}</Text>
              ))}
            </View>

            {/* Calendar Days */}
            <View style={styles.calendarGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.calendarDayEmpty} />;
                }
                // Construct ISO date for comparison (YYYY-MM-DD)
                const year = calendarDate.getFullYear();
                const month = calendarDate.getMonth();
                const cellISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = cellISO === formData.dueDate;
                const isDisabled = cellISO <= today;

                return (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.calendarDay,
                      isSelected && styles.calendarDaySelected,
                      isDisabled && styles.calendarDayDisabled,
                    ]}
                    onPress={() => !isDisabled && handleDateSelect(day)}
                    disabled={isDisabled}
                  >
                    <Text style={[
                      styles.calendarDayText,
                      isSelected && styles.calendarDayTextSelected,
                      isDisabled && styles.calendarDayTextDisabled,
                    ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.calendarCloseBtn}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.calendarCloseBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Save Button */}
      <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
        <Text style={styles.primaryBtnText}>Save →</Text>
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
    marginBottom: 20,
  },
  banner: {
    backgroundColor: '#e6f5ef',
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    borderRadius: 8,
  },
  bannerText: {
    fontSize: 13,
    color: '#1a1c20',
  },
  bannerContent: {
    color: '#1a1c20',
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
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1c20',
    fontFamily: 'Inter-Regular',
  },
  inputError: {
    borderColor: '#e0453f',
    backgroundColor: '#fdecea',
  },
  dateInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateInputText: {
    fontSize: 14,
    color: '#1a1c20',
    fontFamily: 'Inter-Regular',
  },
  dateInputPlaceholder: {
    color: '#c7c9ce',
  },
  calendarIcon: {
    fontSize: 16,
  },
  hint: {
    fontSize: 11.5,
    color: '#5b606c',
    marginTop: 6,
  },
  errorMsg: {
    fontSize: 11.5,
    color: '#e0453f',
    marginTop: 4,
    fontWeight: '500',
  },

  /* Calendar Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: '85%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  calendarNav: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff7a1a',
  },
  calendarTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#5b606c',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  calendarDayEmpty: {
    width: '14.28%',
  },
  calendarDaySelected: {
    backgroundColor: '#ff7a1a',
    borderRadius: 8,
  },
  calendarDayDisabled: {
    opacity: 0.4,
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
  },
  calendarDayTextSelected: {
    color: '#fff',
  },
  calendarDayTextDisabled: {
    color: '#c7c9ce',
  },
  calendarCloseBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  calendarCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});