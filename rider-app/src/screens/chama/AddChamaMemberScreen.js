// rider-app/src/screens/chama/AddChamaMemberScreen.js
import React, { useEffect, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { addMember, chamaConfig, mgrCircles, getMyGroup, apiError } from '../../api/groupsClient';
import { s, Chip } from './chamaStyles';
import { useGroupText } from './groupText';

const num = (v) => parseFloat(String(v).replace(/,/g, ''));
const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v));

function AddChamaMemberScreen({ navigation, route }) {
  const groupId = route.params?.groupId;
  const gt = useGroupText();
  const { showToast } = useToast();
  const [type, setType] = useState(null);                    // 'tb' | 'mgr'
  const [cats, setCats] = useState([]); const [cat, setCat] = useState(null);
  const [name, setName] = useState(''), [phone, setPhone] = useState('');
  const [savings, setSavings] = useState('');
  const [hasLoan, setHasLoan] = useState(null);              // mandatory yes / no
  const [principal, setPrincipal] = useState(''), [owed, setOwed] = useState(''), [interest, setInterest] = useState(''), [due, setDue] = useState('');
  const [circles, setCircles] = useState([]);              // Merry-Go-Round: the circles in this group
  const [seats, setSeats] = useState({});                   // circle_id -> 0 (not in it) | 1 (single) | 2 (double turn)
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    chamaConfig(groupId).then((r) => {
      const t = r.group_type || r.config?.chama_type || null;
      setType(t); setCats(r.categories.filter((c) => c.is_active));
      if (t === 'mgr') mgrCircles(groupId).then((x) => setCircles(x.circles)).catch(() => {});
    }).catch(() => {});
  }, [groupId]);
  const tb = type === 'tb';
  // "Add myself as a member" (from My Savings / My Loans): the Treasurer's own name and number are filled in from the group record.
  useEffect(() => {
    if (!route.params?.self) return;
    getMyGroup(groupId).then((g) => { setName((n) => n || g.treasurer_name || ''); setPhone((p) => p || g.treasurer_phone || ''); }).catch(() => {});
  }, [groupId, route.params?.self]);

  async function save() {
    const p = phone.replace(/[\s-]/g, '');
    if (tb && cats.length && !cat) return showToast('Select a Chama category.', 'warn');
    if (name.trim().length < 3) return showToast('Enter the full name.', 'warn');
    if (!/^(07|01)\d{8}$/.test(p)) return showToast('Enter a valid mobile number, e.g. 0712345678.', 'warn');
    const body = { full_name: name.trim(), phone: p };
    if (tb) {
      if (savings === '' || !(num(savings) >= 0)) return showToast("Enter the member's current savings balance (enter 0 if none).", 'warn');
      if (hasLoan === null) return showToast('Answer: Does this member currently have an active loan?', 'warn');
      Object.assign(body, { category_id: cat, opening_savings: num(savings), has_active_loan: hasLoan });
      if (hasLoan) {
        if (!(num(principal) > 0) || !(num(owed) > 0) || interest === '' || !(num(interest) >= 0) || !isoDate(due)) return showToast('Enter the loan principal, the amount still owed, the interest still owed (0 if none) and a due date (YYYY-MM-DD).', 'warn');
        if (num(interest) >= num(owed)) return showToast('Interest still owed must be less than the total amount still owed.', 'warn');
        Object.assign(body, { loan_principal: num(principal), loan_outstanding: num(owed), loan_interest_outstanding: num(interest), loan_due_date: due });
      }
    } else {
      const picked = Object.entries(seats).filter(([, h]) => h > 0).map(([circle_id, hands]) => ({ circle_id, hands }));
      if (picked.length) body.circles = picked;
    }
    setBusy(true);
    try {
      const r = await addMember(body, groupId);
      showToast(`✅ ${name.trim()} added`, 'success');
      if (r.slots_available === 0) showToast('🎉 Your Chama has reached its maximum approved membership capacity. No additional members can be added.', 'success');
      navigation.goBack();
    } catch (e) { showToast(apiError(e, 'Could not add the member. Check your connection.'), 'warn'); }
    finally { setBusy(false); }
  }
  const YesNo = ({ val, label }) => (
    <TouchableOpacity onPress={() => setHasLoan(val)} style={[s.chip, { flex: 1, alignItems: 'center' }, hasLoan === val && s.chipOn]}>
      <Text style={{ fontWeight: '700' }}>{label}</Text></TouchableOpacity>);
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>➕ {gt('group.title_add_member', 'Add Chama Member')}</Text>
      {tb && cats.length > 0 && (
        <View style={s.card}><Text style={s.cardTitle}>1 · Select Chama Category</Text>
          <View style={s.chipRow}>{cats.map((c) => <Chip key={c.id} on={cat === c.id} label={`${cat === c.id ? '✓ ' : ''}${c.freq} · KSh ${Math.round(c.amount).toLocaleString()}`} onPress={() => setCat(c.id)} />)}</View></View>)}
      <View style={s.card}>
        <Text style={s.cardTitle}>Member Details</Text>
        <FormField label="Full Name" required value={name} onChangeText={setName} placeholder="e.g. Jane Wanjiru" maxLength={80} />
        <FormField label="Mobile Number" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" />
        <Text style={s.hint}>The member's mobile number links them to their Smart Boda account. They set up their profile with this same number.</Text>
      </View>
      {tb && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Opening Balances</Text>
          <FormField label="Current Savings Balance (KSh)" required value={savings} onChangeText={setSavings} keyboardType="number-pad" placeholder="0 if none" />
          <Text style={s.hint}>These are the member's starting balances. All future contributions and loans are added to them.</Text>
          <Text style={[s.label, { marginTop: 12 }]}>DOES THIS MEMBER CURRENTLY HAVE AN ACTIVE LOAN? *</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}><YesNo val label="Yes" /><YesNo val={false} label="No" /></View>
          {hasLoan === true && (<View style={{ marginTop: 10 }}>
            <FormField label="Loan Principal Amount (KSh)" required value={principal} onChangeText={setPrincipal} keyboardType="number-pad" />
            <FormField label="Outstanding Loan Balance (Amount Still Owed)" required value={owed} onChangeText={setOwed} keyboardType="number-pad" />
            <FormField label="Interest Still Owed (included in the balance above)" required value={interest} onChangeText={setInterest} keyboardType="number-pad" placeholder="0 if none" />
            <FormField label="Loan Due Date (YYYY-MM-DD)" required value={due} onChangeText={setDue} placeholder="e.g. 2026-12-31" maxLength={10} />
          </View>)}
        </View>)}
      {type === 'mgr' && (
        <View style={s.card}><Text style={s.cardTitle}>Which circles?</Text>
          {circles.length === 0 && <Text style={s.hint}>No round yet. You can add the person now and put them in a round later.</Text>}
          {circles.map((c) => (
            <View key={c.id} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: '700' }}>{c.name} · KSh {Math.round(Number(c.amount)).toLocaleString()}{c.contrib_label ? ` · ${c.contrib_label}` : ''} · {c.contrib_label ? 'paid out ' : ''}{c.sched_label || 'days not set'}</Text>
              <View style={s.chipRow}>
                {[[0, 'Not in it'], [1, 'One turn'], [2, 'Double turn ✌️']].map(([h, l]) => <Chip key={h} on={(seats[c.id] || 0) === h} label={l} onPress={() => setSeats({ ...seats, [c.id]: h })} />)}
              </View>
              {c.status === 'active' && (seats[c.id] || 0) > 0 && <Text style={s.hint}>This circle is running, so the person joins from the next cycle.</Text>}
            </View>))}
          <Text style={s.hint}>Turn numbers are set in the circle. A person can be in several circles and groups.</Text></View>)}
      <PrimaryButton label="Save Member" onPress={save} disabled={busy || !type} />
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(AddChamaMemberScreen, 'chama');