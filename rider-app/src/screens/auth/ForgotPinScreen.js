// rider-app/src/screens/auth/ForgotPinScreen.js
// ✅ HYBRID SYNC ARCHITECTURE:
// - Localization Provider for multilingual support
// - Network Status hooks for real-time connectivity detection
// - IndexedDB Adapter for offline-first persistent storage
// - Queues PIN recovery request for sync
// - Works offline and online
// - UI/UX design preserved exactly

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderStatus } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function ForgotPinScreen({ navigation }) {
  const { t } = useTranslation();
  
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localRiderId, setLocalRiderId] = useState(null);
  const [localPhone, setLocalPhone] = useState('');

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER INFO FROM INDEXEDDB
  useEffect(() => {
    async function loadRiderInfo() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id && status?.phone) {
          setLocalRiderId(status.rider_id);
          setLocalPhone(status.phone);
          setPhone(status.phone);
        }
      } catch (err) {
        console.error('Error loading rider info:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRiderInfo();
  }, []);

  const handleSubmit = async () => {
    clearCriticalError();

    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();

    if (!trimmedPhone) {
      showCriticalError(
        t('error_enterPhone') || 'Please enter your phone number.',
        'validation'
      );
      return;
    }

    if (!trimmedEmail) {
      showCriticalError(
        t('error_enterEmail') || 'Please enter your email address.',
        'validation'
      );
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      showCriticalError(
        t('error_invalidEmail') || 'Please enter a valid email address.',
        'validation'
      );
      return;
    }

    setSubmitting(true);
    try {
      const recordId = `forgot_pin_${localRiderId}_${Date.now()}`;
      const requestData = {
        id: recordId,
        rider_id: localRiderId,
        phone: trimmedPhone,
        email: trimmedEmail,
        created_at: new Date().toISOString(),
        status: 'pending',
      };

      console.log('💾 Saving PIN recovery request:', { recordId, rider_id: localRiderId });

      // ✅ SAVE TO INDEXEDDB FIRST
      await indexedDbAdapter.insertRow('pin_recovery_requests', requestData);

      // ✅ ADD TO SYNC QUEUE
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'forgot_pin',
        endpoint: `/auth/forgot-pin?rider_id=${localRiderId}`,
        data: {
          phone: trimmedPhone,
          email: trimmedEmail,
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
          console.log('📡 Attempting to sync PIN recovery request to API...');
          const response = await api.post(
            `/auth/forgot-pin?rider_id=${localRiderId}`,
            {
              phone: trimmedPhone,
              email: trimmedEmail,
            }
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ PIN recovery request synced successfully');
            // Navigate to confirmation screen
            navigation.navigate('ForgotPinConfirmation', {
              phone: trimmedPhone,
              email: trimmedEmail
            });
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

      // Data is saved and queued - navigate anyway
      navigation.navigate('ForgotPinConfirmation', {
        phone: trimmedPhone,
        email: trimmedEmail
      });

    } catch (err) {
      console.error('❌ PIN recovery error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to process request. Please try again.',
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
        <Text style={styles.title}>{t('forgotPin') || 'Forgot PIN?'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('forgotPin') || 'Forgot PIN?'}</Text>
      <Text style={styles.subtitle}>
        {t('forgotPinSubtitle') || 'Enter your phone and email to receive a verification code'}
      </Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PHONE NUMBER INPUT */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('phoneNumber') || 'Phone Number'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_phone') || '+254 7XX XXX XXX'}
          placeholderTextColor="#b0a89d"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={(val) => {
            setPhone(val);
            clearCriticalError();
          }}
          editable={!submitting}
        />
        <Text style={styles.hint}>
          {t('hint_phone') || 'Use the phone number linked to your account'}
        </Text>
      </View>

      {/* EMAIL INPUT */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('email') || 'Email Address'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_email') || 'you@example.com'}
          placeholderTextColor="#b0a89d"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={(val) => {
            setEmail(val);
            clearCriticalError();
          }}
          editable={!submitting}
        />
        <Text style={styles.hint}>
          {t('hint_email') || 'Use the email linked to your account'}
        </Text>
      </View>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('info_forgotPin') || 'We\'ll send a verification code to help you reset your PIN securely.'}
        </Text>
      </View>

      <PrimaryButton
        text={submitting ? (t('submitting') || 'Submitting...') : (t('continueButton') || 'Continue →')}
        onPress={handleSubmit}
        disabled={submitting || !phone || !email}
      />

      {/* SUPPORT LINK */}
      <TouchableOpacity 
        style={styles.supportLink}
        onPress={() => navigation.navigate('Help')}
      >
        <Text style={styles.supportLinkText}>
          {t('needHelp') || 'Need help?'} {t('contactSupport') || 'Contact support'}
        </Text>
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
    marginBottom: 4
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkSoft || '#5b606c',
    marginBottom: 20,
    lineHeight: 20
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
    marginBottom: 6,
    fontWeight: '600'
  },
  hint: {
    fontSize: 11.5,
    color: '#5b606c',
    fontWeight: '500'
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    flexDirection: 'row',
    gap: 8
  },
  infoIcon: {
    fontSize: 16,
    marginTop: 2
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16
  },

  supportLink: {
    alignItems: 'center',
    marginTop: 20
  },
  supportLinkText: {
    fontSize: 12,
    color: '#ff7a1a',
    fontWeight: '600',
    textDecorationLine: 'underline'
  }
});
