// rider-app/src/screens/onboarding/PinLoginScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Works offline with IndexedDB
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: Stores credentials locally for offline authentication
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ UI/UX: 100% preserved from original - no banner spam, only critical errors
// ✅ FIXED: Only reached via explicit logout - no automatic session checks redirect here

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, BackHandler, StyleSheet, ActivityIndicator } from 'react-native';
import SkyHeroBand from '../../components/SkyHeroBand';
import DigitBoxInput from '../../components/DigitBoxInput';
import PrimaryButton from '../../components/PrimaryButton';
import { getCurrentScene } from '../../constants/pinHeroScenes';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { addToSyncQueue } from '../../offline/syncQueue';

// ✅ Simple hash function for offline PIN verification
// Note: This is NOT cryptographic - just for local verification
// Real PIN validation happens on server when online
const hashPin = (pin) => {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

// SB-04-B: returning-rider login. Offline-capable. "Forgot PIN" routes to PinRecoveryScreen.
// ✅ FIXED: This screen is ONLY reached via explicit logout from HomeScreen
export default function PinLoginScreen({ route, navigation }) {
  const { riderId, fullName } = route.params || {};
  const { t } = useTranslation();
  
  // Recomputed on every focus (not just mount) via useFocusEffect in the real file
  const scene = getCurrentScene(new Date().getHours());
  
  const [pin, setPin] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [locked, setLocked] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  
  // ✅ Track if initial load is complete
  const hasInitializedRef = useRef(false);
  
  // ✅ Network status and error handling
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  /**
   * ✅ Check if an account is locked offline
   * Stored when login attempts are exceeded
   */
  const isAccountLockedOffline = async () => {
    try {
      const lockData = await indexedDbAdapter.kvGet(`pin_lock_${riderId}`);
      if (lockData) {
        const { locked: isLocked, expiresAt } = typeof lockData === 'string' ? JSON.parse(lockData) : lockData;
        
        if (isLocked && expiresAt && new Date().getTime() < expiresAt) {
          return true;
        }
        
        // Lock has expired, clear it
        if (isLocked && (!expiresAt || new Date().getTime() >= expiresAt)) {
          await indexedDbAdapter.delete(`pin_lock_${riderId}`);
          return false;
        }
      }
      return false;
    } catch (err) {
      console.warn('⚠️ Error checking lock status:', err);
      return false;
    }
  };

  /**
   * ✅ Check offline: Compare PIN hash against stored hash
   * Returns { ok: boolean, attempts_left?: number, error?: string }
   */
  const verifyPinOffline = async (pinInput) => {
    try {
      const storedCredentials = await indexedDbAdapter.kvGet(`pin_credentials_${riderId}`);
      
      if (!storedCredentials) {
        // No offline credentials stored yet - cannot authenticate offline
        return { 
          ok: false, 
          error: 'offline_no_credentials',
          message: t('error_offlineNoCredentials') || 'Cannot verify PIN offline. Please connect to the internet.'
        };
      }

      const credentials = typeof storedCredentials === 'string' ? JSON.parse(storedCredentials) : storedCredentials;
      const inputHash = hashPin(pinInput);

      if (inputHash === credentials.pinHash) {
        console.log('✅ PIN verified offline');
        return { ok: true };
      }

      // ✅ Track failed offline attempts
      let attemptsData = await indexedDbAdapter.kvGet(`pin_attempts_${riderId}`);
      let attempts = attemptsData 
        ? (typeof attemptsData === 'string' ? JSON.parse(attemptsData) : attemptsData) 
        : { count: 0, lastAttempt: null };

      attempts.count = (attempts.count || 0) + 1;
      attempts.lastAttempt = new Date().toISOString();

      // ✅ Lock after 3 failed attempts (15 min lockout)
      if (attempts.count >= 3) {
        const lockExpiry = new Date().getTime() + (15 * 60 * 1000); // 15 minutes
        await indexedDbAdapter.kvSet(
          `pin_lock_${riderId}`,
          JSON.stringify({ locked: true, expiresAt: lockExpiry })
        );
        
        console.log('❌ PIN locked after 3 attempts');
        return {
          ok: false,
          error: 'locked',
          message: t('pin.locked') || 'Account locked. Please try again later.'
        };
      }

      // Save attempt count
      await indexedDbAdapter.kvSet(`pin_attempts_${riderId}`, JSON.stringify(attempts));

      const attemptsRemaining = 3 - attempts.count;
      console.log(`❌ Incorrect PIN offline. ${attemptsRemaining} attempts left.`);
      return {
        ok: false,
        error: 'incorrect',
        attempts_left: attemptsRemaining,
        message: t('pin.incorrect', { attempts_left: attemptsRemaining }) || `Incorrect PIN. ${attemptsRemaining} attempts left.`
      };
    } catch (err) {
      console.error('❌ Error verifying PIN offline:', err);
      return {
        ok: false,
        error: 'verification_error',
        message: t('error_pinVerificationFailed') || 'Error verifying PIN. Please try again.'
      };
    }
  };

  /**
   * ✅ Store credentials locally after successful online login
   * Used for offline authentication on subsequent visits
   */
  const storeCredentialsLocally = async (pinInput) => {
    try {
      const pinHash = hashPin(pinInput);
      await indexedDbAdapter.kvSet(
        `pin_credentials_${riderId}`,
        JSON.stringify({ 
          pinHash, 
          storedAt: new Date().toISOString(),
          riderId 
        })
      );
      
      // Clear any previous attempt counts on successful login
      await indexedDbAdapter.delete(`pin_attempts_${riderId}`);
      await indexedDbAdapter.delete(`pin_lock_${riderId}`);
      
      console.log('✅ Credentials stored locally for offline access');
    } catch (err) {
      console.warn('⚠️ Failed to store credentials locally:', err);
    }
  };

  /**
   * ✅ Try online login first, fall back to offline
   */
  const handleLogin = async () => {
    try {
      // Check if account is locked
      if (await isAccountLockedOffline()) {
        setLocked(true);
        setError(t('pin.locked'));
        showCriticalError(t('pin.locked'), 'account_locked');
        return;
      }

      setLoggingIn(true);
      clearCriticalError();

      // ✅ ONLINE: Try API first
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting online login...');
          const res = await api.post('/onboarding/pin/login', { rider_id: riderId, pin });

          if (res.data.ok) {
            // ✅ Success: Store credentials locally for offline access
            await storeCredentialsLocally(pin);
            
            // ✅ Queue login event for analytics
            await addToSyncQueue({
              id: `login_${riderId}_${Date.now()}`,
              type: 'login_event',
              endpoint: `/onboarding/pin/login-event?rider_id=${riderId}`,
              data: { rider_id: riderId, method: 'pin', timestamp: new Date() },
              timestamp: new Date(),
            });

            console.log('✅ Online login successful');
            setLoggingIn(false);
            navigation.replace('Home');
            return;
          }

          // Handle online login failure
          if (res.data.error === 'locked') {
            // Lock on server - store lock locally too
            const lockExpiry = new Date().getTime() + (15 * 60 * 1000);
            await indexedDbAdapter.kvSet(
              `pin_lock_${riderId}`,
              JSON.stringify({ locked: true, expiresAt: lockExpiry })
            );
            
            setLocked(true);
            setError(t('pin.locked'));
            showCriticalError(t('pin.locked'), 'account_locked');
          } else {
            // Track failed attempt
            setAttemptsLeft(res.data.attempts_left);
            setError(t('pin.incorrect', { attempts_left: res.data.attempts_left }));
          }
          setPin('');
          setLoggingIn(false);
          return;
        } catch (apiErr) {
          console.warn('⚠️ Online login failed, trying offline...', apiErr.message);
          // Fall through to offline verification
        }
      }

      // ✅ OFFLINE: Verify against local stored hash
      console.log('🔌 Attempting offline login...');
      const offlineResult = await verifyPinOffline(pin);

      if (offlineResult.ok) {
        console.log('✅ Offline login successful');
        setLoggingIn(false);
        navigation.replace('Home');
        return;
      }

      // Offline verification failed
      if (offlineResult.error === 'locked') {
        setLocked(true);
        setError(offlineResult.message);
        showCriticalError(offlineResult.message, 'account_locked');
      } else if (offlineResult.error === 'offline_no_credentials') {
        // No stored credentials and offline - need internet
        setError(t('error_offlineNoCredentials') || 'Cannot verify PIN offline. Please connect to the internet.');
        showCriticalError(
          t('error_offlineNoCredentials') || 'Cannot verify PIN offline. Please connect to the internet.',
          'offline_no_credentials'
        );
      } else {
        setAttemptsLeft(offlineResult.attempts_left);
        setError(offlineResult.message);
      }
      
      setPin('');
      setLoggingIn(false);
    } catch (err) {
      console.error('❌ Login error:', err);
      showCriticalError(
        err.message || t('error_loginFailed') || 'Login failed. Please try again.',
        'login_error'
      );
      setPin('');
      setLoggingIn(false);
    }
  };

  // Per product decision, every onboarding/login screen except Language Selection shows a back arrow
  function handleBack() {
    BackHandler.exitApp();
  }

  const firstInitial = (fullName || '').trim().charAt(0).toUpperCase();
  const greeting = `${scene.greeting}${fullName ? `, ${fullName.split(' ')[0]}` : ''}!`;

  return (
    <View style={styles.container}>
      <SkyHeroBand
        scene={scene}
        onBack={handleBack}
        chipLabel={scene.label}
        avatarInitial={firstInitial}
        greeting={greeting}
        subtitle={t('pin.login_title')}
      />

      {/* ✅ CRITICAL ERROR ONLY - No status banners */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.pinRow}>
        <DigitBoxInput 
          length={4} 
          value={pin} 
          onChange={setPin} 
          masked={!revealed} 
          disabled={locked || loggingIn} 
        />
        <TouchableOpacity 
          style={[styles.eyeBtn, revealed && styles.eyeBtnActive]} 
          onPress={() => setRevealed((r) => !r)} 
          disabled={locked || loggingIn}
        >
          <Text style={{ fontSize: 15 }}>{revealed ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>

      {error && (
        // EXC-SB04-003: below 2 attempts remaining, the pill turns red
        <View style={[styles.attemptsPill, attemptsLeft !== null && attemptsLeft <= 2 && styles.attemptsPillLow]}>
          <Text style={styles.attemptsPillText}>⚠️ {error}</Text>
        </View>
      )}

      <PrimaryButton 
        label={loggingIn ? (t('logging_in') || 'Logging In...') : 'Log In'} 
        glow 
        onPress={handleLogin} 
        disabled={pin.length !== 4 || locked || loggingIn}
      />

      {loggingIn && (
        <ActivityIndicator 
          size="small" 
          color="#ff7a1a" 
          style={styles.spinner}
        />
      )}

      <Text 
        style={styles.link} 
        onPress={() => {
          clearCriticalError();
          navigation.navigate('PinRecovery', { riderId });
        }}
      >
        {t('pin.forgot_link')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f6f4ef' 
  },
  
  // ✅ CRITICAL ERROR BANNER - Clean, minimal
  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
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

  pinRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 12, 
    marginTop: 22, 
    paddingHorizontal: 20 
  },
  eyeBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    borderWidth: 1.5, 
    borderColor: '#e7e4db', 
    backgroundColor: '#fff', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  eyeBtnActive: { 
    backgroundColor: '#ff7a1a', 
    borderColor: '#ff7a1a' 
  },
  attemptsPill: { 
    alignSelf: 'center', 
    backgroundColor: '#fff7ec', 
    borderWidth: 1, 
    borderColor: '#ffe3c2', 
    borderRadius: 999, 
    paddingVertical: 6, 
    paddingHorizontal: 13, 
    marginTop: 12 
  },
  attemptsPillLow: { 
    backgroundColor: '#fdecea', 
    borderColor: '#f6cac7' 
  },
  attemptsPillText: { 
    fontSize: 11.5, 
    fontWeight: '700', 
    color: '#e5650a' 
  },
  spinner: {
    marginTop: 12,
    alignSelf: 'center'
  },
  link: { 
    color: '#e5650a', 
    fontSize: 12.5, 
    fontWeight: '700', 
    textAlign: 'center', 
    marginTop: 16, 
    marginBottom: 20 
  },
});