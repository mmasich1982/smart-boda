// rider-app/src/screens/business/BizCalculator.js
// SMART BIZNA calculator (prototype v46): looks and behaves like a pocket calculator. All arithmetic is in offline/businessCalculator.js (tested);
// this component only draws the display and the keypad and reports the current total to its parent.
import React, { useEffect, useReducer, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { newCalc, press, calcTotal, mainText, exprText, KEY_LAYOUT } from '../../offline/businessCalculator';
import { C } from './BizUI';

const LABEL = { back: '⌫', AC: 'AC' };

export default function BizCalculator({ onTotal, onExpression, initialKeys, onKeys }) {
  // MULTIPLE BUSINESSES: the keys pressed so far are reported (onKeys) so a half-entered sale can be kept with its business and replayed (initialKeys).
  const keys = useRef(Array.isArray(initialKeys) ? initialKeys.slice() : []);
  const [calc, dispatch] = useReducer((state, key) => (key === '__reset' ? newCalc() : press(state, key)), undefined, () => keys.current.reduce((st, k) => press(st, k), newCalc()));
  const send = (key) => { keys.current = key === 'AC' || key === '__reset' ? [] : keys.current.concat([key]); dispatch(key); onKeys && onKeys(keys.current.slice()); };
  const total = calcTotal(calc);
  useEffect(() => { onTotal && onTotal(total); onExpression && onExpression(exprText(calc)); }, [total, calc.eq]);   // eslint-disable-line
  return (
    <View style={z.wrap} accessibilityLabel="Calculator">
      <View style={z.display} accessibilityLiveRegion="polite">
        <Text style={z.expr} numberOfLines={1}>{exprText(calc) || ' '}</Text>
        <Text style={[z.main, calc.err && { fontSize: 20, color: '#ffb4ae' }]} numberOfLines={1} adjustsFontSizeToFit>{mainText(calc)}</Text>
      </View>
      <View style={z.pad}>
        {KEY_LAYOUT.map(([key, span, kind]) => (
          <TouchableOpacity key={key} onPress={() => send(key)} accessibilityRole="button" accessibilityLabel={key === 'back' ? 'Backspace' : key === 'AC' ? 'All clear' : key}
            style={[z.key, { flexBasis: span === 2 ? '48%' : '23%' }, kind === 'op' && z.op, kind === 'eq' && z.eq, kind === 'clear' && z.clear]}>
            <Text style={[z.keyText, (kind === 'op' || kind === 'eq') && { color: C.white }, kind === 'clear' && { color: C.red }]}>{LABEL[key] || key}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
export const resetCalculator = null;

const z = StyleSheet.create({
  wrap: { backgroundColor: C.asphalt, borderRadius: 18, padding: 12, marginBottom: 12 },
  display: { backgroundColor: C.asphalt2, borderRadius: 12, padding: 12, marginBottom: 10, minHeight: 84, justifyContent: 'flex-end', alignItems: 'flex-end' },
  expr: { color: '#9aa0ab', fontSize: 14 }, main: { color: C.white, fontSize: 36, fontWeight: '800' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  key: { backgroundColor: '#2a2e36', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 8 }, keyText: { color: C.white, fontSize: 20, fontWeight: '700' },
  op: { backgroundColor: '#3b4150' }, eq: { backgroundColor: C.orange }, clear: { backgroundColor: '#33262a' },
});
