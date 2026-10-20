// rider-app/src/screens/chama/RequestChamaSlotsScreen.js
import React, { useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';
import { requestSlots, apiError } from '../../api/groupsClient';
import { useGroupText } from './groupText';

function RequestChamaSlotsScreen({ navigation, route }) {
  const groupId = route.params?.groupId;
  const gt = useGroupText();
  const { showToast } = useToast();
  const [n, setN] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    const slots = parseInt(n, 10);
    if (!(slots >= 1 && slots <= 200) || why.trim().length < 5) return showToast('Enter the number of slots and a reason.', 'warn');
    setBusy(true);
    try {
      await requestSlots({ requested_slots: slots, reason: why.trim() }, groupId);
      showToast('📨 Request sent to the Smart Boda Administrator.', 'success');
      navigation.goBack();
    } catch (e) { showToast(apiError(e, 'Could not send the request.'), 'warn'); }
    finally { setBusy(false); }
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>📈 {gt('group.title_request_slots', 'Request Additional Member Slots')}</Text>
      <Text style={s.sub}>Goes to the Smart Boda Administrator for approval.</Text>
      <View style={s.card}>
        <FormField label="Number of Additional Member Slots Requested" required value={n} onChangeText={setN} keyboardType="number-pad" placeholder="e.g. 5" maxLength={3} />
        <FormField label="Reason" required value={why} onChangeText={setWhy} placeholder="Why do you need more slots?" maxLength={300} />
      </View>
      <PrimaryButton label="Send Request" onPress={send} disabled={busy} />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginVertical: 6 }, sub: { color: colors.inkSoft, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, marginBottom: 12 },
});

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(RequestChamaSlotsScreen, 'chama');
