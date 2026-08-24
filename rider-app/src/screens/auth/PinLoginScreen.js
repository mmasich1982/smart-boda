// rider-app/src/screens/auth/PinLoginScreen.js
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for PIN validation
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ FULLY OFFLINE: No network dependency for login

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import NumericKeypad from '../../components/NumericKeypad';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useRider } from '../../rider/RiderContext';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

export default function PinLoginScreen({ navigation }) {
  const { dispatch } = useRider();
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [storedPin, setStoredPin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  
  const { isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD PIN FROM INDEXEDDB ON MOUNT
  useEffect(() => {
    const loadPin = async () => {
      try {
        const storedData = await indexedDbAdapter.kvGet('rider_pin');
        if (storedData) {
          setStoredPin(storedData);
          console.log('✅ PinLogin: Loaded PIN from IndexedDB');
        } else {
          console.warn('⚠️ No PIN found in IndexedDB');
        }
      } catch (err) {
        console.error('❌ Error loading PIN:', err);
        showCriticalError(
          t('error_loadPinFailed') || 'Failed to load PIN. Please restart the app.',
          'pin_load_error'
        );
      } finally {
        setLoading(false);
      }
    };
    
    loadPin();
  }, []);

  const handlePinInput = (digit) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);

      // Auto-submit when 4 digits entered
      if (newPin.length === 4) {
        handleLogin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    clearCriticalError();
  };

  const handleLogin = async (pinToValidate) => {
    clearCriticalError();
    setValidating(true);

    try {
      // ✅ VALIDATE AGAINST INDEXEDDB (NO NETWORK NEEDED)
      if (!storedPin) {
        showCriticalError(
          t('error_pinNotSet') || 'PIN not set. Please contact support.',
          'pin_not_set'
        );
        setPin('');
        setValidating(false);
        return;
      }

      if (pinToValidate !== storedPin) {
        showCriticalError(
          t('error_incorrectPin') || 'Incorrect PIN. Please try again.',
          'incorrect_pin'
        );
        setPin('');
        setValidating(false);
        return;
      }

      // ✅ PIN CORRECT - LOAD RIDER DATA FROM INDEXEDDB
      const riderId = await getLocalRiderId();
      
      if (riderId) {
        // Get additional rider data from IndexedDB if available
        const riderData = await indexedDbAdapter.kvGet(`rider_profile_${riderId}`);
        
        dispatch({
          type: 'LOGIN',
          payload: {
            riderId: riderId,
            phone: riderData?.phone,
            pin: pinToValidate,
            ...riderData,
          },
        });

        console.log('✅ PIN validation successful, navigating to MainApp');

        // Navigate to home
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainApp' }],
        });
      } else {
        showCriticalError(
          t('error_riderDataNotFound') || 'Rider data not found. Please restart the app.',
          'rider_data_error'
        );
        setPin('');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      showCriticalError(
        t('error_loginFailed') || 'Login failed. Please try again.',
        'login_error'
      );
      setPin('');
    } finally {
      setValidating(false);
    }
  };

  if (loading || !isInitialized) {
    return (
      <View style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        
        <View style={styles.contentArea}>
          <Text style={styles.title}>{t('enterPin') || 'Enter PIN'}</Text>
          <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      
      <View style={styles.contentArea}>
        <Text style={styles.title}>{t('enterPin') || 'Enter PIN'}</Text>
        <Text style={styles.subtitle}>{t('pinDescription') || 'Your 4-digit security code'}</Text>

        <View style={styles.pinDisplay}>
          {[0, 1, 2, 3].map((idx) => (
            <View
              key={idx}
              style={[
                styles.pinDot,
                idx < pin.length && styles.pinDotFilled,
                criticalError && styles.pinDotError,
              ]}
            />
          ))}
        </View>

        {criticalError && (
          <View style={styles.criticalErrorBanner}>
            <Text style={styles.criticalErrorText}>{criticalError}</Text>
            <TouchableOpacity onPress={clearCriticalError}>
              <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <NumericKeypad
          onDigitPress={handlePinInput}
          onBackspacePress={handleBackspace}
          disabled={validating}
        />

        <TouchableOpacity
          style={styles.forgotLink}
          onPress={() => navigation.navigate('ForgotPin')}
          disabled={validating}
        >
          <Text style={styles.forgotLinkText}>{t('forgotPin') || 'Forgot PIN?'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 20, 
    backgroundColor: '#f6f4ef' 
  },
  
  contentArea: { 
    flex: 1, 
    justifyContent: 'center' 
  },

  title: { 
    fontFamily: 'SpaceGrotesk-Bold', 
    fontSize: 24, 
    fontWeight: '700', 
    color: '#1a1c20', 
    marginBottom: 4, 
    textAlign: 'center' 
  },
  subtitle: { 
    fontSize: 13, 
    color: '#5b606c', 
    marginBottom: 32, 
    textAlign: 'center', 
    lineHeight: 20 
  },

  pinDisplay: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    marginBottom: 40, 
    gap: 12 
  },
  pinDot: { 
    width: 12, 
    height: 12, 
    borderRadius: 6, 
    backgroundColor: '#e7e4db', 
    borderWidth: 2, 
    borderColor: '#d0cbc0' 
  },
  pinDotFilled: { 
    backgroundColor: '#ff7a1a', 
    borderColor: '#ff7a1a' 
  },
  pinDotError: { 
    borderColor: '#e0453f' 
  },

  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
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

  forgotLink: { 
    marginTop: 20, 
    alignItems: 'center' 
  },
  forgotLinkText: { 
    fontSize: 13, 
    color: '#ff7a1a', 
    fontWeight: '600' 
  },
});
