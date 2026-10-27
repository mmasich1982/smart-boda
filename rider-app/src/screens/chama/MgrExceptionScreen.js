// rider-app/src/screens/chama/MgrExceptionScreen.js
// "Note a reason" (Smart_Boda_Prototype_v44): only for a death or an emergency. Members see the note, and the pool is
// paid out without that person's share. Steps: who cannot pay -> what happened -> short note -> "I confirm this is genuine".
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { mgrCircle, mgrNote, apiError } from '../../api/groupsClient';
import { s } from './chamaStyles';
import { Btn, Card, Notice, ScreenTitle } from './mgrUi';
import { CheckRow, FormInput } from './manageUi';
import useManageChama from './useManageChama';
import colors from '../../theme/colors';

const REASONS = ['Passed away', 'Sickness or emergency', 'Accident', 'Other (group agreed)'];

function MgrExceptionScreen({ navigation }) {
  const m = useManageChama();
  const { showToast } = useToast();
  const gid = m.gid, cid = m.circle?.id;
  const [d, setD] = useState(null);
  const [who, setWho] = useState(null), [why, setWhy] = useState(null), [note, setNote] = useState(''), [sure, setSure] = useState(false), [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!gid || !cid) return undefined;
    mgrCircle(cid, gid).then(setD).catch(() => {});
    return undefined;
  }, [gid, cid]));

  const R = d && d.id === cid ? d.round : null;
  const unpaid = R ? R.unpaid : [];
  const pickedWho = who || (unpaid.length === 1 ? unpaid[0].member_id : null);
  const ready = !!pickedWho && !!why && sure;

  async function save() {
    setBusy(true);
    try {
      await mgrNote(cid, { member_id: pickedWho, reason: why, note: note.trim() || undefined }, gid);
      showToast('Noted. Members can see it.', 'success');
      navigation.goBack();
    } catch (e) { showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'); setBusy(false); }
  }

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <BackLink onPress={() => navigation.goBack()} label="← Give Money to Member" />
      <ScreenTitle>📝 Note a reason</ScreenTitle>
      <Text style={x.sub}>Only for a death or an emergency. Members will see this note.</Text>
      {d && !R && <Notice tone="amber" icon="⏳" title="No round is open yet" />}
      {R && unpaid.length === 0 && <Notice tone="green" icon="✅" title="Everyone has paid" sub="There is nobody to note." />}

      {R && unpaid.length > 0 && (<>
        <Card>
          <Text style={x.title}>1 · Who cannot pay?</Text>
          {unpaid.length === 1
            ? <Text style={x.one}>{unpaid[0].name}</Text>
            : unpaid.map((u) => (
              <TouchableOpacity key={u.member_id} onPress={() => setWho(u.member_id)} style={[x.pick, pickedWho === u.member_id && x.pickOn]}>
                <Text style={x.pickTxt}>{pickedWho === u.member_id ? '✓ ' : ''}{u.name}</Text>
              </TouchableOpacity>))}
        </Card>
        <Card>
          <Text style={x.title}>2 · What happened?</Text>
          {REASONS.map((r) => (
            <TouchableOpacity key={r} testID={`why-${r}`} onPress={() => setWhy(r)} style={[x.pick, why === r && x.pickOn]}>
              <Text style={x.pickTxt}>{r}</Text>
            </TouchableOpacity>))}
          <FormInput label="Short note (optional)" value={note} onChangeText={setNote} maxLength={80} placeholder="e.g. Family informed the group" style={{ marginTop: 4 }} />
        </Card>
        <CheckRow plain checked={sure} onChange={setSure} testID="exception-sure">I confirm this is genuine and the group has been told.</CheckRow>
        <Btn label="Save note" disabled={busy || !ready} onPress={save} testID="exception-save" />
      </>)}
    </ScrollView>);
}

const x = {
  sub: { fontSize: 14.5, color: colors.inkSoft, lineHeight: 22, marginBottom: 14, marginTop: -6 },
  title: { fontWeight: '800', fontSize: 15, color: colors.ink, marginBottom: 8 },
  one: { fontWeight: '800', fontSize: 15.5, color: colors.ink, paddingVertical: 8, paddingHorizontal: 8 },
  pick: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8, backgroundColor: '#fff' },
  pickOn: { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' },
  pickTxt: { fontWeight: '700', fontSize: 13.5, color: colors.ink },
};

export default withChamaOnlineGate(MgrExceptionScreen, 'chama');