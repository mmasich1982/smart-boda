// rider-app/src/screens/financialPerformance/SavingsHubScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';

export default function SavingsHubScreen({ riderId, navigation }) {
  const [saccoAccounts, setSaccoAccounts] = useState([]);
  const [chamaAccounts, setChamaAccounts] = useState([]);

  useEffect(() => {
    api.get('/financial/savings/accounts', { params: { rider_id: riderId, type: 'sacco' } }).then(res => setSaccoAccounts(res.data));
    api.get('/financial/savings/accounts', { params: { rider_id: riderId, type: 'chama' } }).then(res => setChamaAccounts(res.data));
  }, []);

  // EXC-SB16-003/004: no account of that type yet -> registration; otherwise -> the shared report, filtered to that type
  function openTile(type) {
    const accounts = type === 'sacco' ? saccoAccounts : chamaAccounts;
    navigation.navigate(accounts.length ? 'SavingsReport' : 'SavingsAccount', { type });
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Savings</Text>
      <Text style={styles.sub}>Track your SACCO and Chama contributions in one place.</Text>
      <TouchableOpacity style={styles.tile} onPress={() => openTile('sacco')}>
        <Text style={styles.emoji}>🤝</Text><Text style={styles.tileLabel}>SACCO</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tile} onPress={() => openTile('chama')}>
        <Text style={styles.emoji}>👥</Text><Text style={styles.tileLabel}>Chama</Text>
      </TouchableOpacity>
      {(saccoAccounts.length + chamaAccounts.length) > 0 && (
        <TouchableOpacity onPress={() => navigation.navigate('SavingsReport', { type: null })}>
          <Text style={styles.reportLink}>View Savings Report →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b606c', marginBottom: 16 },
  tile: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 14, padding: 18, marginBottom: 10, alignItems: 'center' },
  emoji: { fontSize: 26, marginBottom: 4 },
  tileLabel: { fontSize: 15, fontWeight: '800', color: '#1a1c20' },
  reportLink: { fontSize: 13, color: '#e5650a', fontWeight: '700', textAlign: 'center', marginTop: 8 },
});
