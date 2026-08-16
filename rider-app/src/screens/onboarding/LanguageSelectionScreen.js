// rider-app/src/screens/onboarding/LanguageSelectionScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import * as Localization from 'expo-localization';
import HeroBand from '../../components/HeroBand';
import LanguageTileGrid from '../../components/LanguageTileGrid';
import PrimaryButton from '../../components/PrimaryButton';
import CustomerCareFooter from '../../components/CustomerCareFooter';
import useMasterData from '../../hooks/useMasterData';
import { saveLocalLanguage } from '../../offline/db';
import { useTranslation } from '../../i18n/LocalizationProvider';

// SB-01-A. No onboarding progress bar here per prototype: this screen precedes step 1.
// NOTE: the language list itself is 100% Super Admin master data (language_master, is_active=true) —
// this screen never hardcodes "English"/"Kiswahili"; MVP0 simply has two rows active today.
// FIXED: NO Smart Boda branding header (appears in app-topbar only)
// FIXED: NO language pre-selection on app launch
export default function LanguageSelectionScreen({ navigation }) {
  const { languages } = useMasterData();
  const [selected, setSelected] = useState(null); // Start with NULL - no default language
  const { setLanguage } = useTranslation();

  async function handleContinue() {
    if (!selected) return; // Continue is disabled until a tile is chosen; this is a safety net
    await saveLocalLanguage(selected);
    // FIX Issue 4: Call setLanguage to apply translations immediately when language is selected
    await setLanguage(selected);
    navigation.replace('ValuePreview');
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Per cleaned.html: Hero band with moto watermarks, NO branding header */}
      <HeroBand 
        eyebrow="🤝 Riders all over Kenya use this app" 
        title="Karibu! Welcome 👋" 
        subtitle="Pick your language. It only takes one tap." 
      />
      
      <LanguageTileGrid languages={languages} selectedCode={selected} onSelect={setSelected} />
      
      <PrimaryButton 
        label="Continue →" 
        onPress={handleContinue} 
        disabled={!selected}
      />
      
      <CustomerCareFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef' },
});