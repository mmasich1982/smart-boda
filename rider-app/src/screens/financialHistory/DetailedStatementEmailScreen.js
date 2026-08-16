import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import InlineInfo from '../../components/InlineInfo';


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DetailedStatementEmailScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const { statementId } = route.params || {};

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validateEmail = (value) => {
    if (!value.trim()) {
      setEmailError('Enter an email address.');
      return false;
    }

    if (!EMAIL_REGEX.test(value)) {
      setEmailError('Enter a valid email address.');
      return false;
    }

    setEmailError('');
    return true;
  };

  const handleEmailChange = (value) => {
    setEmail(value);
    if (emailError) {
      validateEmail(value);
    }
  };

  const handleContinue = async () => {
    if (!validateEmail(email)) {
      return;
    }

    try {
      setSubmitting(true);

      // In a real app, you would submit this to backend
      // For now, just navigate to confirmation
      navigation.navigate('DetailedStatementConfirmation', {
        statementId,
        email: email.trim(),
      });
    } catch (err) {
      console.error('Submit email error:', err);
      showToast('Error submitting email', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <BackLink label="Back" onPress={() => navigation.goBack()} />

      <Text style={styles.screenTitle}>Verify Your Email</Text>
      <Text style={styles.screenSub}>
        We'll send your detailed statement to a verified email address. RA-18-C · verified email
        required for detailed statement delivery
      </Text>

      {/* Info Banner */}
      <InlineInfo
        icon="ℹ️"
        title="Already provided a verified email?"
        message="It'll be reused automatically next time."
        type="info"
      />

      {/* Email Input */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          Email Address <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.emailInput, emailError && styles.emailInputError]}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={handleEmailChange}
          onBlur={() => validateEmail(email)}
        />
        {emailError && <Text style={styles.errorMessage}>{emailError}</Text>}
      </View>

      {/* Continue Button */}
      <PrimaryButton
        label="Continue →"
        onPress={handleContinue}
        disabled={submitting || !email.trim()}
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
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  required: {
    color: '#e0453f',
  },
  emailInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1c20',
  },
  emailInputError: {
    borderColor: '#e0453f',
    backgroundColor: '#fff9f8',
  },
  errorMessage: {
    fontSize: 11,
    color: '#e0453f',
    marginTop: 6,
  },
});