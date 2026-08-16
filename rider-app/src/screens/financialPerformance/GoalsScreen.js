// rider-app/src/screens/financialPerformance/GoalsScreen.js
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import GoalProgressBar from '../../components/GoalProgressBar';
import api from '../../api/client';

// ── View 1: My Goals list ──────────────────────────────────────────────
export function MyGoalsScreen({ riderId, navigation }) {
  const [goals, setGoals] = useState([]);
  useEffect(() => { api.get('/financial/goals', { params: { rider_id: riderId } }).then(res => setGoals(res.data)); }, []);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>My Goals</Text>
      {goals.length ? goals.map((g) => (
        <TouchableOpacity key={g.id} style={styles.card} onPress={() => navigation.navigate('GoalSummary', { goalId: g.id })}>
          <View style={styles.row}>
            <Text style={styles.goalName}>{g.name || g.goal_type_code}</Text>
            {g.status === 'achieved' && <Text style={styles.achievedBadge}>Achieved</Text>}  {/* BR-SB17-007 */}
          </View>
          <Text style={styles.goalLine}>KSh {g.earned.toLocaleString()} of KSh {g.target_amount.toLocaleString()}</Text>
          <GoalProgressBar earned={g.earned} target={g.target_amount} />
        </TouchableOpacity>
      )) : <Text style={styles.empty}>No goals yet. Set one to start tracking your progress.</Text>}  {/* EXC-SB17-001 */}
      <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('NewGoal')}>
        <Text style={styles.primaryBtnText}>＋ New Goal →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── View 2: New Goal ────────────────────────────────────────────────────
export function NewGoalScreen({ riderId, goalTypes, navigation }) {
  const [goalType, setGoalType] = useState('');
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');  // BR-SB17-004: optional, informational only
  const [error, setError] = useState(null);

  async function handleCreate() {
    if (!goalType) { setError('Select a Goal Type.'); return; }
    if (!targetAmount || parseFloat(targetAmount) <= 0) { setError('Enter a target amount greater than zero.'); return; }  // EXC-SB17-002
    const res = await api.post('/financial/goals', { goal_type_code: goalType, name: name.trim() || null, target_amount: parseFloat(targetAmount), target_date: targetDate || null }, { params: { rider_id: riderId } });
    navigation.navigate('GoalSummary', { goalId: res.data.id });
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('MyGoals')} label="← My Goals" />
      <Text style={styles.title}>New Goal</Text>
      {/* EXCEPTION per current MVP0 scope: Goal Type values are Super Admin master data */}
      <FormField label="Goal Type" required type="select" value={goalType} onChangeText={setGoalType}
        options={goalTypes.map(t => ({ label: t.display_name, value: t.code }))} placeholder="Select..." />
      <FormField label="Goal Name — optional" value={name} onChangeText={setName} placeholder="e.g. School Fees" />
      <FormField label="Target Amount" required value={targetAmount} onChangeText={setTargetAmount} keyboardType="numeric" />
      <FormField label="Target Date — optional" type="date" value={targetDate} onChangeText={setTargetDate} />
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
      <TouchableOpacity style={[styles.primaryBtn, (!goalType || !targetAmount) && styles.primaryBtnDisabled]} onPress={handleCreate} disabled={!goalType || !targetAmount}>
        <Text style={styles.primaryBtnText}>Create Goal</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── View 3: Goal Summary (target achieved so far + add a contribution) ──
export function GoalSummaryScreen({ route, riderId, navigation }) {
  const { goalId } = route.params;
  const [goal, setGoal] = useState(null);
  const [amount, setAmount] = useState('');

  function loadGoal() {
    api.get('/financial/goals', { params: { rider_id: riderId } }).then(res => setGoal(res.data.find((g) => g.id === goalId)));
  }
  useEffect(loadGoal, [goalId]);

  async function handleContribute() {
    if (!amount || parseFloat(amount) <= 0) return;  // EXC-SB17-003
    const res = await api.post('/financial/goals/contribution', { goal_id: goalId, amount: parseFloat(amount) });
    setAmount('');
    loadGoal();
    if (res.data.achieved) { /* NTF-SB17-004: in-app celebration banner fires here, then re-render shows Achieved badge */ }
  }

  if (!goal) return null;
  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('MyGoals')} label="← My Goals" />
      <Text style={styles.title}>{goal.name || goal.goal_type_code}</Text>
      <View style={styles.heroCard}>
        <Text style={styles.heroLbl}>Target achieved so far</Text>
        <Text style={styles.heroAmt}>KSh {goal.earned.toLocaleString()}</Text>
        <Text style={styles.heroSub}>of KSh {goal.target_amount.toLocaleString()} target{goal.target_date ? ` · by ${goal.target_date}` : ''}</Text>
        <GoalProgressBar earned={goal.earned} target={goal.target_amount} />
      </View>
      {goal.status === 'achieved' ? (
        // BR-SB17-007
        <Text style={styles.achievedLine}>🎉 Goal achieved! It stays here for your records.</Text>
      ) : (
        <>
          <FormField label="Log a contribution (KSh)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleContribute}>
            <Text style={styles.primaryBtnText}>＋ Log Contribution</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 14, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalName: { fontSize: 14, fontWeight: '800', color: '#1a1c20' },
  achievedBadge: { fontSize: 10.5, fontWeight: '800', color: '#e5650a', backgroundColor: '#fff6ee', borderWidth: 1, borderColor: '#ff7a1a', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  goalLine: { fontSize: 11.5, color: '#5b606c', marginVertical: 4 },
  empty: { fontSize: 12.5, color: '#5b606c', fontStyle: 'italic', marginBottom: 14 },  // TPL-RA07-030
  heroCard: { backgroundColor: '#1d2026', borderRadius: 16, padding: 18, marginBottom: 16 },
  heroLbl: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroAmt: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 28, fontWeight: '700', color: '#ffc93c', marginVertical: 2 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 6 },
  achievedLine: { fontSize: 13, fontWeight: '700', color: '#1a1c20', textAlign: 'center', marginTop: 6 },
  error: { color: '#e0453f', fontSize: 12.5, marginBottom: 10, fontWeight: '700' },
  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: '#ff7a1a', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
