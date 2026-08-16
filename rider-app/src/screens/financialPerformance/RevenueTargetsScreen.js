// rider-app/src/screens/financialPerformance/RevenueTargetsScreen.js
// UPDATED: Revenue Targets Dashboard (RA-09-B) - Real-time progress tracking
// Shows target status for daily/weekly/monthly periods with progress bars and actions

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

export default function RevenueTargetsScreen({ riderId, navigation }) {
  const [activePeriod, setActivePeriod] = useState('daily');
  const [targets, setTargets] = useState({});
  const [income, setIncome] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    
    // Fetch targets and income for all periods
    Promise.all([
      api.get('/financial/targets', { params: { rider_id: riderId } }).catch(() => ({ data: {} })),
      api.get('/financial/net-profit', { params: { rider_id: riderId, period: 'today' } }).catch(() => ({ data: {} })),
      api.get('/financial/net-profit', { params: { rider_id: riderId, period: 'this_week' } }).catch(() => ({ data: {} })),
      api.get('/financial/net-profit', { params: { rider_id: riderId, period: 'this_month' } }).catch(() => ({ data: {} })),
    ])
      .then(([targetsRes, todayRes, weekRes, monthRes]) => {
        if (isMounted) {
          setTargets(targetsRes.data?.targets || {});
          setIncome({
            daily: todayRes.data?.income || 0,
            weekly: weekRes.data?.income || 0,
            monthly: monthRes.data?.income || 0,
          });
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load targets');
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [riderId]);

  const target = targets[activePeriod];
  const currentIncome = income[activePeriod] || 0;
  const percent = target ? Math.min(100, Math.round((currentIncome / target.amount) * 100)) : 0;
  const remaining = target ? Math.max(0, target.amount - currentIncome) : 0;

  const handleEditTarget = () => {
    navigation.navigate('SetTarget', { period: activePeriod, isEdit: true });
  };

  const handleRemoveTarget = async () => {
    try {
      await api.delete('/financial/targets', {
        params: { rider_id: riderId, period: activePeriod },
      });
      const updatedTargets = { ...targets };
      delete updatedTargets[activePeriod];
      setTargets(updatedTargets);
    } catch (err) {
      setError('Failed to remove target');
    }
  };

  const handleSetTarget = () => {
    navigation.navigate('SetTarget', { period: activePeriod, isEdit: false });
  };

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
        <Text style={styles.title}>Revenue Targets</Text>
        <Text style={styles.loading}>Loading...</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Revenue Targets</Text>
      <Text style={styles.subtitle}>RA-09-B · Real-Time Progress Tracking</Text>

      {/* Period Tabs */}
      <View style={styles.periodTabs}>
        {PERIODS.map((period) => (
          <TouchableOpacity
            key={period.key}
            style={[styles.tab, activePeriod === period.key && styles.tabActive]}
            onPress={() => setActivePeriod(period.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: activePeriod === period.key }}
          >
            <Text style={[styles.tabText, activePeriod === period.key && styles.tabTextActive]}>
              {period.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Target Content */}
      {target ? (
        <>
          {/* Progress Card */}
          <View style={styles.card}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Target</Text>
              <Text style={styles.kvValue}>KSh {target.amount.toLocaleString()}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Earned so far</Text>
              <Text style={styles.kvValue}>KSh {currentIncome.toLocaleString()}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Remaining</Text>
              <Text style={styles.kvValue}>
                {remaining <= 0 ? '✅ Target Reached!' : `KSh ${remaining.toLocaleString()}`}
              </Text>
            </View>

            {/* Progress Bar */}
            <View style={[styles.progressTrack, { marginVertical: 8 }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${percent}%`,
                    backgroundColor: percent >= 100 ? '#1e9e6f' : percent >= 75 ? '#c98a12' : '#1e9e6f',
                  },
                ]}
              />
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity style={styles.ghostBtn} onPress={handleEditTarget}>
            <Text style={styles.ghostBtnText}>✏️ Edit Target</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={handleRemoveTarget}>
            <Text style={styles.linkBtnText}>Remove this target</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* No Target Banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              ℹ️ No active {activePeriod} target for this bike yet — entirely optional.
            </Text>
          </View>

          {/* Set Target Button */}
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSetTarget}>
            <Text style={styles.primaryBtnText}>＋ Set a {activePeriod} Target →</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#8b5cf6', marginBottom: 16 },
  loading: { fontSize: 14, color: '#5b606c', marginTop: 20, textAlign: 'center' },

  periodTabs: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#eee',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b606c',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#1a1c20',
  },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },

  infoBanner: {
    backgroundColor: '#eef3fb',
    borderWidth: 1.5,
    borderColor: '#cfe3f2',
    borderRadius: 14,
    padding: 13,
    marginBottom: 14,
  },
  infoBannerText: { fontSize: 12.5, color: '#2c5182', lineHeight: 18 },

  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  kvKey: { fontSize: 12.5, color: '#5b606c' },
  kvValue: { fontSize: 12.5, fontWeight: '700', color: '#1a1c20' },

  progressTrack: {
    height: 9,
    backgroundColor: '#e7e4db',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    transition: '.3s',
  },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  ghostBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  ghostBtnText: { color: '#1a1c20', fontSize: 14, fontWeight: '700' },

  linkBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  linkBtnText: { color: '#e5650a', fontSize: 13, fontWeight: '700' },
});