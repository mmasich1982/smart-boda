// rider-app/src/screens/onboarding/MobileNumberScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import OnboardingProgressBar from '../../components/OnboardingProgressBar';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';

const KENYA_MSISDN = /^(\+254|0)(7|1)\d{8}$/;

// SB-03-A. No OTP or SMS verification in MVP0 — the number is format-validated client-side
// FIXED: Added unique mobile number validation (no duplicates)
export default function MobileNumberScreen({ navigation }) {
  const { t } = useTranslation();
  const [number, setNumber] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    if (!KENYA_MSISDN.test(number)) {
      setError(t('number.invalid'));
      return;
    }
    try {
      setSending(true);
      const res = await api.post('/onboarding/mobile-number', { mobile_number: number });
      navigation.navigate('ProfileConfirmation', { riderId: res.data.rider_id });
    } catch (err) {
      if (err.response?.status === 409) {
        // FIXED: Unique validation - mobile number already registered
        setError(t('number.duplicate') || 'This mobile number is already registered. Please use a different number or log in.');
      } else {
        setError(t('number.error') || "We couldn't save your number. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* NO Smart Boda branding - only in app-topbar */}
      
      <Text style={styles.backLink} onPress={() => navigation.goBack()}>← Back</Text>
      <OnboardingProgressBar currentStep="number" />
      <Text style={styles.title}>{t('number.title') || 'One Last Step'}</Text>
      <Text style={styles.sub}>{t('number.subtitle') || 'Enter your mobile number to continue.'}</Text>
      
      {/* Bonus banner */}
      <View style={styles.bonusBanner}>
        <Text style={styles.bonusText}>{t('number.bonus_banner') || '🎁 Unlock 2 free hours of Smart Boda Access — clear, simple insights into your earnings and expenses from your very first trip.'}</Text>
      </View>
      
      <FormField 
        label={t('number.label') || 'Mobile Number'}
        value={number} 
        onChangeText={setNumber}
        keyboardType="phone-pad" 
        maxLength={15} 
        placeholder="07XX XXX XXX" 
        error={error}
        required={true}
      />
      
      <PrimaryButton 
        label={sending ? (t('number.saving') || 'Saving…') : (t('number.continue') || 'Continue →')} 
        onPress={handleSubmit} 
        disabled={sending || !number} 
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef', padding: 20 },
  backLink: { fontSize: 12, fontWeight: '700', color: '#5b606c', marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: '#1a1c20', marginBottom: 6 },
  sub: { fontSize: 12, color: '#5b606c', marginBottom: 14 },
  bonusBanner: { backgroundColor: '#fdf3df', borderRadius: 13, padding: 13, marginBottom: 14 },
  bonusText: { fontSize: 11.5, color: '#8a5c0d', lineHeight: 17 },
});