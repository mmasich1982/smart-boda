// rider-app/src/screens/chama/MgrRosterScreen.js
// "Who has paid" for the open round of a Merry-Go-Round circle (Smart_Boda_Prototype_v44).
// A member who is behind on the contribution days so far gets a small warning line (circles with their own contribution days).
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { mgrCircle, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Card, Badge, Notice, ScreenTitle } from './mgrUi';
import { CircleTabs } from './manageUi';
import useManageChama from './useManageChama';
import colors from '../../theme/colors';

function MgrRosterScreen({ navigation }) {
  const m = useManageChama();
  const gid = m.gid, cid = m.circle?.id;
  const [d, setD] = useState(null), [err, setErr] = useState(null);
  useFocusEffect(useCallback(() => {
    if (!gid || !cid) return undefined;
    mgrCircle(cid, gid).then((r) => { setD(r); setErr(null); }).catch((e) => setErr(apiError(e, 'Could not load. Check your connection.')));
    return undefined;
  }, [gid, cid]));
  const R = d && d.id === cid ? d.round : null;

  const badge = (x) => {
    if (x.is_recipient && x.owed_total === 0) return <Badge tone="amber">🎁 Receiving</Badge>;
    if (x.complete) return <Badge tone="green">✓ Paid</Badge>;
    if (x.noted) return <Badge tone="amber">📝 Noted</Badge>;
    return <Badge tone="grey">Not yet</Badge>;
  };
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Give Money to Member" />
      <ScreenTitle>📋 Who has paid</ScreenTitle>
      <CircleTabs m={m} />
      {!!err && <Card><Text>{err}</Text></Card>}
      {d && d.id === cid && !R && <Notice tone="amber" icon="⏳" title="No round is open yet" />}
      {R && (
        <Card>
          {R.roster.map((x, i) => (
            <View key={x.member_id} style={[r.row, i === R.roster.length - 1 && { borderBottomWidth: 0 }, x.is_treasurer && r.mine]}>
              <View style={{ flex: 1 }}>
                <Text style={r.name}>{x.name}{x.is_treasurer ? ' (you)' : ''}{x.hands > 1 ? ' ✌️' : ''}</Text>
                {x.behind && <Text style={r.behind}>⚠️ Behind by {x.days_behind} {x.days_behind === 1 ? 'day' : 'days'} · {fmt(x.behind_amount)}{x.sent > 0 ? ` · ${fmt(x.sent)} sent, waiting for you` : ''}</Text>}
                {!x.behind && x.sent > 0 && !x.complete && <Text style={s.hint}>{fmt(x.sent)} sent, waiting for you to confirm.</Text>}
                {!x.complete && !x.is_recipient && x.owed > 0 && !x.noted && <Text style={s.hint}>Owes {fmt(x.owed)}</Text>}
              </View>
              {badge(x)}
            </View>))}
        </Card>)}
    </ScrollView>);
}

const r = {
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  mine: { backgroundColor: '#fff6ee', borderRadius: 10 },
  name: { fontWeight: '800', fontSize: 15.5, color: colors.ink },
  behind: { fontSize: 11.5, color: colors.signalAmber, fontWeight: '700', marginTop: 2 },
};

export default withChamaOnlineGate(MgrRosterScreen, 'chama');