// rider-app/src/screens/financialPerformance/AddOtherExpenseScreen.js
// UPDATED: Aligned with cleaned.html (RA-07-C)
// Allows riders to log other expenses beyond fuel/maintenance with category and amount

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Picker } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderStatus } from '../../offline/db';
import api from '../../api/client';

export default function AddOtherExpenseScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider status:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  // ✅ USE LOCAL STORAGE AS PRIMARY, FALLBACK TO CONTEXT
  const effectiveRiderId = localRiderId || state?.riderId;

  useEffect(() => {
    // Fetch expense categories from financial service
    api.get('/financial/expense-categories')
      .then(res => {
        const cats = res.data?.categories || [];
        setCategories(cats);
      })
      .catch(() => {
        setCategories([
          'Food & Refreshments',
          'Phone & Data',
          'Transportation (non-bike)',
          'Health & Medical',
          'Family Support',
          'Other',
        ]);
      });
  }, []);

  const handleSave = async () => {
    setError('');

    if (!effectiveRiderId) {
      setError('Rider ID not found. Please return to Home and try again.');
      return;
    }

    if (!category) {
      setError('Select an Expense Category.');
      return;
    }

    const amt = parseFloat(amount || '0');
    if (!amt || amt <= 0) {
      setError('Please enter an amount greater than zero to save this expense.');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/financial/other-expense?rider_id=${effectiveRiderId}`, {
        category,
        amount: amt,
        note,
        submitted_at: new Date().toISOString(),
      });

      // Success - navigate back to Money Mastery
      navigation.navigate('MoneyMastery');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save expense. Please try again.');
      console.error('Save expense error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>Add Other Expense</Text>

      <View style={styles.field}>
        <Text style={styles.label}>
          Expense Category <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.selectContainer}>
          <Picker
            selectedValue={category}
            onValueChange={(value) => setCategory(value)}
            style={styles.picker}
          >
            <Picker.Item label="Select..." value="" />
            {categories.map((cat) => (
              <Picker.Item 
                key={typeof cat === 'string' ? cat : cat.code} 
                label={typeof cat === 'string' ? cat : cat.display_name} 
                value={typeof cat === 'string' ? cat : cat.code} 
              />
            ))}
          </Picker>
        </View>
        {!category && error.includes('Category') && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          Amount <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        {error.includes('amount') && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Add any notes..."
          placeholderTextColor="#b0a89d"
          multiline
          numberOfLines={3}
          value={note}
          onChangeText={setNote}
        />
      </View>

      {error && !error.includes('Category') && !error.includes('amount') && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {error}</Text>
        </View>
      )}

      <TouchableOpacity 
        style={[styles.primaryBtn, (loading || !category || !amount) && styles.primaryBtnDisabled]}
        onPress={handleSave}
        disabled={loading || !category || !amount}
      >
        <Text style={styles.primaryBtnText}>Save Expense →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#8b5cf6', marginBottom: 20 },

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

  selectContainer: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: { height: 50, color: '#1a1c20' },

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
  textarea: { height: 90, paddingTop: 13, textAlignVertical: 'top' },

  errorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorBannerText: { fontSize: 11.5, color: '#a5312c', fontWeight: '600' },
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