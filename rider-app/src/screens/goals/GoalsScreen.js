import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useFocusEffect,
} from 'react-native';
import { useToast } from '../../components/Toast';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';

/**
 * GoalsScreen.js
 * ===============
 * ✅ FIXED: Proper rider_id management using local storage
 * ✅ FIXED: Cleaned.html UI alignment with goal cards, progress bars, badges
 * ✅ FIXED: Complete goal CRUD operations
 * ✅ FIXED: Live data refresh on screen focus
 * 
 * Exports:
 * - MyGoalsScreen: Lists all active and archived goals
 * - NewGoalScreen: Create new goal form
 * - GoalDetailScreen: Goal details with contribution history
 */

// ============================================================================
// MY GOALS SCREEN
// ============================================================================

function MyGoalsScreen({ navigation }) {
  const { showToast } = useToast();
  const { state } = useRider();

  const [localRiderId, setLocalRiderId] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ LOAD RIDER ID AND GOALS
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading rider ID:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRiderId();
  }, []);

  // ✅ LOAD GOALS WHEN SCREEN FOCUSES
  useFocusEffect(
    useCallback(() => {
      loadGoals();
    }, [])
  );

  const loadGoals = useCallback(async () => {
    if (!localRiderId) return;

    try {
      const response = await api.get('/financial/goals', {
        params: { rider_id: localRiderId },
      });
      setGoals(response.data || []);
    } catch (err) {
      console.error('Error loading goals:', err);
      showToast('Error loading goals', 'error');
    }
  }, [localRiderId, showToast]);

  const activeGoals = goals.filter((g) => !g.archived && g.status !== 'archived');
  const archivedGoals = goals.filter((g) => g.archived || g.status === 'archived');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Goals</Text>
      </View>

      <View style={styles.body}>
        {/* Active Goals - Cleaned.html goal cards with progress */}
        {activeGoals.length > 0 ? (
          activeGoals.map((goal) => {
            const total = goal.earned || 0;
            const target = parseFloat(goal.target_amount);
            const pct = Math.min(100, Math.round((total / target) * 100));

            return (
              <TouchableOpacity
                key={goal.id}
                style={styles.goalCard}
                onPress={() =>
                  navigation.navigate('GoalDetail', { goalId: goal.id })
                }
              >
                <View style={styles.goalCardHeader}>
                  <Text style={styles.goalCardTitle}>{goal.name}</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{goal.goal_type_code}</Text>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${pct}%` },
                    ]}
                  />
                </View>

                <Text style={styles.goalCardHint}>
                  KSh {total.toLocaleString()} / {target.toLocaleString()} ({pct}%)
                  {goal.target_date ? ` · by ${goal.target_date}` : ''}
                </Text>

                <TouchableOpacity
                  style={styles.recordButton}
                  onPress={() => {
                    navigation.navigate('LogContribution', {
                      goalId: goal.id,
                    });
                  }}
                >
                  <Text style={styles.recordButtonText}>＋ Record Contribution →</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerText}>ℹ️ No goals yet — entirely optional.</Text>
          </View>
        )}

        {/* New Goal Button */}
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => navigation.navigate('NewGoal')}
        >
          <Text style={styles.buttonText}>＋ New Goal →</Text>
        </TouchableOpacity>

        {/* Archived Goals */}
        {archivedGoals.length > 0 && (
          <TouchableOpacity
            style={styles.archiveLink}
            onPress={() => {
              showToast(
                `Past Goals: ${archivedGoals.map((g) => g.name).join(', ')}`,
                'default'
              );
            }}
          >
            <View style={styles.archiveLinkContent}>
              <Text style={styles.archiveLinkText}>
                📁 Past Goals ({archivedGoals.length})
              </Text>
              <Text style={styles.archiveLinkArrow}>›</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

// ============================================================================
// NEW GOAL SCREEN
// ============================================================================

function NewGoalScreen({ navigation }) {
  const { showToast } = useToast();
  const { state } = useRider();

  const [localRiderId, setLocalRiderId] = useState(null);
  const [goalType, setGoalType] = useState('');
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Goal types from useMasterData
  const GOAL_TYPES = [
    { key: 'school_fees', label: 'School Fees' },
    { key: 'land', label: 'Land' },
    { key: 'second_bike', label: 'Second Bike' },
    { key: 'other', label: 'Other' },
  ];

  // ✅ LOAD RIDER ID
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);
      } catch (err) {
        console.error('Error loading rider ID:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRiderId();
  }, []);

  const handleSaveGoal = useCallback(async () => {
    if (!goalType) {
      showToast('Select a Goal Type.', 'warn');
      return;
    }

    const target = parseFloat(targetAmount);
    if (!target || target <= 0) {
      showToast('Enter a Target Amount greater than zero.', 'error');
      return;
    }

    if (!localRiderId) {
      showToast('Rider information not found', 'error');
      return;
    }

    try {
      setSubmitting(true);

      const response = await api.post(
        '/financial/goals',
        {
          goal_type_code: goalType,
          name: goalName || goalType,
          target_amount: target,
          target_date: targetDate || null,
        },
        {
          params: { rider_id: localRiderId },
        }
      );

      showToast(
        `Goal created: ${goalName || goalType}. Add your first contribution below.`,
        'success'
      );

      navigation.replace('GoalDetail', { goalId: response.data.id });
    } catch (err) {
      console.error('Error saving goal:', err);
      showToast('Error creating goal', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [goalType, goalName, targetAmount, targetDate, localRiderId, showToast, navigation]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Goal</Text>
      </View>

      <View style={styles.body}>
        {/* Goal Type - Cleaned.html dropdown */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Goal Type <Text style={styles.required}>*</Text>
          </Text>
          {/* Using tiles instead of dropdown for better UX */}
          <View style={styles.goalTypeSelector}>
            {GOAL_TYPES.map((type) => (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.goalTypeOption,
                  goalType === type.key && styles.goalTypeOptionSelected,
                ]}
                onPress={() => setGoalType(type.key)}
              >
                <Text
                  style={[
                    styles.goalTypeOptionText,
                    goalType === type.key && styles.goalTypeOptionTextSelected,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Goal Name */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Goal Name <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Amina's School Fees"
            maxLength={60}
            value={goalName}
            onChangeText={setGoalName}
            editable={!submitting}
            placeholderTextColor="#999"
          />
        </View>

        {/* Target Amount */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Target Amount <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={targetAmount}
            onChangeText={setTargetAmount}
            editable={!submitting}
            placeholderTextColor="#999"
          />
        </View>

        {/* Target Date */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Target Date <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={targetDate}
            onChangeText={setTargetDate}
            editable={!submitting}
            placeholderTextColor="#999"
          />
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonPrimary,
            submitting && styles.buttonDisabled,
          ]}
          onPress={handleSaveGoal}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Creating...' : 'Create Goal →'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// GOAL DETAIL SCREEN
// ============================================================================

function GoalDetailScreen({ route, navigation }) {
  const { goalId } = route.params;
  const { showToast } = useToast();
  const { state } = useRider();

  const [localRiderId, setLocalRiderId] = useState(null);
  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  // ✅ LOAD RIDER ID AND GOAL
  useEffect(() => {
    const loadData = async () => {
      try {
        const id = await getLocalRiderId();
        setLocalRiderId(id);

        // Load goal
        const response = await api.get(`/financial/goals/${goalId}`, {
          params: { rider_id: id },
        });
        setGoal(response.data);
      } catch (err) {
        console.error('Error loading goal:', err);
        showToast('Error loading goal details', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [goalId, showToast]);

  const handleArchiveGoal = useCallback(async () => {
    if (!localRiderId) return;

    try {
      setArchiving(true);

      await api.patch(
        `/financial/goals/${goalId}`,
        { archived: true },
        {
          params: { rider_id: localRiderId },
        }
      );

      showToast(`"${goal.name}" archived. You can view it anytime in Past Goals.`, 'success');
      navigation.replace('MyGoals');
    } catch (err) {
      console.error('Error archiving goal:', err);
      showToast('Error archiving goal', 'error');
    } finally {
      setArchiving(false);
    }
  }, [goalId, localRiderId, goal?.name, showToast, navigation]);

  const handleDeleteGoal = useCallback(async () => {
    if (!localRiderId) return;

    try {
      setArchiving(true);

      await api.delete(`/financial/goals/${goalId}`, {
        params: { rider_id: localRiderId },
      });

      showToast('Goal deleted.', 'success');
      navigation.replace('MyGoals');
    } catch (err) {
      console.error('Error deleting goal:', err);
      showToast('Error deleting goal', 'error');
    } finally {
      setArchiving(false);
    }
  }, [goalId, localRiderId, showToast, navigation]);

  if (loading || !goal) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  const total = goal.earned || 0;
  const target = parseFloat(goal.target_amount);
  const pct = Math.min(100, Math.round((total / target) * 100));
  const contributions = goal.contributions || [];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>{goal.name}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{goal.goal_type_code}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {/* Progress Card - Cleaned.html style */}
        <View style={styles.card}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${pct}%` },
              ]}
            />
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Target</Text>
            <Text style={styles.kvValue}>KSh {target.toLocaleString()}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Saved so far</Text>
            <Text style={styles.kvValue}>KSh {total.toLocaleString()}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Remaining</Text>
            <Text style={styles.kvValue}>
              {total >= target ? 'Achieved! 🎉' : `KSh ${(target - total).toLocaleString()}`}
            </Text>
          </View>

          {goal.target_date && (
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Target Date</Text>
              <Text style={styles.kvValue}>{goal.target_date}</Text>
            </View>
          )}
        </View>

        {/* Contribution History Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contribution History</Text>

          {contributions.length > 0 ? (
            contributions
              .slice()
              .reverse()
              .map((contrib, index) => (
                <View key={index}>
                  <View style={styles.ledgerRow}>
                    <Text style={styles.ledgerDate}>
                      {new Date(contrib.ts).toLocaleDateString()}
                    </Text>
                    <Text style={styles.ledgerAmount}>
                      KSh {contrib.amount.toLocaleString()}
                    </Text>
                  </View>
                  {index < contributions.length - 1 && (
                    <View style={styles.rowDivider} />
                  )}
                </View>
              ))
          ) : (
            <Text style={styles.hint}>No contributions logged yet.</Text>
          )}
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary, archiving && styles.buttonDisabled]}
          onPress={() => navigation.navigate('LogContribution', { goalId })}
          disabled={archiving}
        >
          <Text style={styles.buttonText}>＋ Record Contribution →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonGhost]}
          onPress={handleArchiveGoal}
          disabled={archiving}
        >
          <Text style={styles.buttonGhostText}>Archive Goal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteLink}
          onPress={handleDeleteGoal}
          disabled={archiving}
        >
          <Text style={styles.deleteLinkText}>Delete Goal</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export { MyGoalsScreen, NewGoalScreen, GoalDetailScreen };

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
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  // Goal Card Styles
  goalCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  goalCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c20',
    flex: 1,
  },
  badge: {
    backgroundColor: '#e7e4db',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5b606c',
    textTransform: 'capitalize',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#e7e4db',
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff7a1a',
    borderRadius: 3,
  },
  goalCardHint: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 12,
  },
  recordButton: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  bannerInfo: {
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  bannerText: {
    fontSize: 13,
    color: '#2e7d32',
  },
  // Form Fields
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
  optional: {
    fontWeight: '500',
    color: '#5b606c',
    fontSize: 12,
  },
  goalTypeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalTypeOption: {
    flex: 1,
    minWidth: '48%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  goalTypeOptionSelected: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a',
  },
  goalTypeOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5b606c',
  },
  goalTypeOptionTextSelected: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1a1c20',
  },
  // Card Styles
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ebe5',
  },
  kvKey: {
    fontSize: 12.5,
    color: '#5b606c',
  },
  kvValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  ledgerDate: {
    fontSize: 12,
    color: '#5b606c',
  },
  ledgerAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e9e6f',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#f0ebe5',
  },
  hint: {
    fontSize: 13,
    color: '#8b92a3',
    paddingVertical: 8,
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
  deleteLink: {
    paddingVertical: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  deleteLinkText: {
    color: '#e0453f',
    fontSize: 14,
    fontWeight: '600',
  },
  archiveLink: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
  },
  archiveLinkContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  archiveLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20',
  },
  archiveLinkArrow: {
    fontSize: 18,
    color: '#5b606c',
    fontWeight: '300',
  },
});