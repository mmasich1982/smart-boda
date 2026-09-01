// rider-app/src/screens/onboarding/ProfileConfirmationScreen.js
// FIXED: Now saves rider_id to both rider_status AND separate rider_id key for RiderContext access

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Checkbox from 'expo-checkbox';
import NetInfo from '@react-native-community/netinfo';
import OnboardingProgressBar from '../../components/OnboardingProgressBar';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';
import { CURRENT_TERMS_VERSION } from '../../constants/legal';
import { saveLocalRiderStatus, saveLocalRiderId } from '../../offline/db';

// SB-03-B. Onboarding step 4 of 5, matching cleaned.html's screenProfileConfirm exactly:
// full name (with "edit anytime later" hint), one checkbox-row consent whose "Terms of Service" and
// "Data Privacy Notice" words are tappable links that push TermsOfServiceScreen / DataPrivacyScreen
// (BR-RA01-020), and an online/offline activation-status badge above Continue.
// Issue 11 fix: Added required={true} to Full Name field to display red asterisk
// Issue 12 fix: Backend validates uniqueness and returns 409 if duplicate
// FIXED: Now properly saves rider_id to both rider_status and separate rider_id key
export default function ProfileConfirmationScreen({ route, navigation }) {
  // AUDIT FIX: MobileNumberScreen.js has always navigated here with `{ riderId }` in route
  // params, but this component never accepted `route` as a prop at all -- riderId was
  // silently dropped, never persisted, and never forwarded to CreatePinScreen. This is why
  // riderId ends up undefined on every screen past onboarding (see RiderContext.js).
  const { riderId } = route.params || {};
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [nameError, setNameError] = useState(null);
  const [consent, setConsent] = useState(false); // BR-SB03-007: never defaults to checked
  const [consentError, setConsentError] = useState(null);
  const [online, setOnline] = useState(true);

  React.useEffect(() => NetInfo.addEventListener((state) => setOnline(!!state.isConnected)), []);

  async function handleContinue() {
    let ok = true;
    if (!fullName.trim()) { 
      setNameError(t('profile.name_required'));
      ok = false; 
    } else setNameError(null);
    
    if (!consent) { 
      setConsentError(t('profile.consent_required'));
      ok = false; 
    } else setConsentError(null);
    
    if (!ok) return;

    try {
      await api.post('/onboarding/profile-confirm', {
        full_name: fullName.trim(),
        consent_accepted: true,
        consent_content_version: CURRENT_TERMS_VERSION,
      }, {
        params: { rider_id: riderId }
      }); // EXC-SB03-012: queued locally and retried automatically if offline — badge above reflects this
      
      // AUDIT FIX: persist rider_id now that it's actually available — RiderContext.js reads
      // this at app startup so every later screen (Home, New Trip, Financial Performance,
      // etc.) has it, instead of it being lost right here.
      if (riderId) {
        // ✅ FIXED: Save to both rider_status object AND separate rider_id key
        await saveLocalRiderStatus({ 
          rider_id: riderId, 
          onboarding_step: 'createPin' 
        });
        // ✅ FIXED: Also save to separate rider_id key for RiderContext to find
        await saveLocalRiderId(riderId);
        console.log('[ProfileConfirmation] Saved rider_id:', riderId);
      }
      
      // Issue 13 fix: Use navigate() instead of replace() to preserve back stack and allow proper back navigation
      navigation.navigate('CreatePin', { riderId }); // final onboarding step
    } catch (err) {
      if (err.response?.status === 409) {
        // Issue 12: Duplicate full name check
        setNameError(t('profile.name_duplicate'));
      } else {
        setNameError(t('profile.save_error'));
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.backLink} onPress={() => navigation.goBack()}>← Back</Text>
      <OnboardingProgressBar currentStep="profileConfirm" />
      <Text style={styles.title}>{t('profile.title')}</Text>

      {/* Issue 11 fix: Added required={true} to show red asterisk */}
      <FormField 
        label={t('profile.name_label')}
        value={fullName} 
        onChangeText={setFullName} 
        maxLength={80}
        placeholder={t('profile.name_placeholder')}
        error={nameError}
        required={true}
      />
      <Text style={styles.hint}>{t('profile.name_hint')}</Text>

      <View style={styles.checkboxRow}>
        <Checkbox value={consent} onValueChange={setConsent} color={consent ? '#ffc107' : undefined} />
        <Text style={styles.consentLabel}>
          {t('profile.consent_prefix')}{' '}
          <Text style={styles.link} onPress={() => navigation.navigate('TermsOfService')}>
            {t('profile.terms_link')}
          </Text>
          {' '}{t('profile.consent_middle')}{' '}
          <Text style={styles.link} onPress={() => navigation.navigate('DataPrivacy')}>
            {t('profile.privacy_link')}
          </Text>
          {t('profile.consent_suffix')}
        </Text>
      </View>
      {consentError && <Text style={styles.error}>⚠️ {consentError}</Text>}

      <View style={[styles.badge, online ? styles.badgeGreen : styles.badgeAmber]}>
        <Text style={[styles.badgeText, online ? styles.badgeTextGreen : styles.badgeTextAmber]}>
          {online ? t('profile.online_badge') : t('profile.offline_badge')}
        </Text>
      </View>

      <PrimaryButton 
        label={t('profile.continue')}
        onPress={handleContinue} 
        disabled={!fullName || !consent} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef', padding: 20 },
  backLink: { fontSize: 12, fontWeight: '700', color: '#5b606c', marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: '#1a1c20', marginBottom: 14 },
  hint: { fontSize: 11, color: '#5b606c', marginTop: -8, marginBottom: 14 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 13, padding: 12, marginBottom: 14 },
  consentLabel: { fontSize: 11, color: '#5b606c', flex: 1, lineHeight: 17 },
  link: { color: '#ffb300', fontWeight: '700' },
  error: { color: '#e0453f', fontSize: 11, marginBottom: 10, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, marginBottom: 16 },
  badgeGreen: { backgroundColor: '#e6f5ef' },
  badgeAmber: { backgroundColor: '#fdf3df' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextGreen: { color: '#1e9e6f' },
  badgeTextAmber: { color: '#c98a12' },
});