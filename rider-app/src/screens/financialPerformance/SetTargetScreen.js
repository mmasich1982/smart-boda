// rider-app/src/screens/financialPerformance/SetTargetScreen.js
// UPDATED: Set Revenue Target Screen (RA-09-A)
// Allows riders to set daily/weekly/monthly targets with AI-suggested amounts

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';

export default function SetTargetScreen({ riderId, route, navigation }) {
  const { period = 'daily', isEdit = false } = route.params || {};
  
  const [amount, setAmount] = useState('');
  const [suggestedAmount, setSuggestedAmount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    // Fetch suggested target
    api.get('/financial/targets/suggestion', { params: { rider_id: riderId, period } })
      .then(res => {
        if (isMounted) {
          setSuggestedAmount(res.data?.suggestion || null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [period, riderId]);

  const handleAcceptSuggestion = () => {
    if (suggestedAmount) {
      setAmount(suggestedAmount.toString());
    }
  };

  const handleSaveTarget = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a target amount greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const endpoint = isEdit ? '/financial/targets' : '/financial/targets';
      const method = isEdit ? 'put' : 'post';
      
      const response = await (method === 'post' 
        ? api.post(endpoint, {
            rider_id: riderId,
            period,
            amount: parseFloat(amount),
          })
        : api.put(endpoint, {
            rider_id: riderId,
            period,
            amount: parseFloat(amount),
          })
      );

      if (response.status === 200 || response.status === 201) {
        navigation.navigate('RevenueTargets');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save target. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>Set a Target</Text>
        <Text style={styles.loading}>Loading...</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>Set a Target</Text>
      <Text style={styles.subtitle}>RA-09-A · Set a Target Screen — {period}</Text>

      {/* Suggested Target Card */}
      {suggestedAmount ? (
        <TouchableOpacity 
          style={styles.suggestionCard}
          onPress={handleAcceptSuggestion}
          activeOpacity={0.7}
        >
          <Text style={styles.suggestionHint}>Suggested (based on your recent earnings) RA-09-C</Text>
          <Text style={styles.suggestionAmount}>KSh {suggestedAmount.toLocaleString()} — tap to use</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.hint, { marginBottom: 14 }]}>
          We'll suggest a target once we have a bit more of your earning history.
        </Text>
      )}

      {/* Amount Input Field */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Target Amount <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(text) => {
            setAmount(text);
            setError('');
          }}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {/* Save Button */}
      <TouchableOpacity 
        style={[styles.primaryBtn, (saving || !amount) && styles.primaryBtnDisabled]}
        onPress={handleSaveTarget}
        disabled={saving || !amount}
      >
        <Text style={styles.primaryBtnText}>
          {saving ? 'Saving...' : 'Save Target →'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#8b5cf6', marginBottom: 20 },
  loading: { fontSize: 14, color: '#5b606c', marginTop: 20, textAlign: 'center' },

  suggestionCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  suggestionHint: { fontSize: 11.5, color: '#5b606c', marginBottom: 4 },
  suggestionAmount: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 16, fontWeight: '700', color: '#1a1c20', marginTop: 4 },

  hint: { fontSize: 11.5, color: '#5b606c', lineHeight: 18 },

  field: { marginBottom: 16 },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 7,
  },
  required: { color: '#e5650a', fontSize: 11.5 },

  input: {
    width: '100%',
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    fontSize: 15,
    fontFamily: 'Inter',
    backgroundColor: '#fff',
    color: '#1a1c20',
  },

  errorText: { fontSize: 11.5, color: '#e0453f', marginTop: 6, fontWeight: '600' },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});