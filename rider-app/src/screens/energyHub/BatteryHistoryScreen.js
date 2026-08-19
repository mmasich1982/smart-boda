// rider-app/src/screens/energyHub/BatteryHistoryScreen.js
// ✅ COMPLETE REWRITE: Period tabs + Offline data loading + UI alignment
// Features:
// - Period tabs: This Month, Last Month, Last 6 Months, Since Joining
// - Filter entries by selected period
// - Load from offline storage
// - Proper UI/UX alignment with cleaned.html design system
// - Offline indicator and empty states

import React, { useState, useFocusEffect, useCallback, useMemo } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useTranslation } from '../../i18n/LocalizationProvider';

const BatteryHistoryScreen = ({ navigation }) => {
  const { t } = useTranslation();
  const { state: riderState } = useRider();
  
  const [loading, setLoading] = useState(false);
  const [allEntries, setAllEntries] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('thisMonth');
  const [isOffline, setIsOffline] = useState(false);

  const getRiderId = useCallback(() => {
    try {
      return getLocalRiderId();
    } catch (err) {
      return riderState?.riderId;
    }
  }, [riderState]);

  // Load all battery entries from offline storage
  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const riderId = getRiderId();
      
      if (!riderId) {
        setLoading(false);
        return;
      }

      // Load from offline storage
      const storedJson = LocalStore.get(`battery_entries_${riderId}`);
      const entries = storedJson ? JSON.parse(storedJson) : [];
      
      setAllEntries(entries);
      setIsOffline(true);

    } catch (err) {
      console.error('Error loading entries:', err);
      setIsOffline(false);
    } finally {
      setLoading(false);
    }
  }, [getRiderId]);

  // Reload when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  // Filter entries based on period
  const filteredEntries = useMemo(() => {
    const now = new Date();
    
    return allEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      
      switch (selectedPeriod) {
        case 'thisMonth': {
          return entryDate.getMonth() === now.getMonth() && 
                 entryDate.getFullYear() === now.getFullYear();
        }
        case 'lastMonth': {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
          return entryDate.getMonth() === lastMonth.getMonth() && 
                 entryDate.getFullYear() === lastMonth.getFullYear();
        }
        case 'last6Months': {
          const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6);
          return entryDate >= sixMonthsAgo;
        }
        case 'allTime': {
          return true;
        }
        default:
          return true;
      }
    });
  }, [allEntries, selectedPeriod]);

  // Calculate stats for selected period
  const periodStats = useMemo(() => {
    const totalCost = filteredEntries.reduce((sum, e) => sum + (e.cost || 0), 0);
    const totalDuration = filteredEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
    
    return {
      totalCost,
      totalDuration,
      average: filteredEntries.length > 0 ? (totalCost / filteredEntries.length).toFixed(2) : 0,
      count: filteredEntries.length,
    };
  }, [filteredEntries]);

  // Period tab data
  const periods = [
    { id: 'thisMonth', label: t('this_month') || 'This Month' },
    { id: 'lastMonth', label: t('last_month') || 'Last Month' },
    { id: 'last6Months', label: t('last_6_months') || 'Last 6 Months' },
    { id: 'allTime', label: t('all_time') || 'All Time' },
  ];

  // Render individual entry
  const renderEntryItem = ({ item }) => {
    const entryDate = new Date(item.date);
    const formattedDate = entryDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    const costPerMinute = (item.cost / item.duration).toFixed(2);

    return (
      <View style={styles.entryCard}>
        <View style={styles.entryHeader}>
          <View>
            <Text style={styles.entryDate}>{formattedDate}</Text>
            <Text style={styles.entrySubtext}>
              {item.battery_percent ? `Charged to ${item.battery_percent}%` : 'Battery charge session'}
            </Text>
          </View>
          <Text style={styles.entryCost}>KES {item.cost.toLocaleString()}</Text>
        </View>
        
        <View style={styles.entryDetails}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>⏱️ {t('duration') || 'Duration'}</Text>
            <Text style={styles.detailValue}>{Math.round(item.duration)} m</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>💰 {t('per_minute') || 'Per Minute'}</Text>
            <Text style={styles.detailValue}>KES {costPerMinute}</Text>
          </View>
        </View>

        {item.notes && (
          <View style={styles.entryNotes}>
            <Text style={styles.notesLabel}>{t('notes') || 'Notes'}:</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        )}

        {!item.synced && (
          <View style={styles.offlineIndicator}>
            <Text style={styles.offlineIndicatorText}>⏳ {t('not_synced') || 'Pending sync'}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <BackLink title={t('battery_history') || 'Battery History'} />
      </View>

      {/* Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📶 {t('working_offline') || 'Working offline'}
          </Text>
        </View>
      )}

      {/* Period Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {periods.map((period) => (
            <TouchableOpacity
              key={period.id}
              style={[
                styles.tab,
                selectedPeriod === period.id && styles.tabActive,
              ]}
              onPress={() => setSelectedPeriod(period.id)}
            >
              <Text
                style={[
                  styles.tabLabel,
                  selectedPeriod === period.id && styles.tabLabelActive,
                ]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Stats for selected period */}
      {!loading && filteredEntries.length > 0 && (
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('total_cost') || 'Total Cost'}</Text>
            <Text style={styles.statValue}>KES {periodStats.totalCost.toLocaleString()}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('total_time') || 'Total Time'}</Text>
            <Text style={styles.statValue}>{Math.round(periodStats.totalDuration)} m</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('average') || 'Average'}</Text>
            <Text style={styles.statValue}>KES {periodStats.average}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('entries') || 'Entries'}</Text>
            <Text style={styles.statValue}>{periodStats.count}</Text>
          </View>
        </View>
      )}

      {/* Entries List or Empty/Loading States */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ff7a1a" />
          <Text style={styles.loadingText}>{t('loading') || 'Loading...'}</Text>
        </View>
      ) : filteredEntries.length > 0 ? (
        <FlatList
          data={filteredEntries}
          renderItem={renderEntryItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          scrollEnabled={false}
        />
      ) : (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyStateIcon}>🔋</Text>
          <Text style={styles.emptyStateTitle}>
            {t('no_battery_entries_period') || 'No battery entries'}
          </Text>
          <Text style={styles.emptyStateMessage}>
            {t('no_battery_entries_in_period') || 'No battery entries for the selected period'}
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => navigation.navigate('BatteryEntry')}
          >
            <Text style={styles.emptyStateButtonText}>
              {t('record_entry') || 'Record Entry'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  offlineBanner: {
    backgroundColor: '#FFA500',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  offlineText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: '#fff',
  },
  tabActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1c20',
  },
  tabLabelActive: {
    color: '#fff',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff7a1a',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  entryCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  entryDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 2,
  },
  entrySubtext: {
    fontSize: 12,
    color: '#5b606c',
  },
  entryCost: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ff7a1a',
  },
  entryDetails: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  detailItem: {
    flex: 1,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 11,
    color: '#5b606c',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
  },
  entryNotes: {
    backgroundColor: '#f6f4ef',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5b606c',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 18,
  },
  offlineIndicator: {
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  offlineIndicatorText: {
    fontSize: 10,
    color: '#F57C00',
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  emptyStateMessage: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  emptyStateButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    marginTop: 12,
  },
});

export default BatteryHistoryScreen;