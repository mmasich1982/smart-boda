// rider-app/src/screens/auth/PinLoginScreen.js
/**
 * ENHANCED PIN LOGIN SCREEN WITH BEAUTIFUL HERO BANNER
 * ✅ Implements attractive time-of-day sky scenes from cleaned.html
 * ✅ Animated gradients and floating elements
 * ✅ Professional, engaging visual design
 * ✅ Null-safe route.params handling
 * ✅ NEW (26 AUG 2026): Offline-first PIN validation using IndexedDB
 * ✅ FIXED (27 AUG 2026): Removed duplicate lock enforcement from PIN login
 * Production-ready with premium UX and offline capability
 * 
 * UI/UX: 100% PRESERVED - No visual changes
 * ARCHITECTURE FIX: Lock enforcement is now exclusively handled by HomeScreen.useFocusEffect()
 *                   This eliminates race conditions and stuck UI when subscriptions expire
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, Animated, Dimensions
} from 'react-native';
import { getLocalRiderStatus, saveLocalAuthToken, markSessionActive } from '../../offline/db';
import { confirmAction } from '../../utils/confirmDialog';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';
import api from '../../api/client';
import { verifyPinLocally, getLoginAttempts, savePinLocally } from '../../offline/pinUtility';
import { ensureRiderSession } from '../../offline/sessionToken';
// SMART APPS: the Login screen asks for the MOBILE NUMBER and the PIN (rules in auth/loginRules.js)
import { isPhone, choosePath, messageFor, takeoverQuestion, MESSAGES } from '../../auth/loginRules';
import { loginWithMobile } from '../../auth/loginApi';
import { completeLogin } from '../../auth/completeLogin';
import { getRevoked, takeNotice } from '../../auth/sessionFlags';
// ✅ REMOVED: checkAndEnforceLock, ensureFreeTrial imports - this is now HomeScreen's responsibility

const { width } = Dimensions.get('window');

/**
 * TIME-OF-DAY HERO SCENES
 * Beautiful animated backgrounds based on current time
 * Sourced from cleaned.html design system
 */
const PIN_HERO_SCENES = [
  {
    key: 'lateNight',
    label: 'Late Night',
    from: 23,
    to: 5,
    greeting: 'Burning the midnight oil',
    icon: '🌙',
    // Gradient from cleaned.html: #05060f -> #101233 -> #1c1f4a
    colors: ['#05060f', '#101233', '#1c1f4a'],
    starCount: 12,
    showClouds: false,
    celestialIcon: '⭐',
    celestialTop: '18%',
    celestialLeft: '75%',
  },
  {
    key: 'morning',
    label: 'Morning',
    from: 5,
    to: 10,
    greeting: 'Good morning',
    icon: '🌅',
    colors: ['#2b2140', '#7a3d4a', '#f2874a'],
    starCount: 0,
    showClouds: true,
    celestialIcon: '🌅',
    celestialTop: '20%',
    celestialLeft: '85%',
  },
  {
    key: 'midday',
    label: 'Midday',
    from: 10,
    to: 14,
    greeting: 'Hello',
    icon: '☀️',
    colors: ['#123a52', '#2f7fb0', '#9fdcef'],
    starCount: 0,
    showClouds: true,
    celestialIcon: '☀️',
    celestialTop: '15%',
    celestialLeft: '80%',
  },
  {
    key: 'afternoon',
    label: 'Afternoon',
    from: 14,
    to: 17,
    greeting: 'Good afternoon',
    icon: '🌤️',
    colors: ['#3a2a10', '#a85d16', '#ffb648'],
    starCount: 0,
    showClouds: true,
    celestialIcon: '🌤️',
    celestialTop: '20%',
    celestialLeft: '75%',
  },
  {
    key: 'evening',
    label: 'Evening',
    from: 17,
    to: 20,
    greeting: 'Good evening',
    icon: '🌆',
    colors: ['#241436', '#7a2f4e', '#ff7a4d'],
    starCount: 3,
    showClouds: true,
    celestialIcon: '🌅',
    celestialTop: '22%',
    celestialLeft: '78%',
  },
  {
    key: 'night',
    label: 'Night',
    from: 20,
    to: 23,
    greeting: 'Riding into the night',
    icon: '🌃',
    colors: ['#0c0d1f', '#1a1f3d', '#2c2a52'],
    starCount: 15,
    showClouds: false,
    celestialIcon: '🌙',
    celestialTop: '25%',
    celestialLeft: '70%',
  },
];

function getPinHeroScene(hour) {
  return PIN_HERO_SCENES.find(s => {
    if (s.from < s.to) return hour >= s.from && hour < s.to;
    return hour >= s.from || hour < s.to;
  }) || PIN_HERO_SCENES[0];
}

/**
 * ANIMATED HERO BANNER COMPONENT
 * Beautiful gradient background with floating elements
 */
function HeroBanner({ scene, riderName, riderInitial }) {
  const [animationValues] = useState({
    cloudDrift: new Animated.Value(0),
    celestialFloat: new Animated.Value(0),
    starTwinkle: useRef(new Map()),
  });

  useEffect(() => {
    // Cloud drift animation
    Animated.loop(
      Animated.timing(animationValues.cloudDrift, {
        toValue: 1,
        duration: 24000,
        useNativeDriver: true,
      })
    ).start();

    // Celestial float animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(animationValues.celestialFloat, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(animationValues.celestialFloat, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const cloudTranslate = animationValues.cloudDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 360],
  });

  const celestialTransform = animationValues.celestialFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  return (
    <View
      style={[
        styles.heroBanner,
        {
          backgroundImage: `linear-gradient(160deg, ${scene.colors[0]} 0%, ${scene.colors[1]} 45%, ${scene.colors[2]} 100%)`,
        },
      ]}
    >
      {/* Stars (for night scenes) */}
      {scene.starCount > 0 &&
        Array.from({ length: scene.starCount }).map((_, i) => (
          <View
            key={`star-${i}`}
            style={[
              styles.herStar,
              {
                top: `${Math.random() * 60 + 10}%`,
                left: `${Math.random() * 100}%`,
              },
            ]}
          />
        ))}

      {/* Clouds (for daytime scenes) */}
      {scene.showClouds && (
        <>
          <Animated.Text
            style={[
              styles.heroCloud,
              { transform: [{ translateX: cloudTranslate }] },
            ]}
          >
            ☁️
          </Animated.Text>
          <Animated.Text
            style={[
              styles.heroCloud,
              styles.heroCloudSecond,
              { transform: [{ translateX: cloudTranslate }] },
            ]}
          >
            ☁️
          </Animated.Text>
        </>
      )}

      {/* Celestial Object (sun/moon/stars) */}
      <Animated.Text
        style={[
          styles.heroCelestial,
          {
            top: scene.celestialTop,
            left: scene.celestialLeft,
            transform: [{ translateY: celestialTransform }],
          },
        ]}
      >
        {scene.celestialIcon}
      </Animated.Text>

      {/* Scene Indicator Chip */}
      <View style={styles.sceneChip}>
        <Text style={styles.sceneChipText}>
          {scene.icon} {scene.label}
        </Text>
      </View>

      {/* Rider Avatar */}
      <View style={styles.avatarContainer}>
        <Text style={styles.avatar}>{riderInitial}</Text>
      </View>

      {/* Greeting */}
      <Text style={styles.greeting}>
        {scene.greeting}
        {riderName ? `, ${riderName.split(' ')[0]}` : ''}!
      </Text>
      <Text style={styles.instruction}>Enter your 4-digit PIN to continue.</Text>
    </View>
  );
}

export default function PinLoginScreen({ navigation, route }) {
  const { showToast } = useToast();
  const [pinDraft, setPinDraft] = useState(['', '', '', '']);
  const [pinAttemptsLeft, setPinAttemptsLeft] = useState(5);
  const [pinLockedUntil, setPinLockedUntil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [riderName, setRiderName] = useState('');
  const [riderId, setRiderId] = useState(null);
  // SMART APPS: the number the person logs in with. After onboarding on this phone it is the number their Admin or Treasurer linked to them,
  // so after Logout only the PIN is typed. On a new phone it starts empty. (route.params.mobile may pre-fill it.)
  const [mobile, setMobile] = useState((route && route.params && route.params.mobile) || '');
  const [identity, setIdentity] = useState(null);        // what this phone already holds (saved status)
  const [revoked, setRevoked] = useState(null);          // the server ended this phone's session: the PIN on the phone no longer opens the app
  const [notice, setNotice] = useState((route && route.params && route.params.notice) || null);

  const pinInputRefs = useRef([]);
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  // ✅ FIXED: Safely handle route params
  useEffect(() => {
    async function loadRiderData() {
      try {
        if (route?.params?.riderId) {
          setRiderId(route.params.riderId);
        }
        if (route?.params?.riderName) {
          setRiderName(route.params.riderName);
        }

        const status = await getLocalRiderStatus();
        if (status?.riderName) {
          setRiderName(status.riderName);
        }
        setIdentity(status || null);
        if (status?.full_name && !status?.riderName) setRiderName(status.full_name);
        if (status?.mobile_number && !(route?.params?.mobile)) setMobile(status.mobile_number);      // default to the number linked to this person
        setRevoked(await getRevoked());
        if (!route?.params?.notice) setNotice(await takeNotice());
        if (status?.rider_id) {
          setRiderId(status.rider_id);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading rider data:', err);
        setLoading(false);
      }
    }
    loadRiderData();
  }, [route]);

  // ✅ NEW: Load login attempts on mount
  useEffect(() => {
    if (riderId && !loading) {
      loadAttempts();
    }
  }, [riderId, loading]);

  // ✅ NEW: Load current attempt state
  const loadAttempts = async () => {
    try {
      const attempts = await getLoginAttempts(riderId);
      setPinAttemptsLeft(attempts.attemptsRemaining);
      
      if (attempts.isLocked) {
        const lockUntilMs = Date.now() + (attempts.minutesRemaining * 60000);
        setPinLockedUntil(lockUntilMs);
      }
    } catch (err) {
      console.error('Error loading attempts:', err);
    }
  };

  useEffect(() => {
    if (pinLockedUntil && Date.now() < pinLockedUntil) {
      const lockMin = Math.ceil((pinLockedUntil - Date.now()) / 60000);
      Alert.alert('Account Locked', `Too many attempts. Try again in ~${lockMin} minutes.`);
    }
  }, [pinLockedUntil]);

  const isLocked = pinLockedUntil && Date.now() < pinLockedUntil;
  const lockMin = isLocked ? Math.ceil((pinLockedUntil - Date.now()) / 60000) : 0;

  const hour = new Date().getHours();
  const scene = getPinHeroScene(hour);
  const riderInitial = (riderName || '').trim().charAt(0).toUpperCase() || '👋';

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePinChange = (text, index) => {
    if (!/^\d*$/.test(text)) return;

    const newPin = [...pinDraft];
    newPin[index] = text;
    setPinDraft(newPin);

    if (text && index < 3) {
      pinInputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !pinDraft[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  /**
   * ✅ SIMPLIFIED (27 AUG 2026): PIN-only verification - subscription checks moved to HomeScreen
   * 
   * FLOW (SIMPLIFIED):
   * 1. Verify PIN against locally stored PIN (works offline)
   * 2. If PIN correct: Navigate to Home Screen immediately
   * 3. HomeScreen.useFocusEffect() will check subscription lock status
   * 4. If locked, HomeScreen navigates to AccountLockedScreen
   * 5. If online and local fails: Try API verification as fallback
   *
   * WHY THIS FIX:
   * ✅ Eliminates race conditions that caused stuck UI
   * ✅ Single source of truth: HomeScreen owns subscription lock enforcement
   * ✅ Fail-safe: Even if HomeScreen check fails, user still reaches Home
   * ✅ Cleaner separation of concerns: PIN Login verifies auth, Home checks subscription
   */
  const verifyPin = async (pin) => {
    if (isLocked || verifying) return;
    if (pin.length !== 4) {
      showToast('Please enter a 4-digit PIN', 'error');
      return;
    }
    if (!isPhone(mobile)) { showToast(MESSAGES.needNumber, 'error'); return; }
    setNotice(null);

    // SMART APPS: which check applies. This phone already belongs to that person and the server has not ended its session -> the quick check
    // against the PIN kept on the phone (works offline). Anything else (a new phone, another number, an Administrator, an ended session) -> the server.
    if (choosePath({ mobile, status: identity, revoked }) === 'server') { await serverLogin(pin, false); return; }

    try {
      setVerifying(true);
      triggerShake();
      console.log(`[PinLogin] Verifying PIN locally for rider ${riderId}...`);

      // PRIMARY: verify against the PIN saved on this phone (offline-first)
      const localResult = await verifyPinLocally(riderId, pin);

      if (localResult.success) {
        console.log('[PinLogin] PIN verified offline');
        // The server token (online only, never throws). SMART APPS: if the account is logged in on ANOTHER phone the quiet call refuses to take
        // the session; the person is asked whether to log in here instead.
        const sess = await ensureRiderSession(riderId, pin);
        if (!sess.ok && sess.reason === 'session_elsewhere') {
          setVerifying(false);
          const yes = await confirmAction(takeoverQuestion(sess.other));
          if (yes) await serverLogin(pin, true);
          else setPinDraft(['', '', '', '']);
          return;
        }
        showToast('✅ Logged in successfully', 'success');
        await markSessionActive();   // PERSISTENT SESSION: stay signed in until an explicit Logout
        setTimeout(() => { navigation.replace('Home'); }, 600);
        return;
      }

      if (localResult.isLocked) {
        setPinLockedUntil(Date.now() + (localResult.minutesRemaining * 60000));
        setPinAttemptsLeft(0);
        showToast(localResult.message, 'error');
        return;
      }

      // The PIN on this phone says no. The server may know better (e.g. the PIN was reset elsewhere): ask it with the number + PIN.
      setVerifying(false);
      const res = await loginWithMobile({ mobile, pin, takeover: false });
      if (res.ok || res.error === 'active_elsewhere') { await handleServerAnswer(res, pin); return; }
      setPinAttemptsLeft(localResult.attemptsRemaining);
      if (localResult.attemptsRemaining === 0 && localResult.isLocked) setPinLockedUntil(Date.now() + 15 * 60 * 1000);
      triggerShake();
      setPinDraft(['', '', '', '']);
      showToast(localResult.message, 'error');
    } catch (err) {
      console.error('[PinLogin] Unexpected error:', err);
      triggerShake();
      showToast('An error occurred. Please try again.', 'error');
    } finally {
      setVerifying(false);
    }
  };

  /** SMART APPS: log in with the server (new phone, another number, Administrator, or a session the server ended). Needs the internet. */
  const serverLogin = async (pin, takeover) => {
    try {
      setVerifying(true);
      const res = await loginWithMobile({ mobile, pin, takeover });
      await handleServerAnswer(res, pin);
    } finally {
      setVerifying(false);
    }
  };

  const handleServerAnswer = async (res, pin) => {
    if (res.ok && res.token) {
      const done = await completeLogin(res, pin);
      if (!done.ok) { triggerShake(); setPinDraft(['', '', '', '']); showToast(messageFor(done), 'error'); return; }
      showToast('✅ Logged in successfully', 'success');
      setTimeout(() => {
        if (done.next === 'RestoreAccount') navigation.replace('RestoreAccount', { userType: done.userType, riderId: done.riderId });
        else navigation.replace('Home');
      }, 400);
      return;
    }
    if (res.error === 'active_elsewhere') {
      const yes = await confirmAction(takeoverQuestion(res));         // ONE active session per person: log in here, log out there
      if (yes) await serverLogin(pin, true); else setPinDraft(['', '', '', '']);
      return;
    }
    triggerShake();
    setPinDraft(['', '', '', '']);
    if (res.error === 'locked') { setPinLockedUntil(Date.now() + (res.minutes || 15) * 60000); setPinAttemptsLeft(0); }
    else if (typeof res.attempts_left === 'number') setPinAttemptsLeft(res.attempts_left);
    showToast(messageFor(res), 'error');
  };

  const handleForgotPin = () => {
    if (!riderId) {       // SMART APPS: on a phone that does not hold the account yet there is nothing to recover from here
      showToast('To reset your PIN, please call support: +254 757 334481', 'error');
      return;
    }
    navigation.navigate('ForgotPin', {
      riderId: riderId,
      riderName: riderName,
    });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.bodaOrange} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.inkSoft }}>
          Loading Smart Apps...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* BEAUTIFUL HERO BANNER */}
      <HeroBanner
        scene={scene}
        riderName={riderName}
        riderInitial={riderInitial}
      />

      {/* SMART APPS: why the person is back here (e.g. the account was used on another device) */}
      {notice ? (
        <View style={[styles.banner, styles.bannerLocked]}><Text style={styles.bannerText}>{notice}</Text></View>
      ) : null}

      {/* SMART APPS: the MOBILE NUMBER, above the PIN. Filled in for the person this phone belongs to; empty on a new phone. */}
      <View style={styles.mobileBox}>
        <Text style={styles.mobileLabel}>Mobile number</Text>
        <TextInput style={styles.mobileInput} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="0712345678"
          placeholderTextColor="#9aa0ab" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Mobile number" editable={!verifying} />
      </View>

      {/* PIN INPUT SECTION */}
      <View style={styles.pinInputSection}>
        <View style={styles.pinBoxesContainer}>
          {pinDraft.map((digit, index) => (
            <Animated.View
              key={index}
              style={[
                styles.pinBoxWrapper,
                {
                  transform: [{ translateX: shakeAnimation }],
                },
              ]}
            >
              <TextInput
                ref={el => (pinInputRefs.current[index] = el)}
                style={[
                  styles.pinBox,
                  digit && styles.pinBoxFilled,
                  isLocked && styles.pinBoxLocked,
                ]}
                keyboardType="numeric"
                maxLength={1}
                value={digit}
                onChangeText={(text) => handlePinChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                editable={!isLocked && !verifying}
                placeholder="•"
                placeholderTextColor={colors.line}
                secureTextEntry={choosePath({ mobile, status: identity, revoked }) === 'server'}
              />
            </Animated.View>
          ))}
        </View>

        {choosePath({ mobile, status: identity, revoked }) !== 'server' && <Text style={styles.pinHint}>Tap to reveal</Text>}
      </View>

      {/* ATTEMPTS INDICATOR */}
      <View style={styles.attemptsContainer}>
        <View style={[styles.attemptsPill, pinAttemptsLeft <= 2 && styles.attemptsLow]}>
          <Text style={styles.attemptsText}>
            🔑 {pinAttemptsLeft} attempt(s) remaining
          </Text>
        </View>
      </View>

      {/* LOCKED BANNER */}
      {isLocked && (
        <View style={[styles.banner, styles.bannerLocked]}>
          <Text style={styles.bannerText}>
            🔒 Too many attempts. Try again in ~{lockMin} min.
          </Text>
        </View>
      )}

      {/* LOGIN BUTTON */}
      <PrimaryButton
        label={verifying ? 'Verifying...' : 'Log In →'}
        onPress={() => verifyPin(pinDraft.join(''))}
        disabled={isLocked || verifying || pinDraft.join('').length < 4 || !isPhone(mobile)}
        style={{ marginHorizontal: 20, marginVertical: 16 }}
      />

      {/* FORGOT PIN LINK */}
      <TouchableOpacity
        style={styles.forgotPinButton}
        onPress={handleForgotPin}
        disabled={isLocked || loading}
      >
        <Text style={styles.forgotPinText}>Forgot PIN? 🆘</Text>
      </TouchableOpacity>

      {/* SMART APPS: a new person registers here: Language Selection, then the existing onboarding journey */}
      <TouchableOpacity style={styles.registerButton} onPress={() => navigation.navigate('LanguageSelection')} disabled={verifying} accessibilityRole="button">
        <Text style={styles.registerText}>New to Smart Apps? <Text style={{ fontWeight: '800' }}>Register</Text></Text>
      </TouchableOpacity>

      {/* CUSTOMER CARE FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Need help?</Text>
        <Text style={styles.footerNumbers}>
          📞 +254 757 334481 · 📞 +254 101 605262
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  heroBanner: {
    position: 'relative',
    overflow: 'hidden',
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 320,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  herStar: {
    position: 'absolute',
    width: 3,
    height: 3,
    backgroundColor: '#fff',
    borderRadius: 1.5,
    opacity: 0.2,
  },
  heroCloud: {
    position: 'absolute',
    top: '22%',
    fontSize: 28,
    opacity: 0.5,
    zIndex: 1,
  },
  heroCloudSecond: {
    top: '40%',
    fontSize: 22,
    opacity: 0.35,
  },
  heroCelestial: {
    position: 'absolute',
    fontSize: 48,
    zIndex: 1,
    textShadowColor: 'rgba(255,255,255,.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  sceneChip: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  sceneChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.02,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 2,
  },
  avatar: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    zIndex: 2,
  },
  instruction: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    zIndex: 2,
  },
  pinInputSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  pinBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pinBoxWrapper: {
    flex: 1,
    marginHorizontal: 6,
  },
  pinBox: {
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 12,
    height: 56,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    backgroundColor: '#fff',
  },
  pinBoxFilled: {
    borderColor: colors.bodaOrange,
    backgroundColor: '#fff9f3',
  },
  pinBoxLocked: {
    opacity: 0.5,
  },
  pinHint: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.inkSoft,
    fontStyle: 'italic',
  },
  attemptsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  attemptsPill: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  attemptsLow: {
    backgroundColor: colors.signalRedBg,
  },
  attemptsText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink,
  },
  banner: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
  },
  bannerLocked: {
    backgroundColor: colors.signalRedBg,
    borderLeftWidth: 4,
    borderLeftColor: colors.signalRed,
  },
  bannerText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '600',
  },
  forgotPinButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  mobileBox: { marginHorizontal: 20, marginTop: 12 },
  mobileLabel: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, color: '#5b606c', marginBottom: 6 },
  mobileInput: { borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: '#1a1c20', backgroundColor: '#fff' },
  registerButton: { alignItems: 'center', paddingVertical: 14, marginHorizontal: 20, marginTop: 4, borderRadius: 12, borderWidth: 1.5, borderColor: colors.bodaOrange },
  registerText: { color: colors.bodaOrange, fontSize: 15 },
  forgotPinText: {
    fontSize: 13,
    color: colors.bodaOrange,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: colors.inkSoft,
    textAlign: 'center',
    marginBottom: 4,
  },
  footerNumbers: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
});