// rider-app/src/screens/chama/ChamaRulesCard.js
// Table Banking rules for ONE group: contribution categories, loan rules and the meeting rhythm.
// The group's type is set by the Smart Boda Administrator and cannot be changed here. A Merry-Go-Round has no rules card:
// its amount and payout days belong to each circle (see MgrCircleScreen).
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { chamaConfig, saveChamaConfig, saveChamaCategory, apiError } from '../../api/groupsClient';
import { s, Chip } from './chamaStyles';

const FREQS = ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly'];
const F_LOAN = [['interest_rate_pct', 'Loan interest (% per month)'], ['max_loan_multiple', 'Borrowing limit (× savings)'],
                ['max_loan_months', 'Longest repayment (months)'], ['min_loan_amount', 'Smallest loan (KSh)'], ['opening_pool', 'Opening pool (KSh)'],
                ['min_contributions_for_loan', 'Contributions needed before a loan (0 = none)']];
const WEEKS = ['1st', '2nd', '3rd', '4th', 'Last'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEFAULTS = { interest_rate_pct: '5', max_loan_multiple: '3', max_loan_months: '4', min_loan_amount: '1000', opening_pool: '0', min_contributions_for_loan: '0' };

export default function ChamaRulesCard({ groupId, onSaved, saveLabel = 'Save rules' }) {
  const { showToast } = useToast();
  const [type, setType] = useState(null);             // 'tb' | 'mgr', from the server
  const [cfg, setCfg] = useState(DEFAULTS);
  const [cats, setCats] = useState({});               // freq -> { amount, is_active }
  const [meet, setMeet] = useState({ meeting_week: null, meeting_day: null, cycle_month: null });
  const load = () => chamaConfig(groupId).then((r) => {
    setType(r.group_type || r.config?.chama_type || null);
    if (r.config) {
      setCfg({ ...DEFAULTS, ...Object.fromEntries(Object.entries(r.config).filter(([k, v]) => v != null && k in DEFAULTS).map(([k, v]) => [k, String(v)])) });
      setMeet({ meeting_week: r.config.meeting_week, meeting_day: r.config.meeting_day, cycle_month: r.config.cycle_month });
    }
    setCats(Object.fromEntries(r.categories.map((c) => [c.freq, { amount: String(c.amount), is_active: c.is_active }])));
  }).catch(() => {});
  useEffect(() => { load(); }, [groupId]);

  async function save() {
    // Members are linked to a contribution category, so at least one must be switched on with an amount before the rules can be saved.
    if (!FREQS.some((f) => cats[f]?.is_active && +cats[f].amount > 0)) {
      return showToast('Switch on at least one contribution category and enter its amount.', 'warn');
    }
    try {
      await saveChamaConfig({ chama_type: type, interest_rate_pct: +cfg.interest_rate_pct, max_loan_multiple: +cfg.max_loan_multiple,
        max_loan_months: parseInt(cfg.max_loan_months, 10), min_loan_amount: +cfg.min_loan_amount, opening_pool: +cfg.opening_pool,
        min_contributions_for_loan: parseInt(cfg.min_contributions_for_loan || '0', 10), ...meet }, groupId);
      for (const f of FREQS) if (cats[f]) await saveChamaCategory({ freq: f, amount: +cats[f].amount || 0, is_active: cats[f].is_active }, groupId);
      showToast('Saved.', 'success'); onSaved && onSaved(); load();
    } catch (e) { showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'); }
  }
  if (type !== 'tb') return null;

  const field = ([k, label]) => (
    <View key={k}><Text style={[s.label, { marginTop: 10 }]}>{label}</Text>
      <TextInput style={s.input} keyboardType="decimal-pad" value={cfg[k]} onChangeText={(v) => setCfg({ ...cfg, [k]: v })} />
      {k === 'opening_pool' && <Text style={s.hint}>Enter the cash your group can lend today, AFTER any loans already out.</Text>}
    </View>);
  const pickOne = (k, v) => setMeet({ ...meet, [k]: meet[k] === v ? null : v });

  return (
    <View>
      <View style={s.card}>
        <Text style={s.cardTitle}>Contribution categories</Text>
        <Text style={s.hint}>Choose how often members save and how much.</Text>
        {FREQS.map((f) => (
          <View key={f} style={s.row}>
            <Chip on={!!cats[f]?.is_active} label={f} onPress={() => setCats({ ...cats, [f]: { amount: cats[f]?.amount || '0', is_active: !cats[f]?.is_active } })} />
            <TextInput style={[s.input, { width: 120, marginBottom: 0 }]} keyboardType="number-pad" placeholder="KSh"
              value={cats[f]?.amount || ''} onChangeText={(v) => setCats({ ...cats, [f]: { amount: v, is_active: cats[f]?.is_active ?? true } })} />
          </View>))}
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>Loan rules</Text>
        {F_LOAN.map(field)}
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>When does the group meet?</Text>
        <Text style={s.label}>WHICH WEEK</Text><View style={s.chipRow}>{WEEKS.map((w) => <Chip key={w} on={meet.meeting_week === w} label={w} onPress={() => pickOne('meeting_week', w)} />)}</View>
        <Text style={s.label}>WHICH DAY</Text><View style={s.chipRow}>{DAYS.map((w) => <Chip key={w} on={meet.meeting_day === w} label={w.slice(0, 3)} onPress={() => pickOne('meeting_day', w)} />)}</View>
        <Text style={s.label}>CYCLE ENDS IN</Text><View style={s.chipRow}>{MONTHS.map((w) => <Chip key={w} on={meet.cycle_month === w} label={w} onPress={() => pickOne('cycle_month', w)} />)}</View>
      </View>
      <PrimaryButton label={saveLabel} onPress={save} />
    </View>);
}
