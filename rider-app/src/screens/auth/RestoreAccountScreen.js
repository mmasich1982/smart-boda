// rider-app/src/screens/auth/RestoreAccountScreen.js
// SMART APPS: "Setting up your account on this phone". Shown once, right after a person logs in on a phone that does not hold their data
// (a new or replacement phone, or a fresh install). The phone must be ONLINE for this first download; afterwards the app works offline as before.
// Each step is shown as it runs. If a step fails (the connection dropped) the person can try again or carry on: the rest keeps coming down in the
// background through the same sync the app already runs.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import { restoreSteps } from '../../auth/loginRules';
import { restoreAccount } from '../../auth/restoreService';

const ICON = { waiting: '⚪', running: '⏳', ok: '✅', failed: '⚠️' };

export default function RestoreAccountScreen({ navigation, route }) {
  const userType = (route && route.params && route.params.userType) || 'rider';
  const riderId = route && route.params && route.params.riderId;
  const steps = restoreSteps(userType);
  const [state, setState] = useState(() => Object.fromEntries(steps.map((s) => [s.id, 'waiting'])));
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true; setDone(false); setFailed(false);
    setState(Object.fromEntries(steps.map((s) => [s.id, 'waiting'])));
    const out = await restoreAccount({ userType, riderId, onStep: (id, st) => setState((cur) => ({ ...cur, [id]: st })) });
    running.current = false;
    setDone(true); setFailed(!out.ok);
    if (out.ok) setTimeout(() => navigation.replace('Home'), 900);
  }, [userType, riderId]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { run(); }, [run]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.title}>Setting up your account on this phone</Text>
      <Text style={styles.sub}>Keep the internet on for a moment. After this the app works offline as usual.</Text>
      <View style={{ marginTop: 20 }}>
        {steps.map((s) => (
          <View key={s.id} style={styles.row}>
            <Text style={styles.icon}>{ICON[state[s.id]] || ICON.waiting}</Text>
            <Text style={styles.label}>{s.label}</Text>
            {state[s.id] === 'running' ? <ActivityIndicator size="small" color={colors.bodaOrange} style={{ marginLeft: 8 }} /> : null}
          </View>
        ))}
      </View>
      {done && failed ? (
        <View style={{ marginTop: 20 }}>
          <Text style={styles.warn}>Some of your records could not be downloaded yet (is the internet on?). You can try again, or carry on: the rest keeps downloading in the background.</Text>
          <PrimaryButton label="Try again" onPress={run} style={{ marginTop: 12 }} />
          <PrimaryButton label="Carry on" onPress={() => navigation.replace('Home')} style={{ marginTop: 10 }} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1c20', marginTop: 40 },
  sub: { fontSize: 14, color: '#5b606c', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e7e4db', padding: 14, marginBottom: 10 },
  icon: { fontSize: 18, width: 30 },
  label: { fontSize: 15, fontWeight: '600', color: '#1a1c20', flexShrink: 1 },
  warn: { color: '#b4540a', fontSize: 14, lineHeight: 20 },
});
