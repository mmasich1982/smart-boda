import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import InlineWarning from '../../components/InlineWarning';
import { verifyRiderPin } from '../../offline/userRepository';


const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export default function ConfirmPinDetailedStatementScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const { statementId } = route.params || {};

  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [pinVisible, setPinVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pinInputRefs = useRef([]);

  useEffect(() => {
    // Check if account is locked
    const checkLockout = () => {
      if (lockedUntil && Date.now() < lockedUntil) {
        const remainingMs = lockedUntil - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        showToast(`Too many attempts. Try again in ${remainingMin} minutes.`, 'error');
      }
    };

    checkLockout();
  }, [lockedUntil, showToast]);

  const handlePinInput = (index, value) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '');

    if (digit.length > 1) {
      return; // Ignore multi-character input
    }

    const newPinDigits = [...pinDigits];
    newPinDigits[index] = digit;
    setPinDigits(newPinDigits);

    // Auto-focus next input if digit entered
    if (digit && index < PIN_LENGTH - 1) {
      pinInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all 4 digits entered
    if (newPinDigits.every((d) => d !== '')) {
      submitPin(newPinDigits.join(''));
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.nativeEvent.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    } else if (event.nativeEvent.key === 'Enter') {
      const pin = pinDigits.join('');
      if (pin.length === PIN_LENGTH) {
        submitPin(pin);
      }
    }
  };

  const submitPin = async (pin) => {
    // Prevent duplicate submissions
    if (isSubmitting) return;

    // Check if locked out
    if (lockedUntil && Date.now() < lockedUntil) {
      const remainingMs = lockedUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      showToast(`Try again in ${remainingMin} minutes.`, 'error');
      return;
    }

    try {
      setIsSubmitting(true);

      // Verify PIN with backend
      const isValid = await verifyRiderPin(pin);

      if (isValid) {
        // PIN is correct
        setPinDigits(['', '', '', '']);
        setAttemptsLeft(MAX_ATTEMPTS);
        setLockedUntil(null);

        showToast('PIN verified successfully', 'success');

        // Navigate to email screen
        navigation.navigate('DetailedStatementEmail', {
          statementId,
        });
      } else {
        // PIN is incorrect
        const newAttemptsLeft = attemptsLeft - 1;
        setAttemptsLeft(newAttemptsLeft);
        setPinDigits(['', '', '', '']);

        if (newAttemptsLeft <= 0) {
          // Lock account for 15 minutes
          const lockTime = Date.now() + LOCKOUT_DURATION_MS;
          setLockedUntil(lockTime);
          showToast('Too many incorrect attempts. Try again in 15 minutes.', 'error');
        } else {
          showToast(`Incorrect PIN. ${newAttemptsLeft} attempt(s) remaining.`, 'error');
        }
      }
    } catch (err) {
      console.error('PIN verification error:', err);
      
      // Handle specific error cases
      if (err.code === 'ACCOUNT_LOCKED') {
        setLockedUntil(Date.now() + LOCKOUT_DURATION_MS);
        showToast('Account locked. Too many incorrect attempts.', 'error');
      } else if (err?.response?.status === 404) {
        showToast('Account not found. Please contact support.', 'error');
      } else if (err?.response?.status === 500) {
        showToast('Server error. Please try again later.', 'error');
      } else {
        showToast('Error verifying PIN. Please try again.', 'error');
      }
      
      // Clear the entered PIN on error
      setPinDigits(['', '', '', '']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePinVisibility = () => {
    setPinVisible(!pinVisible);
  };

  const isLocked = lockedUntil && Date.now() < lockedUntil;
  const remainingMin = isLocked ? Math.ceil((lockedUntil - Date.now()) / 60000) : 0;

  return (
    <ScrollView style={styles.container}>
      <BackLink label="Back" onPress={() => navigation.goBack()} />

      <Text style={styles.screenTitle}>Confirm Your PIN</Text>
      <Text style={styles.screenSub}>
        Enter your 4-digit PIN to continue requesting a detailed statement. RA-18-C · PIN
        confirmation before detailed statement request
      </Text>

      {/* PIN Input Boxes */}
      <View style={styles.pinInputContainer}>
        <View style={styles.pinBoxesRow}>
          {Array(PIN_LENGTH)
            .fill(0)
            .map((_, index) => (
              <TextInput
                key={index}
                ref={(ref) => (pinInputRefs.current[index] = ref)}
                style={[
                  styles.pinBox,
                  isLocked && styles.pinBoxDisabled,
                  pinDigits[index] && styles.pinBoxFilled,
                ]}
                placeholder="•"
                placeholderTextColor="#ccc"
                maxLength={1}
                keyboardType="numeric"
                secureTextEntry={!pinVisible}
                value={pinDigits[index]}
                onChangeText={(value) => handlePinInput(index, value)}
                onKeyPress={(e) => handleKeyDown(index, e)}
                editable={!isLocked && !isSubmitting}
              />
            ))}
        </View>

        <TouchableOpacity
          style={[styles.pinEyeBtn, isLocked && styles.pinEyeBtnDisabled]}
          onPress={togglePinVisibility}
          disabled={isLocked || isSubmitting}
        >
          <Text style={styles.pinEyeBtnText}>{pinVisible ? '👁️' : '👁️'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.pinRevealHint}>Tap 👁️ to check what you've typed</Text>

      {/* Attempts Counter */}
      <Text style={styles.attemptsText}>{attemptsLeft} attempt(s) remaining</Text>

      {/* Lockout Warning */}
      {isLocked && (
        <InlineWarning
          icon="🔒"
          message={`Too many attempts. Try again in ~${remainingMin} min.`}
          type="error"
        />
      )}

      {/* Continue Button */}
      <PrimaryButton
        label={isSubmitting ? 'Verifying...' : 'Continue →'}
        onPress={() => submitPin(pinDigits.join(''))}
        disabled={isLocked || !pinDigits.every((d) => d !== '') || isSubmitting}
      />

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 16,
  },
  pinInputContainer: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 20,
  },
  pinBoxesRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 10,
  },
  pinBox: {
    width: 50,
    height: 60,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1a1c20',
    backgroundColor: '#fff',
  },
  pinBoxFilled: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
  },
  pinBoxDisabled: {
    backgroundColor: '#f0f0f0',
    color: '#ccc',
  },
  pinEyeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinEyeBtnDisabled: {
    opacity: 0.5,
  },
  pinEyeBtnText: {
    fontSize: 18,
  },
  pinRevealHint: {
    fontSize: 11,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 12,
  },
  attemptsText: {
    fontSize: 12,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 14,
  },
});