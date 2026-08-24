// rider-app/src/screens/onboarding/BikeProfileScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import OnboardingProgressBar from '../../components/OnboardingProgressBar';
import FormField from '../../components/FormField';
import DropdownField from '../../components/DropdownField';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import useMasterData from '../../hooks/useMasterData';
import { useToast } from '../../components/Toast';
import api from '../../api/client';
import { saveLocalBikeProfile, checkLocalPlateCache } from '../../offline/db';
import { enqueue } from '../../offline/syncQueue';

// SB-02-A + SB-02-B combined, matching the single-screen prototype flow exactly
// FIXED: NO Smart Boda branding header (only appears in app-topbar)
// FIXED: Unique plate validation with backend check
export default function BikeProfileScreen({ navigation }) {
  const { fuelTypes } = useMasterData();
  const { t } = useTranslation();
  const [plate, setPlate] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [plateError, setPlateError] = useState(null);
  const [fuelError, setFuelError] = useState(null);
  const [localDuplicateWarning, setLocalDuplicateWarning] = useState(null);
  const [validatingPlate, setValidatingPlate] = useState(false);
  const { showToast } = useToast();

  async function handlePlateBlur() {
    const cleaned = plate.trim().toUpperCase();
    if (!cleaned) return;
    
    setValidatingPlate(true);
    try {
      const localMatch = await checkLocalPlateCache(cleaned);
      if (localMatch) {
        setLocalDuplicateWarning(t('bike.local_duplicate_warning'));
        return;
      }
      
      try {
        const res = await api.get(`/onboarding/check-plate-uniqueness/${cleaned}`);
        if (res.data.exists) {
          setLocalDuplicateWarning(t('bike.global_duplicate_warning') || 'This number plate is already registered to another rider.');
        } else {
          setLocalDuplicateWarning(null);
        }
      } catch (err) {
        setLocalDuplicateWarning(null);
      }
    } finally {
      setValidatingPlate(false);
    }
  }

  function validate() {
    let ok = true;
    const cleaned = plate.trim();
    if (!cleaned || !/[a-zA-Z0-9]/.test(cleaned)) {
      setPlateError(t('bike.plate_required'));
      ok = false;
    } else { setPlateError(null); }
    
    if (!fuelType) {
      setFuelError(t('bike.fuel_required'));
      ok = false;
    } else { setFuelError(null); }
    return ok;
  }

  async function handleContinue() {
    if (!validate()) return;
    const submittedAt = new Date().toISOString();
    const record = { number_plate: plate.trim().toUpperCase(), fuel_type_code: fuelType, submitted_at: submittedAt };
    await saveLocalBikeProfile(record);
    await enqueue('bike_profile', record);
    showToast(t('bike.saved') || 'Bike details saved. Continuing setup…');
    navigation.navigate('MobileNumber');
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* NO Smart Boda branding here - only in app-topbar per cleaned.html */}
      
      <Text style={styles.backLink} onPress={() => navigation.goBack()}>← Back</Text>
      <OnboardingProgressBar currentStep="bikeProfile" />
      <View style={styles.eyebrow}><Text style={styles.eyebrowText}>🔑 Almost there</Text></View>
      <Text style={styles.title}>{t('bike.title') || 'Set Up Your Bike'}</Text>
      <Text style={styles.sub}>{t('bike.subtitle') || 'A few quick details and this bike is fully set up. Works even with no internet.'}</Text>
      
      <FormField
        label={t('bike.plate_label') || 'Number Plate'}
        value={plate}
        onChangeText={setPlate}
        onBlur={handlePlateBlur}
        autoUppercase
        maxLength={12}
        placeholder="e.g. KMEA 001A"
        error={plateError}
        required={true}
      />
      {localDuplicateWarning && (
        <Text style={styles.warning}>
          {validatingPlate ? '🔄 Checking...' : localDuplicateWarning}
        </Text>
      )}

      <DropdownField
        label={t('bike.fuel_label') || 'Fuel Type'}
        value={fuelType}
        onValueChange={setFuelType}
        placeholder="Select..."
        options={fuelTypes.map((f) => ({ label: f.display_name, value: f.code }))}
        error={fuelError}
        required={true}
      />

      <View style={styles.trustNote}>
        <Text>🔒</Text>
        <Text style={styles.trustNoteText}>{t('bike.trust_note') || 'Saved straight to your phone and kept private — it just helps us set your tools up right.'}</Text>
      </View>

      <PrimaryButton label="Continue →" glow onPress={handleContinue} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef', padding: 20 },
  backLink: { fontSize: 12, fontWeight: '700', color: '#5b606c', marginBottom: 10 },
  eyebrow: { alignSelf: 'flex-start', backgroundColor: '#e6f5ef', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, marginBottom: 12 },
  eyebrowText: { color: '#1e9e6f', fontSize: 11, fontWeight: '700' },
  title: { fontSize: 19, fontWeight: '800', color: '#1a1c20', marginBottom: 6 },
  sub: { fontSize: 12, color: '#5b606c', marginBottom: 14, lineHeight: 18 },
  warning: { fontSize: 11, color: '#c98a12', marginTop: -6, marginBottom: 10 },
  trustNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: '#f2f6fb', borderRadius: 10, padding: 9, marginTop: 6, marginBottom: 10 },
  trustNoteText: { fontSize: 10.5, color: '#5b606c', lineHeight: 15, flex: 1 },
});