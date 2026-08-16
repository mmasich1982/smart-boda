// rider-app/src/screens/compliance/RenewDocumentScreen.js
// ✅ UPDATED v2: Custom date picker implementation (no DateTimePicker import)

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { useToast } from '../../components/Toast';

const BADGE_COLORS = {
  expired: '#e0453f',
  due: '#e0453f',
  'expiring-1mo': '#c98a12',
  'expiring-2mo': '#e8a844',
  valid: '#1e9e6f',
};

const STATUS_LABELS = {
  expired: '🔴 Expired',
  due: '🔴 Due today',
  'expiring-1mo': '🟡 Expiring within 1 month',
  'expiring-2mo': '🟠 Expiring within 2 months',
  valid: '✅ Valid',
};

function docStatus(expiryDate) {
  if (!expiryDate) return 'valid';
  const now = Date.now();
  const daysLeft = (expiryDate - now) / 86400000;
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 1) return 'due';
  if (daysLeft <= 30) return 'expiring-1mo';
  if (daysLeft <= 60) return 'expiring-2mo';
  return 'valid';
}

export default function RenewDocumentScreen({ route, navigation }) {
  const { state } = useRider();
  const { showToast } = useToast();
  const documentType = route?.params?.documentType;

  const [existingDoc, setExistingDoc] = useState(null);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        console.log('[RenewDocumentScreen] Loaded riderId:', id);
        setLocalRiderId(id);
        
        if (!id) {
          setError('Rider information not found.');
        }
      } catch (err) {
        console.error('[RenewDocumentScreen] Error loading riderId:', err);
        setError('Error loading rider information.');
      }
    }
    
    loadRiderId();
  }, []);

  // ✅ FETCH EXISTING DOCUMENT WITH FALLBACK RIDER ID
  useEffect(() => {
    const fetchDocument = async () => {
      const effectiveRiderId = localRiderId || state?.riderId;

      if (!effectiveRiderId) {
        console.error('[RenewDocumentScreen] No riderId available');
        setLoading(false);
        return;
      }

      try {
        console.log('[RenewDocumentScreen] Fetching document:', documentType);
        const response = await api.get('/compliance/documents', {
          params: { rider_id: effectiveRiderId },
        });

        const docs = response.data?.documents || [];
        const activeDoc = docs.find((d) => !d.archived && d.document_type === documentType);
        setExistingDoc(activeDoc || null);
      } catch (err) {
        console.error('[RenewDocumentScreen] Fetch error:', err);
        showToast('Failed to load document', 'error');
      } finally {
        setLoading(false);
      }
    };

    if (documentType && (localRiderId || state?.riderId)) {
      fetchDocument();
    }
  }, [documentType, localRiderId, state?.riderId, showToast]);

  // Custom date picker - select a date
  const handleDateSelect = (day) => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    // Construct date in local timezone and convert to ISO string (YYYY-MM-DD)
    const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setNewExpiryDate(isoDate);
    setShowDatePicker(false);
  };

  const handleSave = async () => {
    setError('');

    if (!newExpiryDate) {
      setError('Enter the new expiry date.');
      showToast('Expiry date required', 'error');
      return;
    }

    const expiryMs = new Date(newExpiryDate).getTime();
    const now = Date.now();

    if (expiryMs <= now) {
      setError('Expiry Date must be in the future.');
      showToast('Invalid expiry date', 'error');
      return;
    }

    // ✅ USE FALLBACK RIDER ID
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
        expiry_date: newExpiryDate,
      };

      console.log('[RenewDocumentScreen] Renewing document:', payload);

      const response = await api.post('/compliance/documents', payload, {
        params: { rider_id: effectiveRiderId },
      });

      console.log('[RenewDocumentScreen] Document renewed:', response.data);

      showToast(
        `Renewed! Your ${documentType} has been updated with its new expiry date.`,
        'success'
      );

      navigation.navigate('ComplianceDashboard');
    } catch (err) {
      console.error('[RenewDocumentScreen] Renew error:', err);
      const errorMsg = err.response?.data?.detail || 'Failed to renew document';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const status = existingDoc ? docStatus(existingDoc.expiry_date) : 'valid';

  const formatDate = (ms) => {
    if (!ms) return 'N/A';
    return new Date(ms).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format date for display (MM/DD/YY format)
  const formatDateToDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const y = String(date.getFullYear()).slice(-2);
    return `${m}/${d}/${y}`;
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
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Renew: {documentType}</Text>
        <Text style={styles.screenSub}>
          Already renewed your {documentType}? Just enter the new expiry date below and
          we'll update your reminder.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      {existingDoc && existingDoc.expiry_date ? (
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Current Expiry Date</Text>
            <Text style={styles.kvValue}>{formatDate(existingDoc.expiry_date)}</Text>
          </View>
          <View style={[styles.kvRow, styles.kvRowLast]}>
            <Text style={styles.kvKey}>Status</Text>
            <View style={[styles.badge, { borderColor: BADGE_COLORS[status] }]}>
              <Text style={[styles.badgeText, { color: BADGE_COLORS[status] }]}>
                {STATUS_LABELS[status]}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* New Expiry Date Field */}
      <View style={styles.field}>
        <Text style={styles.label}>
          New Expiry Date <Text style={styles.required}>*</Text>
        </Text>

        <TouchableOpacity
          style={styles.dateInputButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={newExpiryDate ? styles.dateInputValue : styles.dateInputPlaceholder}>
            {newExpiryDate ? formatDateToDisplay(newExpiryDate) : 'Select date...'}
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
                  const isSelected = cellISO === newExpiryDate;
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

        <Text style={styles.hint}>Check the new date printed on your {documentType} and enter it here.</Text>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, (saving || !newExpiryDate) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !newExpiryDate}
      >
        <Text style={styles.saveBtnText}>
          {saving ? 'Saving...' : 'Save New Expiry Date →'}
        </Text>
      </TouchableOpacity>

      {/* Renewal Pathway Link */}
      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => navigation.navigate('RenewalPathway', { documentType })}
      >
        <Text style={styles.linkBtnText}>Haven't renewed yet? See where to renew →</Text>
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
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
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

  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  kvRowLast: {
    borderBottomWidth: 0,
  },
  kvKey: {
    fontSize: 11.5,
    color: '#5b606c',
    fontWeight: '600',
  },
  kvValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
  },
  badge: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
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
    marginBottom: 12,
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

  linkBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkBtnText: {
    color: '#ff7a1a',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
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