// rider-app/src/screens/chama/TbSecurityRulesScreen.js
// A Table Banking group decides what borrowers must put up. Everything here is per group.
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { securityRules, saveSecurityRules, apiError } from '../../api/groupsClient';
import { s, Chip } from './chamaStyles';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

const Toggle = ({ on, label, hint, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[s.row, { alignItems: 'center' }]} testID={`toggle-${label}`}>
    <View style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>{label}</Text>{!!hint && <Text style={s.hint}>{hint}</Text>}</View>
    <Text style={{ fontSize: 22 }}>{on ? '✅' : '⬜'}</Text></TouchableOpacity>);
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

function TbSecurityRulesScreen({ navigation, route }) {
  const gt = useGroupText();
  const { showToast } = useToast();
  const groupId = route.params?.groupId;
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    securityRules(groupId).then((r) => setF({
      preset: r.preset, mode: r.mode, from_amount: String(r.from_amount || 0), haircut_pct: String(r.haircut_pct), cover_pct: String(r.cover_pct), savings_on: r.savings.on, savings_pct: String(r.savings.pct),
      allow_title: r.cats.title, allow_logbook: r.cats.logbook, allow_chattel: r.cats.chattel,
      guar_on: r.guar.on, guar_max: String(r.guar.max),
      guar_savings: r.guar.forms.savings, guar_title: r.guar.forms.title, guar_logbook: r.guar.forms.logbook, guar_chattel: r.guar.forms.chattel,
      keeper: r.keeper, valuation: r.valuation, verify: r.verify, release_rule: r.release }))
      .catch((e) => showToast(apiError(e, 'Could not load.'), 'warn'));
  }, [groupId]));
  const set = (k, v) => setF({ ...f, [k]: v });
  const flip = (k) => set(k, !f[k]);
  const PRESETS = [['none', 'None', 'No security asked'], ['savings', 'Savings only', "Borrower locks part of their own savings"], ['assets', 'Assets', 'Savings, logbook, title deed or household item']];
  const pick = (k) => setF({ ...f, pickedPreset: k, preset: k, mode: k === 'none' ? 'none' : 'required',
    savings_on: k !== 'none' ? true : f.savings_on, allow_logbook: k === 'assets', allow_title: k === 'assets', allow_chattel: k === 'assets' });
  const setMode = (m) => setF({ ...f, mode: m, preset: 'custom', pickedPreset: null });
  async function save() {
    const { preset, ...rest } = f;                          // a preset is only sent when the Treasurer just tapped one
    const body = { ...rest, ...(f.pickedPreset ? { preset: f.pickedPreset } : {}), from_amount: int(f.from_amount, 0), haircut_pct: int(f.haircut_pct, 70),
      cover_pct: int(f.cover_pct, 100), savings_pct: int(f.savings_pct, 100), guar_max: int(f.guar_max, 1) };
    delete body.pickedPreset;
    setBusy(true);
    try { await saveSecurityRules(body, groupId); showToast('Saved. New loan requests will follow these rules.', 'success'); navigation.goBack(); }
    catch (e) { showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'); }
    finally { setBusy(false); }
  }
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Manage Chama" />
      <Text style={s.title}>🔒 {gt('group.title_security_rules', 'Loan security rules')}</Text>
      <Text style={s.sub}>What a member must put up to borrow from this group. Loans already approved are not changed.</Text>
      {f && (<>
        <View style={s.card}>
          <Text style={s.cardTitle}>Security for loans</Text>
          <Text style={s.hint}>Security is off until you switch it on. Pick the closest preset, then adjust below if you need to.</Text>
          <View style={s.chipRow}>{PRESETS.map(([k, l]) => <Chip key={k} on={f.preset === k} label={l} onPress={() => pick(k)} />)}</View>
          <Text style={s.hint}>{(PRESETS.find((p) => p[0] === f.preset) || [0, 0, 'Custom: you changed the options below.'])[2]}</Text>
          <Text style={[s.label, { marginTop: 10 }]}>WHEN IS SECURITY NEEDED</Text>
          <View style={s.chipRow}>{[['none', 'Never'], ['optional', 'Optional'], ['required', 'Required']].map(([k, l]) => <Chip key={k} on={f.mode === k} label={l} onPress={() => setMode(k)} />)}</View>
          {f.mode === 'required' && (<>
            <Text style={[s.label, { marginTop: 10 }]}>ONLY FOR LOANS OF AT LEAST (KSH, 0 = ALL LOANS)</Text>
            <TextInput style={s.input} keyboardType="number-pad" value={f.from_amount} onChangeText={(v) => set('from_amount', v)} />
            <Text style={s.label}>SECURITY MUST BE WORTH (% OF THE LOAN)</Text>
            <TextInput style={s.input} keyboardType="number-pad" value={f.cover_pct} onChangeText={(v) => set('cover_pct', v)} />
          </>)}
        </View>
        {f.mode !== 'none' && (<View style={s.card}>
          <Text style={s.cardTitle}>What members can put up</Text>
          <Toggle on={f.savings_on} label="Their own savings" hint="Locked until the loan is paid. Counts in full." onPress={() => flip('savings_on')} />
          {f.savings_on && (<><Text style={[s.label, { marginTop: 8 }]}>MOST OF THEIR FREE SAVINGS THEY CAN LOCK (%)</Text>
            <TextInput style={s.input} keyboardType="number-pad" value={f.savings_pct} onChangeText={(v) => set('savings_pct', v)} /></>)}
          <Toggle on={f.allow_logbook} label="Bike logbook" onPress={() => flip('allow_logbook')} />
          <Toggle on={f.allow_title} label="Title deed" onPress={() => flip('allow_title')} />
          <Toggle on={f.allow_chattel} label="Household item with a serial number" onPress={() => flip('allow_chattel')} />
          {(f.allow_logbook || f.allow_title || f.allow_chattel) && (<>
            <Text style={[s.label, { marginTop: 8 }]}>PAPERS AND ITEMS COUNT AT (% OF THEIR VALUE)</Text>
            <TextInput style={s.input} keyboardType="number-pad" value={f.haircut_pct} onChangeText={(v) => set('haircut_pct', v)} />
            <Text style={s.hint}>For example 70 means a KSh 10,000 logbook counts as KSh 7,000. One item can secure only one loan at a time.</Text></>)}
        </View>)}
        <View style={s.card}>
          <Text style={s.cardTitle}>Guarantors</Text>
          <Text style={s.hint}>Optional. A guarantor is never compulsory. When you allow them, a guarantor's backing counts toward the security a loan needs.</Text>
          <Toggle on={f.guar_on} label="Members can ask a guarantor" hint="A member of this group who says yes in the app." onPress={() => flip('guar_on')} />
          {f.guar_on && (<>
            <Text style={s.label}>MOST GUARANTORS PER LOAN</Text>
            <TextInput style={s.input} keyboardType="number-pad" value={f.guar_max} onChangeText={(v) => set('guar_max', v)} />
            <Text style={s.hint}>If you switch guarantors off later, guarantees on loans already requested stay until those loans are cleared.</Text>
            <Text style={[s.label, { marginTop: 8 }]}>A GUARANTOR CAN BACK THE LOAN WITH</Text>
            <Toggle on={f.guar_savings} label="Their savings" onPress={() => flip('guar_savings')} />
            <Toggle on={f.guar_logbook} label="Their logbook" onPress={() => flip('guar_logbook')} />
            <Toggle on={f.guar_title} label="Their title deed" onPress={() => flip('guar_title')} />
            <Toggle on={f.guar_chattel} label="Their household item" onPress={() => flip('guar_chattel')} />
          </>)}
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>Papers and checking</Text>
          <Text style={s.label}>WHO KEEPS THE PAPERS</Text>
          <Text style={s.hint}>The Treasurer keeps the papers.</Text>
          <Text style={s.label}>HOW IS THE VALUE DECIDED</Text><TextInput style={s.input} value={f.valuation} onChangeText={(v) => set('valuation', v)} maxLength={80} />
          <Text style={s.label}>HOW IS IT CHECKED</Text><TextInput style={s.input} value={f.verify} onChangeText={(v) => set('verify', v)} maxLength={80} />
          <Text style={s.label}>WHEN IS IT GIVEN BACK</Text><TextInput style={s.input} value={f.release_rule} onChangeText={(v) => set('release_rule', v)} maxLength={80} />
        </View>
        <PrimaryButton label="Save rules" onPress={save} disabled={busy} />
      </>)}
    </ScrollView>);
}

export default withChamaOnlineGate(TbSecurityRulesScreen, 'chama');
