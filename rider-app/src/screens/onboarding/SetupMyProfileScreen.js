// rider-app/src/screens/onboarding/SetupMyProfileScreen.js
// SETUP MY PROFILE (screen 3 of onboarding, Smart Boda + Smart Bizna). One screen, two kinds of person:
//   1. The person types the MOBILE NUMBER an Admin (or their Group Treasurer) registered.
//   2. We look it up and show their FULL NAME directly below (read-only: it comes from the registration).
//   3. Only once the number is found, a rider gets ONE choice:
//        a rider (group member, Treasurer, individual rider)          -> FUEL TYPE (still decides "Fuel Motorcycle" vs "Charge Battery")
//        a business user (Business Owner or Sales/Service Person)    -> NO choice: the BUSINESS TYPE the Admin chose is shown read-only under the name
//   4. They accept the Terms / Privacy Notice, then continue to Create Your Login PIN.
// The account is created on the server by POST /onboarding/setup-profile; the rider_id it returns is stored locally
// (saveLocalRiderId -> getLocalRiderId) exactly as before, so CreatePin behaves unchanged.
// A rider's fuel profile is also queued ('bike_profile') exactly as before. A business user has no bike; the server already holds the
// business type, and the business sync queue arrives with the Smart Bizna Home release.
// The rules live in utils/setupProfileLogic.js (unit-tested).
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
import {
  KENYA_MSISDN,
  cleanMobile,
  userTypeFromLookup,
  businessTypeLabel,
  showBusinessTypeField,
  nameHintKey,
  NAME_HINT_DEFAULTS,
  canContinue,
  buildSetupBody,
  localStatusFrom,
} from '../../utils/setupProfileLogic';

export { KENYA_MSISDN, cleanMobile };   // kept as exports of this screen, as before

const NOT_FOUND_DEFAULT = 'We could not find this number. Ask your Admin or your Group Treasurer to register you, then try again.';

export default function SetupMyProfileScreen({ navigation }) {
  const { fuelTypes } = useMasterData();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [mobile, setMobile] = useState('');
  const [mobileError, setMobileError] = useState(null);
  const [lookup, setLookup] = useState('idle'); // idle | looking | found | notfound | registered | offline
  const [fullName, setFullName] = useState('');
  const [source, setSource] = useState('');       // member | treasurer | individual | business
  const [userType, setUserType] = useState('rider'); // rider | business (decided by the server from the number)
  const [businessTypeName, setBusinessTypeName] = useState('');   // business user: the type the Administrator chose, shown READ-ONLY
  const [fuelType, setFuelType] = useState('');
  const [typeError, setTypeError] = useState(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const seq = useRef(0);

  // Look the number up as soon as it is a complete Kenyan number.
  useEffect(() => {
    const m = cleanMobile(mobile);
    setSaveError(null); setTypeError(null);
    setFuelType(''); setUserType('rider'); setBusinessTypeName('');
    if (!m) { setMobileError(null); setLookup('idle'); setFullName(''); setSource(''); return; }
    if (!KENYA_MSISDN.test(m)) {
      setLookup('idle'); setFullName(''); setSource('');
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
        setUserType(userTypeFromLookup(res.data));
        setBusinessTypeName(businessTypeLabel(res.data));
        setLookup('found');
      } catch (err) {
        if (mine !== seq.current) return;
        const status = err.response?.status;
        if (status === 404) { setLookup('notfound'); setMobileError(t('setup.mobile_not_found') || NOT_FOUND_DEFAULT); }
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
    // A rider chooses the fuel type. A business user (Owner or Sales/Service Person) chooses NOTHING: the Business Type was set by the Administrator
    // at pre-registration, so they only confirm the number, accept the terms and finish.
    if (userType !== 'business' && userType !== 'admin') {      // ADMIN APP: an Administrator chooses nothing either
      if (!fuelType) { setTypeError(t('setup.fuel_required') || 'Please select the fuel type of your motorcycle.'); ok = false; } else setTypeError(null);
    } else setTypeError(null);
    if (!consent) { setConsentError(t('profile.consent_required')); ok = false; } else setConsentError(null);
    return ok;
  }

  async function handleContinue() {
    if (saving || !validate()) return;
    setSaving(true); setSaveError(null);
    try {
      const language = (await getLocalLanguage()) || undefined;
      if (userType === 'admin') {
        // ADMIN APP: an Administrator (admin_user table). Same screen, same terms, but no fuel type / business type, and no rider record:
        // the server only notes the consent and the person goes on to create the app PIN.
        const ares = await api.post('/admin/app/setup-profile', {
          mobile_number: mobile, consent_accepted: true, consent_content_version: CURRENT_TERMS_VERSION, language_code: language,
        });
        await saveLocalRiderStatus(localStatusFrom({ ...ares.data, user_type: 'admin' }, fullName));   // kept under admin_id, never rider_id
        showToast(t('setup.saved') || 'Profile saved. Now create your login PIN.');
        navigation.navigate('CreatePin', { adminId: ares.data.admin_id, userType: 'admin', mobile: ares.data.mobile_number });
        return;
      }
      const res = await api.post('/onboarding/setup-profile', buildSetupBody({
        mobile, userType, fuelType, language, termsVersion: CURRENT_TERMS_VERSION,
      }));
      const riderId = res.data.rider_id;
      const submittedAt = new Date().toISOString();
      // rider_id is generated by the server, stored locally and used by CreatePin / Home / syncQueue from here on.
      await saveLocalRiderStatus(localStatusFrom(res.data, fullName));
      await saveLocalRiderId(riderId);
      console.log('[SetupMyProfile] Saved rider_id:', riderId);
      if (res.data.user_type !== 'business') {
        const record = { fuel_type_code: fuelType, mobile_number: res.data.mobile_number, submitted_at: submittedAt };
        await saveLocalBikeProfile(record);
        await enqueue('bike_profile', record);
      }
      showToast(t('setup.saved') || 'Profile saved. Now create your login PIN.');
      navigation.navigate('CreatePin', { riderId });
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) setMobileError(t('setup.mobile_not_found') || NOT_FOUND_DEFAULT);
      else if (status === 409) setMobileError(t('setup.already_registered') || 'This number is already set up. Please log in with your PIN.');
      else setSaveError(t('setup.save_error') || 'We could not save your profile. Please try again.');
      console.error('Error saving profile:', err?.message || err);
    } finally {
      setSaving(false);
    }
  }

  const hintKey = nameHintKey(lookup, source);
  const nameHint = t(hintKey) || NAME_HINT_DEFAULTS[hintKey];
  const showType = lookup === 'found';   // the one choice appears only once the number is found (prototype v45)

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.backLink} onPress={() => navigation.goBack()}>← Back</Text>
      <OnboardingProgressBar currentStep="setupProfile" />
      <View style={styles.eyebrow}><Text style={styles.eyebrowText}>{t('setup.eyebrow') || '🔑 Almost there'}</Text></View>
      <Text style={styles.title}>{t('setup.title') || 'Setup My Profile'}</Text>
      <Text style={styles.sub}>{t('setup.subtitle') || 'Enter the mobile number your Admin or Group Treasurer registered. We find your name, you complete one choice, and you are set.'}</Text>

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
        {lookup === 'registered' && (          /* ADMIN APP: an Administrator already set up (on another phone, or after Logout) signs in with number + PIN */
          <Text style={styles.link} onPress={() => navigation.navigate('PinLogin', { adminMode: true, mobile })}>Administrator? Log in with your number and PIN →</Text>
        )}
      </View>

      {showBusinessTypeField(lookup, userType) && (        /* read-only, fetched from the server exactly like the name: the Administrator chose it */
        <FormField
          label={t('setup.business_type_label') || 'Business Type'}
          value={businessTypeName}
          onChangeText={() => {}}
          editable={false}
          placeholder="—"
          helperText={t('setup.business_type_hint') || 'This is the business type your Admin registered.'}
        />
      )}

      {showType && userType === 'rider' && (
        <DropdownField
          label={t('setup.fuel_label') || 'Fuel Type'}
          value={fuelType}
          onValueChange={(v) => { setFuelType(v); setTypeError(null); }}
          placeholder="Select..."
          options={fuelTypes.map((f) => ({ label: f.display_name, value: f.code }))}
          error={typeError}
          required={true}
        />
      )}

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
        <Text style={styles.trustNoteText}>{t('setup.trust_note') || 'Your name comes from your Admin or Group Treasurer registration. Your details are kept private on your phone and our secure servers.'}</Text>
      </View>

      <PrimaryButton
        label={t('setup.continue') || 'Continue →'}
        glow
        onPress={handleContinue}
        disabled={!canContinue({ lookup, userType, fuelType, consent, saving })}
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
