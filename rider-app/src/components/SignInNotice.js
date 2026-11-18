// rider-app/src/components/SignInNotice.js
// SMART BIZNA: shown only when this phone has no sign-in token and cannot get one by itself (no PIN saved here, or the server refused the saved one).
// The person types the PIN once; it is sent exactly like a login and, if accepted, kept on the phone (offline-first). Nothing shows otherwise.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { needsSignIn, subscribeNeedsSignIn, signInWithPin } from '../offline/sessionToken';

export default function SignInNotice() {
  const [need, setNeed] = useState(needsSignIn());
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => subscribeNeedsSignIn(setNeed), []);
  if (!need) return null;
  const submit = async () => {
    if (pin.length !== 4 || busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await signInWithPin(pin);
      if (r && r.ok) { setPin(''); setNeed(false); } else setMsg('That PIN was not accepted. Check it and try again.');
    } catch { setMsg('Could not reach the server. Try again when you are online.'); }
    setBusy(false);
  };
  return (
    <View style={s.box}>
      <Text style={s.title}>Enter your PIN once to sync</Text>
      <Text style={s.text}>Your records are safe on this phone. Enter your PIN once so they can be sent to the server.</Text>
      <View style={s.row}>
        <TextInput style={s.input} value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="PIN" />
        <TouchableOpacity style={[s.btn, (pin.length !== 4 || busy) && s.off]} onPress={submit} disabled={pin.length !== 4 || busy}>
          <Text style={s.btnText}>{busy ? '...' : 'Sync'}</Text>
        </TouchableOpacity>
      </View>
      {!!msg && <Text style={s.err}>{msg}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  box: { backgroundColor: '#FFF7E6', borderColor: '#F5C26B', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  title: { fontWeight: '700', color: '#7A4B00', marginBottom: 4 },
  text: { color: '#7A4B00', fontSize: 13, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#E0D2B4', paddingHorizontal: 10, paddingVertical: 8, marginRight: 8 },
  btn: { backgroundColor: '#0B6B3A', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  off: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700' },
  err: { color: '#B00020', marginTop: 6, fontSize: 12 },
});
