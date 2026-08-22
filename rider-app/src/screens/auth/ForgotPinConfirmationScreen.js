// rider-app/src/screens/auth/ForgotPinConfirmationScreen.js
// ✅ HYBRID SYNC ARCHITECTURE:
// - Localization Provider for multilingual support
// - Network Status hooks for real-time connectivity detection
// - IndexedDB Adapter for offline-first persistent storage
// - Submits PIN reset with verification code
// - Queues for sync when offline
// - Works offline and online
// - UI/UX design preserved exactly

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import NumericKeypad from '../../components/NumericKeypad';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderStatus } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function ForgotPinConfirmationScreen({ navigation, route }) {
  const { phone, email } = route.params;
  const { t } = useTranslation();
  
  const [verificationCode, setVerificationCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localRiderId, setLocalRiderId] = useState(null);
  const [showNewPinKeypad, setShowNewPinKeypad] = useState(false);
  const [showConfirmPinKeypad, setShowConfirmPinKeypad] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider info:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  const handleNewPinInput = (digit) => {
    if (newPin.length < 4) {
      setNewPin(newPin + digit);
    }
  };

  const handleNewPinDelete = () => {
    setNewPin(newPin.slice(0, -1));
  };

  const handleConfirmPinInput = (digit) => {
    if (confirmPin.length < 4) {
      setConfirmPin(confirmPin + digit);
    }
  };

  const handleConfirmPinDelete = () => {
    setConfirmPin(confirmPin.slice(0, -1));
  };

  const handleSubmit = async () => {
    clearCriticalError();

    if (!verificationCode.trim()) {
      showCriticalError(
        t('error_enterVerificationCode') || 'Please enter the verification code.',
        'validation'
      );
      return;
    }

    if (!newPin || newPin.length !== 4) {
      showCriticalError(
        t('error_enterNewPin') || 'Please enter a 4-digit PIN.',
        'validation'
      );
      return;
    }

    if (!confirmPin || confirmPin.length !== 4) {
      showCriticalError(
        t('error_confirmPin') || 'Please confirm your PIN.',
        'validation'
      );
      return;
    }

    if (newPin !== confirmPin) {
      showCriticalError(
        t('error_pinMismatch') || 'PINs do not match. Please try again.',
        'validation'
      );
      return;
    }

    setSubmitting(true);
    try {
      const recordId = `pin_reset_${localRiderId}_${Date.now()}`;
      const resetData = {
        id: recordId,
        rider_id: localRiderId,
        phone: phone,
        email: email,
        verification_code: verificationCode.trim(),
        new_pin: newPin,
        created_at: new Date().toISOString(),
        status: 'pending',
      };

      console.log('💾 Saving PIN reset request:', { recordId, rider_id: localRiderId });

      // ✅ SAVE TO INDEXEDDB FIRST
      await indexedDbAdapter.insertRow('pin_reset_requests', resetData);

      // ✅ ADD TO SYNC QUEUE
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'pin_reset',
        endpoint: `/auth/forgot-pin/confirm?rider_id=${localRiderId}`,
        data: {
          phone: phone,
          email: email,
          verification_code: verificationCode.trim(),
          new_pin: newPin,
          submitted_at: Date.now(),
        },
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to sync queue, but local save succeeded');
      }

      // Try to sync immediately if online
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync PIN reset to API...');
          const response = await api.post(
            `/auth/forgot-pin/confirm?rider_id=${localRiderId}`,
            {
              phone: phone,
              email: email,
              verification_code: verificationCode.trim(),
              new_pin: newPin,
            }
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ PIN reset synced successfully');
            Alert.alert(
              t('success_pinReset') || 'Success',
              t('success_pinResetMessage') || 'Your PIN has been successfully reset. Please log in with your new PIN.',
              [{ text: t('okButton') || 'OK', onPress: () => navigation.navigate('Login') }]
            );
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

      // Data is saved and queued
      Alert.alert(
        t('success_pinSaved') || 'Saved',
        t('success_pinSavedMessage') || 'Your PIN has been saved and will be updated shortly.',
        [{ text: t('okButton') || 'OK', onPress: () => navigation.navigate('Login') }]
      );

    } catch (err) {
      console.error('❌ PIN reset error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to reset PIN. Please try again.',
        'save_error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('resetPin') || 'Reset PIN'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('resetPin') || 'Reset PIN'}</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* VERIFICATION CODE INPUT */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('verificationCode') || 'Verification Code'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_verificationCode') || 'Enter the code sent to you'}
          placeholderTextColor="#b0a89d"
          value={verificationCode}
          onChangeText={(val) => {
            setVerificationCode(val);
            clearCriticalError();
          }}
          editable={!submitting}
        />
      </View>

      {/* NEW PIN INPUT */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('newPin') || 'New PIN'} <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity 
          style={styles.pinDisplay}
          onPress={() => setShowNewPinKeypad(!showNewPinKeypad)}
        >
          <Text style={styles.pinDisplayText}>
            {'●'.repeat(newPin.length)}
            {newPin.length < 4 && '○'.repeat(4 - newPin.length)}
          </Text>
        </TouchableOpacity>
        {showNewPinKeypad && (
          <NumericKeypad
            onDigitPress={handleNewPinInput}
            onDelete={handleNewPinDelete}
            disabled={newPin.length >= 4}
          />
        )}
      </View>

      {/* CONFIRM PIN INPUT */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('confirmPin') || 'Confirm PIN'} <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity 
          style={styles.pinDisplay}
          onPress={() => setShowConfirmPinKeypad(!showConfirmPinKeypad)}
        >
          <Text style={styles.pinDisplayText}>
            {'●'.repeat(confirmPin.length)}
            {confirmPin.length < 4 && '○'.repeat(4 - confirmPin.length)}
          </Text>
        </TouchableOpacity>
        {showConfirmPinKeypad && (
          <NumericKeypad
            onDigitPress={handleConfirmPinInput}
            onDelete={handleConfirmPinDelete}
            disabled={confirmPin.length >= 4}
          />
        )}
      </View>

      <PrimaryButton
        text={submitting ? (t('submitting') || 'Submitting...') : (t('resetPinButton') || 'Reset PIN →')}
        onPress={handleSubmit}
        disabled={submitting || !verificationCode || !newPin || !confirmPin}
      />
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
    marginBottom: 4
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
    color: '#e5650a'
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
    fontWeight: '600'
  },
  pinDisplay: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: '#fff',
    alignItems: 'center'
  },
  pinDisplayText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1c20',
    letterSpacing: 8
  }
});
