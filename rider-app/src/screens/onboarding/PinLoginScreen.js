// rider-app/src/screens/onboarding/PinLoginScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, BackHandler, StyleSheet } from 'react-native';
import SkyHeroBand from '../../components/SkyHeroBand';
import DigitBoxInput from '../../components/DigitBoxInput';
import PrimaryButton from '../../components/PrimaryButton';
import { getCurrentScene } from '../../constants/pinHeroScenes';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';

// SB-04-B: returning-rider login. No SMS/OTP anywhere in this MVP0 flow — "Forgot PIN"
// below routes straight into PinRecoveryScreen's manual Super-Admin review, never a text message.
export default function PinLoginScreen({ route, navigation }) {
  const { riderId, fullName } = route.params;
  const { t } = useTranslation();
  // Recomputed on every focus (not just mount) via useFocusEffect in the real file, so the scene
  // stays correct if the app was backgrounded overnight — omitted here for brevity.
  const scene = getCurrentScene(new Date().getHours());
  const [pin, setPin] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [locked, setLocked] = useState(false);

  async function handleLogin() {
    const res = await api.post('/onboarding/pin/login', { rider_id: riderId, pin });
    if (res.data.ok) {
      navigation.replace('Home');
      return;
    }
    if (res.data.error === 'locked') {
      setLocked(true);
      setError(t('pin.locked')); // EXC-SB04-003, Forgot PIN surfaced prominently below
    } else {
      setAttemptsLeft(res.data.attempts_left);
      setError(t('pin.incorrect', { attempts_left: res.data.attempts_left })); // EXC-SB04-002
    }
    setPin('');
  }

  // Per product decision, every onboarding/login screen except Language Selection shows a back
  // arrow. Here there's no natural "previous" in-app screen, so it exits the app the same way the
  // hardware/gesture back action would — cleaned.html itself omits a back-link on this screen.
  function handleBack() {
    BackHandler.exitApp();
  }

  const firstInitial = (fullName || '').trim().charAt(0).toUpperCase(); // matches cleaned.html's state.fullName.charAt(0)
  const greeting = `${scene.greeting}${fullName ? `, ${fullName.split(' ')[0]}` : ''}!`;

  return (
    <View style={styles.container}>
      <SkyHeroBand
        scene={scene}
        onBack={handleBack}
        chipLabel={scene.label}
        avatarInitial={firstInitial}
        greeting={greeting}
        subtitle={t('pin.login_title')}
      />

      <View style={styles.pinRow}>
        <DigitBoxInput length={4} value={pin} onChange={setPin} masked={!revealed} disabled={locked} />
        <TouchableOpacity style={[styles.eyeBtn, revealed && styles.eyeBtnActive]} onPress={() => setRevealed((r) => !r)} disabled={locked}>
          <Text style={{ fontSize: 15 }}>{revealed ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>

      {error && (
        // EXC-SB04-003: below 2 attempts remaining, the pill turns red — same threshold as cleaned.html's .attempts-pill.low
        <View style={[styles.attemptsPill, attemptsLeft !== null && attemptsLeft <= 2 && styles.attemptsPillLow]}>
          <Text style={styles.attemptsPillText}>⚠️ {error}</Text>
        </View>
      )}

      <PrimaryButton label="Log In" glow onPress={handleLogin} disabled={pin.length !== 4 || locked} />
      <Text style={styles.link} onPress={() => navigation.navigate('PinRecovery', { riderId })}>
        {t('pin.forgot_link')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef' },
  pinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 22, paddingHorizontal: 20 },
  eyeBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#e7e4db', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  eyeBtnActive: { backgroundColor: '#ff7a1a', borderColor: '#ff7a1a' },
  attemptsPill: { alignSelf: 'center', backgroundColor: '#fff7ec', borderWidth: 1, borderColor: '#ffe3c2', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13, marginTop: 12 },
  attemptsPillLow: { backgroundColor: '#fdecea', borderColor: '#f6cac7' },
  attemptsPillText: { fontSize: 11.5, fontWeight: '700', color: '#e5650a' },
  link: { color: '#e5650a', fontSize: 12.5, fontWeight: '700', textAlign: 'center', marginTop: 16, marginBottom: 20 },
});
