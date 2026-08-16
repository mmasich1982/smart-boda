// rider-app/src/screens/auth/ForgotPinConfirmationScreen.js
/**
 * FORGOT PIN CONFIRMATION SCREEN - STEP 2 (RA-01-E)
 * ✅ NEW: Shows confirmation after email submission
 * Rider sees message that admin will process within 24 hours
 * 
 * This screen confirms:
 * - Request was received successfully
 * - Admin will review and respond within 24 hours
 * - Rider should check their email
 */

import React, { useEffect, useState } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, Animated
} from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';

export default function ForgotPinConfirmationScreen({ navigation, route }) {
  const { showToast } = useToast();
  const { email, riderName } = route.params || {};
  const [fadeAnim] = useState(new Animated.Value(0));

  // Animate in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleReturnToLogin = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'PinLogin' }]
    });
  };

  const firstName = (riderName || '').split(' ')[0] || 'Rider';

  return (
    <ScrollView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* SUCCESS ICON */}
        <View style={styles.iconContainer}>
          <Text style={styles.successIcon}>✅</Text>
        </View>

        {/* MAIN MESSAGE */}
        <Text style={styles.title}>Request Received!</Text>
        <Text style={styles.subtitle}>
          Hi {firstName}, your PIN recovery request has been received by our Smart Boda admin team.
        </Text>

        {/* DETAILS CARD */}
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>📧 Confirmation Sent To:</Text>
            <Text style={styles.detailValue}>{email || 'your email'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>⏱️ Processing Time:</Text>
            <Text style={styles.detailValue}>Within 24 hours (often faster)</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>📬 New PIN Delivery:</Text>
            <Text style={styles.detailValue}>Via email with setup instructions</Text>
          </View>
        </View>

        {/* WHAT TO EXPECT */}
        <View style={styles.stepsContainer}>
          <Text style={styles.stepsTitle}>What to Expect:</Text>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Admin Review</Text>
              <Text style={styles.stepDesc}>
                Our team will verify your identity and check your account
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Due Diligence Check</Text>
              <Text style={styles.stepDesc}>
                We may contact you on your registered phone number for security verification
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>PIN Reset Email</Text>
              <Text style={styles.stepDesc}>
                Once verified, you'll receive an email with your new PIN
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>4</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Log Back In</Text>
              <Text style={styles.stepDesc}>
                Use your new PIN to access your Smart Boda account
              </Text>
            </View>
          </View>
        </View>

        {/* IMPORTANT NOTICES */}
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠️ Important:</Text>
          <Text style={styles.warningText}>
            • Check your spam/promotions folder if you don't see the email
          </Text>
          <Text style={styles.warningText}>
            • We may call the phone number on your account for verification
          </Text>
          <Text style={styles.warningText}>
            • Never share your PIN with anyone, including Smart Boda staff
          </Text>
        </View>

        {/* CAN'T WAIT */}
        <View style={styles.urgentBox}>
          <Text style={styles.urgentTitle}>💬 Need Immediate Help?</Text>
          <Text style={styles.urgentText}>
            If you need your PIN urgently, contact our customer care team:
          </Text>
          <TouchableOpacity style={styles.phoneButton}>
            <Text style={styles.phoneButtonText}>📞 +254 757 334481</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.phoneButton}>
            <Text style={styles.phoneButtonText}>📞 +254 101 605262</Text>
          </TouchableOpacity>
        </View>

        {/* ACTION BUTTONS */}
        <PrimaryButton
          label="Return to PIN Login →"
          onPress={handleReturnToLogin}
          style={{ marginTop: 24 }}
        />

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => showToast('Request reference saved to your account', 'success')}
        >
          <Text style={styles.secondaryButtonText}>✓ Save This Information</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  content: {
    paddingBottom: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 1.6,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  detailRow: {
    paddingVertical: 10,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.bodaOrange,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 8,
  },
  stepsContainer: {
    marginBottom: 20,
  },
  stepsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 12,
  },
  step: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bodaOrange,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 1.4,
  },
  warningBox: {
    backgroundColor: '#fdf3df',
    borderLeftWidth: 4,
    borderLeftColor: '#c98a12',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c98a12',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  warningText: {
    fontSize: 12,
    color: colors.ink,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  urgentBox: {
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 4,
    borderLeftColor: colors.bodaOrange,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  urgentTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.bodaOrange,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  urgentText: {
    fontSize: 12,
    color: colors.ink,
    marginBottom: 10,
    lineHeight: 1.4,
  },
  phoneButton: {
    backgroundColor: colors.bodaOrange,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  phoneButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 13,
    color: colors.bodaOrange,
    fontWeight: '600',
  },
});