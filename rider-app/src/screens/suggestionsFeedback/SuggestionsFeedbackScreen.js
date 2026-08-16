// rider-app/src/screens/suggestionsFeedback/SuggestionsFeedbackScreenComplete.js
/**
 * COMPLETE SUGGESTIONS & FEEDBACK SCREEN (RA-35)
 * Production-ready with proper Rider ID handling
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ScrollView, View, Text, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, FlatList
} from 'react-native';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';
import api from '../../api/client';

const SUGGESTION_CATEGORIES = [
  { key: 'idea', emoji: '💡', label: 'Idea' },
  { key: 'problem', emoji: '😕', label: 'Problem' },
  { key: 'compliment', emoji: '❤️', label: 'Compliment' },
  { key: 'other', emoji: '💬', label: 'Other' },
];

export default function SuggestionsFeedbackScreen({ navigation }) {
  const { state: riderState } = useRider();
  const { showToast } = useToast();

  const [localRiderId, setLocalRiderId] = useState(null);
  const [category, setCategory] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // ✅ CRITICAL: Load Rider ID from local storage
  useEffect(() => {
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

  // ✅ Get effective rider ID
  const effectiveRiderId = localRiderId || riderState?.riderId;

  // Fetch history on focus
  useFocusEffect(
    useCallback(() => {
      if (effectiveRiderId) {
        loadHistory(1);
      } else {
        setLoading(false);
      }
    }, [effectiveRiderId])
  );

  const loadHistory = async (pageNum) => {
    try {
      setLoading(true);
      const res = await api.get('/suggestions', {
        params: {
          rider_id: effectiveRiderId,
          page: pageNum,
          page_size: 10
        }
      });
      setHistory(res.data?.items || []);
      setPage(res.data?.page || 1);
      setTotalPages(res.data?.total_pages || 1);
    } catch (err) {
      console.error('Error loading suggestions:', err);
      showToast('Error loading suggestions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!effectiveRiderId) {
      showToast('Unable to identify rider', 'error');
      return;
    }

    if (!message.trim()) {
      showToast('Please write your message before sending', 'error');
      return;
    }

    if (message.trim().length > 500) {
      showToast('Message is too long (max 500 characters)', 'error');
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/suggestions', null, {
        params: {
          rider_id: effectiveRiderId,
          category_code: category || 'Other',
          message: message.trim()
        }
      });

      showToast('Thank you! Your feedback has been sent. 🙏', 'success');
      setMessage('');
      setCategory(null);
      loadHistory(1);
    } catch (err) {
      console.error('Error submitting suggestion:', err);
      showToast(err.response?.data?.detail || 'Failed to send feedback', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategory = (key) => {
    setCategory(category === key ? null : key);
  };

  const handleNextPage = () => {
    if (page < totalPages) {
      loadHistory(page + 1);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      loadHistory(page - 1);
    }
  };

  if (!effectiveRiderId) {
    return (
      <View style={styles.container}>
        <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
        <Text style={styles.errorText}>Unable to load rider information</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
      
      <Text style={styles.title}>Suggestions & Feedback</Text>
      <Text style={styles.subtitle}>
        We read every message — tell us what's on your mind.
      </Text>

      {/* SUBMIT SECTION */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📝 Share Your Feedback</Text>

        {/* CATEGORY TILES */}
        <View style={styles.categoryContainer}>
          {SUGGESTION_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              onPress={() => toggleCategory(c.key)}
              style={[
                styles.categoryTile,
                category === c.key && styles.categoryTileSelected
              ]}
            >
              <Text style={styles.categoryEmoji}>{c.emoji}</Text>
              <Text style={styles.categoryLabel}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* MESSAGE INPUT */}
        <Text style={styles.label}>Your Message</Text>
        <TextInput
          style={[styles.messageInput, message.length > 400 && styles.messageInputWarning]}
          placeholder="Tell us your thoughts... (max 500 characters)"
          placeholderTextColor={colors.inkSoft}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
          editable={!submitting}
        />

        {/* CHARACTER COUNT */}
        <View style={styles.charCountRow}>
          <Text style={[
            styles.charCount,
            message.length > 450 && styles.charCountWarning
          ]}>
            {message.length}/500
          </Text>
        </View>

        {/* SUBMIT BUTTON */}
        <PrimaryButton
          label={submitting ? 'Sending...' : 'Send Feedback →'}
          onPress={handleSubmit}
          disabled={submitting || !message.trim()}
          style={{ marginTop: 12 }}
        />
      </View>

      {/* HISTORY SECTION */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.bodaOrange} />
        </View>
      ) : history.length > 0 ? (
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>📋 Your Past Feedback</Text>

          {history.map((item, idx) => {
            const catObj = SUGGESTION_CATEGORIES.find(c => c.key === item.category_code);
            return (
              <View key={idx} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyEmoji}>{catObj?.emoji || '💬'}</Text>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyCategory}>
                      {catObj?.label || item.category_code}
                    </Text>
                    <Text style={styles.historyDate}>
                      {new Date(item.submitted_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.historyMessage}>{item.message}</Text>
              </View>
            );
          })}

          {/* PAGINATION */}
          {totalPages > 1 && (
            <View style={styles.paginationContainer}>
              <TouchableOpacity
                onPress={handlePrevPage}
                disabled={page === 1}
                style={[styles.pagButton, page === 1 && styles.pagButtonDisabled]}
              >
                <Text style={styles.pagButtonText}>← Previous</Text>
              </TouchableOpacity>

              <Text style={styles.pageIndicator}>
                Page {page} of {totalPages}
              </Text>

              <TouchableOpacity
                onPress={handleNextPage}
                disabled={page === totalPages}
                style={[styles.pagButton, page === totalPages && styles.pagButtonDisabled]}
              >
                <Text style={styles.pagButtonText}>Next →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : null}

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
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
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
    lineHeight: 1.5,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bodaOrange,
    marginBottom: 12,
  },
  categoryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  categoryTile: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  categoryTileSelected: {
    borderColor: colors.bodaOrange,
    backgroundColor: '#fff9f3',
  },
  categoryEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  messageInput: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.ink,
    minHeight: 100,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
  messageInputWarning: {
    borderColor: colors.signalAmber,
  },
  charCountRow: {
    alignItems: 'flex-end',
    marginTop: 6,
  },
  charCount: {
    fontSize: 11,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  charCountWarning: {
    color: colors.signalAmber,
  },
  historySection: {
    marginBottom: 20,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 12,
  },
  historyItem: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  historyInfo: {
    flex: 1,
  },
  historyCategory: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  historyDate: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 2,
  },
  historyMessage: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 1.5,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  pagButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: colors.bodaOrange,
    borderRadius: 8,
  },
  pagButtonDisabled: {
    borderColor: colors.line,
    opacity: 0.5,
  },
  pagButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.bodaOrange,
  },
  pageIndicator: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
  },
});