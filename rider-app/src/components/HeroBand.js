// rider-app/src/components/HeroBand.js — the dark navy→orange gradient header
// used on Language Selection, Value Preview and other "welcome" style screens
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function HeroBand({ eyebrow, title, subtitle, onBack }) {
  return (
    <LinearGradient colors={['#1a1c20', '#2a1f10', '#3a2810']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.band}>
      <Text style={styles.watermark}>🚕</Text>
      {onBack && <Text style={styles.back} onPress={onBack}>← Back</Text>}
      {eyebrow && <View style={styles.eyebrowPill}><Text style={styles.eyebrowText}>{eyebrow}</Text></View>}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.sub}>{subtitle}</Text>}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  band: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 22, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: 'hidden', marginBottom: 14 },
  watermark: { position: 'absolute', right: -20, bottom: -10, fontSize: 90, opacity: 0.14 },
  back: { color: 'rgba(255,255,255,.8)', fontWeight: '700', fontSize: 12.5, marginBottom: 12 },
  eyebrowPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,.14)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, marginBottom: 10 },
  eyebrowText: { color: '#ffe1a8', fontSize: 11, fontWeight: '700' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  sub: { color: 'rgba(255,255,255,.82)', fontSize: 13, lineHeight: 19 },
});