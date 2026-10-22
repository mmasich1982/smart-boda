// rider-app/src/screens/chama/mgrUi.js
// Shared look-and-feel and logic for the rider's Merry-Go-Round screens, matching Smart_Boda_Prototype_v25:
//   My Savings (Merry-Go-Round)  ·  Pay contribution  ·  Members Payout Turns  ·  Group rules  ·  My Contribution history
//
// Everything here is presentation plus small pure helpers. The numbers come from the real server (/chama/mgr/me),
// the same data the old screens used; only the layout and wording changed.
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import colors from '../../theme/colors';
import { fmt } from './chamaStyles';

export const DISPLAY_FONT = 'SpaceGrotesk-Bold';

/* ----------------------------------------------------------------------------------------------------------------
   Dates (hand-parsed so the phone's time zone can never move a date)
---------------------------------------------------------------------------------------------------------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-11-25' -> 'Wed, 25 Nov 2026' (the prototype's svDate). */
export function longDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return String(iso);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** An ISO date-time -> 'Oct 21' (the prototype's history rows). */
export function monthDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${String(d.getDate()).padStart(2, '0')}`;
}

/* ----------------------------------------------------------------------------------------------------------------
   Turn list and "what state is this rider in" logic
---------------------------------------------------------------------------------------------------------------- */
/** One row per turn: { key, turn, mine, name, date, status: 'paid' | 'next' | 'upcoming' }. */
export function mgrTurns(c) {
  return (c?.schedule || []).map((x) => ({
    key: `${x.turn}-${x.hand_no}`, turn: x.turn, mine: !!x.mine, name: x.mine ? 'You' : x.name, date: x.date,
    paid_at: x.paid_at || null, self_paid: !!x.self_paid,
    status: x.status === 'paid' ? 'paid' : x.status === 'current' ? 'next' : 'upcoming',
  }));
}

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * Everything the screens need to know about the rider in ONE circle.
 *   kind: waiting | receive | nothing | paid | awaiting | due
 *   hero: { label, amount, split[] }       payoutRows: [[label, value], ...]
 *   left: what the rider can still pay this round (owed minus what already waits for the Treasurer)
 *   unit / payDefault: one contribution, and what the Pay screen pre-fills (the missed days when behind)
 * Circles whose members contribute more often than the pool is paid out (c.contrib_label) show today's / the next
 * contribution, how much of the round is paid, and a "behind" warning. Older circles look as before.
 */
export function mgrState(c) {
  const R = c?.round || null;
  const turns = mgrTurns(c);
  const mine = turns.filter((t) => t.mine);
  const me = mine.find((t) => t.status !== 'paid') || mine[mine.length - 1] || null;
  const owed = R ? Number(R.owed) : 0, pending = R ? Number(R.pending) : 0, owesTotal = R ? Number(R.owes_total) : 0;
  const left = R ? Math.max(0, owed - pending) : 0;
  const started = !!R && c.status !== 'draft';
  const multi = !!c.contrib_label && !!R;                       // contributions are more frequent than payouts
  const unit = R ? Number(R.unit_amount) || Number(c.amount) : Number(c.amount);
  const behind = multi && !!R.behind;

  let kind = 'due';
  if (!started) kind = 'waiting';
  else if (R.i_receive) kind = 'receive';
  else if (owesTotal <= 0) kind = 'nothing';
  else if (owed <= 0) kind = 'paid';
  else if (pending > 0 && left <= 0) kind = 'awaiting';          // everything owed has been sent and waits for the Treasurer

  const next = [`Next contribution: ${fmt(c.amount)}`, c.contrib_label || c.sched_label].filter(Boolean);
  const paidSoFar = R ? Number(R.paid) + pending : 0;
  const dueHero = multi
    ? { label: behind ? 'Contribution due' : R.contribute_today ? "Today's contribution" : 'Next contribution',
        amount: fmt(Math.min(left, behind ? Number(R.behind_amount) : unit)),
        split: [`This round: ${fmt(paidSoFar)} of ${fmt(owesTotal)}`, `Payout ${longDate(R.deadline)}`, behind ? `⚠️ ${days(R.days_behind)} behind` : null].filter(Boolean) }
    : { label: 'Contribution due', amount: fmt(owed), split: R ? [`Due ${longDate(R.deadline)}`, c.sched_label].filter(Boolean) : [] };
  const hero = {
    waiting: { label: 'Merry-Go-Round', amount: 'Not started', split: [c.joins_next_cycle ? 'You join from the next cycle.' : 'Waiting for your Treasurer to start this circle.'] },
    receive: { label: 'This round', amount: 'Your turn 🎉', split: ['Everyone else pays you this round.'] },
    nothing: { label: 'This round', amount: 'Nothing to pay', split: next },
    paid: { label: 'This round', amount: 'Paid ✓', split: next },
    awaiting: { label: 'Contribution sent', amount: fmt(pending), split: ['Waiting for Treasurer to confirm'] },
    due: dueHero,
  }[kind];

  const payoutRows = [];
  if (R) {
    payoutRows.push(['Members Contributions so far', `${fmt(R.pot)} of ${fmt(R.expected)}`]);
    payoutRows.push(['Members who have paid', `${R.paid_count} of ${R.member_count}`]);
    if (multi && Number(R.contrib_count) > 1 && owesTotal > 0) payoutRows.push(['You pay this round', `${fmt(owesTotal)} (${R.contrib_count} × ${fmt(unit)})`]);
    if (Number(R.treasurer_self_confirmed) > 0) payoutRows.push(["Treasurer's own payments (self-confirmed)", fmt(R.treasurer_self_confirmed)]);
  }
  if (me) {
    payoutRows.push(['You will receive money on', me.status === 'paid' ? 'Received ✓' : longDate(me.date)]);
    if (me.status !== 'paid') payoutRows.push(['You will receive', fmt(c.payout_estimate)]);
  }
  const payDefault = multi ? Math.min(left, behind ? Number(R.behind_amount) : unit) : (left > 0 ? left : Number(c.amount));
  return { R, kind, hero, payoutRows, me, turns, left, started, multi, behind, unit, payDefault,
           canPay: started && !R.i_receive && owesTotal > 0 };
}

/** The params every "Pay contribution" button passes to the ChamaPay screen. */
export function payParams(group, c, st) {
  return {
    kind: 'contribution', model: 'mgr', amount: st.payDefault, maxAmount: st.left, minAmount: st.multi ? st.unit : 0,
    treasurer: group.treasurer, groupId: group.group_id, circleId: c.id, circleName: c.name,
  };
}

/* ----------------------------------------------------------------------------------------------------------------
   Building blocks
---------------------------------------------------------------------------------------------------------------- */
/** The dark "big number" card at the top of the screen. */
export function Hero({ label, amount, split }) {
  return (
    <LinearGradient colors={['#1a1c20', '#2b2f38']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={u.hero}>
      <Text style={u.heroLbl}>{label}</Text>
      <Text style={u.heroAmt}>{amount}</Text>
      {!!(split && split.length) && (
        <View style={u.heroSplit}>{split.map((x) => <Text key={x} style={u.heroSplitTxt}>{x}</Text>)}</View>)}
    </LinearGradient>);
}

/** Orange primary button, or an outlined (ghost) one. small = the compact inline button. */
export function Btn({ label, onPress, ghost, small, disabled, style, testID }) {
  return (
    <TouchableOpacity testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[u.btn, ghost ? u.btnGhost : u.btnPrimary, small && u.btnSmall, disabled && u.btnDisabled, style]}>
      <Text style={[u.btnTxt, ghost ? u.btnGhostTxt : u.btnPrimaryTxt, small && u.btnSmallTxt, disabled && u.btnDisabledTxt]}>{label}</Text>
    </TouchableOpacity>);
}

/** Centred orange text link, e.g. "Group rules →". */
export function TextLink({ label, onPress }) {
  return (
    <TouchableOpacity accessibilityRole="link" onPress={onPress} style={u.link}>
      <Text style={u.linkTxt}>{label} →</Text>
    </TouchableOpacity>);
}

/** White rounded card. */
export function Card({ children, style }) { return <View style={[u.card, style]}>{children}</View>; }

/** Label on the left, value on the right, a hairline between rows. rows = [[label, value], ...] */
export function DetailRows({ rows }) {
  return (<>{rows.map(([l, v], i) => (
    <View key={`${l}-${i}`} style={[u.detailRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
      <Text style={u.detailLabel}>{l}</Text>
      {typeof v === 'string' || typeof v === 'number' ? <Text style={u.detailValue}>{v}</Text> : <View style={u.detailValueBox}>{v}</View>}
    </View>))}</>);
}

/** Coloured notice box. tone: amber | green | red */
export function Notice({ tone = 'amber', icon, title, sub, onPress }) {
  const t = TONES[tone];
  const body = (
    <View style={[u.notice, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={u.noticeTitle}>{title}</Text>
        {!!sub && <Text style={u.noticeSub}>{sub}</Text>}
      </View>
    </View>);
  return onPress ? <TouchableOpacity activeOpacity={0.8} onPress={onPress}>{body}</TouchableOpacity> : body;
}
const TONES = {
  amber: { bg: colors.signalAmberBg, bd: colors.signalAmber },
  green: { bg: colors.signalGreenBg, bd: colors.signalGreen },
  red: { bg: '#fdecec', bd: colors.signalRed },
};

/** Small coloured pill. tone: green | amber | red | grey */
export function Badge({ tone = 'grey', children }) {
  const t = BADGE[tone];
  return <View style={[u.badge, { backgroundColor: t.bg }]}><Text style={[u.badgeTxt, { color: t.fg }]}>{children}</Text></View>;
}
const BADGE = {
  green: { bg: colors.signalGreenBg, fg: colors.signalGreen },
  amber: { bg: colors.signalAmberBg, fg: colors.signalAmber },
  red: { bg: colors.signalRedBg, fg: colors.signalRed },
  grey: { bg: '#eeeeee', fg: '#666666' },
};

/** Row of rounded filter chips, scrolls sideways. chips = [{ key, label }] */
export function FilterChips({ chips, value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={u.chipScroll} contentContainerStyle={{ gap: 6 }}>
      {chips.map((c) => {
        const on = c.key === value;
        return (
          <TouchableOpacity key={c.key} testID={`chip-${c.key}`} onPress={() => onChange(c.key)} style={[u.chip, on && u.chipOn]}>
            <Text style={[u.chipTxt, on && { color: '#fff' }]}>{c.label}</Text>
          </TouchableOpacity>);
      })}
    </ScrollView>);
}

/** "Showing 1–10 of 18" and the page buttons. Renders nothing when there is only one page. */
export function Pager({ page, totalPages, total, pageSize, onPage }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1, to = Math.min(page * pageSize, total);
  const pages = [];
  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
  else {
    pages.push(1);
    if (page > 3) pages.push('…a');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…b');
    pages.push(totalPages);
  }
  const btn = (key, label, target, disabled, active, nav) => (
    <TouchableOpacity key={key} disabled={disabled} onPress={() => onPage(target)} style={[u.pgBtn, disabled && { opacity: 0.35 }]}>
      {active
        ? <LinearGradient colors={[colors.bodaOrange, '#ff9a4d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[u.pgBtnIn, u.pgActive]}><Text style={[u.pgTxt, { color: '#fff' }]}>{label}</Text></LinearGradient>
        : <View style={u.pgBtnIn}><Text style={[u.pgTxt, nav && { color: colors.bodaOrange, fontSize: 15 }]}>{label}</Text></View>}
    </TouchableOpacity>);
  return (
    <View style={{ marginTop: 2 }}>
      <Text style={u.pgMeta}>Showing {from}–{to} of {total}</Text>
      <View style={u.pager}>
        {btn('prev', '‹', page - 1, page <= 1, false, true)}
        {pages.map((p) => (typeof p === 'number' ? btn(`p${p}`, String(p), p, false, p === page, false) : <Text key={p} style={u.pgDots}>…</Text>))}
        {btn('next', '›', page + 1, page >= totalPages, false, true)}
      </View>
    </View>);
}

/** Screen heading, 22px display font. */
export function ScreenTitle({ children }) { return <Text style={u.title}>{children}</Text>; }

/** Label above an input: "Amount contributed (KSh) *" */
export function FormLabel({ children, required }) {
  return <Text style={u.formLabel}>{children}{required ? <Text style={{ color: colors.signalRed }}> *</Text> : null}</Text>;
}

export const u = StyleSheet.create({
  title: { fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 2, marginBottom: 14, letterSpacing: -0.22 },
  hero: { borderRadius: 18, padding: 18, marginBottom: 14, overflow: 'hidden' },
  heroLbl: { fontSize: 11, fontWeight: '700', color: '#a9adb6', textTransform: 'uppercase', letterSpacing: 0.66 },
  heroAmt: { fontFamily: DISPLAY_FONT, fontSize: 30, fontWeight: '700', color: '#fff', marginTop: 4, marginBottom: 10 },
  heroSplit: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2 },
  heroSplitTxt: { fontSize: 11.5, color: '#c7cad1' },
  btn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  btnPrimary: { backgroundColor: colors.bodaOrange, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 9, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.bodaOrange },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, minHeight: 0, alignSelf: 'flex-start', marginBottom: 0 },
  btnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0, elevation: 0 },
  btnTxt: { fontSize: 15 },
  btnPrimaryTxt: { color: '#fff', fontWeight: '700' },
  btnGhostTxt: { color: colors.bodaOrange, fontWeight: '600' },
  btnSmallTxt: { fontSize: 12.5 },
  btnDisabledTxt: { color: '#b3a48f' },
  link: { alignItems: 'center', marginTop: 6, marginBottom: 14 },
  linkTxt: { color: colors.bodaOrangeDark, fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, marginBottom: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  detailLabel: { fontSize: 13.5, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  detailValue: { fontSize: 14, color: colors.inkSoft, textAlign: 'right', flexShrink: 1, marginLeft: 12 },
  detailValueBox: { marginLeft: 12, alignItems: 'flex-end', flexShrink: 1 },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 14 },
  noticeTitle: { fontSize: 12.5, fontWeight: '700', color: colors.ink, lineHeight: 19 },
  noticeSub: { fontSize: 11, color: colors.inkSoft, marginTop: 2, lineHeight: 16 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  chipScroll: { flexGrow: 0, marginBottom: 12 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.bodaOrange, borderColor: colors.bodaOrange },
  chipTxt: { fontSize: 11, fontWeight: '700', color: colors.ink },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 5, backgroundColor: '#f4f4f5', borderRadius: 14, padding: 6, marginTop: 4, marginBottom: 6 },
  pgMeta: { fontSize: 11, color: colors.inkSoft, textAlign: 'center', marginBottom: 8, fontWeight: '600', letterSpacing: 0.22 },
  pgBtn: { minWidth: 32, height: 32 },
  pgBtnIn: { minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pgActive: { shadowColor: colors.bodaOrange, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  pgTxt: { fontSize: 12.5, fontWeight: '700', color: colors.inkSoft },
  pgDots: { color: colors.inkSoft, paddingHorizontal: 4 },
  formLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 },
});