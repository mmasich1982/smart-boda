// rider-app/src/screens/settings/ChangePinVerifyScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import DigitBoxInput from '../../components/DigitBoxInput';  // FIX: was 'PinInputBoxes', a component that never existed -- this is the same box-input component PinLoginScreen.js already uses
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import api from '../../api/client';

export default function ChangePinVerifyScreen({ riderId, navigation }) {
  const [pin, setPin] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(null);

  async function handleContinue() {
    if (pin.length !== 4) { setError("Enter your current 4-digit PIN."); return; }
    try {
      await api.post('/settings/verify-current-pin', null, { params: { rider_id: riderId, pin } });
      // BR-SB22-003: only after this succeeds does CreatePinScreen ever open in changeMode
      navigation.navigate('CreatePin', { changeMode: true });
    } catch (e) {
      if (e.response?.status === 423) { setLocked(true); setError('Too many attempts. Try again in ~15 min.'); return; }
      const left = e.response?.data?.attempts_left ?? attemptsLeft - 1;
      setAttemptsLeft(left);
      setError(`Incorrect PIN. ${left} attempt(s) remaining.`);  // EXC-SB22-004
      setPin('');
    }
  }

  return (
    <View style={styles.container}>
      <BackLink label="← Settings" onPress={() => navigation.navigate('Settings')} />
      <Text style={styles.title}>Confirm it's you</Text>
      <Text style={styles.sub}>Enter your current 4-digit PIN to continue.</Text>
      <DigitBoxInput value={pin} onChange={setPin} length={4} disabled={locked} />
      <Text style={styles.hint}>{attemptsLeft} attempt(s) remaining</Text>
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
      <PrimaryButton label="Continue →" onPress={handleContinue} disabled={locked || pin.length !== 4} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  sub: { fontSize: 13, color: colors.inkSoft, marginBottom: 18 },
  hint: { fontSize: 12, color: colors.inkSoft, textAlign: 'center', marginBottom: 14 },
  error: { color: colors.signalRed, fontSize: 12.5, marginBottom: 10, fontWeight: '700', textAlign: 'center' },
});
