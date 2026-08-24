// rider-app/src/screens/complianceHistory/DataExportRequestScreen.js
// ADDED (ADDITIONAL_CRITICAL_MVP0_FEATURES.docx #2): rebuilt as the required security flow --
// Confirm Your PIN -> email + reason -> confirmation -- instead of a single unguarded button.
// BR-SB21-001/002 still hold: nothing here reads subscription/lock state at any step.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import FormField from '../../components/FormField';
import DropdownField from '../../components/DropdownField';
import DigitBoxInput from '../../components/DigitBoxInput';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import useMasterData from '../../hooks/useMasterData';
import api from '../../api/client';

const STEP_PIN = 'pin', STEP_DETAILS = 'details', STEP_CONFIRMED = 'confirmed';

export default function DataExportRequestScreen({ riderId, navigation }) {
  const [step, setStep] = useState(STEP_PIN);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(null);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [reasonError, setReasonError] = useState(null);
  const [deliveryHours, setDeliveryHours] = useState(48);
  const { data: reasons } = useMasterData('dataExportReasons', '/compliance/data-export/reasons');
  const { showToast } = useToast();

  useEffect(() => {
    api.get('/compliance/data-export/status', { params: { rider_id: riderId } }).then((res) => {
      if (res.data.has_request && res.data.status === 'pending') {
        setStep(STEP_CONFIRMED);
        setDeliveryHours(res.data.delivery_window_hours || 48);
      }
    });
  }, []);

  // Step 1: Confirm Your PIN — same PIN service every other confirm-your-PIN flow in the app uses.
  async function handlePinConfirm() {
    const res = await api.post('/compliance/data-export/verify-pin', null, { params: { rider_id: riderId, pin } });
    if (!res.data?.ok) { setPinError('Incorrect PIN. Please try again.'); return; }
    setPinError(null);
    setStep(STEP_DETAILS);
  }

  // Step 2: verified email + reason dropdown (admin-configurable reason list, per docx #2)
  async function handleSubmit() {
    let ok = true;
    if (!email || !email.includes('@')) { setEmailError('Enter a valid email address.'); ok = false; } else setEmailError(null);
    if (!reason) { setReasonError('Please select a reason.'); ok = false; } else setReasonError(null);
    if (!ok) return;
    const res = await api.post('/compliance/data-export', null, {
      params: { rider_id: riderId, contact_email: email, reason_code: reason, pin_verified: true },
    });
    if (res.data.already_requested) {
      showToast('You already have a request in progress.', 'default');  // EXC-SB21-001
    }
    setDeliveryHours(res.data.delivery_window_hours || 48);
    setStep(STEP_CONFIRMED);
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Export My Data</Text>

      {step === STEP_PIN && (
        <>
          <Text style={styles.sub}>Confirm your PIN to continue.</Text>
          <DigitBoxInput length={4} value={pin} onChange={setPin} masked />
          {pinError && <Text style={styles.error}>⚠️ {pinError}</Text>}
          <PrimaryButton label="Confirm PIN →" onPress={handlePinConfirm} disabled={pin.length !== 4} />
        </>
      )}

      {step === STEP_DETAILS && (
        <>
          <Text style={styles.sub}>Request a full copy of everything Smart Boda has recorded about you.</Text>
          <FormField label="Email Address" value={email} onChangeText={setEmail}
            keyboardType="email-address" placeholder="you@example.com" error={emailError} />
          <DropdownField label="Reason for Export" value={reason} onValueChange={setReason}
            placeholder="Select a reason..." options={(reasons || []).map((r) => ({ label: r.display_name, value: r.code }))}
            error={reasonError} />
          <PrimaryButton label="Submit Request →" onPress={handleSubmit} />
        </>
      )}

      {step === STEP_CONFIRMED && (
        <>
          <Text style={styles.fulfilled}>✅ Your request has been received.</Text>
          <Text style={styles.pending}>
            We'll send your export to {email || 'your registered email'} within {deliveryHours} hours.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 8 },
  sub: { fontSize: 12.5, color: '#5b606c', marginBottom: 16 },
  fulfilled: { fontSize: 12.5, color: '#16a34a', marginBottom: 14, fontWeight: '700' },
  pending: { fontSize: 12, color: '#5b606c', textAlign: 'center', marginTop: 14, fontStyle: 'italic' },
  error: { fontSize: 11, color: '#e0453f', marginTop: 6, fontWeight: '700' },
});
