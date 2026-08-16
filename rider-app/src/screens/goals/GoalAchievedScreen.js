import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useToast } from '../../components/Toast';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';

/**
 * GoalAchievedScreen.js
 * =====================
 * ✅ FIXED: Proper rider_id management using local storage
 * ✅ FIXED: Celebration UI with emoji
 * ✅ FIXED: Archive and continue options
 * ✅ FIXED: Cleaned.html aligned design
 * 
 * This screen is shown when a rider completes a goal (earned >= target_amount).
 * It displays a celebration message and offers two options:
 * 1. Archive the goal and set a new one
 * 2. Keep viewing the goal details
 */

export default function GoalAchievedScreen({ route, navigation }) {
  const { goalId } = route.params;
  const { showToast } = useToast();
  const { state } = useRider();

  const [localRiderId, setLocalRiderId] = useState(null);
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    const loadData = async () => {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);

        if (!id) {
          throw new Error('Rider information not found');
        }

        // Load goal details
        const response = await api.get(`/financial/goals/${goalId}`, {
          params: { rider_id: id },
        });
        setGoal(response.data);
      } catch (err) {
        console.error('Error loading goal:', err);
        const errorMsg = err.response?.data?.detail || err.message || 'Error loading goal';
        showToast(errorMsg, 'error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [goalId, showToast]);

  // ✅ USE LOCAL STORAGE AS PRIMARY, FALLBACK TO CONTEXT
  const effectiveRiderId = localRiderId || state?.riderId;

  const handleArchiveGoal = useCallback(async () => {
    if (!effectiveRiderId || !goal) return;

    try {
      setArchiving(true);

      await api.patch(
        `/financial/goals/${goalId}`,
        { archived: true },
        {
          params: { rider_id: effectiveRiderId },
        }
      );

      showToast(`"${goal.name}" archived. Set a new goal!`, 'success');
      navigation.replace('MyGoals');
    } catch (err) {
      console.error('Error archiving goal:', err);
      const errorMsg = err.response?.data?.detail || 'Error archiving goal';
      showToast(errorMsg, 'error');
      setArchiving(false);
    }
  }, [goalId, effectiveRiderId, goal, showToast, navigation]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Goal not found</Text>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={() => navigation.replace('MyGoals')}
          >
            <Text style={styles.buttonText}>Return to My Goals</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.celebrationContainer}>
        {/* Celebration Emoji - Large and prominent */}
        <Text style={styles.celebrationEmoji}>🎉</Text>

        {/* Title */}
        <Text style={styles.celebrationTitle}>Goal Achieved!</Text>

        {/* Subtitle */}
        <Text style={styles.celebrationSubtitle}>
          Congratulations on reaching your goal!
        </Text>

        {/* Goal Details Card - Cleaned.html style */}
        <View style={styles.card}>
          <Text style={styles.goalName}>{goal.name}</Text>
          <Text style={styles.goalType}>
            {goal.goal_type_code.replace(/_/g, ' ').toUpperCase()}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.goalAmount}>
            KSh {parseFloat(goal.target_amount).toLocaleString()} reached! ✨
          </Text>
          {goal.target_date && (
            <Text style={styles.goalDate}>
              Target date: {goal.target_date}
            </Text>
          )}
        </View>

        {/* Achievement Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Target Amount</Text>
            <Text style={styles.statValue}>
              KSh {parseFloat(goal.target_amount).toLocaleString()}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Amount Saved</Text>
            <Text style={styles.statValue}>
              KSh {(goal.earned || 0).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}

        {/* Archive & Set New Goal Button */}
        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonPrimary,
            archiving && styles.buttonDisabled,
          ]}
          onPress={handleArchiveGoal}
          disabled={archiving}
        >
          <Text style={styles.buttonText}>
            {archiving ? 'Archiving...' : '✅ Archive & Set a New Goal'}
          </Text>
        </TouchableOpacity>

        {/* Keep Viewing Button */}
        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonGhost,
            archiving && styles.buttonDisabled,
          ]}
          onPress={() => navigation.replace('GoalDetail', { goalId })}
          disabled={archiving}
        >
          <Text style={styles.buttonGhostText}>Keep Viewing Goal Details</Text>
        </TouchableOpacity>

        {/* Return to Goals Link */}
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.replace('MyGoals')}
          disabled={archiving}
        >
          <Text style={styles.linkButtonText}>← Back to My Goals</Text>
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
  celebrationContainer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  errorContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#e0453f',
    marginBottom: 20,
    fontWeight: '600',
  },

  // Celebration Elements
  celebrationEmoji: {
    fontSize: 72,
    marginBottom: 24,
    lineHeight: 80,
  },

  celebrationTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
    textAlign: 'center',
  },

  celebrationSubtitle: {
    fontSize: 15,
    color: '#5b606c',
    marginBottom: 32,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Goal Details Card - Cleaned.html style
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },

  goalName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 6,
    textAlign: 'center',
  },

  goalType: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  divider: {
    height: 1,
    backgroundColor: '#e7e4db',
    width: '100%',
    marginBottom: 12,
  },

  goalAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e9e6f',
    textAlign: 'center',
    marginBottom: 8,
  },

  goalDate: {
    fontSize: 12,
    color: '#8b92a3',
    textAlign: 'center',
    marginTop: 8,
  },

  // Stats Card
  statsCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 32,
    width: '100%',
    flexDirection: 'row',
  },

  statItem: {
    flex: 1,
    alignItems: 'center',
  },

  statDivider: {
    width: 1,
    backgroundColor: '#e7e4db',
  },

  statLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500',
    marginBottom: 6,
  },

  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },

  // Buttons
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

  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
  },

  buttonText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
  },

  buttonGhostText: {
    color: '#ff7a1a',
    fontSize: 15.5,
    fontWeight: '700',
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  // Link Button
  linkButton: {
    paddingVertical: 12,
    marginTop: 8,
    alignItems: 'center',
  },

  linkButtonText: {
    color: '#ff7a1a',
    fontSize: 14,
    fontWeight: '600',
  },
});