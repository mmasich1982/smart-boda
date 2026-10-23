// rider-app/src/screens/chama/ManageChamaHubScreen.js
// Manage Chama for a Treasurer who may run several groups, laid out like Smart_Boda_Prototype_v30:
//   group type tabs  ->  group tabs (more than one group of that type)  ->  circle tabs (more than one circle)
//   ->  "To do" hero  ->  Confirm contributions · Pay out the pool · Members & rules.
// Merry-Go-Round rows open the new Contributions, Pay out the pool and Set Up Your Chama screens.
// Table Banking keeps its own rows (Contributions, Loans, Loan security, Security held, Members & rules).
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { chamaOverview, queueList } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Hero, Card, Notice, ScreenTitle } from './mgrUi';
import { ManageTabs, MenuRow } from './manageUi';
import useManageChama from './useManageChama';

function ManageChamaHubScreen({ navigation }) {
  const m = useManageChama();
  const [o, setO] = useState(null);              // overview of the selected group (pending counts)
  const [queue, setQueue] = useState([]);        // contributions waiting for the Treasurer (Merry-Go-Round only)
  const gid = m.gid;

  useFocusEffect(useCallback(() => {
    if (!gid) return undefined;
    setO(null); setQueue([]);
    chamaOverview(gid).then(setO).catch(() => {});
    if (m.isMgr) queueList('contributions', gid).then((r) => setQueue((r && r.items) || [])).catch(() => {});
    return undefined;
  }, [gid, m.isMgr]));

  const tb = m.type === 'tb';
  const mine = (m.isMgr ? queue.filter((i) => i.model === 'mgr' && (!m.circle || i.circle_id === m.circle.id)) : []);
  const n = tb ? Number(o?.pending_contributions || 0) : mine.length;                 // contributions waiting
  const loans = tb ? Number(o?.pending_loan_requests || 0) + Number(o?.pending_repayments || 0) : 0;
  const pool = tb ? 0 : Number(m.circle?.round?.pot || 0);
  const held = tb ? Number(o?.security_to_check || 0) : 0;
  const todo = n + loans;
  const go = (to, params) => navigation.navigate(to, { groupId: gid, ...(params || {}) });

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <ScreenTitle>Manage Chama</ScreenTitle>
      {!!m.err && <Card><Text>{m.err}</Text></Card>}
      {m.groups && m.groups.length === 0 && !m.err && (
        <Card><Text style={s.hint}>You are not the Treasurer of a group yet. Enter your Chama Code from the Home screen.</Text></Card>)}

      {!!m.group && (<>
        <ManageTabs m={m} />
        {m.group.status && m.group.status !== 'active' && <Notice tone="amber" icon="⏸️" title="This group is inactive." />}
        {m.isMgr && m.circles && m.circles.length === 0 && (
          <Notice tone="amber" icon="🔄" title="No circle yet" sub="A circle has its own contribution, schedules and people. Open Members & rules to make one." />)}

        <Hero label="To do" amount={todo ? `${todo} waiting` : 'All done ✅'}
          split={[`${n} contribution${n === 1 ? '' : 's'}`, tb ? `${loans} loan item${loans === 1 ? '' : 's'}` : `Pool ${fmt(pool)}`]} />

        <MenuRow emoji="✅" title="Confirm contributions" badge={n || ''} testID="row-contributions"
          onPress={() => (tb ? go('ChamaQueue', { kind: 'contributions' }) : go('MgrContributions'))} />
        {!tb && <MenuRow emoji="💸" title="Pay out the pool" badge={pool > 0 ? fmt(pool) : ''} testID="row-payout" onPress={() => go('MgrPayout')} />}
        {tb && <MenuRow emoji="💳" title="Loans" badge={loans || ''} testID="row-loans" onPress={() => go('ChamaLoans')} />}
        {tb && <MenuRow emoji="🛡️" title="Loan security & guarantors" testID="row-security" onPress={() => go('TbSecurityRules')} />}
        {tb && <MenuRow emoji="🗄️" title="Security held" badge={held || ''} testID="row-held" onPress={() => go('SecurityHeld')} />}
        <MenuRow emoji="👥" title="Members & rules" testID="row-setup" onPress={() => (tb ? go('ChamaSetup') : go('MgrSetup'))} />
      </>)}
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(ManageChamaHubScreen, 'chama');