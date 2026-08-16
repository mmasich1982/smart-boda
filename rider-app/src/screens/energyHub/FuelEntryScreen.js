// rider-app/src/screens/energyHub/FuelEntryScreen.js
// ✅ FIXED: Wrapped BackLink and Text components in View to prevent "Unexpected text node" error
// ✅ FIXED: Ensures fuel entries properly create financial expenses
// Screen to record fuel/energy costs and link to financial tracking

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';

export default function FuelEntryScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [totalCost, setTotalCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isElectric = bikeProfile?.fuelType === 'electric';
  const title = isElectric ? 'Record Battery Cost' : 'Record Fuel Cost';

  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading riderId:', err);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  const handleSave = async () => {
    if (!totalCost || parseFloat(totalCost) <= 0) {
      setError('Please enter a valid cost');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        mode: isElectric ? 'charging' : 'petrol',
        cost: parseFloat(totalCost),
        litres: isElectric ? null : undefined,
      };

      const response = await api.post('/fuel-maintenance/fuel-entry', payload, {
        params: { rider_id: effectiveRiderId }
      });

      if (response.status === 200 || response.status === 201) {
        // Success - navigate to history
        navigation.navigate('FuelHistory');
      } else {
        setError('Failed to save entry. Please try again.');
      }
    } catch (err) {
      console.error('Save error:', err);
      setError(err.response?.data?.detail || 'Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!effectiveRiderId) {
    return (
      <View style={styles.container}>
        <View>
          <BackLink onPress={() => navigation.goBack()} label="← Back" />
        </View>
        <View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Unable to load rider information</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
      </View>
      <View>
        <Text style={styles.title}>{title}</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>Total Cost <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 630"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={totalCost}
          onChangeText={setTotalCost}
          editable={!saving}
        />
        <Text style={styles.hint}>Enter the total amount you paid for fuel/energy in KSh</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, (saving || !totalCost) && styles.primaryBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !totalCost}
      >
        <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : `Record ${isElectric ? 'Battery' : 'Fuel'} Cost →`}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 20 },
  errorBanner: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#f6cac7', borderRadius: 14, padding: 12, marginBottom: 14 },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },
  field: { marginBottom: 16 },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.04, color: '#5b606c', marginBottom: 7 },
  required: { color: '#e5650a' },
  input: { width: '100%', padding: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#e7e4db', fontSize: 15, backgroundColor: '#fff', color: '#1a1c20' },
  hint: { fontSize: 11.5, color: '#5b606c', lineHeight: 18, marginTop: 6 },
  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, shadowColor: '#ff7a1a', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});