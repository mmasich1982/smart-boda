// rider-app/src/screens/chama/MgrScheduleScreen.js
// "Days when members pay" / "Day when a member receives Money" of one round (Smart_Boda_Prototype_v44):
//   how often -> which day -> calendar with the dates marked -> sample / upcoming dates -> Done.
// A round has TWO schedules: when a member receives money (the pool is paid out) and (optionally) the days when members pay. Every payout period must
// contain at least one contribution date; the server checks this on the real dates and says why when it does not fit.
// While a cycle is running the rules are locked: changes saved here start from the next cycle.
// route.params: { kind: 'payout' | 'contribution', circleId, groupId }
import React, { useCallback, useEffect, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { mgrCircle, mgrUpdateCircle, mgrPreview, apiError } from '../../api/groupsClient';
import { s } from './chamaStyles';
import { Btn, Card, Notice, ScreenTitle, shortDate } from './mgrUi';
import { GroupLine, CircleTabs } from './manageUi';
import ScheduleEditor, { DEFAULT_SCHED, PAY_TYPES, RECEIVE_TYPES } from './ScheduleEditor';
import MonthCalendar from './MonthCalendar';
import useManageChama from './useManageChama';
import colors from '../../theme/colors';

const dow = (isoDate) => new Date(`${isoDate}T00:00:00`).getDay();

function MgrScheduleScreen({ navigation, route }) {
  const m = useManageChama();
  const { showToast } = useToast();
  const kind = route.params?.kind === 'contribution' ? 'contribution' : 'payout';
  const contrib = kind === 'contribution';
  const circleId = route.params?.circleId || m.circle?.id, gid = route.params?.groupId || m.gid;
  const [d, setD] = useState(null);
  const [sched, setSched] = useState(null);          // the schedule being edited
  const [pv, setPv] = useState(null), [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!circleId || !gid) return undefined;
    mgrCircle(circleId, gid).then((r) => {
      setD(r);
      const e = r.effective || {};
      setSched(contrib ? (e.contrib_sched === undefined ? r.contrib_sched : e.contrib_sched) || { ...DEFAULT_SCHED } : e.sched || r.sched || { ...DEFAULT_SCHED });
    }).catch((e) => showToast(apiError(e, 'Could not load this circle.'), 'warn'));
    return undefined;
  }, [circleId, gid, contrib]));

  // Live check and dates from the server, a moment after the last change.
  useEffect(() => {
    if (!d || !sched) return undefined;
    const e = d.effective || {};
    const payout = contrib ? (e.sched || d.sched) : sched, other = contrib ? sched : (e.contrib_sched === undefined ? d.contrib_sched : e.contrib_sched);
    let live = true;
    const t = setTimeout(() => {
      mgrPreview({ amount: Number(e.amount ?? d.amount) || 0, sched: payout, contrib_sched: other || { type: 'same' }, recipient_pays: !!(e.recipient_pays ?? d.recipient_pays), hands: (d.turns || []).length }, gid)
        .then((r) => { if (live) setPv(r); }).catch(() => { if (live) setPv(null); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [JSON.stringify(sched), d && d.id, gid, contrib]);

  // Tapping a date on the calendar means different things for different schedule types.
  const pick = (isoDate) => {
    if (!sched) return;
    const wd = dow(isoDate);
    if (sched.type === 'weekly') setSched({ ...sched, day: wd });
    else if (sched.type === 'daily' || sched.type === 'twice') {
      const cur = sched.days || [];
      if (cur.includes(wd)) setSched({ ...sched, days: cur.filter((x) => x !== wd) });
      else setSched({ ...sched, days: (sched.type === 'twice' && cur.length >= 2 ? [...cur.slice(1), wd] : [...cur, wd]).sort() });
    } else if (sched.type === 'biweekly') setSched({ ...sched, start: isoDate });
    else if (sched.type === 'monthly') setSched({ ...sched, dom: Number(isoDate.slice(8, 10)), fix: {} });
    else setSched({ ...sched, dates: (sched.dates || []).includes(isoDate) ? sched.dates.filter((x) => x !== isoDate) : [...(sched.dates || []), isoDate].sort() });
  };

  async function done() {
    setBusy(true);
    try {
      await mgrUpdateCircle(circleId, contrib ? { contrib_sched: sched } : { sched }, gid);
      showToast(d?.locked ? `Saved. It starts from cycle ${d.cycle_no + 1}.` : 'Saved.', 'success');
      navigation.goBack();
    } catch (e) { showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'); setBusy(false); }
  }
  async function oncePerPayout() {
    setBusy(true);
    try { await mgrUpdateCircle(circleId, { contrib_sched: { type: 'same' } }, gid); showToast('Saved. Members pay once per payout.', 'success'); navigation.goBack(); }
    catch (e) { showToast(apiError(e, 'Could not save.'), 'warn'); setBusy(false); }
  }

  const dates = (contrib ? pv?.contrib_dates : pv?.payout_dates) || [];
  const upcoming = dates.slice(0, 6);
  const firstTurn = d?.round?.turn_no || 1;
  const label = sched ? (contrib ? pv?.contrib_label : pv?.payout_label) : null;
  const blocked = !!pv && !pv.ok;
  // Who receives on a turn ("Turn 4 · Esther Njeri"; the Treasurer is "You").
  const who = (turn) => {
    const x = (d?.turns || []).find((r) => r.turn === turn);
    if (!x) return '';
    return (m.members || []).find((y) => y.member_id === x.member_id)?.is_treasurer ? 'You' : x.name;
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Set Up Your Chama" />
      <ScreenTitle>{contrib ? '📅 Days when members pay' : '🗓️ Day when a member receives Money'}</ScreenTitle>
      <Text style={sc.sub}>{d?.name || 'Your round'}{label ? ` · ${label}` : ''}</Text>
      <CircleTabs m={m} />
      {!!d?.locked && <Notice tone="amber" icon="🔒" title="Locked for this cycle" sub={`What you save here starts from cycle ${d.cycle_no + 1}.`} />}

      {sched && (<>
        <Card>
          <ScheduleEditor kind={kind} sched={sched} onChange={setSched} flags={sched.type === 'monthly' ? (d?.monthly_flags || []) : []}
            types={contrib ? PAY_TYPES : RECEIVE_TYPES} dayTitle="Which day?"
            copy={contrib
              ? { daily: 'Members pay every day. Nothing to pick.', weekly: 'Pick the day, or tap a date on the calendar.', twice: 'Pick two days, for example Tuesday and Thursday.', biweekly: 'Tap the first payment date on the calendar. It then repeats every 2 weeks.' }
              : { daily: 'Untick any day with no payout.', weekly: 'Pick the day.', twice: 'Pick two days, for example Tuesday and Thursday.', biweekly: 'Tap the first date on the calendar. It then repeats every 2 weeks.' }}
            title={contrib ? 'How often do members pay?' : 'How often does a member receive money?'} />
          {contrib && <Btn small ghost label="Use one payment per payout" onPress={oncePerPayout} disabled={busy} style={{ marginTop: 10 }} />}
        </Card>

        {blocked && (
          <View style={sc.err}><Text style={{ fontSize: 15 }}>⚠️</Text>
            <View style={{ flex: 1 }}><Text style={sc.errTitle}>This does not fit</Text><Text style={sc.errTxt}>{pv.error}</Text></View></View>)}

        <Card>
          <MonthCalendar marked={dates} onPick={pick} legend={contrib ? 'Members pay on the orange dates.' : 'Payout days repeat on the orange dates.'} />
        </Card>

        <Card>
          <Text style={sc.upTitle}>{contrib ? 'Sample payment dates' : 'Upcoming payouts'}</Text>
          {upcoming.length === 0 && <Text style={s.hint}>Choose the days above to see the dates.</Text>}
          {upcoming.map((x, i) => (
            <View key={x} style={[sc.upRow, i === upcoming.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={sc.upDate}>{shortDate(x)}</Text>
              {!contrib && <Text style={sc.upRight}>{`Turn ${firstTurn + i}`}{who(firstTurn + i) ? ` · ${who(firstTurn + i)}` : ''}</Text>}
            </View>))}
        </Card>
        <Btn label="Done" onPress={done} disabled={busy || blocked} testID="schedule-done" />
      </>)}
    </ScrollView>);
}

const sc = {
  sub: { fontSize: 14.5, color: colors.inkSoft, marginTop: -8, marginBottom: 14 },
  err: { flexDirection: 'row', gap: 10, backgroundColor: '#fdecec', borderWidth: 1, borderColor: colors.signalRed, borderRadius: 14, padding: 14, marginBottom: 14 },
  errTitle: { fontWeight: '800', fontSize: 14, color: colors.ink },
  errTxt: { fontSize: 12.5, color: colors.inkSoft, marginTop: 2, lineHeight: 18 },
  upTitle: { fontWeight: '800', fontSize: 16, color: colors.ink, marginBottom: 6 },
  upRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  upDate: { fontWeight: '800', fontSize: 15, color: colors.ink },
  upRight: { fontSize: 14.5, color: colors.inkSoft },
};

export default withChamaOnlineGate(MgrScheduleScreen, 'chama');