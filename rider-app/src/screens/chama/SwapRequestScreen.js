// rider-app/src/screens/chama/SwapRequestScreen.js
// Ask another rider to swap turns (Smart_Boda_Prototype_v25 "Request a Turn Swap").
// route.params: { circle, groupId } where circle comes from /chama/mgr/me.
// The other rider can only AGREE; you can CANCEL. There is no "decline" and a refusal leaves no record.
import React, { useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { mgrSwapRequest, apiError } from '../../api/groupsClient';
import { s } from './chamaStyles';
import { first } from './common';
import { Btn, Card, ScreenTitle, longDate } from './mgrUi';
import colors from '../../theme/colors';

function SwapRequestScreen({ navigation, route }) {
  const { showToast } = useToast();
  const c = route.params?.circle;
  const mine = c?.swap?.my_free_turns || [];
  const targets = c?.swap?.targets || [];
  const [my, setMy] = useState(mine.length === 1 ? mine[0] : null);
  const [other, setOther] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const t = targets.find((x) => x.turn === other);
  const dateOf = (turn) => (c?.schedule || []).find((x) => x.turn === turn)?.date;

  async function send() {
    setBusy(true);
    try {
      await mgrSwapRequest(c.id, { my_turn: my, other_turn: other, reason: reason.trim() }, route.params?.groupId);
      showToast(`Swap request sent to ${first(t.name)}.`, 'success');
      navigation.goBack();
    } catch (e) { showToast(apiError(e, 'Could not send. Check your connection.'), 'warn'); }
    finally { setBusy(false); }
  }
  if (!c) return <ScrollView style={s.page}><BackLink onPress={() => navigation.goBack()} /><Text style={{ padding: 16 }}>Open this from My Savings.</Text></ScrollView>;

  const back = <BackLink onPress={() => navigation.goBack()} label="← Group Turns" />;
  const head = (<>{back}<ScreenTitle>🔁 Request a Turn Swap</ScreenTitle></>);
  if (mine.length === 0) {
    return (
      <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>{head}
        <Card><Text style={w.hint}>Your turn has already come, or a swap is already in progress, so it cannot be swapped.</Text></Card>
      </ScrollView>);
  }
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      {head}
      <Card>
        <Text style={w.title}>Your turn</Text>
        {mine.length === 1
          ? <Text style={w.bold}>Turn {mine[0]} of {c.total_turns}{dateOf(mine[0]) ? ` · ${longDate(dateOf(mine[0]))}` : ''}</Text>
          : mine.map((n) => (
            <TouchableOpacity key={n} onPress={() => setMy(n)} style={[w.pick, my === n && w.pickOn]}>
              <Text style={w.pickName}>{my === n ? '✓ ' : ''}Turn {n} of {c.total_turns}</Text>
              <Text style={w.pickSub}>{longDate(dateOf(n))}</Text>
            </TouchableOpacity>))}
      </Card>
      <Card>
        <Text style={w.title}>1 · Choose who to swap with</Text>
        <Text style={[w.hint, { marginBottom: 6 }]}>Only members whose turn has not come yet can be chosen.</Text>
        {targets.length === 0 && <Text style={w.hint}>Nobody can swap with you right now.</Text>}
        {targets.map((x) => (
          <TouchableOpacity key={x.turn} onPress={() => setOther(x.turn)} style={[w.pick, other === x.turn && w.pickOn]}>
            <Text style={w.pickName}>{other === x.turn ? '✓ ' : ''}{x.name}</Text>
            <Text style={w.pickSub}>Turn {x.turn} · {longDate(x.date)}</Text>
          </TouchableOpacity>))}
      </Card>
      <Card>
        <Text style={w.title}>2 · Reason (optional)</Text>
        <TextInput style={w.input} value={reason} onChangeText={setReason} maxLength={120} placeholder="e.g. School fees due earlier" />
      </Card>
      <Btn label="Send Swap Request" onPress={send} disabled={busy || !my || !other} testID="swap-send" />
    </ScrollView>);
}

const w = {
  title: { fontWeight: '700', fontSize: 13.5, color: colors.ink, marginBottom: 4 },
  bold: { fontWeight: '800', fontSize: 14, color: colors.ink },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 6, lineHeight: 17 },
  pick: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent' },
  pickOn: { backgroundColor: '#fff6ee', borderColor: colors.bodaOrange },
  pickName: { fontWeight: '700', fontSize: 13, color: colors.ink },
  pickSub: { fontSize: 11, color: colors.inkSoft },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, color: colors.ink, backgroundColor: '#fff' },
};

export default withChamaOnlineGate(SwapRequestScreen, 'savings');