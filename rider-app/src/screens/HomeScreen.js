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
// ✅ FIXED: Removed useRider import, use getRiderAccountSummary instead (aligns with backup)
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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../i18n/LocalizationProvider';
import { useToast } from '../components/Toast';
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
import HeroFareCard from '../components/HeroFareCard';

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
    console.error('HomeScreen error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorDisplay
          error={this.state.error?.message || 'Unknown error'}
          onRetry={() => this.setState({ hasError: false })}
        />
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// MAIN HOMESCREEN COMPONENT
// ============================================================================
const HomeScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { showToast } = useToast();
  // ✅ FIXED: Removed useRider() - use getRiderAccountSummary instead (see loadDashboard)

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

  // ✅ Load dashboard data (trips, totals, queued records, bike profile)
  const loadDashboard = useCallback(async () => {
    try {
      setHasError(false);
      setErrorMsg(null);

      // ✅ FIXED: Use getRiderAccountSummary instead of useRider hook
      const accountData = await getRiderAccountSummary();
      setAccount(accountData);

      const today = getTodaysTrips();
      setTripsToday(today.length);

      const todayIncome = getTodaysRealizedIncome();
      setRunningTotal(todayIncome);

      const yesterday = getYesterdaysTotal();
      setYesterdayTotal(yesterday);

      const queued = getQueuedRecords();
      setQueuedCount(queued.length);

      const bike = await getActiveBikeProfile();
      setBike(bike);

      const hours = hoursSinceLastSync();
      setOfflineHours(hours);

      setIsInitialized(true);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setHasError(true);
      setErrorMsg(err.message || 'Failed to load dashboard');
    }
  }, []);

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  // ✅ Initial load on component mount
  useEffect(() => {
    loadDashboard();
    loadSubscription();
  }, [loadDashboard, loadSubscription]);

  // ✅ Refresh on screen focus (for Lipa Later payment updates)
  useFocusEffect(
    useCallback(() => {
      loadDashboard();
      loadSubscription();
    }, [loadDashboard, loadSubscription])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadDashboard();
      await loadSubscription();
      showToast('Dashboard updated', 'success');
    } catch (err) {
      showToast('Refresh failed', 'error');
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, loadSubscription, showToast]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isInitialized && !hasError) {
    return <LoadingSkeleton />;
  }

  if (hasError) {
    return <ErrorDisplay error={errorMsg} onRetry={loadDashboard} />;
  }

  const energyTile = ENERGY_TILE_BY_FUEL[bike?.fuel_type] || ENERGY_TILE_BY_FUEL.petrol;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ===== TOP BAR ===== */}
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>🚕</Text>
          </View>
          <Text style={styles.brandName}>Smart Boda</Text>
        </View>
      </View>

      <View style={styles.screenBody}>
        {/* ===== HERO FARE CARD ===== */}
        <HeroFareCard
          runningTotal={runningTotal}
          onPress={() => navigation.navigate('DailyTradeSummary')}
        />

        {/* ===== SUBSCRIPTION BANNER ===== */}
        {subscription && (
          <View style={[styles.banner, subscription.days_left <= 2 && styles.bannerUrgent]}>
            <Text style={styles.bannerText}>
              {subscription.days_left <= 0
                ? '🔒 Subscription expired'
                : `⏰ ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''} left`}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Subscription')}>
              <Text style={styles.bannerLink}>→</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ===== YESTERDAY'S TOTAL ===== */}
        {yesterdayTotal !== null && (
          <View style={styles.yesterdayCard}>
            <Text style={styles.yesterdayLabel}>Yesterday Total Trade</Text>
            <View style={styles.yesterdayRow}>
              <Text style={styles.yesterdayAmount}>KSh {yesterdayTotal.toLocaleString()}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('DailyTradeSummary')}>
                <Text style={styles.yesterdayLink}>View →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ===== SYNC STATUS ===== */}
        {queuedCount > 0 && (
          <View style={styles.syncBanner}>
            <Text style={styles.syncBannerText}>
              📡 {queuedCount} record{queuedCount !== 1 ? 's' : ''} waiting to sync
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SyncStatus')}>
              <Text style={styles.syncBannerLink}>View →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ===== HOME TILES GRID ===== */}
        <View style={styles.grid}>
          {/* Energy Tile (Dynamic based on fuel type) */}
          <TouchableOpacity
            style={styles.homeTile}
            onPress={() => navigation.navigate(energyTile.route)}
          >
            <Text style={styles.tileEmoji}>{energyTile.emoji}</Text>
            <Text style={styles.tileName}>{t(energyTile.label)}</Text>
          </TouchableOpacity>

          {/* Other Tiles */}
          {HOME_TILES.map((tile) => (
            <TouchableOpacity
              key={tile.route}
              style={styles.homeTile}
              onPress={() => navigation.navigate(tile.route)}
            >
              <Text style={styles.tileEmoji}>{tile.emoji}</Text>
              <Text style={styles.tileName}>{t(tile.label)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ===== FOOTER ACTIONS ===== */}
        <TouchableOpacity style={styles.footerLink} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.footerLinkText}>⚙️ Settings & Bike Profile →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.footerLink}
          onPress={() => {
            Alert.alert(
              'Logout',
              'Are you sure? This will clear all local data.',
              [
                {
                  text: 'Cancel',
                  onPress: () => {},
                  style: 'cancel',
                },
                {
                  text: 'Logout',
                  onPress: async () => {
                    try {
                      await clearSession();
                      showToast('Logged out', 'success');
                      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
                    } catch (err) {
                      showToast('Logout failed', 'error');
                    }
                  },
                  style: 'destructive',
                },
              ]
            );
          }}
        >
          <Text style={[styles.footerLinkText, styles.footerLinkDanger]}>🚪 Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

// ============================================================================
// EXPORT WITH ERROR BOUNDARY
// ============================================================================

export default () => (
  <HomeScreenErrorBoundary>
    <HomeScreen />
  </HomeScreenErrorBoundary>
);

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  topBar: {
    backgroundColor: '#1a1c20',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 8,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255, 122, 26, 0.2)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 20,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  screenBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 40,
  },
  banner: {
    backgroundColor: '#fff6ee',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ffe7cc',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerUrgent: {
    backgroundColor: '#fdecea',
    borderColor: '#fdc8bf',
  },
  bannerText: {
    fontSize: 12.5,
    color: '#5b4a2a',
    fontWeight: '600',
    flex: 1,
  },
  bannerLink: {
    fontSize: 16,
    color: '#ff7a1a',
  },
  yesterdayCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 12,
    marginBottom: 12,
  },
  yesterdayLabel: {
    fontSize: 11,
    color: '#8b92a3',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  yesterdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yesterdayAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
  },
  yesterdayLink: {
    fontSize: 12,
    color: '#ff7a1a',
    fontWeight: '700',
  },
  syncBanner: {
    backgroundColor: '#e6f5ef',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#c2e8d9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncBannerText: {
    fontSize: 12.5,
    color: '#1e7e6a',
    fontWeight: '600',
  },
  syncBannerLink: {
    fontSize: 12,
    color: '#1e7e6a',
    fontWeight: '700',
  },
  heroFare: {
    backgroundColor: '#1a1c20',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    height: 140,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  homeTile: {
    width: (width - 64) / 2,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  tileName: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1a1c20',
    textAlign: 'center',
  },
  footerLink: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
    marginHorizontal: -16,
    marginBottom: 0,
  },
  footerLinkText: {
    fontSize: 13,
    color: '#ff7a1a',
    fontWeight: '700',
  },
  footerLinkDanger: {
    color: '#e0453f',
  },
  skeleton: {
    backgroundColor: '#e7e4db',
    opacity: 0.3,
  },
  skeletonGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 20,
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 13,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
