// rider-app/src/screens/onboarding/ValuePreviewScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import HeroBand from '../../components/HeroBand';
import ProgressStatCard from '../../components/ProgressStatCard';
import PrimaryButton from '../../components/PrimaryButton';
import CustomerCareFooter from '../../components/CustomerCareFooter';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';
import { getLocalLanguage } from '../../offline/db';

// SB-01-B: display-only, no personal data captured. Onboarding step 1 of 6.
// The illustrative income/cost/profit figures are Super Admin master data (value_preview_config),
// never hardcoded here — MobileNumberScreen and every screen after this reads live rider data instead.
export default function ValuePreviewScreen({ navigation }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const { t, languageCode } = useTranslation();

  useEffect(() => {
    (async () => {
      const lang = await getLocalLanguage() || languageCode || 'en';
      try {
        const res = await api.get(`/onboarding/value-preview/${lang}`);
        setPreview(res.data);
      } catch (err) {
        // EXC-SB01-006: generic fallback copy instead of a blank field, use default illustrative data
        // ✅ Using t() here for internationalization - translates fallback message based on current languageCode
        setPreview({ 
          fallback: true,
          sample_weekly_earnings_ksh: 14200,
          sample_weekly_costs_ksh: 3650,
          message: t('preview.fallback') || 'Track your daily boda earnings, costs, and profit — automatically.'
        });
      } finally {
        setLoading(false);
      }
    })();
    // ✅ FIXED: Only include languageCode in dependencies
    // Why: languageCode triggers refetch when user changes language
    // The t() function is used inside via closure and will automatically have the correct translations
    // Including t in dependencies would cause infinite loop (t is recreated on every render)
  }, [languageCode]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ffc107" />
      </View>
    );
  }

  const net = preview ? (preview.sample_weekly_earnings_ksh - preview.sample_weekly_costs_ksh) : 0;
  // ✅ All text labels use t() for internationalization
  const earnedLabel = t('preview.earned_label') || 'Money earned';
  const costLabel = t('preview.cost_label') || 'Fuel & service';
  const netLabel = t('preview.net_label') || 'Money kept (profit)';
  const hintText = t('preview.hint') || 'We work out these numbers for you, from your trips. No pen. No paper. No guessing.';

  const handleBack = () => {
    navigation.navigate('LanguageSelection');
  };

  return (
    <View style={styles.container}>
      <HeroBand 
        onBack={handleBack} 
        eyebrow={t('preview.eyebrow') || '✨ A peek at what\'s waiting for you'}
        title={t('preview.title') || 'This Could Be Your Week 💰'}
        subtitle={t('preview.subtitle') || 'This is what riders see every week, once their bike is set up.'} 
      />

      <View style={styles.contentContainer}>
        {preview && (
          <ProgressStatCard
            earnedLabel={earnedLabel}
            earnedValue={preview.sample_weekly_earnings_ksh}
            costLabel={costLabel}
            costValue={preview.sample_weekly_costs_ksh}
            netLabel={netLabel}
            netValue={net}
            showHint={true}
            hintText={hintText}
          />
        )}
      </View>

      <PrimaryButton 
        label={t('preview.cta') || 'Set Up My Bike Now →'}
        glow 
        onPress={() => navigation.navigate('BikeProfile')} 
      />
      <CustomerCareFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef', paddingHorizontal: 20 },
  contentContainer: { marginBottom: 20 },
});