// rider-app/src/screens/auth/ForgotPinScreen.js
/**
 * FORGOT PIN SCREEN - STEP 1: EMAIL ENTRY (RA-01-E)
 * ✅ NEW: Email-based PIN recovery flow
 * Phase 1: Admin manual review + email dispatch
 * Phase 2: Can extend to OTP verification without app release (dynamic journey)
 * 
 * Customer Journey:
 * 1. Rider enters valid email address
 * 2. Request submitted to admin console
 * 3. Routes to confirmation screen
 */

import React, { useState, useEffect } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert
} from 'react-native';
import { getLocalRiderStatus } from '../../offline/db';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';
import api from '../../api/client';

export default function ForgotPinScreen({ navigation, route }) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [riderId, setRiderId] = useState(null);
  const [riderName, setRiderName] = useState('');

  // ✅ Load rider data from local storage
  useEffect(() => {
    async function loadRiderData() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setRiderId(status.rider_id);
        }
        if (status?.riderName) {
          setRiderName(status.riderName);
        }
        if (status?.email) {
          setEmail(status.email);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error loading rider data:', err);
        setLoading(false);
      }
    }
    loadRiderData();
  }, []);

  // ✅ Email validation helper
  const isValidEmail = (emailAddress) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailAddress);
  };

  const handleSubmitRequest = async () => {
    // Validation
    if (!email || email.trim().length === 0) {
      showToast('Please enter your email address', 'error');
      return;
    }

    if (!isValidEmail(email)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }

    if (!riderId) {
      showToast('Rider ID not found. Please go back and try again.', 'error');
      return;
    }

    try {
      setSubmitting(true);

      // Submit PIN recovery request to backend
      const response = await api.post('/pin/forgot/request-email', null, {
        params: {
          rider_id: riderId,
          email: email.trim()
        }
      });

      if (response.data?.success || response.data?.pin_recovery_id) {
        // Navigate to confirmation screen
        navigation.navigate('ForgotPinConfirmation', {
          riderId: riderId,
          email: email.trim(),
          riderName: riderName,
          recoveryRequestId: response.data.pin_recovery_id
        });
      } else {
        showToast('Failed to submit request. Please try again.', 'error');
      }
    } catch (err) {
      console.error('PIN recovery request error:', err);
      
      if (err.response?.status === 429) {
        showToast('Too many requests. Please try again later.', 'error');
      } else if (err.response?.data?.message) {
        showToast(err.response.data.message, 'error');
      } else {
        showToast('Error submitting request. Please check your connection.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.bodaOrange} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back to Login" onPress={() => navigation.goBack()} />

      <View style={styles.headerSection}>
        <Text style={styles.icon}>🔐</Text>
        <Text style={styles.title}>Recover Your PIN</Text>
        <Text style={styles.subtitle}>
          We'll help you get back into your account
        </Text>
      </View>

      <View style={styles.card}>
        {/* ✅ User-friendly message explaining the process */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>📧 How It Works</Text>
          <Text style={styles.infoText}>
            Please enter the valid email address associated with your Smart Boda account. Our admin team will verify your request and send you a new PIN within 24 hours (usually faster).
          </Text>
        </View>

        {/* Email Input */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Email Address <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.fieldHint}>
            Important: This must be the email you provided during onboarding. If you've changed your email, please contact our support team.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={colors.line}
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Important Note */}
        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>💡 Important Note</Text>
          <Text style={styles.noteText}>
            If you've lost access to your email as well, please contact our support team directly. They can help you verify your identity through other means.
          </Text>
        </View>

        {/* Phone Support Info */}
        <View style={styles.supportBox}>
          <Text style={styles.supportTitle}>📞 Can't Use This Email?</Text>
          <Text style={styles.supportText}>
            Call our customer care team:
          </Text>
          <TouchableOpacity 
            style={styles.phoneLink}
            onPress={() => Alert.alert('Contact', '+254 757 334481')}
          >
            <Text style={styles.phoneLinkText}>+254 757 334481</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.phoneLink}
            onPress={() => Alert.alert('Contact', '+254 101 605262')}
          >
            <Text style={styles.phoneLinkText}>+254 101 605262</Text>
          </TouchableOpacity>
        </View>

        {/* Submit Button */}
        <PrimaryButton
          label={submitting ? 'Submitting Request...' : 'Submit PIN Recovery Request →'}
          onPress={handleSubmitRequest}
          disabled={submitting || !email || !isValidEmail(email)}
          style={{ marginTop: 16 }}
        />

        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={submitting}
        >
          <Text style={styles.backButtonText}>← Back to PIN Login</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 4,
    borderLeftColor: colors.bodaOrange,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.bodaOrange,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  infoText: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 1.6,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: {
    color: colors.signalRed,
    fontSize: 12,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.inkSoft,
    marginBottom: 8,
    fontStyle: 'italic',
    lineHeight: 1.4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: '#fff',
    fontFamily: 'Inter',
  },
  noteBox: {
    backgroundColor: '#fff8e1',
    borderLeftWidth: 4,
    borderLeftColor: '#c98a12',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  noteTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c98a12',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  noteText: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 1.6,
  },
  supportBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  supportTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
  },
  supportText: {
    fontSize: 12,
    color: colors.inkSoft,
    marginBottom: 8,
  },
  phoneLink: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.bodaOrange,
    borderRadius: 8,
    marginBottom: 6,
  },
  phoneLinkText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 13,
    color: colors.bodaOrange,
    fontWeight: '600',
  },
});