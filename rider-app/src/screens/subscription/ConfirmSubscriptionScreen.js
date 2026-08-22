// rider-app/src/screens/subscription/ConfirmSubscriptionScreen.js
// ✅ HYBRID SYNC ARCHITECTURE:
// - Localization Provider for multilingual support
// - Network Status hooks for real-time connectivity detection
// - IndexedDB Adapter for offline-first persistent storage
// - M-Pesa payment with local save then sync
// - UI/UX design preserved exactly

import React, { useState, useContext } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import BackLink from '../../components/BackLink';
import { AppContext } from '../../context/AppContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';

const ConfirmSubscriptionScreen = ({ navigation, route }) => {
  const { state } = useContext(AppContext);
  const { t } = useTranslation();
  const { frequency, label, days, price, isRenewal } = route.params || {};
  
  const [mpesaCode, setMpesaCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const riderId = state?.riderId;

  // ✅ UPDATE CACHE: Add subscription status to IndexedDB
  const updateSubscriptionCache = async (freq, planDays) => {
    try {
      const now = new Date();
      const expiryDate = new Date(now.getTime() + planDays * 24 * 60 * 60 * 1000);
      
      const updatedSub = {
        frequency: freq,
        has_ever_paid: true,
        expiry_at: expiryDate.toISOString(),
        last_payment_at: now.toISOString(),
        last_payment_amount: price,
        urgency_banner_shown: false,
        updated_at: now.toISOString(),
      };

      const cacheKey = `subscription_status_${riderId}`;
      await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(updatedSub));
      console.log('✅ Updated subscription cache in IndexedDB');
    } catch (err) {
      console.warn('⚠️ Failed to update subscription cache:', err);
    }
  };

  // ========================================================================
  // OFFLINE FIRST: Save locally first, then sync
  // ========================================================================
  
  const handlePayment = async () => {
    try {
      // Validation
      if (!mpesaCode || mpesaCode.trim().length < 8) {
        showCriticalError(
          t('error_invalidMpesaCode') || 'Please enter a valid M-Pesa code (at least 8 characters)',
          'validation'
        );
        return;
      }

      if (!riderId) {
        showCriticalError(
          t('error_riderIdNotAvailable') || 'Rider ID not available. Please restart the app.',
          'auth'
        );
        return;
      }

      setSaving(true);
      clearCriticalError();
      setSuccessMessage('');

      const payload = {
        frequency: frequency,
        mpesa_code: mpesaCode.trim().toUpperCase(),
        created_at: new Date().toISOString()
      };

      const recordId = `subscription_${riderId}_${Date.now()}`;
      const offlineRecord = { 
        id: recordId,
        rider_id: riderId,
        frequency: frequency,
        mpesa_code: mpesaCode.trim().toUpperCase(),
        status: 'pending',
        created_at: payload.created_at,
      };

      console.log('💾 Saving subscription payment:', { recordId, riderId, frequency, price });

      // ✅ ALWAYS save locally first using IndexedDB
      await indexedDbAdapter.insertRow('subscription_payments', offlineRecord);

      // Update subscription cache to show new state immediately
      await updateSubscriptionCache(frequency, days);

      // ✅ ADD TO SYNC QUEUE FOR BACKGROUND SYNC
      const queueSuccess = await addToSyncQueue({
        id: recordId,
        type: 'subscription_payment',
        endpoint: `/api/riders/subscription/subscribe?rider_id=${riderId}`,
        data: {
          rider_id: riderId,
          frequency: frequency,
          mpesa_code: mpesaCode.trim().toUpperCase(),
          price: price,
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
          console.log('📡 Attempting to sync subscription payment to API...');
          const response = await api.post(
            `/api/riders/subscription/subscribe?rider_id=${riderId}`,
            payload
          );

          if (response.status === 200 || response.status === 201) {
            console.log('✅ Payment synced successfully to API');
            setSuccessMessage(
              t('success_subscriptionConfirmed') || 
              `${label} ${t('subscription') || 'subscription'} confirmed! ${t('awaitingVerification') || 'Awaiting admin verification.'}`
            );
            
            setTimeout(() => {
              navigation.navigate('Subscription');
            }, 800);
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (will retry later):', {
            status: apiErr.response?.status,
            message: apiErr.message
          });
          // Data is saved and queued, continue
        }
      }

      // Data is safely stored and queued - show success
      setSuccessMessage(
        t('success_subscriptionSaving') || 
        `${label} ${t('subscription') || 'subscription'} saved. Syncing...`
      );
      
      setTimeout(() => {
        navigation.navigate('Subscription');
      }, 800);

    } catch (err) {
      console.error('❌ Payment error:', err);
      showCriticalError(
        err.response?.data?.detail || t('error_saveFailed') || 'Failed to save payment. Please try again.',
        'save_error'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('confirmPayment') || 'Confirm Payment'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('confirmPayment') || 'Confirm Payment'}</Text>

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

      {/* PRICE BREAKDOWN */}
      <View style={styles.breakdownCard}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t('plan') || 'Plan'}</Text>
          <Text style={styles.breakdownValue}>{label}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t('duration') || 'Duration'}</Text>
          <Text style={styles.breakdownValue}>{days} {t('days') || 'days'}</Text>
        </View>
        <View style={[styles.breakdownRow, styles.breakdownRowHighlight]}>
          <Text style={styles.breakdownLabelHighlight}>{t('amountToPay') || 'Amount to Pay'}</Text>
          <Text style={styles.breakdownValueHighlight}>KSh {price}</Text>
        </View>
      </View>

      {/* M-PESA INSTRUCTIONS */}
      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>{t('mpesaInstructions') || 'How to Pay via M-Pesa'}</Text>
        
        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>1</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{t('step1_dialMpesa') || 'Dial or Open M-Pesa'}</Text>
            <Text style={styles.stepText}>{t('step1_desc') || 'Use *334# or the M-Pesa app'}</Text>
          </View>
        </View>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>2</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{t('step2_selectSend') || 'Select Send Money'}</Text>
            <Text style={styles.stepText}>{t('step2_desc') || 'Choose to send money to another number'}</Text>
          </View>
        </View>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>3</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{t('step3_enterNumber') || 'Enter Our Number'}</Text>
            <Text style={styles.stepText}>0757 334 481</Text>
          </View>
        </View>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>4</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{t('step4_enterAmount') || 'Enter Amount & PIN'}</Text>
            <Text style={styles.stepText}>KSh {price} + {t('yourMpesaPIN') || 'Your M-Pesa PIN'}</Text>
          </View>
        </View>

        <View style={styles.instructionStep}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>5</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{t('step5_getCode') || 'Get Confirmation Code'}</Text>
            <Text style={styles.stepText}>{t('step5_desc') || 'M-Pesa sends it via SMS'}</Text>
          </View>
        </View>
      </View>

      {/* M-PESA CODE INPUT */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {t('mpesaCode') || 'M-Pesa Confirmation Code'} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('placeholder_mpesaCode') || 'e.g., ABCD1234EF'}
          placeholderTextColor="#b0a89d"
          value={mpesaCode}
          onChangeText={(val) => {
            setMpesaCode(val);
            clearCriticalError();
          }}
          editable={!saving}
          autoCapitalize="characters"
          maxLength={20}
        />
        <Text style={styles.hint}>{t('hint_mpesaCode') || 'Enter the code you received from Safaricom'}</Text>
      </View>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('info_paymentVerification') || 'Your payment will be verified by our team within a few hours. You\'ll receive a notification once confirmed.'}
        </Text>
      </View>

      {/* SUBMIT BUTTON */}
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          (saving || !mpesaCode) && styles.primaryBtnDisabled
        ]}
        onPress={handlePayment}
        disabled={saving || !mpesaCode}
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
            {saving ? (t('submitting') || 'Submitting...') : (t('submitPaymentButton') || 'Submit Payment →')}
          </Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f6f4ef'
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 28,
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

  breakdownCard: {
    backgroundColor: '#fff8f0',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ffb366',
    padding: 16,
    marginBottom: 20
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10
  },
  breakdownRowHighlight: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ffb366'
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#5b606c',
    fontWeight: '500'
  },
  breakdownLabelHighlight: {
    fontSize: 14,
    color: '#ff7a1a',
    fontWeight: '700'
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20'
  },
  breakdownValueHighlight: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ff7a1a'
  },

  instructionsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
    marginBottom: 20
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 16
  },

  instructionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db'
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ff7a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  stepNumber: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 2
  },
  stepText: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 16
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
    marginBottom: 8,
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
  }
});

export default ConfirmSubscriptionScreen;
