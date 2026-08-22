// rider-app/src/screens/financialPerformance/AddOtherExpenseScreen.js
// ✅ HYBRID SYNC ARCHITECTURE:
// - Localization Provider for multilingual support
// - Network Status hooks for real-time connectivity detection
// - IndexedDB Adapter for offline-first persistent storage
// - Loads categories from cache with API fallback
// - Queues expenses for background sync
// - UI/UX design preserved exactly

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Picker, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderStatus } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';

export default function AddOtherExpenseScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID FROM INDEXEDDB
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

  // ✅ LOAD CATEGORIES WITH CACHE-FIRST FALLBACK USING INDEXEDDB
  useEffect(() => {
    async function loadCategories() {
      const cacheKey = 'expense_categories';
      
      try {
        // 1. Load from IndexedDB cache immediately
        const cached = await indexedDbAdapter.kvGet(cacheKey);
        if (cached) {
          const parsedCategories = typeof cached === 'string' ? JSON.parse(cached) : cached;
          setCategories(parsedCategories);
        } else {
          // No cache, show defaults while fetching
          setCategories([
            t('expenseCategory_food') || 'Food & Refreshments',
            t('expenseCategory_phone') || 'Phone & Data',
            t('expenseCategory_transport') || 'Transportation (non-bike)',
            t('expenseCategory_health') || 'Health & Medical',
            t('expenseCategory_family') || 'Family Support',
            t('expenseCategory_other') || 'Other',
          ]);
        }

        // 2. Fetch fresh categories from API if online
        if (isConnected && isInitialized) {
          try {
            const res = await api.get('/financial/expense-categories');
            const cats = res.data?.categories || [];
            setCategories(cats);
            // 3. Cache the fresh data in IndexedDB
            await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(cats));
            console.log('✅ Updated expense categories cache');
          } catch (apiErr) {
            // API failed - use cache or defaults already shown
            console.log('⚠️ Categories API unavailable, using cached/defaults');
          }
        }
      } catch (err) {
        console.error('Error loading categories:', err);
        // Fallback to defaults
        setCategories([
          t('expenseCategory_food') || 'Food & Refreshments',
          t('expenseCategory_phone') || 'Phone & Data',
          t('expenseCategory_transport') || 'Transportation (non-bike)',
          t('expenseCategory_health') || 'Health & Medical',
          t('expenseCategory_family') || 'Family Support',
          t('expenseCategory_other') || 'Other',
        ]);
      }
    }

    loadCategories();
  }, [isConnected, isInitialized, t]);

  const handleSave = async () => {
    clearCriticalError();

    if (!effectiveRiderId) {
      showCriticalError(
        t('error_riderIdNotFound') || 'Rider ID not found. Please return to Home and try again.',
        'auth'
      );
      return;
    }

    if (!category) {
      showCriticalError(
        t('error_selectCategory') || 'Select an Expense Category.',
        'validation'
      );
      return;
    }

    const amt = parseFloat(amount || '0');
    if (!amt || amt <= 0) {
      showCriticalError(
        t('error_enterValidAmount') || 'Please enter an amount greater than zero to save this expense.',
        'validation'
      );
      return;
    }

    setSaving(true);
    try {
      const recordId = `expense_${effectiveRiderId}_${Date.now()}`;
      const entry = {
        id: recordId,
        rider_id: effectiveRiderId,
        category,
        amount: amt,
        note: note || '',
        created_at: new Date().toISOString(),
        status: 'pending',
      };

      console.log('💾 Saving expense:', { recordId, riderId: effectiveRiderId, category, amount: amt });

      // ✅ SAVE TO INDEXEDDB FIRST (offline-first)
      await indexedDbAdapter.insertRow('local_expenses', entry);

      // ✅ ADD TO SYNC QUEUE FOR BACKGROUND SYNC
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'expense',
        endpoint: `/financial/expenses?rider_id=${effectiveRiderId}`,
        data: {
          rider_id: effectiveRiderId,
          category,
          amount: amt,
          note: note || '',
          submitted_at: Date.now(),
        },
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to sync queue, but local save succeeded');
      }

      // Try to sync immediately only if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync expense to API...');
          const response = await api.post(
            `/financial/expenses?rider_id=${effectiveRiderId}`,
            {
              rider_id: effectiveRiderId,
              category,
              amount: amt,
              note: note || '',
              submitted_at: Date.now(),
            }
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Expense synced successfully to API');
            // Navigate after success
            navigation.navigate('MoneyMastery');
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry later):', {
            status: apiErr.response?.status,
            message: apiErr.message,
          });
          // Data is saved and queued, continue
        }
      }

      // Data is safely stored and queued
      navigation.navigate('MoneyMastery');

    } catch (err) {
      console.error('❌ Save error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to save expense. Please try again.',
        'save_error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('addExpense') || 'Add Other Expense'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('addExpense') || 'Add Other Expense'}</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>
          {t('expenseCategory') || 'Expense Category'} <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.selectContainer}>
          <Picker
            selectedValue={category}
            onValueChange={(value) => {
              setCategory(value);
              clearCriticalError();
            }}
            style={styles.picker}
            enabled={!saving}
          >
            <Picker.Item label={t('selectOption') || 'Select...'} value="" />
            {categories.map((cat) => (
              <Picker.Item 
                key={typeof cat === 'string' ? cat : cat.code} 
                label={typeof cat === 'string' ? cat : cat.display_name} 
                value={typeof cat === 'string' ? cat : cat.code} 
              />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          {t('amount') || 'Amount (KSh)'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_amount') || '0'}
          placeholderTextColor="#b0a89d"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(val) => {
            setAmount(val);
            clearCriticalError();
          }}
          editable={!saving}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('notes') || 'Notes'} ({t('optional') || 'optional'})</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder={t('placeholder_notes') || 'Add any notes...'}
          placeholderTextColor="#b0a89d"
          multiline
          numberOfLines={3}
          value={note}
          onChangeText={setNote}
          editable={!saving}
        />
      </View>

      <TouchableOpacity 
        style={[
          styles.primaryBtn, 
          (saving || !category || !amount) && styles.primaryBtnDisabled
        ]}
        onPress={handleSave}
        disabled={saving || !category || !amount}
        activeOpacity={0.8}
      >
        <View style={styles.btnContent}>
          {saving && (
            <ActivityIndicator 
              size="small" 
              color="#fff" 
              style={styles.btnSpinner}
            />
          )}
          <Text style={styles.primaryBtnText}>
            {saving ? (t('saving') || 'Saving...') : (t('saveExpenseButton') || 'Save Expense →')}
          </Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 20, 
    backgroundColor: '#f6f4ef' 
  },
  title: { 
    fontFamily: 'SpaceGrotesk-Bold', 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#1a1c20', 
    marginBottom: 2 
  },

  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  criticalErrorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1
  },
  dismissText: {
    fontSize: 11,
    color: '#a5312c',
    fontWeight: '700',
    marginLeft: 12
  },

  field: { 
    marginBottom: 16 
  },
  label: { 
    fontSize: 11.5, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.04, 
    color: '#5b606c',
    marginBottom: 7,
  },
  required: { 
    color: '#e5650a', 
    fontSize: 11.5 
  },

  selectContainer: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: { 
    height: 50, 
    color: '#1a1c20' 
  },

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
  textarea: { 
    height: 90, 
    paddingTop: 13, 
    textAlignVertical: 'top' 
  },

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
    elevation: 6,
  },
  primaryBtnDisabled: { 
    backgroundColor: '#e9dccc', 
    shadowOpacity: 0 
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSpinner: {
    marginRight: 10
  },
  primaryBtnText: { 
    color: '#fff', 
    fontSize: 15, 
    fontWeight: '700',
    letterSpacing: 0.02
  },
});
