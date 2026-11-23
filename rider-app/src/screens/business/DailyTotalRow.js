// rider-app/src/screens/business/DailyTotalRow.js
// An earlier day on a History or Transactions list. After the end-of-day close only ONE summary of each past day exists, so a past day is one row of totals, never
// a list of individual records (those are shown for today only). Shows the figures the filter asks for.
import React from 'react';
import { Text, View } from 'react-native';
import { C, s } from './BizUI';
import { kes } from '../../utils/businessFormat';
import { monthLabelOf } from '../../offline/businessDaily';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayTitle = (day) => { const d = new Date(`${day}T00:00:00Z`); return `${WEEKDAY[d.getUTCDay()]} ${Number(day.slice(8, 10))} ${monthLabelOf(day.slice(0, 7)).split(' ')[0].slice(0, 3)} ${day.slice(0, 4)}`; };

/** row: { day, count?, total?, label? }  (History)   or   { day, sales, purchases, expenses, net, sales_made } (Transactions: all figures) */
export default function DailyTotalRow({ row }) {
  return (
    <View testID={`day-${row.day}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Text style={{ fontWeight: '800', color: C.ink }}>{dayTitle(row.day)}</Text>
      {row.total !== undefined ? (
        <Text style={s.hint}>{row.label}: {row.count} · <Text style={{ fontWeight: '800', color: C.ink }}>{kes(row.total)}</Text></Text>
      ) : (
        <Text style={s.hint}>Sales {kes(row.sales)} · Purchases {kes(row.purchases)} · Expenses {kes(row.expenses)} · <Text style={{ fontWeight: '800', color: row.net < 0 ? C.red : C.green }}>Net {kes(row.net)}</Text></Text>
      )}
    </View>
  );
}
