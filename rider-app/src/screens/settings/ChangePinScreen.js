// rider-app/src/screens/settings/ChangePinScreensComplete.js
/**
 * COMPLETE CHANGE PIN SCREENS (RA-22-004)
 * Two-part flow:
 * 1. ChangePinVerifyScreen - Verify current PIN
 * 2. ChangePinNewScreen - Set new PIN
 */

import React, { useState, useRef } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert
} from 'react-native';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';
import api from '../../api/client';

// ============================================================
// SCREEN 1: CHANGE PIN VERIFY
// ============================================================
export function ChangePinVerifyScreen({ navigation }) {
  const { state: riderState } = useRider();
  const { showToast } = useToast();

  const [localRiderId, setLocalRiderId] = React.useState(null);
  const [currentPin, setCurrentPin] = useState(['', '', '', '']);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [locked, setLocked] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const pinRefs = useRef([]);

  React.useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading riderId:', err);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || riderState?.riderId;

  const handlePinChange = (text, index) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue.length <= 1) {
      const newPin = [...currentPin];
      newPin[index] = numericValue;
      setCurrentPin(newPin);

      if (numericValue && index < 3) {
        pinRefs.current[index + 1]?.focus();
      }

      if (newPin[0] && newPin[1] && newPin[2] && newPin[3]) {
        handleContinue(newPin.join(''));
      }
    }
  };

  const handleContinue = async (pin = null) => {
    const pinToVerify = pin || currentPin.join('');

    if (pinToVerify.length !== 4) {
      showToast('Enter your current 4-digit PIN', 'error');
      return;
    }

    try {
      setVerifying(true);

      await api.post('/settings/verify-current-pin', null, {
        params: {
          rider_id: effectiveRiderId,
          pin: pinToVerify
        }
      });

      // Success - navigate to new PIN screen
      navigation.navigate('ChangePinNew');
    } catch (err) {
      console.error('Error verifying PIN:', err);

      if (err.response?.status === 423) {
        setLocked(true);
        showToast('Too many attempts. Try again in ~15 min.', 'error');
      } else {
        const left = err.response?.data?.attempts_left ?? attemptsLeft - 1;
        setAttemptsLeft(left);
        setCurrentPin(['', '', '', '']);

        if (left <= 0) {
          setLocked(true);
          showToast('Too many attempts. Account locked for 15 minutes.', 'error');
        } else {
          showToast(`Incorrect PIN. ${left} attempt(s) remaining.`, 'error');
        }
      }
    } finally {
      setVerifying(false);
    }
  };

  if (!effectiveRiderId) {
    return (
      <View style={styles.container}>
        <BackLink label="← Settings" onPress={() => navigation.navigate('Settings')} />
        <Text style={styles.errorText}>Unable to load rider information</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Settings" onPress={() => navigation.navigate('Settings')} />

      <Text style={styles.title}>Confirm it's you</Text>
      <Text style={styles.subtitle}>Enter your current 4-digit PIN to continue.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Current PIN</Text>
        <View style={styles.pinContainer}>
          {currentPin.map((digit, index) => (
            <TextInput
              key={index}
              ref={el => (pinRefs.current[index] = el)}
              style={[styles.pinBox, digit && styles.pinBoxFilled]}
              keyboardType="numeric"
              maxLength={1}
              value={digit}
              onChangeText={(text) => handlePinChange(text, index)}
              editable={!locked && !verifying}
              secureTextEntry
              placeholder="•"
              placeholderTextColor={colors.line}
            />
          ))}
        </View>

        <Text style={styles.attemptsText}>
          {attemptsLeft} attempt(s) remaining
        </Text>

        <PrimaryButton
          label={verifying ? 'Verifying...' : 'Continue →'}
          onPress={() => handleContinue()}
          disabled={locked || verifying || currentPin.join('').length < 4}
          style={{ marginTop: 16 }}
        />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ============================================================
// SCREEN 2: CHANGE PIN NEW
// ============================================================
export function ChangePinNewScreen({ navigation }) {
  const { state: riderState } = useRider();
  const { showToast } = useToast();

  const [localRiderId, setLocalRiderId] = React.useState(null);
  const [newPin, setNewPin] = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [saving, setSaving] = useState(false);

  const newPinRefs = useRef([]);
  const confirmPinRefs = useRef([]);

  React.useEffect(() => {
    async function loadRiderId() {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading riderId:', err);
      }
    }
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || riderState?.riderId;

  const handleNewPinChange = (text, index) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue.length <= 1) {
      const newPin_ = [...newPin];
      newPin_[index] = numericValue;
      setNewPin(newPin_);

      if (numericValue && index < 3) {
        newPinRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleConfirmPinChange = (text, index) => {
    const numericValue = text.replace(/[^0-9]/g, '');
    if (numericValue.length <= 1) {
      const confirm_ = [...confirmPin];
      confirm_[index] = numericValue;
      setConfirmPin(confirm_);

      if (numericValue && index < 3) {
        confirmPinRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleSave = async () => {
    const pin = newPin.join('');
    const confirm = confirmPin.join('');

    if (pin.length !== 4) {
      showToast('New PIN must be 4 digits', 'error');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      showToast('PIN must contain only numbers', 'error');
      return;
    }
    if (pin !== confirm) {
      showToast('PINs do not match', 'error');
      return;
    }

    try {
      setSaving(true);

      await api.post('/settings/change-pin', null, {
        params: {
          rider_id: effectiveRiderId,
          new_pin: pin
        }
      });

      showToast('PIN changed successfully! ✅', 'success');
      setTimeout(() => {
        navigation.navigate('Settings');
      }, 1500);
    } catch (err) {
      console.error('Error changing PIN:', err);
      showToast(err.response?.data?.message || 'Failed to change PIN', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!effectiveRiderId) {
    return (
      <View style={styles.container}>
        <BackLink label="← Settings" onPress={() => navigation.navigate('Settings')} />
        <Text style={styles.errorText}>Unable to load rider information</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />

      <Text style={styles.title}>Create New PIN</Text>
      <Text style={styles.subtitle}>Choose a new 4-digit PIN for your account.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>New PIN</Text>
        <View style={styles.pinContainer}>
          {newPin.map((digit, index) => (
            <TextInput
              key={index}
              ref={el => (newPinRefs.current[index] = el)}
              style={[styles.pinBox, digit && styles.pinBoxFilled]}
              keyboardType="numeric"
              maxLength={1}
              value={digit}
              onChangeText={(text) => handleNewPinChange(text, index)}
              editable={!saving}
              secureTextEntry
              placeholder="•"
              placeholderTextColor={colors.line}
            />
          ))}
        </View>

        <Text style={[styles.label, { marginTop: 16 }]}>Confirm PIN</Text>
        <View style={styles.pinContainer}>
          {confirmPin.map((digit, index) => (
            <TextInput
              key={index}
              ref={el => (confirmPinRefs.current[index] = el)}
              style={[styles.pinBox, digit && styles.pinBoxFilled]}
              keyboardType="numeric"
              maxLength={1}
              value={digit}
              onChangeText={(text) => handleConfirmPinChange(text, index)}
              editable={!saving}
              secureTextEntry
              placeholder="•"
              placeholderTextColor={colors.line}
            />
          ))}
        </View>

        <Text style={styles.hint}>
          💡 Use a PIN you can remember but others can't guess.
        </Text>

        <PrimaryButton
          label={saving ? 'Saving...' : 'Save New PIN'}
          onPress={handleSave}
          disabled={saving || newPin.join('').length < 4}
          style={{ marginTop: 16 }}
        />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.signalRed,
    textAlign: 'center',
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pinBox: {
    width: '22%',
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
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
  attemptsText: {
    fontSize: 11,
    color: colors.inkSoft,
    fontWeight: '600',
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    color: colors.inkSoft,
    marginVertical: 12,
    fontStyle: 'italic',
    lineHeight: 1.4,
  },
});