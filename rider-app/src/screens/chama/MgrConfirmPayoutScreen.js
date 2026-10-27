// rider-app/src/screens/chama/MgrConfirmPayoutScreen.js
// "Confirm Money Given" (Smart_Boda_Prototype_v44): the Treasurer ticks "I have handed KSh X to <recipient>" and confirms.
// When the Treasurer is the recipient they are paying themselves: the history then marks the payout "self-paid".
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { mgrCircle, mgrPayout, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Btn, Card, Notice, ScreenTitle, DISPLAY_FONT } from './mgrUi';
import { GroupLine, CircleTabs, CheckRow, MoreInfo } from './manageUi';
import useManageChama from './useManageChama';
import colors from '../../theme/colors';

function MgrConfirmPayoutScreen({ navigation }) {
  const m = useManageChama();
  const { showToast } = useToast();
  const gid = m.gid, cid = m.circle?.id;
  const [d, setD] = useState(null), [sure, setSure] = useState(false), [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!gid || !cid) return undefined;
    setSure(false);
    mgrCircle(cid, gid).then(setD).catch(() => {});
    return undefined;
  }, [gid, cid]));

  const R = d && d.id === cid ? d.round : null;
  const total = d && d.id === cid ? (d.turns || []).length : 0;

  async function confirm() {
    setBusy(true);
    try {
      const r = await mgrPayout(cid, gid);
      showToast(`💸 ${fmt(r.paid)} paid to ${r.to}${r.self_paid ? ' (self-paid)' : ''}${r.new_cycle ? ' · new cycle starts' : ''}`, 'success');
      navigation.navigate('MgrPayout', { groupId: gid });
    } catch (e) { showToast(apiError(e, 'Could not pay out. Check your connection.'), 'warn'); setBusy(false); }
  }

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Give Money to Member" />
      <ScreenTitle>💸 Confirm Money Given</ScreenTitle>
      <GroupLine type="mgr" name={m.group?.group_name} />
      <CircleTabs m={m} />
      {d && !R && <Notice tone="amber" icon="⏳" title="No round is open yet" />}
      {R && (<>
        <LinearGradient colors={['#fff6ee', '#ffffff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={c.box}>
          <Text style={c.lbl}>PAY {R.recipient_is_treasurer ? 'YOURSELF' : R.recipient.toUpperCase()}</Text>
          <Text style={c.amt}>{fmt(R.pot)}</Text>
          <Text style={c.turn}>Turn {R.turn_no} of {total}</Text>
        </LinearGradient>
        {(R.noted || []).length > 0 && (
          <Notice tone="amber" icon="📝" title={`${fmt((R.noted || []).reduce((t, x) => t + Number(x.owed || 0), 0))} not collected`}
            sub={`${R.noted.map((x) => x.name).join(', ')} · noted by you. Members can see it.`} />)}
        <Card>
          <CheckRow checked={sure} onChange={setSure} testID="payout-sure">
            {R.recipient_is_treasurer ? `I am the recipient. I take ${fmt(R.pot)} for myself.` : `I have handed ${fmt(R.pot)} to ${R.recipient}.`}
          </CheckRow>
          {R.recipient_is_treasurer
            ? <MoreInfo>You are paying yourself, so this payout is marked "self-paid" in the history where members can see it.</MoreInfo>
            : <Text style={c.after}>After this, the pool starts again at KSh 0 for the next member.</Text>}
        </Card>
        <Btn glow label="✅ Confirm Money Given" disabled={busy || !sure || !R.can_pay} onPress={confirm} testID="payout-confirm" />
      </>)}
    </ScrollView>);
}

const c = {
  box: { borderRadius: 18, borderWidth: 1.5, borderColor: colors.bodaOrange, padding: 18, alignItems: 'center', marginBottom: 14, overflow: 'hidden' },
  lbl: { fontSize: 14, color: colors.inkSoft, letterSpacing: 0.5 },
  amt: { fontFamily: DISPLAY_FONT, fontSize: 40, fontWeight: '800', color: colors.bodaOrange, marginVertical: 4 },
  turn: { fontSize: 13.5, color: colors.inkSoft },
  after: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 19, marginTop: 8 },
};

export default withChamaOnlineGate(MgrConfirmPayoutScreen, 'chama');