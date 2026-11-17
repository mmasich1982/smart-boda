// rider-app/src/screens/onboarding/ValuePreviewScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import HeroBand from '../../components/HeroBand';
import ProgressStatCard from '../../components/ProgressStatCard';
import PrimaryButton from '../../components/PrimaryButton';
import CustomerCareFooter from '../../components/CustomerCareFooter';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';
import { getLocalLanguage } from '../../offline/db';

// SB-01-B / prototype v45, screen 2 "A peek at what's waiting for you": display-only, no personal data captured.
// Smart Bizna: no brand (neither Smart Boda nor Smart Bizna), shop watermark, an Example weekly progress card, the three ticks,
// a trust note and "Set Up My Business Now". Everyone sees it before the app knows who they are; the number is asked next.
// The illustrative income/cost/profit figures are Super Admin master data (value_preview_config),
// never hardcoded here — Setup My Profile and every screen after this reads live data instead.
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
          message: t('preview.fallback') || 'Track your daily sales, costs, and profit — automatically.'
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
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#ffc107" />
      </View>
    );
  }

  const net = preview ? (preview.sample_weekly_earnings_ksh - preview.sample_weekly_costs_ksh) : 0;
  // ✅ All text labels use t() for internationalization
  const earnedLabel = t('preview.earned_label') || 'Money earned';
  const costLabel = t('preview.cost_label') || 'Running expenses';
  const netLabel = t('preview.net_label') || 'Money kept (profit)';
  const hintText = t('preview.hint') || 'We work out these numbers for you, from your sales. No pen. No paper. No guessing.';
  const ticks = [
    t('preview.tick1') || 'See how much you really made — every single day.',
    t('preview.tick2') || 'Know your true profit after expenses.',
    t('preview.tick3') || 'Works even when you have no internet.',
  ];

  const handleBack = () => {
    navigation.navigate('LanguageSelection');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <HeroBand
        watermark="🏪"
        onBack={handleBack}
        eyebrow={t('preview.eyebrow') || '✨ A peek at what\'s waiting for you'}
        title={t('preview.title') || 'This Could Be Your Week 💰'}
        subtitle={t('preview.subtitle') || 'This is what business owners see every month, once you\'re set up.'}
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

      <View style={styles.ticksCard}>
        {ticks.map((line, i) => (
          <View key={i} style={[styles.tickRow, i === ticks.length - 1 && styles.tickRowLast]}>
            <Text style={styles.tick}>✅</Text>
            <Text style={styles.tickText}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={styles.trustNote}>
        <Text>🔒</Text>
        <Text style={styles.trustNoteText}>{t('preview.trust_note') || 'Just two quick questions about your business, and this is yours. We only ask what we truly need — your information is never shared without your say-so.'}</Text>
      </View>

      <PrimaryButton 
        label={t('preview.cta') || 'Set Up My Business Now →'}
        glow 
        onPress={() => navigation.navigate('SetupProfile')} 
      />
      <CustomerCareFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  loading: { flex: 1, backgroundColor: '#f6f4ef', paddingHorizontal: 20, justifyContent: 'center' },
  contentContainer: { marginBottom: 12 },
  ticksCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e7e4db', paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 },
  tickRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  tickRowLast: { marginBottom: 0 },
  tick: { fontSize: 14 },
  tickText: { flex: 1, fontSize: 12.5, color: '#1a1c20', lineHeight: 18 },
  trustNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: '#f2f6fb', borderRadius: 10, padding: 9, marginTop: 2, marginBottom: 12 },
  trustNoteText: { fontSize: 11.5, color: '#5b606c', lineHeight: 17, flex: 1 },
});
