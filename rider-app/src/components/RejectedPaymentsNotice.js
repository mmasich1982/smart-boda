// rider-app/src/components/RejectedPaymentsNotice.js
// "A payment recorded offline no longer fits": when the server refuses a Lipa Later payment at sync time (for example another user paid in between so it
// would now be more than is owed), the payment is NEVER silently changed or dropped. It stays on the phone as recorded, the queue stops retrying it, and this
// card tells the person in plain words, with the server's reason, until they tap OK. Shown on the Lipa Later customers and suppliers screens.
import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getRejectedPayments, dismissRejectedPayment } from '../offline/syncQueue';

const WHO = { business_lipa_payment: 'customer payment', supplier_lipa_payment: 'supplier payment', lipa_later_payment: 'customer payment' };

export default function RejectedPaymentsNotice() {
  const [items, setItems] = useState([]);
  useFocusEffect(useCallback(() => { let live = true; getRejectedPayments().then((r) => live && setItems(r)); return () => { live = false; }; }, []));
  if (!items.length) return null;
  const dismiss = async (id) => { await dismissRejectedPayment(id); setItems((x) => x.filter((i) => i.id !== id)); };
  return (
    <View testID="rejected-payments" accessibilityRole="alert">
      {items.map((i) => (
        <View key={i.id} style={{ backgroundColor: '#fdecea', borderColor: '#d9534f', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <Text style={{ fontWeight: '800', color: '#a94442' }}>A {WHO[i.type] || 'payment'}{i.amount ? ` of KSh ${i.amount.toLocaleString()}` : ''} was not accepted</Text>
          <Text style={{ color: '#a94442', marginTop: 4 }}>{i.message}</Text>
          <Text style={{ color: '#7a4a48', marginTop: 4, fontSize: 12.5 }}>Nothing was changed on your records. Check the balance, then record the payment again if it is still due.</Text>
          <TouchableOpacity onPress={() => dismiss(i.id)} accessibilityRole="button" accessibilityLabel="OK" style={{ alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#a94442', borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>OK</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
