// rider-app/src/screens/chama/common.js
// Small pieces shared by the Chama screens: tab rows, the group picker used by My Savings / My Loans / Manage Chama,
// and date helpers. Nothing here talks to the server.
//
// A rider can belong to several groups (Merry-Go-Round and Table Banking, with different Treasurers), and a Treasurer
// can run several. Screens therefore show:   type tabs (Merry-Go-Round | Table Banking)  ->  one tab per group of that type.
import React from 'react';
import { ScrollView, TouchableOpacity, Text, View } from 'react-native';
import { s } from './chamaStyles';
import colors from '../../theme/colors';

export const TYPE_LABEL = { mgr: '🔄 Merry-Go-Round', tb: '📒 Table Banking' };

/** Horizontal scrolling tab row. tabs = [{key, label, badge?}] */
export function Tabs({ tabs, value, onChange, small, testID }) {
  if (!tabs || tabs.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, flexGrow: 0 }} testID={testID}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <TouchableOpacity key={t.key} testID={`tab-${t.key}`} onPress={() => onChange(t.key)}
            style={[s.chip, on && s.chipOn, { marginRight: 8, paddingVertical: small ? 5 : 8 }]}>
            <Text style={{ fontWeight: '700', fontSize: small ? 12 : 14 }}>{t.label}</Text>
            {!!t.badge && <View style={{ position: 'absolute', top: -6, right: -4, backgroundColor: colors.signalAmber, borderRadius: 99, paddingHorizontal: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{t.badge}</Text></View>}
          </TouchableOpacity>);
      })}
    </ScrollView>);
}

/** Groups -> [{type, groups:[...]}] in a stable order (Merry-Go-Round first), skipping empty types. */
export function byType(groups) {
  return ['mgr', 'tb'].map((type) => ({ type, groups: (groups || []).filter((g) => g.group_type === type) })).filter((x) => x.groups.length);
}

/**
 * Type tabs, then group tabs. Returns what to render plus the controls.
 * Usage:  const pick = useGroupPicker(groups, initialGroupId);  <GroupPicker pick={pick} />  pick.group is the selected one.
 * A tab row is hidden when it would only hold one choice.
 */
export function useGroupPicker(groups, initialGroupId) {
  const types = byType(groups);
  const initial = (groups || []).find((g) => g.group_id === initialGroupId);
  const [type, setType] = React.useState(initial ? initial.group_type : null);
  const [gid, setGid] = React.useState(initialGroupId || null);
  const activeType = types.some((t) => t.type === type) ? type : types[0]?.type || null;
  const list = types.find((t) => t.type === activeType)?.groups || [];
  const group = list.find((g) => g.group_id === gid) || list[0] || null;
  return { types, list, type: activeType, group, setType: (t) => { setType(t); setGid(null); }, setGroup: setGid };
}

export function GroupPicker({ pick, badges = {} }) {
  const { types, list, type, group } = pick;
  return (<>
    {types.length > 1 && <Tabs tabs={types.map((t) => ({ key: t.type, label: TYPE_LABEL[t.type] }))} value={type} onChange={pick.setType} />}
    {list.length > 1 && <Tabs small tabs={list.map((g) => ({ key: g.group_id, label: g.group_name, badge: badges[g.group_id] }))}
      value={group?.group_id} onChange={pick.setGroup} />}
  </>);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** '2026-03-14' -> 'Sat 14 Mar'. Parsed by hand so the phone's time zone cannot move the date. */
export function niceDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return String(iso);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
export function niceDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const first = (name) => String(name || '').split(' ')[0];
export const ordinalTurn = (n) => `Turn ${n}`;

/** Plain-words status for a turn swap, from the point of view of the viewer. Used by rider and Treasurer screens. */
export function swapStatus(x) {
  const a = first(x.a), b = first(x.b);
  switch (x.stage) {
    case 'member': return { icon: '⏳', tone: 'amber', head: `Waiting for ${b} to agree`, hint: `Then ${'the Treasurer'} approves.` };
    case 'treasurer': return { icon: '⏳', tone: 'amber', head: 'Waiting for Treasurer approval', hint: `${b} has agreed. Turns stay the same until approved.` };
    case 'done': return { icon: '✅', tone: 'green', head: 'Swap approved', hint: x.effect?.text || '' };
    case 'declined': return { icon: '❌', tone: 'red', head: 'Not approved by the Treasurer', hint: x.note || '' };
    case 'cancelled': return { icon: '🚫', tone: 'grey', head: 'Cancelled', hint: x.note || `${a} cancelled this request.` };
    case 'expired': return { icon: '⌛', tone: 'grey', head: 'Expired', hint: x.note || 'Nobody answered in time, so the request closed by itself.' };
    default: return { icon: '•', tone: 'grey', head: x.stage, hint: '' };
  }
}
export const TONE_BG = { amber: colors.signalAmberBg, green: colors.signalGreenBg, red: colors.signalRedBg, grey: '#f3f3f3' };
