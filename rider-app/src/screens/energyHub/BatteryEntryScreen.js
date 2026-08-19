// rider-app/src/screens/energyHub/BatteryEntryScreen.js
// ✅ Offline-First Pattern 2: Record Data Entry
// ✅ Principle 1: LocalStore First - Cache swap partners
// ✅ Principle 2: Offline Repositories - Uses sync queue
// ✅ Principle 3: getLocalRiderId Always
// ✅ Principle 4: API with Fallback - Try fetch, fallback to cache
// ✅ Principle 5: Sync Queue - Queue battery entries for offline sync

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Picker, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { addToSyncQueue } from '../../offline/syncQueue';

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
  const [isOffline, setIsOffline] = useState(false);

  // ✅ Principle 3: Get rider ID from offline database
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

  // ✅ Pattern 1: Load Data - Principle 4: API with Fallback
  // Load swap partners from API with cache fallback
  useEffect(() => {
    let isMounted = true;

    async function loadSwapPartners() {
      try {
        setLoading(true);
        // Try to fetch from API
        const response = await api.get('/fuel-maintenance/swap-partners');
        const partners = response.data?.swap_partners || [];

        if (isMounted) {
          setSwapPartners(partners);
          // ✅ Principle 1: Cache in LocalStore for offline use
          LocalStore.set('swap_partners_cache', JSON.stringify(partners));
          setIsOffline(false);
          setError('');
        }
      } catch (err) {
        console.error('Failed to load swap partners:', err);
        
        // ✅ Principle 4: Fallback to cache on network error
        if (err.response?.status === 0 || err.message.includes('Network')) {
          try {
            const cached = LocalStore.get('swap_partners_cache');
            if (cached && isMounted) {
              setSwapPartners(JSON.parse(cached));
              setIsOffline(true);
            }
          } catch (e) {
            console.error('Cache load failed:', e);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSwapPartners();
    return () => { isMounted = false; };
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

  // ✅ Pattern 2: Record Data Entry - Principle 5: Sync Queue
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
      created_at: new Date().toISOString(),
    };

    if (mode === 'swap') {
      requestBody.swap_partner_id = selectedPartner;
    }

    setSaving(true);
    try {
      // ✅ Principle 1 & 2: Save to offline database first
      const recordId = `battery_${effectiveRiderId}_${Date.now()}`;
      const offlineRecord = { ...requestBody, id: recordId, rider_id: effectiveRiderId };
      
      // Store locally
      LocalStore.set(`battery_entry_${recordId}`, JSON.stringify(offlineRecord));

      // ✅ Principle 5: Add to sync queue for later sync
      await addToSyncQueue({
        id: recordId,
        type: 'battery_entry',
        endpoint: `/fuel-maintenance/fuel-entry?rider_id=${effectiveRiderId}`,
        data: requestBody,
        timestamp: new Date(),
      });

      // Try to sync immediately (Principle 4: API with Fallback)
      try {
        await api.post(`/fuel-maintenance/fuel-entry?rider_id=${effectiveRiderId}`, requestBody);
        
        // ✅ Record as expense in financial tracking
        const expenseType = mode === 'swap' ? 'Battery Swap' : 'Battery Charging';
        await api.post(`/financial/expense?rider_id=${effectiveRiderId}`, {
          expense_type: expenseType,
          amount: parseFloat(mode === 'swap' ? swapCost : chargingCost),
          description: expenseType,
        }).catch(err => console.warn('Expense tracking failed:', err));

        setIsOffline(false);
        setError('');
        // ✅ Auto-redirect to history
        navigation.navigate('BatteryHistory');
      } catch (apiErr) {
        // Network error - data already saved offline and queued
        console.warn('API sync failed, using offline queue:', apiErr);
        setIsOffline(true);
        // Still navigate to history - data will sync when online
        setTimeout(() => {
          navigation.navigate('BatteryHistory');
        }, 1500);
      }
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

      {/* ✅ Pattern 4: Display Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📶 Working Offline · Will sync when connected</Text>
        </View>
      )}

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
  offlineBanner: { backgroundColor: '#fff9e6', borderWidth: 1.5, borderColor: '#ffe6b3', borderRadius: 14, padding: 12, marginBottom: 14 },
  offlineBannerText: { fontSize: 11.5, color: '#b88900', fontWeight: '600' },
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