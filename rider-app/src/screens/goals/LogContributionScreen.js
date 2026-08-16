import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useToast } from '../../components/Toast';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';

/**
 * LogContributionScreen.js
 * ========================
 * ✅ FIXED: Proper rider_id management using local storage
 * ✅ FIXED: Decimal input validation
 * ✅ FIXED: Achievement detection
 * ✅ FIXED: Navigates to GoalAchieved when goal is achieved
 * 
 * This screen is shown when user taps "Record Contribution" on a goal.
 * User enters contribution amount, which is validated and saved.
 * If goal is achieved, navigates to GoalAchievedScreen.
 * Otherwise, navigates back to GoalDetailScreen.
 */

export default function LogContributionScreen({ route, navigation }) {
  const { goalId } = route.params;
  const { showToast } = useToast();
  const { state } = useRider();

  const [localRiderId, setLocalRiderId] = useState(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading rider ID:', err);
        showToast('Error loading rider information', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadRiderId();
  }, [showToast]);

  // ✅ USE LOCAL STORAGE AS PRIMARY, FALLBACK TO CONTEXT
  const effectiveRiderId = localRiderId || state?.riderId;

  const handleSaveContribution = useCallback(async () => {
    setError(null);

    // Validation
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      const msg = 'Enter a contribution amount greater than zero.';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!effectiveRiderId) {
      const msg = 'Rider information not found';
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    try {
      setSubmitting(true);

      // ✅ SEND TO BACKEND WITH RIDER ID
      const response = await api.post(
        '/financial/goals/contribution',
        {
          goal_id: goalId,
          amount: amt,
        },
        {
          params: { rider_id: effectiveRiderId },
        }
      );

      showToast(`Contribution logged: KSh ${amt.toLocaleString()}.`, 'success');

      // Check if goal achieved
      if (response.data?.achieved) {
        // ✅ NAVIGATE TO GOAL ACHIEVED SCREEN
        navigation.replace('GoalAchieved', { goalId });
      } else {
        // ✅ NAVIGATE BACK TO GOAL DETAIL
        navigation.replace('GoalDetail', { goalId });
      }
    } catch (err) {
      console.error('Error saving contribution:', err);
      const errorMsg = err.response?.data?.detail || 'Error saving contribution';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [amount, goalId, effectiveRiderId, showToast, navigation]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Record Contribution</Text>
      </View>

      <View style={styles.body}>
        {/* Amount Field */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Contribution Amount <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={amount}
            onChangeText={setAmount}
            editable={!submitting}
            placeholderTextColor="#999"
            autoFocus
          />
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.error}>⚠️ {error}</Text>
          </View>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonPrimary,
            (submitting || !effectiveRiderId) && styles.buttonDisabled,
          ]}
          onPress={handleSaveContribution}
          disabled={submitting || !effectiveRiderId}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Saving...' : 'Save Contribution →'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  backLink: {
    fontSize: 13,
    color: '#ff7a1a',
    fontWeight: '600',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  required: {
    color: '#e0453f',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1c20',
    fontWeight: '500',
  },
  errorContainer: {
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fee8e6',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
  },
  error: {
    color: '#e0453f',
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 48,
    justifyContent: 'center',
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: '#ff7a1a',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});