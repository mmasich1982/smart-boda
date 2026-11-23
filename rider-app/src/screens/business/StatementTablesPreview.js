// rider-app/src/screens/business/StatementTablesPreview.js
// The statement tables on screen: Summary = one row per month; Detailed = for each month one row per DAY and the month total. Every figure is a daily aggregate.
import React from 'react';
import { Text, View } from 'react-native';
import { Card, Hint, s, C } from './BizUI';
import { kes } from '../../utils/businessFormat';

const COLS = [['Sales', 'sales'], ['Purchases', 'purchases'], ['Expenses', 'expenses'], ['Net Income', 'net']];
function Head({ first }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Text style={[s.hint, { width: 64, fontWeight: '800' }]}>{first}</Text>
      {COLS.map(([t]) => <Text key={t} style={[s.hint, { flex: 1, textAlign: 'right', fontWeight: '800' }]}>{t}</Text>)}
    </View>
  );
}
function Line({ label, r, bold, id }) {
  return (
    <View testID={id} style={{ flexDirection: 'row', paddingVertical: 3, backgroundColor: bold ? '#f6f4ef' : undefined }}>
      <Text style={{ width: 64, color: C.ink, fontWeight: bold ? '800' : '500' }} numberOfLines={1}>{label}</Text>
      {COLS.map(([, k]) => <Text key={k} style={{ flex: 1, textAlign: 'right', fontSize: 12.5, fontWeight: bold ? '800' : '500', color: k === 'net' && r[k] < 0 ? C.red : C.ink }}>{Number(r[k]).toLocaleString('en-KE')}</Text>)}
    </View>
  );
}

export default function StatementTablesPreview({ statement }) {
  const tb = statement.tables;
  if (!tb || !tb.months) return null;
  const detailed = statement.type === 'detailed';
  return (
    <View testID="statement-tables">
      {detailed ? tb.months.map((m) => (
        <Card key={m.key}>
          <Text style={s.label}>{m.label}{m.partial ? ` (${m.from} to ${m.to})` : ''}</Text>
          <Head first="Day" />
          {m.days.map((d) => <Line key={d.day} id={`row-${d.day}`} label={String(d.dom)} r={d} />)}
          <Line id={`total-${m.key}`} label="Total" r={m.totals} bold />
        </Card>
      )) : (
        <Card>
          <Text style={s.label}>Summary by Month</Text>
          <Head first="Month" />
          {tb.months.map((m) => <Line key={m.key} id={`row-${m.key}`} label={m.label.split(' ')[0].slice(0, 3) + ' ' + m.label.split(' ')[1]} r={m.totals} />)}
          <Line id="total-all" label="Total" r={tb.grand} bold />
        </Card>
      )}
      {detailed && tb.multiMonth ? <Card><Text style={s.label}>Grand Total</Text><Head first="Period" /><Line id="grand" label="All" r={tb.grand} bold /></Card> : null}
      <Hint>Each figure is the total for that day or month (KSh), not an individual transaction.</Hint>
    </View>
  );
}
