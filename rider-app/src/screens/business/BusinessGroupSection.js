// rider-app/src/screens/business/BusinessGroupSection.js
// SMART CABZ: a business user who belongs to a group (or is a group's Treasurer) sees their group on the Smart Bizna Home: My Savings, My Loans,
// Manage Chama, Group Finance History and the "Enter your Chama Code" card. They are the same screens riders use. A business user in no group
// sees nothing here: this component draws nothing, so the Home is exactly as before.
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Section, Card, Hint, C } from './BizUI';
import useChamaMembership from '../../hooks/useChamaMembership';
import { groupRows } from '../../utils/businessGroupRows';

export default function BusinessGroupSection({ go }) {
  const m = useChamaMembership();
  const { invite, rows } = groupRows(m);
  if (!invite && !rows.length) return null;
  return (
    <>
      <Section>My Group</Section>
      {invite ? (
        <Card onPress={() => go('ChamaSetup')}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>Click here to Enter your Chama Code</Text>
          <Hint>{`You are the Treasurer of ${invite.group || 'your group'}. Enter the Chama Code you were given to start managing it.`}</Hint>
        </Card>
      ) : null}
      {rows.length ? (
        <Card>
          {rows.map((r) => (
            <TouchableOpacity key={r.route} onPress={() => go(r.route, r.params)} accessibilityRole="button" style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </Card>
      ) : null}
    </>
  );
}
