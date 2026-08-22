// rider-app/src/screens/subscription/SubscriptionScreen.js
// ✅ OFFLINE FIRST - Following fuel screen pattern
// Local cache, immediate feedback, silent background sync

import React, { useState, useEffect, useContext } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackLink from '../../components/BackLink';
import { AppContext } from '../../context/AppContext';
import LocalStore from '../../offline/LocalStore';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';

const SubscriptionScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state } = useContext(AppContext);
  
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const riderId = state?.riderId;

  // ========================================================================
  // OFFLINE FIRST: Load from cache, then try API
  // ========================================================================
  
  useEffect(() => {
    if (!riderId || !isInitialized) return;
    
    loadSubscriptionData();
  }, [riderId, isInitialized]);

  const loadSubscriptionData = async (fromRefresh = false) => {
    try {
      if (!fromRefresh) setLoading(true);

      // OFFLINE FIRST: Try API first if online
      if (isConnected && isInitialized) {
        try {
          const response = await api.get('/api/riders/subscription/status');
          
          if (response.ok && response.data) {
            setSubscriptionData(response.data);
            
            // Cache it for offline access
            LocalStore.set(
              `subscription_status_${riderId}`,
              JSON.stringify(response.data)
            );
            console.log('✅ Loaded subscription from API');
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API load failed, using cache:', apiErr.message);
        }
      }

      // Fallback: Use cached data
      loadSubscriptionFromCache();
    } catch (err) {
      console.error('❌ Error loading subscription:', err);
      showCriticalError('Failed to load subscription status', 'data_load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSubscriptionFromCache = () => {
    try {
      const cached = LocalStore.get(`subscription_status_${riderId}`);
      if (cached) {
        const data = JSON.parse(cached);
        setSubscriptionData(data);
        console.log('✅ Loaded subscription from cache');
      } else {
        // No data available - initialize
        showCriticalError('Subscription data not available. Please sync.', 'no_data');
      }
    } catch (err) {
      console.error('❌ Cache load error:', err);
      showCriticalError('Failed to load cached subscription', 'cache_error');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSubscriptionData(true);
  };

  // ========================================================================
  // Handle Navigation to Frequency Selection
  // ========================================================================
  
  const handleSubscribe = () => {
    if (subscriptionData?.is_locked) {
      showCriticalError('Your account is locked. Contact support.', 'locked');
      return;
    }
    clearCriticalError();
    navigation.navigate('FrequencySelect', { isRenewal: subscriptionData?.has_ever_paid });
  };

  // ========================================================================
  // Render States
  // ========================================================================
  
  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>My Subscription</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (subscriptionData?.is_locked) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>Account Locked</Text>
        
        <View style={styles.lockedContainer}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockedTitle}>Your subscription has expired</Text>
          <Text style={styles.lockedMessage}>
            {subscriptionData.lock_reason === 'Free Trial Expired' 
              ? 'Subscribe now to continue using the app'
              : 'Renew your subscription to unlock your account'
            }
          </Text>
          
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSubscribe}>
            <Text style={styles.primaryBtnText}>
              {subscriptionData.lock_reason === 'Free Trial Expired' ? 'Subscribe Now →' : 'Renew Now →'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label="← Back" />
        <Text style={styles.title}>My Subscription</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  // ========================================================================
  // Main Subscription Status Display
  // ========================================================================
  
  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <Text style={styles.title}>My Subscription</Text>

      {/* CRITICAL ERROR ONLY */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* DAYS LEFT HERO */}
      <View style={styles.heroBanner}>
        <Text style={styles.heroSubtitle}>
          {subscriptionData?.is_trial ? '🎁 Free Trial' : '✅ Active Subscription'}
        </Text>
        <Text style={styles.daysLeftNumber}>{subscriptionData?.days_left || 0}</Text>
        <Text style={styles.daysLeftLabel}>
          {subscriptionData?.days_left === 1 ? 'day left' : 'days left'}
        </Text>
      </View>

      {/* URGENCY BANNER - Only when ≤2 days */}
      {subscriptionData?.urgency_banner_shown && (
        <View style={[
          styles.urgencyBanner,
          { backgroundColor: subscriptionData?.expires_today ? '#fdecea' : '#fff3e0' }
        ]}>
          <Text style={[
            styles.urgencyText,
            { color: subscriptionData?.expires_today ? '#a5312c' : '#e65100' }
          ]}>
            {subscriptionData?.expires_today 
              ? 'Your subscription ends today'
              : 'Your subscription ends tomorrow'
            }
          </Text>
        </View>
      )}

      {/* PENDING PRICE CHANGE ALERT - EM-10 */}
      {subscriptionData?.pending_price_change && (
        <View style={styles.priceChangeAlert}>
          <Text style={styles.priceChangeTitle}>⚠️ Price Change Coming</Text>
          <Text style={styles.priceChangeText}>
            Bi-Weekly: {subscriptionData.pending_price_change.biweekly_price ? `KSh ${subscriptionData.pending_price_change.biweekly_price}` : 'No change'} | 
            Monthly: {subscriptionData.pending_price_change.monthly_price ? `KSh ${subscriptionData.pending_price_change.monthly_price}` : 'No change'}
          </Text>
          <Text style={styles.priceChangeTime}>
            Effective in {subscriptionData.pending_price_change.hours_until}h
          </Text>
        </View>
      )}

      {/* PLAN INFO CARD */}
      <View style={styles.planCard}>
        <View style={styles.planRow}>
          <Text style={styles.planLabel}>Plan</Text>
          <Text style={styles.planValue}>{subscriptionData?.plan_name}</Text>
        </View>

        <View style={styles.planRow}>
          <Text style={styles.planLabel}>Frequency</Text>
          <Text style={styles.planValue}>
            {subscriptionData?.frequency === 'biweekly' ? 'Bi-Weekly' : 'Monthly'}
          </Text>
        </View>

        <View style={styles.planRow}>
          <Text style={styles.planLabel}>Current Price</Text>
          <Text style={styles.planValue}>
            KSh {subscriptionData?.pricing?.amount || 0}
          </Text>
        </View>

        {subscriptionData?.total_paid_lifetime > 0 && (
          <View style={styles.planRow}>
            <Text style={styles.planLabel}>Lifetime Spent</Text>
            <Text style={styles.planValue}>
              KSh {Math.floor(subscriptionData.total_paid_lifetime)}
            </Text>
          </View>
        )}

        <Text style={styles.planNote}>
          Expires: {new Date(subscriptionData?.expiry_at).toLocaleDateString()}
        </Text>
      </View>

      {/* CTA BUTTONS */}
      <TouchableOpacity 
        style={styles.primaryBtn}
        onPress={handleSubscribe}
      >
        <Text style={styles.primaryBtnText}>
          {subscriptionData?.has_ever_paid ? '✅ Renew Now →' : '🚀 Subscribe Now →'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate('PaymentHistory')}
      >
        <Text style={styles.secondaryBtnText}>
          💳 View Payment History
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 20
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 20
  },
  
  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  criticalErrorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1
  },
  dismissText: {
    fontSize: 11,
    color: '#a5312c',
    fontWeight: '700',
    marginLeft: 12
  },

  heroBanner: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 12
  },
  daysLeftNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 52
  },
  daysLeftLabel: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginTop: 4
  },

  urgencyBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#e65100'
  },
  urgencyText: {
    fontSize: 14,
    fontWeight: '600'
  },

  priceChangeAlert: {
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800'
  },
  priceChangeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e65100',
    marginBottom: 4
  },
  priceChangeText: {
    fontSize: 12,
    color: '#1a1c20',
    marginBottom: 4
  },
  priceChangeTime: {
    fontSize: 11,
    color: '#5b606c',
    fontStyle: 'italic'
  },

  planCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#e7e4db'
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  planLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  planValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20'
  },
  planNote: {
    fontSize: 11,
    color: '#5b606c',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db'
  },

  lockedContainer: {
    alignItems: 'center',
    marginVertical: 40
  },
  lockIcon: {
    fontSize: 80,
    marginBottom: 20
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
    textAlign: 'center'
  },
  lockedMessage: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.02
  },

  secondaryBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center'
  },
  secondaryBtnText: {
    color: '#ff7a1a',
    fontSize: 16,
    fontWeight: '700'
  }
});

export default SubscriptionScreen;
