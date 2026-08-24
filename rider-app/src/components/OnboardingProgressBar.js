// rider-app/src/components/OnboardingProgressBar.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ONBOARDING_STEPS } from '../constants/onboardingSteps';

// BR-SB01-009: shown on every onboarding screen, never on returning-rider login.
// Rebuilt as a single linear gradient bar (boda_orange → yellow) matching cleaned.html's .onb-progress —
// replaces the old blue step-dot row, which had no equivalent in the prototype.
// Issue 16 fix: Corrected layout - percentage on right, step label properly positioned
export default function OnboardingProgressBar({ currentStep }) {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  if (currentIndex === -1) return null;
  const pct = Math.round(((currentIndex + 1) / ONBOARDING_STEPS.length) * 100);
  const stepLabel = `Step ${currentIndex + 1} of ${ONBOARDING_STEPS.length}`;

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={styles.topRow}>
        <Text style={styles.stepLabel}>{stepLabel}</Text>
        <Text style={styles.percentLabel}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <LinearGradient colors={['#ff7a1a', '#ffc93c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  stepLabel: { fontSize: 10, fontWeight: '700', color: '#5b606c', textTransform: 'uppercase', letterSpacing: 0.5 },
  percentLabel: { fontSize: 10, fontWeight: '700', color: '#5b606c', textTransform: 'uppercase', letterSpacing: 0.5 },
  track: { height: 5, backgroundColor: '#e7e4db', borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});