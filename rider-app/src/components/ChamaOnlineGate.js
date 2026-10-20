// rider-app/src/components/ChamaOnlineGate.js
// ============================================================================
// ONLINE-REQUIRED GATE for My Savings, My Loans and My Chama
// ============================================================================
// Wrap a screen with withChamaOnlineGate(Screen, 'savings' | 'loans' | 'chama').
//
//  • Online  -> the screen renders normally. If the server was briefly unreachable and a saved copy was shown,
//               a small "last saved" notice appears above it.
//  • Offline -> the screen is NOT mounted (so it cannot try to load or submit anything). The person sees a clear,
//               professional explanation of why a connection is required, a Try again button, and a way back Home.
//  • Back online -> the screen mounts automatically and loads the latest information.
//
// Every other Smart Boda feature keeps its offline-first behaviour; only these three modules use this gate.
// Uses the app's useNetworkStatus hook, exactly like FuelEntryScreen / FuelHubScreen.
// ============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useTranslation } from '../i18n/LocalizationProvider';
import colors from '../theme/colors';
import BackLink from './BackLink';
import {
  getModuleCopy, isOnlineNow, subscribeStaleServed, getStaleServed, clearStaleServed, friendlyWhen,
  CHAMA_OFFLINE_REASSURANCE, CHAMA_OFFLINE_RETRY, CHAMA_OFFLINE_CHECKING, CHAMA_OFFLINE_BACK,
  CHAMA_BACK_ONLINE, CHAMA_STALE_NOTICE,
} from '../offline/chamaConnectivity';

// Same fallback idea as groupText.js: t() returns the key when a string is missing, so show English instead.
function useText() {
  const { t } = useTranslation();
  return (key, english, vars) => {
    const v = t(key, vars);
    if (v && v !== key) return v;
    return Object.entries(vars || {}).reduce((s, [k, val]) => s.replace(`{${k}}`, String(val)), english);
  };
}

export default function ChamaOnlineGate({ module: moduleKey = 'chama', navigation, children }) {
  const tx = useText();
  const copy = getModuleCopy(moduleKey);
  const { isConnected, verifyConnection } = useNetworkStatus();

  const [probe, setProbe] = useState(null);          // null = unknown, true = online, false = offline
  const [checking, setChecking] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const [stale, setStale] = useState(getStaleServed());
  const wasOffline = useRef(false);

  // Only an explicit "not connected" counts as offline. null / unknown never blocks the person.
  const offline = isConnected === false || probe === false;

  useEffect(() => {
    let alive = true;
    isOnlineNow().then((ok) => { if (alive) setProbe(ok); });
    return () => { alive = false; };
  }, [isConnected]);

  useEffect(() => subscribeStaleServed(setStale), []);
  useEffect(() => () => clearStaleServed(), []);

  // offline -> online: the screen was not mounted while offline, so mounting it now already loads the latest data
  // (no forced remount, which would load everything twice). Just say so briefly.
  useEffect(() => {
    if (offline) { wasOffline.current = true; return undefined; }
    if (wasOffline.current) {
      wasOffline.current = false;
      setJustReconnected(true);
      const timer = setTimeout(() => setJustReconnected(false), 3500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [offline]);

  const retry = useCallback(async () => {
    setChecking(true);
    try { await verifyConnection?.(); } catch { /* the probe below decides */ }
    const ok = await isOnlineNow();
    setProbe(ok);
    setChecking(false);
  }, [verifyConnection]);

  if (offline) {
    return (
      <ScrollView style={st.page} contentContainerStyle={st.pad} testID="chama-offline-gate">
        <BackLink onPress={() => navigation?.navigate?.('Home')} label={tx(CHAMA_OFFLINE_BACK.key, CHAMA_OFFLINE_BACK.text)} />
        <View style={st.card}>
          <Text style={st.icon}>📡</Text>
          <Text style={st.module}>{tx(copy.moduleLabelKey, copy.moduleLabel)}</Text>
          <Text style={st.title}>{tx(copy.titleKey, copy.title)}</Text>
          <Text style={st.body}>{tx(copy.bodyKey, copy.body)}</Text>
          <TouchableOpacity style={st.btn} onPress={retry} disabled={checking} accessibilityRole="button" testID="chama-offline-retry">
            {checking
              ? <View style={st.row}><ActivityIndicator color="#fff" /><Text style={st.btnTxt}>  {tx(CHAMA_OFFLINE_CHECKING.key, CHAMA_OFFLINE_CHECKING.text)}</Text></View>
              : <Text style={st.btnTxt}>{tx(CHAMA_OFFLINE_RETRY.key, CHAMA_OFFLINE_RETRY.text)}</Text>}
          </TouchableOpacity>
        </View>
        <Text style={st.reassure}>ℹ️ {tx(CHAMA_OFFLINE_REASSURANCE.key, CHAMA_OFFLINE_REASSURANCE.text)}</Text>
      </ScrollView>
    );
  }

  return (
    <View style={st.flex}>
      {justReconnected && (
        <View style={st.okBar}><Text style={st.okTxt}>✅ {tx(CHAMA_BACK_ONLINE.key, CHAMA_BACK_ONLINE.text)}</Text></View>
      )}
      {stale && (
        <View style={st.staleBar} testID="chama-stale-notice">
          <Text style={st.staleTxt}>⚠️ {tx(CHAMA_STALE_NOTICE.key, CHAMA_STALE_NOTICE.text, { when: friendlyWhen(stale.savedAt) })}</Text>
        </View>
      )}
      <View style={st.flex}>{children}</View>
    </View>
  );
}

/**
 * HOC: export default withChamaOnlineGate(MyScreen, 'savings');
 * Props (navigation, route) pass straight through to the wrapped screen.
 */
export function withChamaOnlineGate(Screen, moduleKey) {
  // moduleKey may be a function of the props when one screen serves two modules (e.g. ChamaPay: savings vs loan)
  const Gated = (props) => (
    <ChamaOnlineGate module={typeof moduleKey === 'function' ? moduleKey(props) : moduleKey} navigation={props.navigation}>
      <Screen {...props} />
    </ChamaOnlineGate>
  );
  Gated.displayName = `ChamaOnlineGate(${Screen.displayName || Screen.name || 'Screen'})`;
  return Gated;
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.cream },
  pad: { padding: 16 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 20, alignItems: 'center', marginTop: 12 },
  icon: { fontSize: 44, marginBottom: 6 },
  module: { fontSize: 12, fontWeight: '800', color: colors.inkSoft, letterSpacing: 0.5, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 10 },
  body: { fontSize: 14.5, lineHeight: 21, color: colors.ink, textAlign: 'center', marginBottom: 18 },
  btn: { backgroundColor: colors.bodaOrange, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 28, minWidth: 180, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center' },
  reassure: { marginTop: 16, color: colors.inkSoft, fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  okBar: { backgroundColor: '#e7f7ec', paddingVertical: 8, paddingHorizontal: 14 },
  okTxt: { color: '#1b6b3a', fontWeight: '700', fontSize: 12.5 },
  staleBar: { backgroundColor: colors.signalAmberBg, borderBottomWidth: 1, borderBottomColor: colors.signalAmber, paddingVertical: 8, paddingHorizontal: 14 },
  staleTxt: { color: colors.ink, fontSize: 12 },
});
