// rider-app/src/screens/chama/ManageChamaHubScreen.js
// Manage Chama for a Treasurer who may run several groups:
//   type tabs (Merry-Go-Round | Table Banking)  ->  one tab per group of that type  ->  what to do in that group.
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { managedGroups, chamaOverview, mgrCircles, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { GroupPicker, useGroupPicker, niceDate } from './common';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

function ManageChamaHubScreen({ navigation }) {
  const gt = useGroupText();
  const [groups, setGroups] = useState(null);
  const [o, setO] = useState(null);            // overview of the selected group
  const [circles, setCircles] = useState(null);
  const [err, setErr] = useState(null);
  const pick = useGroupPicker(groups || []);
  const g = pick.group;
  const gid = g?.group_id;

  useFocusEffect(useCallback(() => {
    managedGroups()
      .then((rows) => { setGroups((rows || []).map((x) => ({ group_id: x.id || x.group_id, group_name: x.group_name, group_type: x.group_type, status: x.status }))); setErr(null); })
      .catch((e) => { setGroups([]); setErr(apiError(e, 'Could not load your groups. Check your connection.')); });
  }, []));

  useFocusEffect(useCallback(() => {
    if (!gid) return;
    setO(null); setCircles(null);
    chamaOverview(gid).then(setO).catch(() => {});
    if (g.group_type === 'mgr') mgrCircles(gid).then((r) => setCircles(r.circles)).catch(() => setCircles([]));
  }, [gid, g?.group_type]));

  const Tile = ({ e, label, to, params, badge }) => (
    <TouchableOpacity style={s.tile3} onPress={() => navigation.navigate(to, params)} testID={`tile-${to}`}>
      <Text style={{ fontSize: 26 }}>{e}</Text><Text style={{ fontWeight: '700', textAlign: 'center' }}>{label}</Text>
      {!!badge && <View style={{ backgroundColor: colors.signalAmber, borderRadius: 99, paddingHorizontal: 8, marginTop: 4 }}><Text style={{ color: '#fff', fontWeight: '800' }}>{badge}</Text></View>}
    </TouchableOpacity>);

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={s.title}>⚙️ {gt('group.title_manage_chama', 'Manage Chama')}</Text>
      {err && <View style={s.card}><Text>{err}</Text></View>}
      {groups && groups.length === 0 && !err && <View style={s.card}><Text style={s.hint}>You are not the Treasurer of a group yet. Enter your Chama Code from the Home screen.</Text></View>}
      <GroupPicker pick={pick} />
      {g && (<>
        <Text style={s.sub}>{g.group_name}{g.status && g.status !== 'active' ? ' · inactive' : ''}</Text>

        {g.group_type === 'mgr' && (<>
          <Text style={s.cardTitle}>Circles</Text>
          {circles && circles.length === 0 && <Text style={s.hint}>No circle yet. A circle has its own amount, payout days and people. Make one to begin.</Text>}
          {(circles || []).map((c) => (
            <TouchableOpacity key={c.id} style={[s.card, c.round && { borderColor: colors.bodaOrange }]} testID={`circle-${c.id}`}
              onPress={() => navigation.navigate('MgrHub', { groupId: gid, circleId: c.id })}>
              <View style={s.row}><Text style={{ fontWeight: '800', flex: 1 }}>{c.name} ›</Text>
                <Text style={s.hint}>{c.status === 'draft' ? 'Not started' : c.needs_season_setup ? 'New season' : `Cycle ${c.cycle_no}`}</Text></View>
              <Text style={s.hint}>{fmt(c.amount)} · {c.sched_label || 'Payout days not set'} · {c.people} people{c.hands > c.people ? ` (${c.hands} turns)` : ''}</Text>
              {c.round && <Text style={s.hint}>Turn {c.round.turn_no}: {c.round.recipient} · {c.round.paid_count} of {c.round.member_count} paid · pool {fmt(c.round.pot)} · due {niceDate(c.round.deadline)}</Text>}
              {c.needs_season_setup && <Text style={[s.hint, { color: colors.signalAmber }]}>⚠️ Give new people their turns, then start the new season.</Text>}
            </TouchableOpacity>))}
          <PrimaryButton label="➕ New circle" disabled={g.status !== 'active'} onPress={() => navigation.navigate('MgrHub', { groupId: gid, circleId: 'new' })} />
          <View style={{ height: 14 }} />
        </>)}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Tile e="📥" label="Contributions" to="ChamaQueue" params={{ kind: 'contributions', groupId: gid }} badge={o?.pending_contributions} />
          {g.group_type === 'mgr' && <Tile e="🔁" label="Swap requests" to="MgrSwaps" params={{ groupId: gid }} badge={o?.pending_swaps} />}
          {g.group_type === 'mgr' && <Tile e="🕘" label="Activity" to="MgrActivity" params={{ groupId: gid }} />}
          {g.group_type === 'tb' && <Tile e="💳" label="Loans" to="ChamaLoans" params={{ groupId: gid }} badge={(o?.pending_loan_requests || 0) + (o?.pending_repayments || 0)} />}
          {g.group_type === 'tb' && <Tile e="🛡️" label="Loan security rules" to="TbSecurityRules" params={{ groupId: gid }} />}
          {g.group_type === 'tb' && <Tile e="🗄️" label="Security held" to="SecurityHeld" params={{ groupId: gid }} badge={o?.security_to_check} />}
          <Tile e="🛠️" label="Set up & members" to="ChamaSetup" params={{ groupId: gid }} />
          <Tile e="🧾" label="History" to="GroupFinanceHistory" params={{ groupId: gid }} />
        </View>
      </>)}
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(ManageChamaHubScreen, 'chama');
