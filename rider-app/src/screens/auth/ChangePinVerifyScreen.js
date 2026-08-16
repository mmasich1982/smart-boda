// rider-app/src/screens/auth/ChangePinVerifyScreen.js
// First step of changing PIN: verify current PIN for security
// After verification, user is guided to CreatePin screen to set new PIN

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import colors from '../../theme/colors';
import { useRiderId } from '../../rider/RiderContext';
import api from '../../api/client';

export default function ChangePinVerifyScreen({ navigation }) {
  const riderId = useRiderId();
  const [pinVerifyDraft, setPinVerifyDraft] = useState(['', '', '', '']);
  const [pinAttemptsLeft, setPinAttemptsLeft] = useState(5);
  const [pinLockedUntil, setPinLockedUntil] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const pinInputRefs = useRef([]);

  useEffect(() => {
    if (!riderId) {
      Alert.alert('Error', 'Rider ID not found. Please log in again.');
      navigation.goBack();
    }
  }, []);

  const isLocked = pinLockedUntil && Date.now() < pinLockedUntil;
  const lockMin = isLocked ? Math.ceil((pinLockedUntil - Date.now()) / 60000) : 0;

  const handlePinChange = (text, index) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue.length <= 1) {
      const newPin = [...pinVerifyDraft];
      newPin[index] = numericValue;
      setPinVerifyDraft(newPin);

      // Auto-advance to next box
      if (numericValue && index < 3) {
        pinInputRefs.current[index + 1]?.focus();
      }

      // Auto-submit when all 4 digits entered
      if (newPin[0] && newPin[1] && newPin[2] && newPin[3]) {
        submitVerify(newPin.join(''));
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !pinVerifyDraft[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  const submitVerify = async (pin) => {
    if (isLocked) {
      Alert.alert('Account Locked', `Try again in ~${lockMin} minutes.`);
      return;
    }

    const currentPin = pin || pinVerifyDraft.join('');
    if (currentPin.length !== 4) {
      Alert.alert('Error', 'Enter your current 4-digit PIN.');
      return;
    }

    try {
      setLoading(true);
      
      // Call backend to verify current PIN
      const response = await api.post('/settings/verify-current-pin', null, {
        params: {
          rider_id: riderId,
          pin: currentPin
        }
      });

      if (response.data?.verified || response.data?.ok) {
        // PIN verified - proceed to new PIN creation
        navigation.navigate('CreatePin', {
          isChangingPin: true,
          fromVerify: true
        });
      }
    } catch (error) {
      const remainingAttempts = pinAttemptsLeft - 1;
      setPinAttemptsLeft(remainingAttempts);
      setPinVerifyDraft(['', '', '', '']);

      if (remainingAttempts <= 0) {
        // Lock for 15 minutes
        const lockTime = Date.now() + 15 * 60 * 1000;
        setPinLockedUntil(lockTime);
        Alert.alert(
          'Too Many Attempts',
          'Your account is locked for 15 minutes for security. Try again later.'
        );
      } else {
        Alert.alert(
          'Incorrect PIN',
          `${remainingAttempts} attempt(s) remaining.`
        );
      }

      // Reset focus
      pinInputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <BackLink label="← Settings" onPress={() => navigation.goBack()} />

      <Text style={styles.title}>Confirm it's you</Text>
      <Text style={styles.sub}>Enter your current 4-digit PIN to continue.</Text>

      {/* PIN Input Row */}
      <View style={styles.pinInputRow}>
        <View style={styles.pinBoxesContainer}>
          {pinVerifyDraft.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => (pinInputRefs.current[index] = ref)}
              style={[
                styles.pinBox,
                digit && styles.pinBoxFilled,
                isLocked && styles.pinBoxDisabled
              ]}
              maxLength={1}
              keyboardType="numeric"
              secureTextEntry={!showPin}
              value={showPin ? digit : digit ? '•' : ''}
              onChangeText={(text) => handlePinChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              editable={!isLocked && !loading}
              placeholder="•"
              placeholderTextColor={colors.inkSoft}
            />
          ))}
        </View>

        {/* Eye Button */}
        <TouchableOpacity
          style={[styles.eyeBtn, isLocked && styles.eyeBtnDisabled]}
          onPress={() => setShowPin(!showPin)}
          disabled={isLocked || loading}
        >
          <Text style={styles.eyeEmoji}>{showPin ? '👁️' : '👁️‍🗨️'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.pinHint}>Tap 👁️ to check what you've typed</Text>

      {/* Attempts Display */}
      <View style={styles.attemptsDisplay}>
        <Text style={styles.attemptsText}>
          {pinAttemptsLeft} attempt(s) remaining
        </Text>
      </View>

      {/* Locked Banner */}
      {isLocked && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedBannerText}>
            🔒 Too many attempts. Try again in ~{lockMin} min.
          </Text>
        </View>
      )}

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          💡 For your security, we need to verify your current PIN before allowing changes.
        </Text>
      </View>

      {/* Continue Button */}
      <TouchableOpacity
        style={[styles.button, (isLocked || loading) && styles.buttonDisabled]}
        onPress={() => submitVerify()}
        disabled={isLocked || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue →</Text>
        )}
      </TouchableOpacity>

      {/* Cancel Button */}
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => navigation.goBack()}
        disabled={loading}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  contentContainer: { padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 12, marginBottom: 6 },
  sub: { fontSize: 13, color: colors.inkSoft, marginBottom: 24 },
  pinInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8
  },
  pinBoxesContainer: { flexDirection: 'row', gap: 10 },
  pinBox: {
    width: 50,
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.ink,
    backgroundColor: '#fff'
  },
  pinBoxFilled: { borderColor: colors.bodaOrange, backgroundColor: '#fff8f0' },
  pinBoxDisabled: { opacity: 0.5, backgroundColor: '#f5f5f5' },
  eyeBtn: {
    width: 50,
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9'
  },
  eyeBtnDisabled: { opacity: 0.5 },
  eyeEmoji: { fontSize: 20 },
  pinHint: { fontSize: 11.5, color: colors.inkSoft, textAlign: 'center', marginBottom: 16 },
  attemptsDisplay: { alignItems: 'center', marginBottom: 16 },
  attemptsText: { fontSize: 13, color: colors.inkSoft, fontWeight: '500' },
  lockedBanner: {
    backgroundColor: '#fce5e3',
    borderLeftWidth: 4,
    borderLeftColor: colors.signalRed,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16
  },
  lockedBannerText: { fontSize: 13, color: colors.signalRed, fontWeight: '600' },
  infoBanner: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 24
  },
  infoBannerText: { fontSize: 12, color: colors.ink, lineHeight: 16 },
  button: {
    backgroundColor: colors.bodaOrange,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: colors.bodaOrange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 40
  },
  cancelButtonText: { color: colors.ink, fontWeight: '600', fontSize: 13 }
});