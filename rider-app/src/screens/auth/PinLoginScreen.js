// rider-app/src/screens/auth/PinLoginScreen.js
/**
 * ENHANCED PIN LOGIN SCREEN WITH BEAUTIFUL HERO BANNER
 * ✅ Implements attractive time-of-day sky scenes from cleaned.html
 * ✅ Animated gradients and floating elements
 * ✅ Professional, engaging visual design
 * ✅ Null-safe route.params handling
 * Production-ready with premium UX
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, Animated, Dimensions
} from 'react-native';
import { getLocalRiderStatus } from '../../offline/db';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';
import api from '../../api/client';

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
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue.length <= 1) {
      const newPin = [...pinDraft];
      newPin[index] = numericValue;
      setPinDraft(newPin);

      if (numericValue && index < 3) {
        pinInputRefs.current[index + 1]?.focus();
      }

      if (newPin[0] && newPin[1] && newPin[2] && newPin[3]) {
        verifyPin(newPin.join(''));
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !pinDraft[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  const verifyPin = async (pin) => {
    if (isLocked) {
      Alert.alert('Account Locked', `Try again in ~${lockMin} minutes.`);
      return;
    }

    try {
      setVerifying(true);

      // ✅ FIXED: Use correct endpoint and method
      const response = await api.post('/pin/verify', { pin });

      if (response.data?.success) {
        setPinDraft(['', '', '', '']);
        setPinAttemptsLeft(5);
        showToast('Welcome back! ✅', 'success');

        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      }
    } catch (err) {
      console.error('PIN verification error:', err);

      if (err.response?.status === 429 || err.response?.status === 423) {
        setPinLockedUntil(Date.now() + 15 * 60 * 1000);
        showToast('Too many attempts. Account locked for 15 minutes.', 'error');
      } else {
        const newAttempts = pinAttemptsLeft - 1;
        setPinAttemptsLeft(newAttempts);
        setPinDraft(['', '', '', '']);
        triggerShake();

        if (newAttempts <= 0) {
          setPinLockedUntil(Date.now() + 15 * 60 * 1000);
          showToast('Too many attempts. Account locked for 15 minutes.', 'error');
        } else {
          showToast(
            `Incorrect PIN. ${newAttempts} attempt(s) remaining.`,
            'error'
          );
        }
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleForgotPin = () => {
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
          Loading Smart Boda...
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
                secureTextEntry={false}
              />
            </Animated.View>
          ))}
        </View>

        <Text style={styles.pinHint}>Tap to reveal</Text>
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
        disabled={isLocked || verifying || pinDraft.join('').length < 4}
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