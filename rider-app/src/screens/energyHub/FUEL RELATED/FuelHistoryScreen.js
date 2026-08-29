// rider-app/src/screens/energyHub/FuelHistoryScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Clean UI, no status banners
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ FIXED: Infinite loop resolved with proper dependency management
// ✅ FIXED: Back navigation now properly handled
// ✅ FIXED: Single data load on mount with smart refresh on focus

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import colors from '../../theme/colors';

const PAGE_SIZE = 10;

export default function FuelHistoryScreen({ bikeProfile, navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState('thisMonth');
  const [allEntries, setAllEntries] = useState([]);
  
  // ✅ Track if we've already loaded data on mount
  const hasLoadedRef = useRef(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const isElectric = bikeProfile?.fuelType === 'electric';
  const title = isElectric ? (t('batteryManagement_history') || 'Battery Cost History') : (t('fuelManagement_history') || 'Fuel Cost History');

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ FuelHistory: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  const getPeriodRange = useCallback((selectedPeriod) => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();

    switch (selectedPeriod) {
      case 'thisMonth':
        return { start: thisMonthStart, end: now.getTime() };
      case 'lastMonth':
        return { start: lastMonthStart, end: thisMonthStart - 1 };
      case 'last6':
        return { start: sixMonthsStart, end: now.getTime() };
      case 'sinceJoining':
        return { start: 0, end: now.getTime() };
      default:
        return { start: thisMonthStart, end: now.getTime() };
    }
  }, []);

  /**
   * ✅ Reconstruct history from individual entries
   * Fallback when cache is missing
   * Uses IndexedDB queryRows for efficient lookups
   */
  const reconstructHistoryFromIndividualEntries = useCallback(async () => {
    try {
      const rows = await indexedDbAdapter.queryRows('fuelEntry', (row) => {
        return row.rider_id === effectiveRiderId;
      });
      
      // Sort by created_at (newest first)
      rows.sort((a, b) => 
        new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime()
      );
      
      return rows;
    } catch (err) {
      console.error('❌ Error reconstructing entries:', err);
      return [];
    }
  }, [effectiveRiderId]);

  // ✅ LOAD DATA ON MOUNT - Single execution
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized || hasLoadedRef.current) {
      return;
    }

    let isMounted = true;

    async function loadHistoryOnMount() {
      try {
        setLoading(true);
        clearCriticalError();

        const cacheKey = `fuel_history_${effectiveRiderId}`;

        // Try cache first
        console.log('📦 Checking cache...');
        const cachedData = await indexedDbAdapter.kvGet(cacheKey);
        if (cachedData) {
          try {
            const items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
            if (Array.isArray(items) && items.length > 0) {
              if (isMounted) {
                setAllEntries(items);
                setPage(1);
                console.log(`✅ Loaded ${items.length} items from cache`);
              }
            } else {
              // Cache is empty, reconstruct from entries
              const reconstructed = await reconstructHistoryFromIndividualEntries();
              if (isMounted && reconstructed.length > 0) {
                setAllEntries(reconstructed);
                setPage(1);
              }
            }
          } catch (parseErr) {
            const reconstructed = await reconstructHistoryFromIndividualEntries();
            if (isMounted && reconstructed.length > 0) {
              setAllEntries(reconstructed);
              setPage(1);
            }
          }
        } else {
          // No cache, reconstruct from individual entries
          const reconstructed = await reconstructHistoryFromIndividualEntries();
          if (isMounted && reconstructed.length > 0) {
            setAllEntries(reconstructed);
            setPage(1);
          }
        }

        // Try to sync fresh data if online
        if (isConnected && isMounted) {
          console.log('📡 Syncing with API...');
          try {
            const response = await api.get('/fuel-maintenance/fuel-entry/history', {
              params: {
                rider_id: effectiveRiderId,
                page: 1,
                limit: 100,
              }
            });

            if (isMounted) {
              const items = (response.data?.entries || [])
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

              setAllEntries(items);
              
              // Cache it for next time using IndexedDB
              await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(items));
              console.log(`✅ Synced ${items.length} entries and cached`);
            }
          } catch (apiErr) {
            console.warn('⚠️ API sync failed (using cached data):', apiErr.message);
          }
        }

        if (isMounted) {
          hasLoadedRef.current = true;
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ Fetch error:', err);
        if (isMounted) {
          showCriticalError(
            t('error_loadHistoryFailed') || 'Failed to load history. Please try again.',
            'data_load'
          );
          setLoading(false);
        }
      }
    }

    loadHistoryOnMount();

    return () => {
      isMounted = false;
    };
  }, [effectiveRiderId, isInitialized, isConnected, t, clearCriticalError, reconstructHistoryFromIndividualEntries]);

  /**
   * ✅ Refresh on screen focus (soft refresh only)
   * Does NOT trigger full data reload - just updates from current cache
   */
  useFocusEffect(
    useCallback(() => {
      if (!effectiveRiderId || !isInitialized || !hasLoadedRef.current) {
        return;
      }

      async function softRefreshCache() {
        try {
          const cacheKey = `fuel_history_${effectiveRiderId}`;
          const cachedData = await indexedDbAdapter.kvGet(cacheKey);
          
          if (cachedData) {
            const items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
            if (Array.isArray(items) && items.length > 0) {
              setAllEntries(items);
              console.log('✅ Refreshed cache on focus');
            }
          }
        } catch (err) {
          console.warn('⚠️ Error in focus refresh:', err);
        }
      }

      softRefreshCache();
    }, [effectiveRiderId, isInitialized])
  );

  // Filter by period
  useEffect(() => {
    const { start, end } = getPeriodRange(period);
    const filtered = allEntries.filter(entry => {
      const entryTime = new Date(entry.created_at || entry.createdAt).getTime();
      return entryTime >= start && entryTime <= end;
    });
    setEntries(filtered);
    setPage(1);
  }, [period, allEntries, getPeriodRange]);

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const pageItems = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      const dateStr = date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${dateStr} ${timeStr}`;
    } catch {
      return dateString;
    }
  };

  // ✅ FIXED: Back navigation goes directly to Home (customer-friendly)
  const handleBackPress = useCallback(() => {
    try {
      if (navigation && navigation.navigate) {
        // Navigate directly to Home instead of goBack (customer prefers this)
        navigation.navigate('Home');
      } else {
        console.warn('⚠️ Navigation not available');
      }
    } catch (err) {
      console.error('❌ Navigation error:', err);
    }
  }, [navigation]);

  if (!isInitialized || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleBackPress} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{title}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleBackPress} label={t('backLabel') || '← Back'} />
      
      <Text style={styles.title}>{title}</Text>

      {/* CRITICAL ERROR ONLY */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Period tabs */}
      <View style={styles.periodTabs}>
        {[
          { label: t('thisMonth') || 'This Month', value: 'thisMonth' },
          { label: t('lastMonth') || 'Last Month', value: 'lastMonth' },
          { label: t('last6Months') || 'Last 6M', value: 'last6' },
          { label: t('sinceJoining') || 'Since Joining', value: 'sinceJoining' }
        ].map(tab => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.periodTab, period === tab.value && styles.periodTabActive]}
            onPress={() => setPeriod(tab.value)}
          >
            <Text style={[styles.periodTabText, period === tab.value && styles.periodTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>{t('totalSpent') || 'Total Spent'}</Text>
            <Text style={styles.summaryValue}>KSh {entries.reduce((sum, e) => sum + (e.cost || 0), 0).toLocaleString()}</Text>
          </View>
          <View style={styles.summarySpacer} />
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>{t('entries') || 'Entries'}</Text>
            <Text style={styles.summaryValue}>{entries.length}</Text>
          </View>
        </View>
      </View>

      {/* Entries list */}
      <View style={styles.entriesCard}>
        {pageItems.length > 0 ? (
          pageItems.map((entry, idx) => (
            <View key={entry.id || idx}>
              <View style={styles.entryRow}>
                <View style={styles.entryLeft}>
                  <Text style={styles.entryMode}>
                    {isElectric ? '🔋 Charge' : '⛽ Fuel'}
                  </Text>
                  <Text style={styles.entryTime}>
                    {formatDate(entry.created_at)}
                  </Text>
                </View>
                <View style={styles.entryRight}>
                  <Text style={styles.entryAmount}>KSh {entry.cost.toLocaleString()}</Text>
                </View>
              </View>
              {idx < pageItems.length - 1 && <View style={styles.entryDivider} />}
            </View>
          ))
        ) : (
          <Text style={styles.emptyMessage}>{t('noEntriesForPeriod') || 'No entries for this period'}</Text>
        )}
      </View>

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationInfo}>
            {t('showing') || 'Showing'} {pageItems.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, entries.length)} {t('of') || 'of'} {entries.length}
          </Text>
          <View style={styles.paginationControls}>
            <TouchableOpacity
              style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
              onPress={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <Text style={styles.pageBtnText}>‹</Text>
            </TouchableOpacity>

            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.pageBtn, p === page && styles.pageBtnActive]}
                onPress={() => setPage(p)}
              >
                <Text style={[styles.pageBtnText, p === page && styles.pageBtnTextActive]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
              onPress={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              <Text style={styles.pageBtnText}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 0
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 20,
    paddingHorizontal: 20,
    marginTop: 16
  },

  // CRITICAL ERROR ONLY
  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 20,
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

  // Period tabs
  periodTabs: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: '#fff',
    alignItems: 'center'
  },
  periodTabActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a'
  },
  periodTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft || '#5b606c'
  },
  periodTabTextActive: {
    color: '#fff'
  },

  // Summary card
  summaryCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  summaryCol: {
    flex: 1
  },
  summarySpacer: {
    width: 1,
    backgroundColor: '#e7e4db',
    marginHorizontal: 16
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.inkSoft || '#5b606c',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    marginBottom: 6
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20'
  },

  // Entries list
  entriesCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    overflow: 'hidden'
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center'
  },
  entryLeft: {
    flex: 1
  },
  entryMode: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 4
  },
  entryTime: {
    fontSize: 11,
    color: colors.inkSoft || '#5b606c',
    fontWeight: '500'
  },
  entryRight: {
    alignItems: 'flex-end'
  },
  entryAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20'
  },
  entryDivider: {
    height: 1,
    backgroundColor: '#f0ede7',
    marginHorizontal: 16
  },
  emptyMessage: {
    fontSize: 13,
    color: colors.inkSoft || '#5b606c',
    fontWeight: '500',
    paddingVertical: 16,
    textAlign: 'center'
  },

  // Pagination
  paginationContainer: {
    marginHorizontal: 20,
    marginBottom: 24
  },
  paginationInfo: {
    fontSize: 11,
    color: colors.inkSoft || '#5b606c',
    fontWeight: '500',
    marginBottom: 10,
    textAlign: 'center'
  },
  paginationControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4
  },
  pageBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: '#fff',
    minWidth: 36,
    alignItems: 'center'
  },
  pageBtnActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a'
  },
  pageBtnDisabled: {
    backgroundColor: '#f0ede7',
    borderColor: '#e7e4db'
  },
  pageBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft || '#5b606c'
  },
  pageBtnTextActive: {
    color: '#fff'
  }
});