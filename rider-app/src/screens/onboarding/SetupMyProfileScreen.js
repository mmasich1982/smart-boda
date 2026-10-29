// rider-app/src/screens/onboarding/SetupMyProfileScreen.js
// SETUP MY PROFILE: replaces "Set Up Your Bike" + Mobile Number + Profile Confirmation.
//   1. The rider types the MOBILE NUMBER their Group Treasurer registered.
//   2. We look it up and show their FULL NAME directly below (read-only: it comes from the Treasurer's record).
//   3. They choose their FUEL TYPE (this still decides "Fuel Motorcycle" vs "Charge Battery" on Home).
//   4. They accept the Terms / Privacy Notice, then continue to Create Your Login PIN.
// The rider account is created on the server by POST /onboarding/setup-profile; the rider_id it returns is stored locally
// (saveLocalRiderId -> getLocalRiderId) exactly as before, so CreatePin and Home behave unchanged.
// The fuel profile is also queued ('bike_profile') so the sync queue / orchestrator keep the server in step if the
// connection drops right after this screen.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Checkbox from 'expo-checkbox';
import OnboardingProgressBar from '../../components/OnboardingProgressBar';
import FormField from '../../components/FormField';
import DropdownField from '../../components/DropdownField';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import useMasterData from '../../hooks/useMasterData';
import { useToast } from '../../components/Toast';
import api from '../../api/client';
import { CURRENT_TERMS_VERSION } from '../../constants/legal';
import {
  saveLocalBikeProfile,
  saveLocalRiderStatus,
  saveLocalRiderId,
  getLocalLanguage,
} from '../../offline/db';
import { enqueue } from '../../offline/syncQueue';

export const KENYA_MSISDN = /^(\+254|254|0)(7|1)\d{8}$/;
export const cleanMobile = (v) => (v || '').replace(/[\s-]/g, '');

export default function SetupMyProfileScreen({ navigation }) {
  const { fuelTypes } = useMasterData();
  const { t, hasTranslation } = useTranslation();
  const { showToast } = useToast();
  const [mobile, setMobile] = useState('');
  const [mobileError, setMobileError] = useState(null);
  const [lookup, setLookup] = useState('idle'); // idle | looking | found | notfound | registered | offline
  const [fullName, setFullName] = useState('');
  const [source, setSource] = useState('');   // member | treasurer | individual (pre-registered by Smart Boda, no group)
  const [fuelType, setFuelType] = useState('');
  const [fuelError, setFuelError] = useState(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const seq = useRef(0);

  // Look the number up as soon as it is a complete Kenyan number.
  useEffect(() => {
    const m = cleanMobile(mobile);
    setSaveError(null);
    if (!m) { setMobileError(null); setLookup('idle'); setFullName(''); return; }
    if (!KENYA_MSISDN.test(m)) {
      setLookup('idle'); setFullName('');
      setMobileError(m.length >= 10 ? t('setup.mobile_invalid') || 'Enter a valid Kenyan mobile number.' : null);
      return;
    }
    setMobileError(null);
    const mine = ++seq.current;
    setLookup('looking'); setFullName(''); setSource('');
    (async () => {
      try {
        const res = await api.get(`/onboarding/profile-lookup/${encodeURIComponent(m)}`);
        if (mine !== seq.current) return;
        setFullName(res.data.full_name || '');
        setSource(res.data.source || '');
        setLookup('found');
      } catch (err) {
        if (mine !== seq.current) return;
        const status = err.response?.status;
        if (status === 404) { setLookup('notfound'); setMobileError(t('setup.mobile_not_found') || 'We could not find this number. Ask your Group Treasurer to register you, or contact Smart Boda to be added as an individual rider, then try again.'); }
        else if (status === 409) { setLookup('registered'); setMobileError(t('setup.already_registered') || 'This number is already set up. Please log in with your PIN.'); }
        else if (status === 400) { setLookup('idle'); setMobileError(t('setup.mobile_invalid') || 'Enter a valid Kenyan mobile number.'); }
        else { setLookup('offline'); }
      }
    })();
    // t is recreated on each render; only the typed number should trigger a lookup.
  }, [mobile]);

  function validate() {
    let ok = true;
    if (lookup !== 'found') {
      if (!mobileError) setMobileError(KENYA_MSISDN.test(cleanMobile(mobile)) ? null : (t('setup.mobile_invalid') || 'Enter a valid Kenyan mobile number.'));
      ok = false;
    }
    if (!fuelType) { setFuelError(t('setup.fuel_required') || 'Please select the fuel type of your motorcycle.'); ok = false; } else setFuelError(null);
    if (!consent) { setConsentError(t('profile.consent_required')); ok = false; } else setConsentError(null);
    return ok;
  }

  async function handleContinue() {
    if (saving || !validate()) return;
    setSaving(true); setSaveError(null);
    try {
      const language_code = (await getLocalLanguage()) || undefined;
      const res = await api.post('/onboarding/setup-profile', {
        mobile_number: cleanMobile(mobile),
        fuel_type_code: fuelType,
        consent_accepted: true,
        consent_content_version: CURRENT_TERMS_VERSION,
        language_code,
      });
      const riderId = res.data.rider_id;
      const name = res.data.full_name || fullName;
      const submittedAt = new Date().toISOString();
      // rider_id is generated by the server, stored locally and used by CreatePin / Home / syncQueue from here on.
      await saveLocalRiderStatus({
        rider_id: riderId,
        onboarding_step: 'createPin',
        registration_status: 'verified_incomplete',
        mobile_number: res.data.mobile_number,
        full_name: name,
        county_id: res.data.county_id,
        sub_county_id: res.data.sub_county_id,
        ward_id: res.data.ward_id,
      });
      await saveLocalRiderId(riderId);
      console.log('[SetupMyProfile] Saved rider_id:', riderId);
      const record = { fuel_type_code: fuelType, mobile_number: res.data.mobile_number, submitted_at: submittedAt };
      await saveLocalBikeProfile(record);
      await enqueue('bike_profile', record);
      showToast(t('setup.saved') || 'Profile saved. Now create your login PIN.');
      navigation.navigate('CreatePin', { riderId });
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) setMobileError(t('setup.mobile_not_found') || 'We could not find this number. Ask your Group Treasurer to register you, or contact Smart Boda to be added as an individual rider, then try again.');
      else if (status === 409) setMobileError(t('setup.already_registered') || 'This number is already set up. Please log in with your PIN.');
      else setSaveError(t('setup.save_error') || 'We could not save your profile. Please try again.');
      console.error('Error saving profile:', err?.message || err);
    } finally {
      setSaving(false);
    }
  }

  const nameHint = lookup === 'looking' ? (t('setup.looking_up') || 'Looking up your number…')
    : lookup === 'offline' ? (t('setup.need_connection') || 'Connect to the internet to find your name, then continue.')
    : lookup === 'found' && source === 'individual' ? ((typeof hasTranslation === 'function' && hasTranslation('setup.name_hint_individual')) ? t('setup.name_hint_individual') : 'This is the name Smart Boda registered for you.')
    : lookup === 'found' ? (t('setup.name_hint') || 'This is the name your Group Treasurer registered.')
    : (t('setup.name_waiting') || 'Enter your mobile number to see your name.');

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.backLink} onPress={() => navigation.goBack()}>← Back</Text>
      <OnboardingProgressBar currentStep="setupProfile" />
      <View style={styles.eyebrow}><Text style={styles.eyebrowText}>{t('setup.eyebrow') || '🔑 Almost there'}</Text></View>
      <Text style={styles.title}>{t('setup.title') || 'Setup My Profile'}</Text>
      <Text style={styles.sub}>{t('setup.subtitle') || 'Enter the mobile number your Group Treasurer registered. We find your name, you choose your fuel type, and you are set.'}</Text>

      <FormField
        label={t('setup.mobile_label') || 'Mobile Number'}
        value={mobile}
        onChangeText={setMobile}
        keyboardType="phone-pad"
        maxLength={15}
        placeholder={t('setup.mobile_placeholder') || '07XX XXX XXX'}
        error={mobileError}
        required={true}
      />

      <View>
        <FormField
          label={t('setup.name_label') || 'Full Name'}
          value={fullName}
          onChangeText={() => {}}
          editable={false}
          placeholder="—"
          helperText={nameHint}
        />
        {lookup === 'looking' && <ActivityIndicator size="small" color="#ffc107" style={styles.spinner} />}
      </View>

      <DropdownField
        label={t('setup.fuel_label') || 'Fuel Type'}
        value={fuelType}
        onValueChange={setFuelType}
        placeholder="Select..."
        options={fuelTypes.map((f) => ({ label: f.display_name, value: f.code }))}
        error={fuelError}
        required={true}
      />

      <View style={styles.checkboxRow}>
        <Checkbox value={consent} onValueChange={setConsent} color={consent ? '#ffc107' : undefined} />
        <Text style={styles.consentLabel}>
          {t('profile.consent_prefix')}{' '}
          <Text style={styles.link} onPress={() => navigation.navigate('TermsOfService')}>{t('profile.terms_link')}</Text>
          {' '}{t('profile.consent_middle')}{' '}
          <Text style={styles.link} onPress={() => navigation.navigate('DataPrivacy')}>{t('profile.privacy_link')}</Text>
          {t('profile.consent_suffix')}
        </Text>
      </View>
      {consentError ? <Text style={styles.error}>⚠️ {consentError}</Text> : null}
      {saveError ? <Text style={styles.error}>⚠️ {saveError}</Text> : null}

      <View style={styles.trustNote}>
        <Text>🔒</Text>
        <Text style={styles.trustNoteText}>{t('setup.trust_note') || 'Your name and group come from your Treasurer. Your details are kept private on your phone and our secure servers.'}</Text>
      </View>

      <PrimaryButton
        label={t('setup.continue') || 'Continue →'}
        glow
        onPress={handleContinue}
        disabled={saving || lookup !== 'found' || !fuelType || !consent}
      />
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
  spinner: { position: 'absolute', right: 14, top: 34 },
  checkboxRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8, marginTop: 2 },
  consentLabel: { fontSize: 11, color: '#5b606c', flex: 1, lineHeight: 17 },
  link: { color: '#e5650a', fontWeight: '700' },
  error: { color: '#e0453f', fontSize: 11, marginBottom: 10, fontWeight: '700' },
  trustNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: '#f2f6fb', borderRadius: 10, padding: 9, marginTop: 6, marginBottom: 10 },
  trustNoteText: { fontSize: 10.5, color: '#5b606c', lineHeight: 15, flex: 1 },
});
