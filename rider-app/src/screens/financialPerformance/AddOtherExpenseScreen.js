// rider-app/src/screens/financialPerformance/AddOtherExpenseScreen.js
// ✅ REFACTORED: IndexedDB-first with immediate cache updates
// ✅ OFFLINE PERSISTENCE: Exclusive IndexedDB key-value storage (no external stores)
// ✅ REAL-TIME SYNC: Updates cache immediately for instant display across all screens
// ✅ SYNC QUEUE: Background API uploads when online
// ✅ MULTILINGUAL: Full i18n support

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Picker, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';

/**
 * ✅ UPDATE CACHE: Invalidate and refresh other expenses summary
 * Called immediately after saving to ensure MoneyMasteryScreen reflects new data
 */
async function invalidateOtherExpensesCache(riderId) {
  try {
    // Clear period caches so they recompute with fresh data
    const cacheKeys = [
      `other_expenses_summary_${riderId}`,
      `net_profit_today_${riderId}`,
      `net_profit_this_week_${riderId}`,
      `net_profit_this_month_${riderId}`,
      `money_mastery_${riderId}_today`,
      `money_mastery_${riderId}_this_week`,
      `money_mastery_${riderId}_this_month`,
    ];

    for (const key of cacheKeys) {
      try {
        await indexedDbAdapter.deleteRow('kvStore', key);
      } catch (err) {
        console.warn(`⚠️ Failed to clear cache key: ${key}`);
      }
    }
    
    console.log('✅ Invalidated other expenses cache');
  } catch (err) {
    console.error('❌ Error invalidating cache:', err);
  }
}

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
  const [successMessage, setSuccessMessage] = useState('');

  const hasLoadedCategoriesRef = useRef(false);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ AddOtherExpense: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      } finally {
        setLoading(false);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ LOAD CATEGORIES ON MOUNT - Single execution
  useEffect(() => {
    if (!isInitialized || hasLoadedCategoriesRef.current) {
      return;
    }

    let isMounted = true;

    async function loadCategoriesOnMount() {
      const cacheKey = 'expense_categories';
      
      try {
        // 1. Try cache first
        console.log('📦 Checking IndexedDB cache for categories...');
        try {
          const cachedData = await indexedDbAdapter.kvGet(cacheKey);
          if (cachedData && isMounted) {
            const cachedCategories = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
            if (cachedCategories && cachedCategories.length > 0) {
              setCategories(cachedCategories);
              console.log('✅ Loaded categories from IndexedDB cache');
            } else {
              throw new Error('Empty cache');
            }
          } else {
            throw new Error('No cache');
          }
        } catch (cacheErr) {
          // Cache missing or empty - use defaults
          console.log('📦 No cache, using default categories');
          const defaultCategories = [
            t('expenseCategory_food') || 'Food & Refreshments',
            t('expenseCategory_phone') || 'Phone & Data',
            t('expenseCategory_transport') || 'Transportation (non-bike)',
            t('expenseCategory_health') || 'Health & Medical',
            t('expenseCategory_family') || 'Family Support',
            t('expenseCategory_other') || 'Other',
          ];
          setCategories(defaultCategories);
        }

        // 2. Try to sync fresh categories if online
        if (isConnected && isInitialized && isMounted) {
          console.log('📡 Syncing categories with API...');
          try {
            const res = await api.get('/financial/expense-categories');
            const apiCategories = res.data?.categories || [];
            if (apiCategories && apiCategories.length > 0 && isMounted) {
              setCategories(apiCategories);
              
              // Cache the fresh data
              try {
                await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(apiCategories));
                console.log('✅ Updated expense categories cache');
              } catch (setCacheErr) {
                console.warn('⚠️ Failed to cache categories:', setCacheErr);
              }
            }
          } catch (apiErr) {
            console.log('⚠️ Categories API unavailable, using cached/defaults');
          }
        }

        if (isMounted) {
          hasLoadedCategoriesRef.current = true;
        }
      } catch (err) {
        console.error('Error loading categories:', err);
        // Fallback to defaults
        if (isMounted) {
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
    }

    loadCategoriesOnMount();

    return () => {
      isMounted = false;
    };
  }, [isConnected, isInitialized, t]);

  const handleSave = async () => {
    clearCriticalError();
    setSuccessMessage('');

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
      const recordId = `other_expense_${effectiveRiderId}_${Date.now()}`;
      const timestamp = new Date().getTime();
      
      const entry = {
        id: recordId,
        rider_id: effectiveRiderId,
        category,
        amount: amt,
        note: note || '',
        created_at: new Date().toISOString(),
        ts: timestamp,
        status: 'pending',
      };

      console.log('💾 Saving other expense:', { recordId, riderId: effectiveRiderId, category, amount: amt });

      // ✅ ALWAYS SAVE LOCALLY FIRST using IndexedDB kvSet
      await indexedDbAdapter.kvSet(
        `other_expense_${recordId}`, 
        JSON.stringify(entry)
      );
      console.log('✅ Saved to IndexedDB');

      // ✅ UPDATE CACHE IMMEDIATELY for instant UI feedback
      await invalidateOtherExpensesCache(effectiveRiderId);

      // ✅ ADD TO SYNC QUEUE for background API uploads
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'other_expense',
        endpoint: `/financial/other-expense?rider_id=${effectiveRiderId}`,
        data: {
          category,
          amount: amt,
          note: note || '',
        },
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to queue, but local save succeeded');
      }

      // Try to sync immediately only if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync to API...');
          const response = await api.post(
            `/financial/other-expense?rider_id=${effectiveRiderId}`,
            {
              category,
              amount: amt,
              note: note || '',
            }
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Synced successfully to API');
            setSuccessMessage(t('success_expenseSaved') || 'Expense saved!');
            
            setTimeout(() => {
              navigation.navigate('MoneyMastery');
            }, 800);
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry later):', {
            status: apiErr.response?.status,
            message: apiErr.message,
          });
        }
      }

      // Either offline or API sync failed - but data is safely stored
      const syncingMsg = t('success_expenseSaving') || 'Expense saved. Syncing...';
      setSuccessMessage(syncingMsg);
      
      setTimeout(() => {
        navigation.navigate('MoneyMastery');
      }, 800);

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

      {successMessage && !saving && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>✅ {successMessage}</Text>
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
    marginBottom: 20 
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

  successBanner: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1.5,
    borderColor: '#a5d6a7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16
  },
  successBannerText: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600'
  },

  field: { 
    marginBottom: 20 
  },
  label: { 
    fontSize: 11.5, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.04, 
    color: '#5b606c',
    marginBottom: 8
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
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1a1c20',
    marginBottom: 8
  },
  textarea: { 
    height: 90, 
    paddingTop: 14, 
    textAlignVertical: 'top' 
  },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
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
    fontSize: 16, 
    fontWeight: '700',
    letterSpacing: 0.02
  },
});