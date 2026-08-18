// rider-app/src/screens/HomeScreen.js
// ============================================================================
// CORRECT: Keeps all core tiles + subscription features
// Removes ONLY: Revenue Targets, Insurance, Savings, Lipa Later, Send Money, Goals, Feedback
// Keeps: Daily Trade Summary, Financial History, Statements
// Adds: Subscription banner, notification bell badge, locked modal
// ============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../i18n/LocalizationProvider';
import { getTodaysTrips, getTodaysRealizedIncome, getYesterdaysTotal, summarizeTrips } from '../offline/tripsRepository';
import { getQueuedRecords, hoursSinceLastSync } from '../offline/syncQueue';
import { getActiveBikeProfile, getRiderAccountSummary, clearSession } from '../offline/db';
import HeroFareCard from '../components/HeroFareCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

const ENERGY_TILE_BY_FUEL = {
  petrol: { emoji: '⛽', label: 'home.tile_fuel_motorcycle', route: 'FuelHub' },
  electric: { emoji: '🔋', label: 'home.tile_charge_battery', route: 'ChargeBatteryHub' },
};

// ============================================================================
// CORE TILES - These are KEPT (not removed)
// ============================================================================
// Row 1: Fuel/Charge + Service/Maintenance
// Row 2: Financial Performance + My Subscription
// Settings: Daily Trade Summary + Financial History + Logout

// ============================================================================
// LOADING SKELETON
// ============================================================================
function LoadingSkeleton() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>🚕</Text>
          </View>
          <Text style={styles.brandName}>Smart Boda</Text>
        </View>
      </View>
      <View style={styles.screenBody}>
        <View style={[styles.heroFare, styles.skeleton]} />
        <View style={[styles.yesterdayCard, styles.skeleton, { height: 80, marginBottom: 16 }]} />
        <View style={styles.skeletonGrid}>
          <View style={[styles.homeTile, styles.skeleton]} />
          <View style={[styles.homeTile, styles.skeleton]} />
        </View>
      </View>
    </ScrollView>
  );
}

// ============================================================================
// ERROR DISPLAY
// ============================================================================
function ErrorDisplay({ error, onRetry }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>⚠️ Unable to Load Home Screen</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// ERROR BOUNDARY
// ============================================================================
class HomeScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[HomeScreen] Error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorDisplay
          error={this.state.error?.message || 'An unexpected error occurred'}
          onRetry={() => {
            this.setState({ hasError: false, error: null });
            this.props.onRetry?.();
          }}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// MAIN HOMESCREEN COMPONENT
// ============================================================================
export default function HomeScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [runningTotal, setRunningTotal] = useState(0);
  const [yesterdayTotal, setYesterdayTotal] = useState(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [bike, setBike] = useState(null);
  const [account, setAccount] = useState(null);
  const [tripsToday, setTripsToday] = useState(0);
  const [offlineHours, setOfflineHours] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  
  // ✅ REQ-4.1, 4.2: Subscription state
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [riderId, setRiderId] = useState(null);

  // ============================================================================
  // SUBSCRIPTION LOADING
  // ============================================================================
  
  // ✅ REQ-4.1, 4.2: Load subscription data
  const loadSubscription = useCallback(async () => {
    if (!riderId) return;
    
    try {
      setSubscriptionLoading(true);
      const response = await api.get('/subscription', {
        params: { rider_id: riderId }
      });
      
      setSubscription(response.data.subscription);
      setIsOffline(false);
      
      // ✅ OFFLINE: Cache subscription data
      await AsyncStorage.setItem(
        `subscription_cache_${riderId}`,
        JSON.stringify({
          data: response.data.subscription,
          cached_at: new Date().toISOString()
        })
      );
    } catch (err) {
      console.error('Error loading subscription:', err);
      
      // ✅ OFFLINE: Load from cache
      if (err.response?.status === 0 || err.message.includes('Network')) {
        const cached = await AsyncStorage.getItem(`subscription_cache_${riderId}`);
        if (cached) {
          try {
            const { data } = JSON.parse(cached);
            setSubscription(data);
            setIsOffline(true);
          } catch (e) {
            console.error('Error parsing cached subscription:', e);
          }
        }
      }
    } finally {
      setSubscriptionLoading(false);
    }
  }, [riderId]);

  useFocusEffect(
    useCallback(() => {
      if (riderId) {
        loadSubscription();
      }
    }, [riderId, loadSubscription])
  );

  // ============================================================================
  // REFRESH FUNCTION
  // ============================================================================
  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setHasError(false);
      setErrorMsg(null);

      // Load bike profile
      const activeBike = await getActiveBikeProfile();
      if (activeBike) {
        setBike(activeBike);
        // ✅ Get rider ID from bike profile or account
        if (activeBike.rider_id) {
          setRiderId(activeBike.rider_id);
        }
      }

      // Load account summary
      const accountSummary = await getRiderAccountSummary();
      if (accountSummary) {
        setAccount(accountSummary);
        if (accountSummary.rider_id && !riderId) {
          setRiderId(accountSummary.rider_id);
        }
      }

      // Load today's trips and realized income
      const trips = await getTodaysTrips();
      const summary = summarizeTrips(trips);
      const realizedIncome = await getTodaysRealizedIncome();
      setRunningTotal(realizedIncome.total || 0);
      setTripsToday(trips.length || 0);

      // Load yesterday's total
      const yest = await getYesterdaysTotal();
      setYesterdayTotal(yest);

      // Load queued records
      const queued = await getQueuedRecords();
      setQueuedCount(queued?.length || 0);

      // Load sync status
      const hours = await hoursSinceLastSync();
      setOfflineHours(Math.floor(hours) || 0);

      // Load subscription
      if (riderId) {
        await loadSubscription();
      }

      if (!isInitialized) {
        setIsInitialized(true);
      }
    } catch (err) {
      console.error('[HomeScreen] Refresh error:', err);
      setHasError(true);
      setErrorMsg(err.message || 'Error loading home screen');
      if (!isInitialized) {
        setIsInitialized(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, [isInitialized, riderId, loadSubscription]);

  // ============================================================================
  // AUTO-REFRESH ON FOCUS
  // ============================================================================
  useEffect(() => {
    refresh();
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
    });
    return unsubscribe;
  }, [navigation, refresh]);

  // ============================================================================
  // NAVIGATION HANDLERS
  // ============================================================================
  const handleLogout = async () => {
    Alert.alert(
      t('common.confirm'),
      t('home.logout_confirm'),
      [
        { text: t('common.cancel'), onPress: () => {} },
        {
          text: t('common.logout'),
          onPress: async () => {
            try {
              await clearSession();
              navigation.navigate('Auth', { screen: 'PinLogin' });
            } catch (err) {
              console.error('Logout failed:', err);
            }
          },
        },
      ]
    );
  };

  const handleViewFinancialHistory = () => {
    navigation.navigate('FinancialHistory');
  };

  const handleOpenDailySummary = () => {
    navigation.navigate('DailyTradeSummary');
  };

  const handleNewTrip = () => {
    navigation.navigate('NewTrip');
  };

  // ============================================================================
  // SAFE VALUES & COMPUTED PROPERTIES
  // ============================================================================
  const energyTile = bike?.fuel_type_code ? ENERGY_TILE_BY_FUEL[bike.fuel_type_code] : null;
  const safeRunningTotal = Number(runningTotal) || 0;
  const safeYesterdayTotal = typeof yesterdayTotal === 'number' ? yesterdayTotal : 0;

  // ✅ REQ-4.1: Calculate notification badge
  const showSubscriptionBadge = subscription?.days_left <= 1 && !subscription?.locked;
  const notificationCount = showSubscriptionBadge ? null : queuedCount; // Show subscription warning if last day, else queue count

  // ✅ REQ-4.4: Account locked modal
  const renderLockedModal = () => {
    if (!subscription?.locked) return null;

    return (
      <Modal
        visible={subscription.locked}
        animationType="slide"
        transparent={false}
      >
        <View style={styles.lockedContainer}>
          <View style={styles.lockedContent}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <Text style={styles.lockedTitle}>Account Locked</Text>
            
            <Text style={styles.lockedMessage}>
              {subscription.lock_reason === 'Free Trial Expired' 
                ? 'Your free trial has expired. Subscribe to continue using Smart Boda.'
                : 'Your subscription has expired. Please pay to unlock your account.'}
            </Text>

            <View style={styles.lockedDetails}>
              <Text style={styles.detailLabel}>Lock Reason:</Text>
              <Text style={styles.detailValue}>{subscription.lock_reason}</Text>
              
              {subscription.locked_at && (
                <>
                  <Text style={styles.detailLabel}>Locked At:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(subscription.locked_at).toLocaleString()}
                  </Text>
                </>
              )}
            </View>

            {isOffline && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineText}>⚠️ You are offline</Text>
                <Text style={styles.offlineSubtext}>
                  You can still submit payment. It will sync when online.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.unlockedButton}
              onPress={() => navigation.navigate('MySubscriptions')}
            >
              <Text style={styles.unlockedButtonText}>Unlock Account → Pay Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ============================================================================
  // RENDER LOADING STATE
  // ============================================================================
  if (!isInitialized && !hasError) {
    return <LoadingSkeleton />;
  }

  // ============================================================================
  // RENDER ERROR STATE
  // ============================================================================
  if (hasError) {
    return (
      <ErrorDisplay
        error={errorMsg}
        onRetry={refresh}
      />
    );
  }

  // ============================================================================
  // RENDER MAIN SCREEN
  // ============================================================================
  return (
    <HomeScreenErrorBoundary onRetry={refresh}>
      {/* ✅ REQ-4.4: Account locked modal */}
      {renderLockedModal()}

      <ScrollView
        style={styles.container}
        refreshing={refreshing}
        onRefresh={refresh}
        scrollEnabled={true}
      >
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>🚕</Text>
            </View>
            <Text style={styles.brandName}>Smart Boda</Text>
          </View>
          <View style={styles.notifBell}>
            <Text style={styles.bellIcon}>🔔</Text>
            {/* ✅ REQ-4.1: Notification badge */}
            {showSubscriptionBadge && (
              <View style={[styles.notifBadge, styles.notifBadgeWarning]}>
                <Text style={styles.badgeText}>!</Text>
              </View>
            )}
            {notificationCount > 0 && !showSubscriptionBadge && (
              <View style={[styles.notifBadge, styles.notifBadgeQueue]}>
                <Text style={styles.badgeText}>{notificationCount}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.screenBody}>
          {/* HERO FARE CARD */}
          <HeroFareCard
            totalFare={safeRunningTotal}
            onOpenDailySummary={handleOpenDailySummary}
            onNewTrip={handleNewTrip}
          />

          {/* ✅ REQ-4.2: SUBSCRIPTION RENEWAL BANNER */}
          {subscription?.days_left <= 1 && !subscription?.locked && (
            <View style={styles.subscriptionBanner}>
              <View style={styles.bannerContent}>
                <Text style={styles.bannerTitle}>⚠️ Last Day Warning</Text>
                <Text style={styles.bannerText}>
                  Today is your last day! Keep your bike's tools running — subscribe now.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.bannerButton}
                onPress={() => navigation.navigate('MySubscriptions')}
              >
                <Text style={styles.bannerButtonText}>Subscribe Now →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* OFFLINE WARNING */}
          {offlineHours >= 24 && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ Offline for {offlineHours}h. Syncing when online.
              </Text>
            </View>
          )}

          {/* YESTERDAY'S TOTAL CARD */}
          {yesterdayTotal !== null && typeof safeYesterdayTotal === 'number' && (
            <View style={styles.yesterdayCard}>
              <View style={styles.yesterdayHeader}>
                <Text style={styles.yesterdayLabel}>{t('home.yesterday_total')}</Text>
                <TouchableOpacity onPress={handleOpenDailySummary}>
                  <Text style={styles.viewBreakdownLink}>{t('home.view_breakdown')} →</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.yesterdayAmount}>
                KSh {safeYesterdayTotal.toLocaleString('en-KE')}
              </Text>
            </View>
          )}

          {/* ============================================================================ */}
          {/* KEPT TILES - Core functionality (NOT removed) */}
          {/* ============================================================================ */}

          {/* TILES GRID - Row 1: Fuel/Charge + Service */}
          <View style={styles.tileRow}>
            {energyTile && (
              <TouchableOpacity
                style={styles.homeTile}
                onPress={() => {
                  try {
                    navigation.navigate(energyTile.route);
                  } catch (err) {
                    console.error('[HomeScreen] Navigation error:', err);
                  }
                }}
              >
                <Text style={styles.tileEmoji}>{energyTile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(energyTile.label)}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate('MaintenanceHub')}
            >
              <Text style={styles.tileEmoji}>🔧</Text>
              <Text style={styles.tileLabel}>{t('home.tile_service_motorcycle')}</Text>
            </TouchableOpacity>
          </View>

          {/* TILES GRID - Row 2: Financial + Subscription */}
          <View style={styles.tileRow}>
            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate('MoneyMastery')}
            >
              <Text style={styles.tileEmoji}>💰</Text>
              <Text style={styles.tileLabel}>{t('home.tile_financial_performance')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => navigation.navigate('MySubscriptions')}
            >
              <Text style={styles.tileEmoji}>📲</Text>
              <Text style={styles.tileLabel}>My Subscription</Text>
            </TouchableOpacity>
          </View>

          {/* ============================================================================ */}
          {/* REMOVED TILES - These 7 were specifically requested to be removed */}
          {/* ============================================================================ */}
          {/* ❌ REMOVED: Revenue Targets (🎯) */}
          {/* ❌ REMOVED: Insurance & Licenses (📋) */}
          {/* ❌ REMOVED: Savings (🐖) */}
          {/* ❌ REMOVED: Lipa Later Report (🧾) */}
          {/* ❌ REMOVED: Send Money Home (🏡) */}
          {/* ❌ REMOVED: My Goals (🏆) */}
          {/* ❌ REMOVED: Suggestions & Feedback (💡) */}

          {/* SYNC STATUS CARD */}
          <TouchableOpacity
            style={styles.cardContainer}
            onPress={() => navigation.navigate('SyncStatus')}
            activeOpacity={0.7}
          >
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardStatusEmoji}>
                {queuedCount > 0 ? '🟠' : '🟢'}
              </Text>
              <Text style={styles.cardTitle}>Sync Status</Text>
              <View style={[
                styles.badge,
                queuedCount > 0 ? styles.badgeAmber : styles.badgeGreen
              ]}>
                <Text style={styles.badgeText}>
                  {queuedCount > 0 ? `Queued: ${queuedCount}` : 'All Synced'}
                </Text>
              </View>
            </View>
            <Text style={styles.cardHint}>
              {queuedCount > 0 ? 'Tap to view queue and retry.' : 'Everything is safely backed up.'}
            </Text>
          </TouchableOpacity>

          {/* ACCOUNT CARD */}
          <View style={styles.cardContainer}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Trips today</Text>
              <Text style={styles.kvValue}>{tripsToday}</Text>
            </View>
          </View>

          {/* ============================================================================ */}
          {/* KEPT SETTINGS - Daily Trade Summary, Financial History, Logout */}
          {/* ============================================================================ */}

          {/* SETTINGS LIST */}
          <View style={styles.settingsListContainer}>
            {/* ✅ KEPT: Daily Trade Summary */}
            <TouchableOpacity
              style={styles.settingsListItem}
              onPress={handleOpenDailySummary}
            >
              <Text style={styles.settingsListLabel}>📊 My Daily Trade Summary</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>

            {/* ✅ KEPT: Financial History */}
            <TouchableOpacity
              style={styles.settingsListItem}
              onPress={handleViewFinancialHistory}
            >
              <Text style={styles.settingsListLabel}>📈 My Financial History</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>

            {/* ✅ KEPT: Logout */}
            <TouchableOpacity
              style={[styles.settingsListItem, styles.logoutListItem]}
              onPress={handleLogout}
            >
              <Text style={[styles.settingsListLabel, styles.logoutText]}>🚪 Logout</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </HomeScreenErrorBoundary>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    backgroundColor: '#ff7a1a',
    borderRadius: 8,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 18,
  },
  brandName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1c20',
  },
  notifBell: {
    position: 'relative',
  },
  bellIcon: {
    fontSize: 24,
  },
  notifBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadgeWarning: {
    backgroundColor: '#ff9800',
  },
  notifBadgeQueue: {
    backgroundColor: '#e0453f',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  screenBody: {
    padding: 16,
  },
  heroFare: {
    height: 140,
  },
  subscriptionBanner: {
    backgroundColor: '#fffbea',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerContent: {
    flex: 1,
    marginRight: 12,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff9800',
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
  },
  bannerButton: {
    backgroundColor: '#ff7a1a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  yesterdayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  yesterdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  yesterdayLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
  },
  yesterdayAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
  },
  viewBreakdownLink: {
    color: '#ff7a1a',
    fontSize: 11,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  warningText: {
    color: '#ff9800',
    fontSize: 12,
    fontWeight: '600',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  homeTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    minHeight: 100,
  },
  tileEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1c20',
    textAlign: 'center',
  },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardStatusEmoji: {
    fontSize: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    flex: 1,
  },
  cardHint: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeGreen: {
    backgroundColor: '#e6f5ef',
  },
  badgeAmber: {
    backgroundColor: '#fdf3df',
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
  },
  kvKey: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500',
  },
  kvValue: {
    fontSize: 12,
    color: '#1a1c20',
    fontWeight: '600',
  },
  settingsListContainer: {
    marginTop: 6,
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e4db',
    overflow: 'hidden',
  },
  settingsListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  settingsListItemLast: {
    borderBottomWidth: 0,
  },
  settingsListLabel: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '500',
  },
  settingsListArrow: {
    fontSize: 16,
    color: '#5b606c',
    marginLeft: 8,
  },
  logoutListItem: {
    borderBottomWidth: 0,
  },
  logoutText: {
    color: '#e0453f',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#f6f4ef',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1c20',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#5b606c',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#ff7a1a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  skeleton: {
    backgroundColor: '#e0e0e0',
    opacity: 0.5,
  },
  skeletonGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  // ✅ REQ-4.4: Locked modal styles
  lockedContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  lockedContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  lockedIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
    textAlign: 'center',
  },
  lockedMessage: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  lockedDetails: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b606c',
    marginTop: 8,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1a1c20',
  },
  offlineBanner: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    width: '100%',
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff9800',
    marginBottom: 4,
  },
  offlineSubtext: {
    fontSize: 11,
    color: '#ff9800',
    lineHeight: 16,
  },
  unlockedButton: {
    width: '100%',
    backgroundColor: '#ff7a1a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  unlockedButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});