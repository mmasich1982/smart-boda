// rider-app/src/screens/chama/SwapRequestScreen.js
// Ask another rider to swap turns. route.params: { circle, groupId } where circle comes from /chama/mgr/me.
// The other rider can only AGREE; you can CANCEL. There is no "decline" and a refusal leaves no record.
import React, { useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, TextInput, ScrollView } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { mgrSwapRequest, apiError } from '../../api/groupsClient';
import { s, Chip } from './chamaStyles';
import { niceDate, first } from './common';
import { useGroupText } from './groupText';

function SwapRequestScreen({ navigation, route }) {
  const gt = useGroupText();
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
      await mgrSwapRequest(c.id, { my_turn: my, other_turn: other, reason: reason.trim() });
      showToast(`Sent to ${first(t.name)}. If they agree, your Treasurer approves.`, 'success');
      navigation.goBack();
    } catch (e) { showToast(apiError(e, 'Could not send. Check your connection.'), 'warn'); }
    finally { setBusy(false); }
  }
  if (!c) return <ScrollView style={s.page}><BackLink onPress={() => navigation.goBack()} /><Text style={{ padding: 16 }}>Open this from My Savings.</Text></ScrollView>;
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>🔁 {gt('group.title_swap_request', 'Request a turn swap')}</Text>
      <Text style={s.sub}>{c.name}. You can only swap a turn that has not come yet.</Text>
      <View style={s.card}>
        <Text style={s.label}>MY TURN TO GIVE AWAY *</Text>
        <View style={s.chipRow}>{mine.map((n) => <Chip key={n} on={my === n} label={`Turn ${n} · ${niceDate(dateOf(n))}`} onPress={() => setMy(n)} />)}</View>
        <Text style={s.label}>SWAP WITH *</Text>
        {targets.length === 0 && <Text style={s.hint}>Nobody can swap with you right now.</Text>}
        <View style={s.chipRow}>{targets.map((x) => <Chip key={x.turn} on={other === x.turn} label={`${first(x.name)} · Turn ${x.turn} · ${niceDate(x.date)}`} onPress={() => setOther(x.turn)} />)}</View>
        <Text style={s.label}>WHY? (OPTIONAL)</Text>
        <TextInput style={s.input} value={reason} onChangeText={setReason} maxLength={120} placeholder="e.g. I need the money earlier" />
      </View>
      {my && t && (
        <View style={[s.card, { backgroundColor: '#fff6ee' }]}>
          <Text style={s.cardTitle}>What will change</Text>
          <Text>You move from Turn {my} to Turn {other}, and {first(t.name)} moves from Turn {other} to Turn {my}.</Text>
          <Text style={s.hint}>{first(t.name)} must agree, then your Treasurer approves. Your turn stays the same until then. The request closes by itself after {c.swap.waiting_days} days without an answer, or when one of the turns becomes the current one.</Text>
        </View>)}
      <PrimaryButton label="Send request" disabled={busy || !my || !other} onPress={send} />
    </ScrollView>);
}

export default withChamaOnlineGate(SwapRequestScreen, 'savings');
