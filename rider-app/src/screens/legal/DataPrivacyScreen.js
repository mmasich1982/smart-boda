// rider-app/src/screens/legal/DataPrivacyScreen.js
// Issue 15 fix: Data Privacy Notice content is now fetched from backend, not hardcoded

import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLegalDocuments } from '../../hooks/useLegalDocuments';

export default function DataPrivacyScreen({ navigation }) {
  const { documents, loading, error } = useLegalDocuments();

  return (
    <View style={styles.container}>
      <Text style={styles.backLink} onPress={() => navigation.goBack()}>← Back</Text>
      <Text style={styles.title}>Data Privacy Notice</Text>
      
      {loading && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#ff7a1a" />
          <Text style={styles.loadingText}>Loading privacy notice...</Text>
        </View>
      )}
      
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ Could not load Data Privacy Notice</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
        </View>
      )}
      
      {!loading && documents.dataPrivacy && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.contentText}>{documents.dataPrivacy}</Text>
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef', padding: 20 },
  backLink: { fontSize: 12, fontWeight: '700', color: '#5b606c', marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: '#1a1c20', marginBottom: 14 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 12, color: '#5b606c' },
  errorBox: { backgroundColor: '#ffe6e6', borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 12, fontWeight: '700', color: '#e0453f' },
  errorSubtext: { fontSize: 11, color: '#d03a2f', marginTop: 4 },
  content: { flex: 1 },
  contentText: { fontSize: 13, color: '#5b606c', lineHeight: 20 },
});