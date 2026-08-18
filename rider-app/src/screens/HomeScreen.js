// rider-app/src/screens/HomeScreen.js
// ============================================================================
// CONSOLIDATED: Complete subscription management + comprehensive dashboard
// Features Combined:
// - Subscription notifications, banner, locked modal, offline support (REQ-4.1-4.4)
// - Hero Fare Card with today's earnings and daily summary
// - Yesterday's total, trips tracking, queued records
// - Multiple navigation tiles (Fuel, Service, Financial, Targets, etc.)
// - Error boundary and loading skeleton for robust UX
// - Auto-refresh on focus for real-time updates
// - Full offline-first support for subscription and trip data
// ============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n/LocalizationProvider';
import { useRiderId } from '../rider/RiderContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getTodaysTrips,
  getTodaysRealizedIncome,
  getYesterdaysTotal,
  summarizeTrips,
} from '../offline/tripsRepository';
import {
  getQueuedRecords,
  hoursSinceLastSync,
} from '../offline/syncQueue';
import { getActiveBikeProfile, getRiderAccountSummary, clearSession } from '../offline/db';

const { width } = Dimensions.get('window');

const ENERGY_TILE_BY_FUEL = {
  petrol: { emoji: '⛽', label: 'home.tile_fuel_motorcycle', route: 'FuelHub' },
  electric: { emoji: '🔋', label: 'home.tile_charge_battery', route: 'ChargeBatteryHub' },
};

const HOME_TILES = [
  { emoji: '🔧', label: 'home.tile_service_motorcycle', route: 'MaintenanceHub' },
  { emoji: '💰', label: 'home.tile_financial_performance', route: 'MoneyMastery' },
  { emoji: '🎯', label: 'home.tile_revenue_targets', route: 'RevenueTargets' },
  { emoji: '📋', label: 'home.tile_license_insurance', route: 'ComplianceDashboard' },
  { emoji: '🐖', label: 'home.tile_savings', route: 'SavingsHub' },
  { emoji: '🧾', label: 'home.tile_lipa_later_report', route: 'PaymentSummary' },
  { emoji: '🏡', label: 'home.tile_send_money_home', route: 'SendMoneyHome' },
  { emoji: '🏆', label: 'home.tile_my_goals', route: 'Goals' },
  { emoji: '💡', label: 'home.tile_suggestions_feedback', route: 'SuggestionsFeedback' },
];

// ============================================================================
// ERROR BOUNDARY
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
// MAIN HOMESCREEN COMPONENT
// ============================================================================
const HomeScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const riderId = useRiderId();

  // ✅ Subscription State (REQ-4.1-4.4) - Offline only
  const [subscription, setSubscription] = useState(null);

  // ✅ Dashboard State
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

  // ============================================================================
  // SUBSCRIPTION FUNCTIONS (REQ-4.1, 4.2, 4.3, 4.4) - OFFLINE ONLY
  // ============================================================================

  // ✅ Load subscription data from offline cache only
  const loadSubscription = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem('subscription_cache');
      if (cached) {
        try {
          const { data } = JSON.parse(cached);
          setSubscription(data);
        } catch (e) {
          console.error('Error loading cached subscription:', e);
        }
      }
    } catch (err) {
      console.error('Error loading subscription from cache:', err);
    }
  }, []);

  // ============================================================================
  // DASHBOARD FUNCTIONS
  // ============================================================================

  // ✅ Refresh all dashboard data
  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setHasError(false);
      setErrorMsg(null);

      // Load bike profile
      const activeBike = await getActiveBikeProfile();
      if (activeBike) {
        setBike(activeBike);
      }

      // Load account summary
      const accountSummary = await getRiderAccountSummary();
      if (accountSummary) {
        setAccount(accountSummary);
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
      await loadSubscription();

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
  }, [isInitialized, loadSubscription]);

  // ✅ Auto-refresh on component focus and initial load
  useEffect(() => {
    refresh();
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
    });
    return unsubscribe;
  }, [navigation, refresh]);

  // ============================================================================
  // SUBSCRIPTION UI RENDERERS (REQ-4.1-4.4)
  // ============================================================================

  // ✅ REQ-4.4: Locked Modal
  const renderLockedModal = () => {
    if (!subscription?.locked) return null;

    return (
      <Modal visible={subscription.locked} animationType="slide" transparent={false}>
        <View style={styles.lockedContainer}>
          <View style={styles.lockedContent}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <Text style={styles.lockedTitle}>{t('subscription.account_locked')}</Text>

            <Text style={styles.lockedReason}>
              {subscription.lock_reason === 'Free Trial Expired'
                ? t('subscription.trial_expired_message')
                : t('subscription.subscription_expired_message')}
            </Text>

            <View style={styles.offlineBannerModal}>
              <Text style={styles.offlineText}>⚠️ {t('common.offline_mode')}</Text>
              <Text style={styles.offlineSubtext}>
                {t('subscription.offline_payment_message')}
              </Text>
            </View>

            <View style={styles.lockedDetails}>
              <Text style={styles.detailLabel}>{t('subscription.lock_reason')}:</Text>
              <Text style={styles.detailValue}>{subscription.lock_reason}</Text>

              {subscription.locked_at && (
                <>
                  <Text style={styles.detailLabel}>{t('subscription.locked_at')}:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(subscription.locked_at).toLocaleDateString()}
                  </Text>
                </>
              )}
            </View>

            <TouchableOpacity
              style={styles.unlockButton}
              onPress={() => navigation.navigate('ChooseFrequencyScreen')}
            >
              <Text style={styles.unlockButtonText}>
                {t('subscription.unlock_pay_now')} 💳
              </Text>
            </TouchableOpacity>

            <Text style={styles.supportText}>
              {t('subscription.support_contact')}: +254 700 000 000
            </Text>
          </View>
        </View>
      </Modal>
    );
  };

  // ✅ REQ-4.2, REQ-4.3: Subscription Renewal Banner
  const renderSubscriptionBanner = () => {
    if (!subscription || subscription.locked || subscription.days_left > 1) {
      return null;
    }

    return (
      <View style={styles.subscriptionBanner}>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerIcon}>⚠️</Text>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>
              {t('subscription.last_day_warning')}
            </Text>
            <Text style={styles.bannerSubtitle}>
              {t('subscription.subscribe_avoid_interruption')}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.bannerButton}
          onPress={() => navigation.navigate('ChooseFrequencyScreen')}
        >
          <Text style={styles.bannerButtonText}>
            {t('subscription.subscribe_now')} →
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ✅ REQ-4.1: Notification Bell with Subscription Badge
  const renderNotificationBell = () => {
    const hasSubscriptionWarning = subscription && subscription.days_left <= 1 && !subscription.locked;

    return (
      <TouchableOpacity
        style={styles.notifBellContainer}
        onPress={() => {
          if (hasSubscriptionWarning) {
            navigation.navigate('MySubscriptions');
          }
        }}
      >
        <Text style={styles.bellIcon}>🔔</Text>
        {hasSubscriptionWarning ? (
          <View style={[styles.notifBadge, styles.badgeWarning]}>
            <Text style={styles.badgeText}>!</Text>
          </View>
        ) : queuedCount > 0 ? (
          <View style={[styles.notifBadge, styles.badgeQueue]}>
            <Text style={styles.badgeText}>{queuedCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  // ✅ Subscription Status Card
  const renderSubscriptionStatusCard = () => {
    if (!subscription) return null;

    const statusColor = subscription.locked
      ? '#dc3545'
      : subscription.days_left <= 1
      ? '#ff9800'
      : '#4caf50';

    return (
      <TouchableOpacity
        style={[styles.statusCard, { borderLeftColor: statusColor }]}
        onPress={() => navigation.navigate('MySubscriptions')}
      >
        <View style={styles.statusCardContent}>
          <Text style={styles.statusCardEmoji}>📲</Text>
          <View style={styles.statusCardText}>
            <Text style={styles.statusCardLabel}>{t('home.tile_my_subscription')}</Text>
            <Text style={styles.statusCardValue}>
              {subscription.locked
                ? t('subscription.status_locked')
                : subscription.days_left <= 1
                ? `⏰ ${t('subscription.last_day')}`
                : `✅ ${subscription.days_left} ${t('subscription.days_left')}`}
            </Text>
          </View>
        </View>
        <Text style={styles.cardArrow}>→</Text>
      </TouchableOpacity>
    );
  };

  // ============================================================================
  // DASHBOARD UI RENDERERS
  // ============================================================================

  const handleOpenDailySummary = () => {
    navigation.navigate('DailyTradeSummary');
  };

  const handleNewTrip = () => {
    navigation.navigate('NewTrip');
  };

  const handleViewFinancialHistory = () => {
    navigation.navigate('FinancialHistory');
  };

  const handleTilePress = (route) => {
    if (navigation && route) {
      navigation.navigate(route);
    }
  };

  const handleEnergyTilePress = (route) => {
    try {
      // Try direct navigation first (MainNavigator context)
      navigation.navigate(route);
    } catch (err) {
      console.error('[HomeScreen] Navigation error:', err);
      // Fallback: try navigating through parent if nested
      try {
        navigation.navigate('Home', { screen: route });
      } catch (fallbackErr) {
        console.error('[HomeScreen] Fallback navigation failed:', fallbackErr);
      }
    }
  };

  const energyTile = bike?.fuel_type_code ? ENERGY_TILE_BY_FUEL[bike.fuel_type_code] : null;
  const safeRunningTotal = Number(runningTotal) || 0;
  const safeYesterdayTotal = typeof yesterdayTotal === 'number' ? yesterdayTotal : 0;

  // ============================================================================
  // RENDER LOGIC
  // ============================================================================

  if (!isInitialized && !hasError) {
    return <LoadingSkeleton />;
  }

  if (hasError) {
    return <ErrorDisplay error={errorMsg} onRetry={refresh} />;
  }

  return (
    <HomeScreenErrorBoundary onRetry={refresh}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
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
          {renderNotificationBell()}
        </View>

        <View style={styles.screenBody}>
          {/* ✅ OFFLINE WARNING */}
          {offlineHours > 0 && (
            <View style={styles.offlineWarning}>
              <Text style={styles.offlineWarningEmoji}>⚠️</Text>
              <Text style={styles.offlineWarningText}>
                {t('common.offline_mode')} - {t('common.offline_data_cached')}
              </Text>
            </View>
          )}

          {/* ✅ REQ-4.2, 4.3: Subscription Renewal Banner */}
          {renderSubscriptionBanner()}

          {/* HERO FARE CARD */}
          <HeroFareCard
            totalFare={safeRunningTotal}
            onOpenDailySummary={handleOpenDailySummary}
            onNewTrip={handleNewTrip}
          />

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

          {/* ✅ SUBSCRIPTION STATUS CARD */}
          {renderSubscriptionStatusCard()}

          {/* Tiles Grid - Aligned with cleaned.html */}
          {/* Row 1: Fuel/Charge + Service */}
          <View style={styles.tileRow}>
            {energyTile && (
              <TouchableOpacity
                style={styles.homeTile}
                onPress={() => {
                  try {
                    // Try direct navigation first (MainNavigator context)
                    navigation.navigate(energyTile.route);
                  } catch (err) {
                    console.error('[HomeScreen] Navigation error:', err);
                    // Fallback: try navigating through parent if nested
                    try {
                      navigation.navigate('Home', { screen: energyTile.route });
                    } catch (fallbackErr) {
                      console.error('[HomeScreen] Fallback navigation failed:', fallbackErr);
                    }
                  }
                }}
              >
                <Text style={styles.tileEmoji}>{energyTile.emoji}</Text>
                <Text style={styles.tileLabel}>{t(energyTile.label)}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.homeTile}
              onPress={() => {
                console.log('[HomeScreen] Navigating to MaintenanceHub');
                try {
                  navigation.navigate('MaintenanceHub');
                } catch (err) {
                  console.error('[HomeScreen] MaintenanceHub navigation error:', err);
                }
              }}
            >
              <Text style={styles.tileEmoji}>🔧</Text>
              <Text style={styles.tileLabel}>{t('home.tile_service_motorcycle')}</Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: Financial Performance + My Subscription */}
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
              <Text style={styles.tileLabel}>{t('home.tile_my_subscription')}</Text>
            </TouchableOpacity>
          </View>

          {/* Row 3: Sync Status Card (Clickable) */}
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
              <View
                style={[
                  styles.badge,
                  queuedCount > 0 ? styles.badgeAmber : styles.badgeGreen,
                ]}
              >
                <Text style={styles.badgeText}>
                  {queuedCount > 0 ? `Queued: ${queuedCount}` : 'All Synced'}
                </Text>
              </View>
            </View>
            <Text style={styles.cardHint}>
              {queuedCount > 0
                ? 'Tap to view queue and retry.'
                : 'Everything is safely backed up.'}
            </Text>
          </TouchableOpacity>

          {/* Account Card */}
          <View style={styles.cardContainer}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Trips today</Text>
              <Text style={styles.kvValue}>{tripsToday}</Text>
            </View>
          </View>

          {/* Settings List Items */}
          <View style={styles.settingsListContainer}>
            <TouchableOpacity
              style={styles.settingsListItem}
              onPress={handleOpenDailySummary}
            >
              <Text style={styles.settingsListLabel}>📊 My Daily Trade Summary</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsListItem}
              onPress={handleViewFinancialHistory}
            >
              <Text style={styles.settingsListLabel}>📈 My Financial History & Statements</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsListItem, styles.logoutListItem]}
              onPress={() => navigation.navigate('PinLogin')}
            >
              <Text style={[styles.settingsListLabel, styles.logoutText]}>🚪 Logout</Text>
              <Text style={styles.settingsListArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ✅ REQ-4.4: Locked Modal Overlay */}
      {renderLockedModal()}
    </HomeScreenErrorBoundary>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#d32f2f',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ff7a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 16,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },
  notifBellContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellIcon: {
    fontSize: 20,
  },
  notifBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  badgeWarning: {
    backgroundColor: '#ff9800',
  },
  badgeQueue: {
    backgroundColor: '#ff7a1a',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  screenBody: {
    padding: 20,
  },
  offlineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  offlineWarningEmoji: {
    fontSize: 18,
    marginRight: 10,
  },
  offlineWarningText: {
    color: '#ff9800',
    fontSize: 13,
    fontWeight: '600',
  },
  subscriptionBanner: {
    marginBottom: 15,
    backgroundColor: '#fffbea',
    borderRadius: 8,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  bannerContent: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  bannerIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  bannerButton: {
    backgroundColor: '#ff9800',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  bannerButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  yesterdayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  yesterdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    elevation: 1,
  },
  statusCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusCardEmoji: {
    fontSize: 24,
    marginRight: 15,
  },
  statusCardText: {
    flex: 1,
  },
  statusCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  statusCardValue: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  cardArrow: {
    fontSize: 16,
    color: '#999',
  },
  energyTile: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    alignItems: 'center',
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
  lockedContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  lockedContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    elevation: 3,
  },
  lockedIcon: {
    fontSize: 60,
    marginBottom: 20,
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 10,
  },
  lockedReason: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  offlineBannerModal: {
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 6,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#ff9800',
  },
  offlineText: {
    fontWeight: '600',
    color: '#ff9800',
    fontSize: 12,
  },
  offlineSubtext: {
    color: '#ff9800',
    fontSize: 11,
    marginTop: 4,
  },
  lockedDetails: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 6,
    marginBottom: 25,
    width: '100%',
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginTop: 8,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
  },
  unlockButton: {
    backgroundColor: '#007bff',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 15,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  supportText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  skeleton: {
    backgroundColor: '#e0e0e0',
    opacity: 0.5,
  },
  skeletonGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  heroFare: {
    height: 140,
  },
  // Card Styles
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
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a1c20',
  },
  // Key-Value Row Styles
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
  // Settings List Styles
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
});

export default HomeScreen;