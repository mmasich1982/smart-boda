// rider-app/src/screens/onboarding/PinRecoveryScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import DigitBoxInput from '../../components/DigitBoxInput';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import api from '../../api/client';

// SB-04-C: three sequential screens in one component — pending admin review, set new PIN, confirm new PIN.
// BR-SB04-007 / MVP0 scope note: identity is verified by a Smart Boda team member manually reviewing
// the request in Super Admin. There is no OTP and no SMS anywhere in this flow.
export default function PinRecoveryScreen({ route, navigation }) {
  const { riderId } = route.params;
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [stage, setStage] = useState('pending'); // 'pending' | 'newPin' | 'confirmPin'
  const [recoveryRequestId, setRecoveryRequestId] = useState(null);
  const [approved, setApproved] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);

  // BR-SB04-007: recovery always goes through manual Super Admin review — no OTP/SMS involved.
  async function startRecovery() {
    const res = await api.post('/onboarding/pin/recovery/start', null, { params: { rider_id: riderId } });
    setRecoveryRequestId(res.data.recovery_request_id); // NTF-SB04-004 fires from the Rider Account Support queue, not here
  }

  async function checkStatus() {
    const res = await api.get('/onboarding/pin/recovery/status', { params: { recovery_request_id: recoveryRequestId } });
    if (res.data.status === 'approved') {
      setApproved(true);
      setStage('newPin');
      showToast(t('pin.recovery.verified_success'), 'success');
    } else {
      // EXC-SB04-005: still pending, ask the rider to check back rather than looping silently
      setError(t('pin.recovery.not_yet'));
    }
  }

  function handleNewPinNext() {
    if (newPin.length === 4) setStage('confirmPin');
  }

  async function handleConfirmPin() {
    if (confirmPin !== newPin) {
      // EXC-SB04-006: same friendly copy as Create PIN's mismatch state
      setError(t('pin.mismatch'));
      setStage('newPin');
      setNewPin(''); 
      setConfirmPin('');
      return;
    }
    const res = await api.post('/onboarding/pin/recovery/confirm',
      { recovery_request_id: recoveryRequestId, new_pin: newPin, new_pin_confirm: confirmPin },
      { params: { rider_id: riderId } });
    if (res.data.ok) {
      showToast(t('pin.recovery.reset_success'), 'success'); // NTF-SB04-005
      navigation.replace('Home');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.backLink} onPress={() => navigation.goBack()}>
        ← {t('pin.recovery.back_to_login')}
      </Text>
      {error && <Text style={styles.error}>⚠️ {error}</Text>}

      {stage === 'pending' && !recoveryRequestId && (
        <>
          <Text style={styles.title}>{t('pin.recovery.title')}</Text>
          <Text style={styles.sub}>{t('pin.recovery.subtitle')}</Text>
          <PrimaryButton label={t('pin.recovery.submit')} onPress={startRecovery} />
        </>
      )}
      {stage === 'pending' && recoveryRequestId && (
        <>
          <Text style={styles.title}>{t('pin.recovery.title')}</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('pin.recovery.pending_icon')}</Text>
            <Text style={styles.cardBody}>{t('pin.recovery.pending')}</Text>
          </View>
          <PrimaryButton label={t('pin.recovery.check_again')} onPress={checkStatus} />
        </>
      )}
      {stage === 'newPin' && (
        <>
          <Text style={styles.title}>{t('pin.recovery.set_new_title')}</Text>
          <View style={styles.pinRow}>
            <DigitBoxInput length={4} value={newPin} onChange={setNewPin} masked={!revealed} />
            <TouchableOpacity 
              style={[styles.eyeBtn, revealed && styles.eyeBtnActive]} 
              onPress={() => setRevealed((r) => !r)}
            >
              <Text style={{ fontSize: 15 }}>{revealed ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
          <PrimaryButton 
            label={t('pin.continue_button')}
            onPress={handleNewPinNext} 
            disabled={newPin.length !== 4} 
          />
        </>
      )}
      {stage === 'confirmPin' && (
        <>
          <Text style={styles.title}>{t('pin.recovery.confirm_new_title')}</Text>
          <DigitBoxInput length={4} value={confirmPin} onChange={setConfirmPin} masked={!revealed} />
          <PrimaryButton 
            label={t('pin.confirm_button')}
            onPress={handleConfirmPin} 
            disabled={confirmPin.length !== 4} 
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef', padding: 20, justifyContent: 'center' },
  backLink: { fontSize: 12, fontWeight: '700', color: '#5b606c', marginBottom: 16 },
  title: { fontSize: 19, fontWeight: '800', color: '#1a1c20', marginBottom: 6 },
  sub: { fontSize: 12, color: '#5b606c', marginBottom: 16, lineHeight: 18 },
  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 15, padding: 14, marginBottom: 16 },
  cardTitle: { fontWeight: '700', fontSize: 12.5, marginBottom: 4 },
  cardBody: { fontSize: 11.5, color: '#5b606c', lineHeight: 17 },
  pinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  eyeBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#e7e4db', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  eyeBtnActive: { backgroundColor: '#ff7a1a', borderColor: '#ff7a1a' },
  error: { color: '#e0453f', fontSize: 11.5, marginBottom: 14, fontWeight: '700' },
});