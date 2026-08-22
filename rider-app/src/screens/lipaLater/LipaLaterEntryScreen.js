/**
 * rider-app/src/screens/lipaLater/LipaLaterEntryScreen.js
 * RA-03-D: Lipa Later Entry
 * 
 * ✅ SEAMLESS ONLINE/OFFLINE: Offline-first with auto sync
 * ✅ MULTILINGUAL: Uses i18n for all UI text
 * ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
 * ✅ NETWORK AWARE: Real-time connectivity detection
 * 
 * Captures customer details for credit sale:
 * - Customer Name
 * - Customer Phone
 * - Amount (pre-filled from trip)
 * - Due Date
 * 
 * Offline-First: Saves to IndexedDB immediately, queues for sync
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useRider } from '../../rider/RiderContext';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import styles from '../../theme/styles';

export function LipaLaterEntryScreen({ route }) {
  const navigation = useNavigation();
  const { trip } = route.params;
  const { state: riderState } = useRider();
  const { t } = useTranslation();
  const { isConnected, isInitialized } = useNetworkStatus();
  const [localRiderId, setLocalRiderId] = useState(null);
  
  const [formState, setFormState] = useState({
    customerName: '',
    customerPhone: '',
    amount: trip?.amount ? trip.amount.toString() : '',
    dueDate: getDefaultDueDate(),
    errors: {},
    isSubmitting: false
  });

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ LipaLaterEntry: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  useEffect(() => {
    // Initialize with trip amount if available
    if (trip?.amount && !formState.amount) {
      setFormState(prev => ({
        ...prev,
        amount: trip.amount.toString()
      }));
    }
  }, [trip]);

  const effectiveRiderId = localRiderId || riderState?.riderId;

  const getDefaultDueDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7); // Default 7 days from now
    return date.toISOString().split('T')[0];
  };

  const validateForm = () => {
    const errors = {};

    if (!formState.customerName.trim()) {
      errors.customerName = t('validationError_customerNameRequired') || 'Customer name is required';
    } else if (formState.customerName.trim().length < 2) {
      errors.customerName = t('validationError_nameMinLength') || 'Name must be at least 2 characters';
    }

    if (!formState.customerPhone.trim()) {
      errors.customerPhone = t('validationError_phoneRequired') || 'Phone number is required';
    } else if (!/^[\d\s+\-()]{7,}$/.test(formState.customerPhone)) {
      errors.customerPhone = t('validationError_invalidPhone') || 'Invalid phone number';
    }

    const amount = parseFloat(formState.amount);
    if (!formState.amount || isNaN(amount) || amount <= 0) {
      errors.amount = t('validationError_validAmountRequired') || 'Valid amount is required';
    }

    if (!formState.dueDate) {
      errors.dueDate = t('validationError_dueDateRequired') || 'Due date is required';
    } else {
      const dueDate = new Date(formState.dueDate);
      const today = new Date();
      if (dueDate <= today) {
        errors.dueDate = t('validationError_dueDateFuture') || 'Due date must be in the future';
      }
    }

    return errors;
  };

  const handleInputChange = (field, value) => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
      errors: {
        ...prev.errors,
        [field]: undefined
      }
    }));
  };

  const handleSubmit = async () => {
    const validationErrors = validateForm();
    
    if (Object.keys(validationErrors).length > 0) {
      setFormState(prev => ({
        ...prev,
        errors: validationErrors
      }));
      return;
    }

    setFormState(prev => ({ ...prev, isSubmitting: true }));

    try {
      const amount = parseFloat(formState.amount);
      const tripId = trip?.id || `trip_${Date.now()}`;
      
      // ✅ Create Lipa Later record for IndexedDB storage
      const lipaRecord = {
        id: `lipa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        trip_id: tripId,
        rider_id: effectiveRiderId,
        customer_name: formState.customerName.trim(),
        customer_mobile: formState.customerPhone.trim(),
        original_amount: amount,
        remaining_amount: amount,
        remaining_balance: amount,
        due_date: formState.dueDate,
        status: 'pending',
        channel_origin: 'app',
        sync_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payments: []
      };

      // ✅ Save to IndexedDB immediately (offline-first, non-blocking)
      await indexedDbAdapter.insertRow('local_trip', lipaRecord);
      console.log('✅ Lipa Later entry saved to IndexedDB:', lipaRecord.id);

      // ✅ Add to sync queue for background synchronization
      const queueSuccess = await addToSyncQueue({
        id: lipaRecord.id,
        type: 'lipa:entry',
        endpoint: `/trips/lipa-later/new?rider_id=${effectiveRiderId}`,
        data: lipaRecord,
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to sync queue, but local save succeeded');
      }

      // ✅ Try to sync immediately only if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting immediate sync to API...');
          // Sync attempt would go here via API if desired
          // For now, sync queue will handle background sync
        } catch (syncErr) {
          console.warn('⚠️ Immediate sync failed, will retry via queue:', syncErr.message);
        }
      }

      // Show success alert
      Alert.alert(
        t('success') || 'Success',
        t('success_lipaEntryCreated', { name: formState.customerName }) || `Lipa Later entry created for ${formState.customerName}`,
        [
          {
            text: t('goToSummary') || 'Go to Summary',
            onPress: () => {
              navigation.navigate('LipaLaterPaymentSummary');
            }
          }
        ]
      );

    } catch (error) {
      console.error('❌ Error creating Lipa Later entry:', error);
      Alert.alert(
        t('error') || 'Error', 
        t('error_createEntryFailed', { message: error.message }) || `Failed to create entry: ${error.message}`
      );
      setFormState(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  return (
    <ScrollView 
      style={styles.screenContainer}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>{t('lipaLaterEntry') || 'Lipa Later Entry'}</Text>
        <Text style={styles.screenSubtitle}>{t('recordCustomerCreditDetails') || 'Record customer credit sale details'}</Text>
      </View>

      {/* Trip Summary Card */}
      {trip && (
        <View style={[styles.card, { marginBottom: 20 }]}>
          <Text style={styles.cardTitle}>{t('tripAmount') || 'Trip Amount'}</Text>
          <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#1a1c20', marginTop: 8 }}>
            KSh {parseFloat(trip.amount).toLocaleString()}
          </Text>
          <Text style={{ fontSize: 12, color: '#a8a196', marginTop: 4 }}>
            {t('tripAmountChargedOnCredit') || 'This amount will be charged on credit'}
          </Text>
        </View>
      )}

      {/* Form Fields */}
      <View style={{ marginBottom: 20 }}>
        <Text style={styles.formLabel}>{t('customerName') || 'Customer Name'} *</Text>
        <TextInput
          style={[
            styles.textInput,
            formState.errors.customerName && styles.inputError
          ]}
          placeholder={t('placeholder_enterCustomerName') || "Enter customer's full name"}
          placeholderTextColor="#b8b2a5"
          value={formState.customerName}
          onChangeText={(value) => handleInputChange('customerName', value)}
          editable={!formState.isSubmitting}
          maxLength={80}
        />
        {formState.errors.customerName && (
          <Text style={styles.errorText}>{formState.errors.customerName}</Text>
        )}
      </View>

      <View style={{ marginBottom: 20 }}>
        <Text style={styles.formLabel}>{t('phoneNumber') || 'Phone Number'} *</Text>
        <TextInput
          style={[
            styles.textInput,
            formState.errors.customerPhone && styles.inputError
          ]}
          placeholder={t('placeholder_phoneNumber') || "0712345678 or +254712345678"}
          placeholderTextColor="#b8b2a5"
          value={formState.customerPhone}
          onChangeText={(value) => handleInputChange('customerPhone', value)}
          editable={!formState.isSubmitting}
          keyboardType="phone-pad"
          maxLength={20}
        />
        {formState.errors.customerPhone && (
          <Text style={styles.errorText}>{formState.errors.customerPhone}</Text>
        )}
      </View>

      <View style={{ marginBottom: 20 }}>
        <Text style={styles.formLabel}>{t('amount') || 'Amount (KSh)'} *</Text>
        <View style={[
          styles.textInput,
          { 
            backgroundColor: '#f4f4f5',
            justifyContent: 'center',
            paddingVertical: 18
          }
        ]}>
          <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#1a1c20' }}>
            {parseFloat(formState.amount || '0').toLocaleString()}
          </Text>
        </View>
        {formState.errors.amount && (
          <Text style={styles.errorText}>{formState.errors.amount}</Text>
        )}
      </View>

      <View style={{ marginBottom: 20 }}>
        <Text style={styles.formLabel}>{t('dueDate') || 'Due Date'} *</Text>
        <TextInput
          style={[
            styles.textInput,
            formState.errors.dueDate && styles.inputError
          ]}
          placeholder={t('placeholder_dateFormat') || "YYYY-MM-DD"}
          placeholderTextColor="#b8b2a5"
          value={formState.dueDate}
          onChangeText={(value) => handleInputChange('dueDate', value)}
          editable={!formState.isSubmitting}
          maxLength={10}
        />
        {formState.errors.dueDate && (
          <Text style={styles.errorText}>{formState.errors.dueDate}</Text>
        )}
        <Text style={{ fontSize: 11, color: '#a8a196', marginTop: 4 }}>
          {t('defaultDueDate') || 'Default is 7 days from today'}
        </Text>
      </View>

      {/* Info Banner */}
      <View style={[
        styles.trustNote,
        { marginBottom: 24 }
      ]}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: '#2c5182' }}>
          <Text style={{ fontWeight: 'bold' }}>📱 {t('offlineReady') || 'Offline Ready'}:</Text> {t('offlineSyncMessage') || 'This entry will be saved locally and synced automatically when you have internet connection.'}
        </Text>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[
          styles.primaryButton,
          formState.isSubmitting && styles.buttonDisabled
        ]}
        onPress={handleSubmit}
        disabled={formState.isSubmitting}
      >
        {formState.isSubmitting ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>{t('creatingEntry') || 'Creating Entry...'}</Text>
          </View>
        ) : (
          <Text style={styles.primaryButtonText}>{t('createLipaLaterEntry') || 'Create Lipa Later Entry'}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}