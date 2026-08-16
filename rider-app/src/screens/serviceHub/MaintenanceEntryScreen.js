// rider-app/src/screens/serviceHub/MaintenanceEntryScreen.js
// ✅ FIXED: Service type tiles with conditional fields for dated services
// ✅ FIXED: Proper service type code mapping (oil_change, not Oil Change)

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Picker, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';

const SERVICE_TYPES = [
  { code: 'oil_change', display: 'Oil Change', icon: '🛢️', isDated: true },
  { code: 'chain_sprocket', display: 'Chain & Sprocket', icon: '⛓️', isDated: false },
  { code: 'brake_pads', display: 'Brake Pads', icon: '🛑', isDated: false },
  { code: 'tyres', display: 'Tyres', icon: '🛞', isDated: false },
  { code: 'general_service', display: 'General Service', icon: '🔧', isDated: true },
  { code: 'other', display: 'Other', icon: '✳️', isDated: false },
];

export default function MaintenanceEntryScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [oilTypes, setOilTypes] = useState([]);
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [selectedOilType, setSelectedOilType] = useState('');
  const [cost, setCost] = useState('');
  const [odometer, setOdometer] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedService = SERVICE_TYPES.find(s => s.code === selectedServiceType);
  const isDatedService = selectedService?.isDated || false;

  useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
        setLoading(false);
      } catch (err) {
        console.error('Error loading riderId:', err);
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  useEffect(() => {
    api.get('/fuel-maintenance/oil-types')
      .then(res => {
        setOilTypes(res.data?.oil_types || []);
      })
      .catch(err => console.error('Failed to load oil types:', err));
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  const handleSave = useCallback(async () => {
    setError('');

    if (!selectedServiceType) {
      setError('Select a service type.');
      return;
    }

    if (!cost || parseFloat(cost) <= 0) {
      setError('Enter the service cost, greater than zero.');
      return;
    }

    if (!effectiveRiderId) {
      setError('Rider information not found. Please return to home.');
      return;
    }

    if (isDatedService) {
      if (!odometer || parseFloat(odometer) <= 0) {
        setError('Enter the odometer reading at time of service.');
        return;
      }
      if (!selectedOilType) {
        setError('Select an Oil Type — this drives the next service reminder.');
        return;
      }
    }

    const requestBody = {
      service_type_code: selectedServiceType,
      cost: parseFloat(cost),
    };

    if (isDatedService) {
      requestBody.odometer_reading = parseFloat(odometer);
      requestBody.oil_type_code = selectedOilType;
    }

    setSaving(true);
    try {
      await api.post(`/fuel-maintenance/maintenance-entry?rider_id=${effectiveRiderId}`, requestBody);

      // ✅ Auto-redirect to history
      navigation.navigate('MaintenanceHistory');
    } catch (err) {
      console.error('Save error:', err);
      setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [selectedServiceType, cost, odometer, selectedOilType, isDatedService, effectiveRiderId, navigation]);

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
      <Text style={styles.title}>Record Service Cost</Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* Service Type Tiles - Grid layout */}
      <Text style={styles.label}>Service Type <Text style={styles.required}>*</Text></Text>
      <View style={styles.tileGrid}>
        {SERVICE_TYPES.map((serviceType) => (
          <TouchableOpacity
            key={serviceType.code}
            style={[styles.tile, selectedServiceType === serviceType.code && styles.tileSelected]}
            onPress={() => {
              setSelectedServiceType(serviceType.code);
              setError('');
              // Reset dated fields when switching service type
              if (!serviceType.isDated) {
                setOdometer('');
                setSelectedOilType('');
              }
            }}
            disabled={saving}
          >
            <Text style={styles.tileEmoji}>{serviceType.icon}</Text>
            <Text style={[styles.tileLbl, selectedServiceType === serviceType.code && styles.tileLblSelected]}>
              {serviceType.display}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Conditional Fields - Only for Oil Change or General Service */}
      {isDatedService && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Oil Type <Text style={styles.required}>*</Text></Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedOilType}
                onValueChange={setSelectedOilType}
                style={styles.picker}
                enabled={!saving}
              >
                <Picker.Item label="Select..." value="" />
                {oilTypes.map((oil) => (
                  <Picker.Item
                    key={oil.code}
                    label={`${oil.name} — every ${oil.interval_km?.toLocaleString() || '?'} km`}
                    value={oil.code}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Odometer Reading Now <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 12500"
              placeholderTextColor="#b0a89d"
              keyboardType="number-pad"
              value={odometer}
              onChangeText={setOdometer}
              editable={!saving}
            />
            <Text style={styles.hint}>ℹ️ Enter today's reading. Next service odometer will be auto-calculated.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.labelSecondary}>Next Service Due <Text style={styles.hint}>(auto-calculated)</Text></Text>
            <Text style={styles.hint}>
              Enter the odometer reading and pick an Oil Type to calculate this.
            </Text>
            <Text style={[styles.hint, { marginTop: 6, fontStyle: 'italic' }]}>
              This is a reminder only, based on mileage — we'll alert you as you get closer, but it never stops you from changing the oil earlier.
            </Text>
          </View>
        </>
      )}

      {/* Service Cost - Always show */}
      <View style={styles.field}>
        <Text style={styles.label}>Service Cost <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 900"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={cost}
          onChangeText={setCost}
          editable={!saving}
        />
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (saving || !selectedServiceType || !cost || (isDatedService && (!odometer || !selectedOilType))) &&
            styles.primaryBtnDisabled,
        ]}
        onPress={handleSave}
        disabled={saving || !selectedServiceType || !cost || (isDatedService && (!odometer || !selectedOilType))}
      >
        <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Record Service Cost →'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 20 },

  errorBanner: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#f6cac7', borderRadius: 14, padding: 12, marginBottom: 14 },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },

  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.04, color: '#5b606c', marginBottom: 12 },
  labelSecondary: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.04, color: '#5b606c', marginBottom: 6 },
  required: { color: '#e5650a' },

  // Tile Grid Layout
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  tile: {
    width: '48%',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff7a1a',
  },
  tileEmoji: { fontSize: 28, marginBottom: 8 },
  tileLbl: { fontSize: 12, fontWeight: '600', color: '#5b606c', textAlign: 'center' },
  tileLblSelected: { color: '#ff7a1a' },

  field: { marginBottom: 16 },
  input: { width: '100%', padding: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#e7e4db', fontSize: 15, backgroundColor: '#fff', color: '#1a1c20' },
  pickerContainer: { borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#1a1c20' },
  hint: { fontSize: 11.5, color: '#5b606c', lineHeight: 18, marginTop: 6 },

  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, shadowColor: '#ff7a1a', shadowOpacity: 0.55, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});