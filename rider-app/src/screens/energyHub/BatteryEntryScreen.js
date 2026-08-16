// rider-app/src/screens/energyHub/BatteryEntryScreen.js
// ✅ Battery swap/charging - Auto-redirect to history after save

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Picker, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';

export default function BatteryEntryScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [mode, setMode] = useState('swap');
  const [swapPartners, setSwapPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState('');
  const [swapCost, setSwapCost] = useState('');
  const [chargingCost, setChargingCost] = useState('');
  const [odometer, setOdometer] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading riderId:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  useEffect(() => {
    api.get('/fuel-maintenance/swap-partners')
      .then(res => {
        setSwapPartners(res.data?.swap_partners || []);
      })
      .catch(err => console.error('Failed to load swap partners:', err));
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  const handlePartnerChange = useCallback((partnerId) => {
    setSelectedPartner(partnerId);
    const partner = swapPartners.find(p => p.id === partnerId);
    if (partner && partner.default_fee) {
      setSwapCost(partner.default_fee.toString());
    } else {
      setSwapCost('');
    }
  }, [swapPartners]);

  const handleSave = useCallback(async () => {
    setError('');

    if (!odometer || parseFloat(odometer) <= 0) {
      setError('Please enter the current odometer reading.');
      return;
    }

    if (!effectiveRiderId) {
      setError('Rider information not found. Please return to home.');
      return;
    }

    if (mode === 'swap') {
      if (!selectedPartner) {
        setError('Select a Swap Network.');
        return;
      }
      if (!swapCost || parseFloat(swapCost) <= 0) {
        setError('Please enter the swap cost.');
        return;
      }
    } else {
      if (!chargingCost || parseFloat(chargingCost) <= 0) {
        setError('Please enter the charging cost.');
        return;
      }
    }

    const requestBody = {
      mode: mode,
      cost: parseFloat(mode === 'swap' ? swapCost : chargingCost),
      odometer_reading: parseFloat(odometer),
    };

    if (mode === 'swap') {
      requestBody.swap_partner_id = selectedPartner;
    }

    setSaving(true);
    try {
      await api.post(`/fuel-maintenance/fuel-entry?rider_id=${effectiveRiderId}`, requestBody);
      
      // ✅ Record as expense in financial tracking
      const expenseType = mode === 'swap' ? 'Battery Swap' : 'Battery Charging';
      await api.post(`/financial/expense?rider_id=${effectiveRiderId}`, {
        expense_type: expenseType,
        amount: parseFloat(mode === 'swap' ? swapCost : chargingCost),
        description: expenseType,
      }).catch(err => console.warn('Expense tracking failed:', err));
      
      // ✅ Auto-redirect to history
      navigation.navigate('BatteryHistory');
    } catch (err) {
      console.error('Save error:', err);
      setError(err.response?.data?.message || 'Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [mode, odometer, swapCost, chargingCost, selectedPartner, effectiveRiderId, navigation]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>Record Battery Cost</Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, mode === 'swap' && styles.tabActive]}
          onPress={() => { setMode('swap'); setError(''); }}
          disabled={saving}
        >
          <Text style={[styles.tabText, mode === 'swap' && styles.tabTextActive]}>🔋 Battery Swap</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'charging' && styles.tabActive]}
          onPress={() => { setMode('charging'); setError(''); }}
          disabled={saving}
        >
          <Text style={[styles.tabText, mode === 'charging' && styles.tabTextActive]}>🔌 Charging</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {mode === 'swap' && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Swap Network / Partner <Text style={styles.required}>*</Text></Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedPartner}
                onValueChange={handlePartnerChange}
                style={styles.picker}
                enabled={!saving}
              >
                <Picker.Item label="Select..." value="" />
                {swapPartners.map((p) => (
                  <Picker.Item 
                    key={p.id}
                    label={p.default_fee ? `${p.name} (KSh ${p.default_fee})` : p.name}
                    value={p.id}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Swap Cost <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="Cost in KSh"
              placeholderTextColor="#b0a89d"
              keyboardType="decimal-pad"
              value={swapCost}
              onChangeText={setSwapCost}
              editable={!saving}
            />
          </View>
        </>
      )}

      {mode === 'charging' && (
        <View style={styles.field}>
          <Text style={styles.label}>Charging Cost <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="Cost in KSh"
            placeholderTextColor="#b0a89d"
            keyboardType="decimal-pad"
            value={chargingCost}
            onChangeText={setChargingCost}
            editable={!saving}
          />
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>Current Odometer Reading <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 12500"
          placeholderTextColor="#b0a89d"
          keyboardType="number-pad"
          value={odometer}
          onChangeText={setOdometer}
          editable={!saving}
        />
        <Text style={styles.hint}>We'll alert you 5 km before your battery is expected to run out.</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn, 
          (saving || !odometer || (mode === 'swap' ? !swapCost : !chargingCost)) && styles.primaryBtnDisabled
        ]}
        onPress={handleSave}
        disabled={saving || !odometer || (mode === 'swap' ? !swapCost : !chargingCost)}
      >
        <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Record Battery Cost →'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 20 },
  tabs: { flexDirection: 'row', gap: 6, backgroundColor: '#eee', borderRadius: 12, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tabText: { fontSize: 12, fontWeight: '700', color: '#5b606c' },
  tabTextActive: { color: '#1a1c20' },
  errorBanner: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#f6cac7', borderRadius: 14, padding: 12, marginBottom: 14 },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },
  field: { marginBottom: 16 },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.04, color: '#5b606c', marginBottom: 7 },
  required: { color: '#e5650a' },
  input: { width: '100%', padding: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#e7e4db', fontSize: 15, backgroundColor: '#fff', color: '#1a1c20' },
  pickerContainer: { borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#1a1c20' },
  hint: { fontSize: 11.5, color: '#5b606c', lineHeight: 18, marginTop: 6 },
  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, shadowColor: '#ff7a1a', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});