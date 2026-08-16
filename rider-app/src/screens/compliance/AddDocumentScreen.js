// rider-app/src/screens/compliance/AddDocumentScreen.js
// ✅ UPDATED: Custom date picker implementation (no DateTimePicker import)

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Picker,
  TextInput,
  Modal,
} from 'react-native';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { useToast } from '../../components/Toast';

const DOCUMENT_TYPES = [
  { id: 'license', name: 'License', expires: true },
  { id: 'insurance', name: 'Insurance', expires: true },
];

export default function AddDocumentScreen({ navigation }) {
  const { state } = useRider();
  const { showToast } = useToast();

  const [documentType, setDocumentType] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [localRiderId, setLocalRiderId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
        if (!id) {
          setError('Rider information not found.');
        }
      } catch (err) {
        console.error('[AddDocumentScreen] Error loading riderId:', err);
        setError('Error loading rider information.');
      } finally {
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  const selectedDocMeta = DOCUMENT_TYPES.find((t) => t.name === documentType);
  const requiresExpiry = selectedDocMeta?.expires || false;

  // Format date for display (MM/DD/YY format)
  const formatDateToDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const y = String(date.getFullYear()).slice(-2);
    return `${m}/${d}/${y}`;
  };

  // Custom date picker - select a date
  const handleDateSelect = (day) => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    // Construct date in local timezone and convert to ISO string (YYYY-MM-DD)
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setExpiryDate(isoDate);
    setShowDatePicker(false);
  };

  const handleSave = async () => {
    setError('');

    if (!documentType) {
      setError('Select a Document Type.');
      showToast('Select a Document Type.', 'warn');
      return;
    }

    if (requiresExpiry) {
      if (!expiryDate) {
        setError('Enter an Expiry Date for this document type.');
        showToast('Enter an Expiry Date for this document type.', 'error');
        return;
      }

      const expiryMs = new Date(expiryDate).getTime();
      if (expiryMs <= Date.now()) {
        setError('Expiry Date must be in the future.');
        showToast('Expiry Date must be in the future.', 'error');
        return;
      }
    }

    const effectiveRiderId = localRiderId || state?.riderId;
    if (!effectiveRiderId) {
      setError('Rider information not available.');
      showToast('Rider information not available.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        document_type_code: documentType.toLowerCase(),
        expiry_date: requiresExpiry ? expiryDate : null,
      };

      const response = await api.post('/compliance/documents', payload, {
        params: { rider_id: effectiveRiderId },
      });

      showToast(`${documentType} saved successfully.`, 'success');
      navigation.navigate('ComplianceDashboard');
    } catch (err) {
      console.error('[AddDocumentScreen] Save error:', err);
      const errorMsg = err.response?.data?.detail || 'Failed to save document';
      setError(errorMsg);
      showToast(errorMsg, 'error');
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Add a Document</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>
          Document Type <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={documentType}
            onValueChange={setDocumentType}
            style={styles.picker}
          >
            <Picker.Item label="Select..." value="" />
            {DOCUMENT_TYPES.map((docType) => (
              <Picker.Item key={docType.id} label={docType.name} value={docType.name} />
            ))}
          </Picker>
        </View>
        <Text style={styles.hint}>Pick the document you want to track.</Text>
      </View>

      {requiresExpiry ? (
        <View style={styles.field}>
          <Text style={styles.label}>
            Expiry Date <Text style={styles.required}>*</Text>
          </Text>

          <TouchableOpacity
            style={styles.dateInputButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={expiryDate ? styles.dateInputValue : styles.dateInputPlaceholder}>
              {expiryDate ? formatDateToDisplay(expiryDate) : 'Select date...'}
            </Text>
            <Text style={styles.dateIcon}>📅</Text>
          </TouchableOpacity>

          {/* Custom Calendar Modal */}
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

                {/* Weekday Row */}
                <View style={styles.weekdayRow}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <Text key={day} style={styles.weekday}>{day}</Text>
                  ))}
                </View>

                {/* Calendar Grid */}
                <View style={styles.calendarGrid}>
                  {calendarDays.map((day, idx) => {
                    if (day === null) {
                      return <View key={`empty-${idx}`} style={styles.calendarDayEmpty} />;
                    }
                    // Construct ISO date for comparison (YYYY-MM-DD)
                    const year = calendarDate.getFullYear();
                    const month = calendarDate.getMonth();
                    const cellISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isSelected = cellISO === expiryDate;
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

          <Text style={styles.hint}>Enter the expiry date from your document.</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.saveBtn, (saving || !documentType) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !documentType}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save →'}</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
  },
  container: {
    flex: 1,
    padding: 18,
    backgroundColor: '#f6f4ef',
  },
  header: {
    marginBottom: 16,
  },
  backLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff7a1a',
    marginBottom: 8,
  },
  screenTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
  },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 11.5,
    color: '#a5312c',
    fontWeight: '600',
  },

  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 8,
  },
  required: {
    color: '#e5650a',
  },

  pickerWrapper: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
    marginBottom: 8,
  },
  picker: {
    height: 50,
    color: '#1a1c20',
  },

  dateInputButton: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 13,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateInputValue: {
    fontSize: 15,
    color: '#1a1c20',
    fontWeight: '500',
  },
  dateInputPlaceholder: {
    fontSize: 15,
    color: '#b0a89d',
  },
  dateIcon: {
    fontSize: 18,
  },

  hint: {
    fontSize: 11.5,
    color: '#5b606c',
    lineHeight: 18,
  },

  saveBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  saveBtnDisabled: {
    backgroundColor: '#e9dccc',
    shadowOpacity: 0,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
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
});