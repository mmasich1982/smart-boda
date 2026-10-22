// rider-app/src/screens/chama/MgrPaySubmittedScreen.js
// What the rider sees right after "I've Made the Payment" for a Merry-Go-Round contribution
// (Smart_Boda_Prototype_v25): thank-you, the payment details, and what happens next.
// route.params: { groupId, circleId, amount, method, reference, treasurer }
import React, { useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { s, fmt } from './chamaStyles';
import { Btn, Card, DetailRows, Badge, DISPLAY_FONT } from './mgrUi';
import colors from '../../theme/colors';

function Fold({ title, children, bare }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[f.wrap, bare && f.bare]}>
      <TouchableOpacity onPress={() => setOpen(!open)} style={f.head}>
        <Text style={f.title}>{title}</Text><Text style={f.caret}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>{children}</View>}
    </View>);
}

function MgrPaySubmittedScreen({ navigation, route }) {
  const p = route.params || {};
  const first = String(p.treasurer?.name || 'Your Treasurer').split(' ')[0];
  const goBack = () => navigation.navigate('MySavings', p.groupId ? { groupId: p.groupId } : undefined);
  const step = (n, text) => (
    <View key={n} style={f.step}><View style={f.stepNo}><Text style={f.stepNoTxt}>{n}</Text></View><Text style={f.stepTxt}>{text}</Text></View>);
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <View style={{ alignItems: 'center', paddingTop: 26, paddingHorizontal: 16, paddingBottom: 10 }}>
        <Text style={{ fontSize: 50, marginBottom: 10 }}>🎉</Text>
        <Text style={f.thanks}>Thank you! We've got your contribution</Text>
      </View>
      <Card>
        <DetailRows rows={[
          ['Saving to', 'Chama · Merry-Go-Round'],
          ['Amount', <Text style={{ color: colors.bodaOrange, fontWeight: '700', fontSize: 14 }}>{fmt(p.amount)}</Text>],
          ['Paid via', p.method === 'cash' ? '💵 Cash' : '📲 M-Pesa'],
          ['Reference', <Text style={{ fontSize: 11, color: colors.inkSoft }}>{p.reference || '—'}</Text>],
        ]} />
        <Fold bare title="More details">
          <DetailRows rows={[['Status', <Badge tone="amber">⏳ Awaiting Treasurer</Badge>]]} />
        </Fold>
      </Card>
      <Fold title="What happens next">
        <Card style={{ marginBottom: 0 }}>
          {step(1, `${first} reviews and verifies your payment`)}
          {step(2, 'Your contributions and history are updated')}
          {step(3, 'Check your contribution history: it shows as approved once confirmed')}
        </Card>
      </Fold>
      <View style={{ height: 14 }} />
      <Btn label="Back to My Contributions" onPress={goBack} testID="mgr-submitted-back" />
    </ScrollView>);
}

const f = {
  thanks: { fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: '700', color: colors.bodaOrangeDark, textAlign: 'center', letterSpacing: -0.22 },
  wrap: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 16, marginBottom: 0 },
  bare: { borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  title: { fontWeight: '700', fontSize: 13.5, color: colors.ink },
  caret: { color: colors.inkSoft, fontSize: 12 },
  step: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  stepNo: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.signalGreenBg, alignItems: 'center', justifyContent: 'center' },
  stepNoTxt: { color: colors.signalGreen, fontWeight: '800', fontSize: 12 },
  stepTxt: { flex: 1, fontSize: 12.5, lineHeight: 19, color: colors.ink },
};

export default withChamaOnlineGate(MgrPaySubmittedScreen, 'savings');