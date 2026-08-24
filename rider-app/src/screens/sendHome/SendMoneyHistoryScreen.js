import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, useFocusEffect } from 'react-native';
import { useToast } from '../../components/Toast';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import { getRemittanceSummary } from '../../offline/remittanceRepository';

/**
 * SendMoneyHistoryScreen.js
 * ==========================
 * ✅ FIXED: Proper rider_id management using local storage
 * ✅ FIXED: Cleaned.html UI alignment with period tabs, summary cards, pagination
 * ✅ FIXED: Period-based filtering (This Month, Last Month, Last 6M, Since Joining)
 * ✅ FIXED: Live data refresh on screen focus
 */

const PERIODS = {
  thisMonth: { label: 'This Month', key: 'thisMonth' },
  lastMonth: { label: 'Last Month', key: 'lastMonth' },
  last6: { label: 'Last 6 Months', key: 'last6' },
  sinceJoining: { label: 'Since Joining', key: 'sinceJoining' },
};

export default function SendMoneyHistoryScreen({ navigation }) {
  const { showToast } = useToast();
  const { state } = useRider();

  // Rider ID management
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [period, setPeriod] = useState('thisMonth');
  const [remittances, setRemittances] = useState([]);
  const [totalSent, setTotalSent] = useState(0);
  const [entriesLogged, setEntriesLogged] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

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

  // ✅ LOAD DATA WHEN SCREEN FOCUSES OR PERIOD CHANGES
  useFocusEffect(
    useCallback(() => {
      loadRemittances();
    }, [period])
  );

  const loadRemittances = useCallback(async () => {
    try {
      setLoading(true);

      // Get remittances summary for the period
      const summary = await getRemittanceSummary(period);

      setRemittances(summary.remittances || []);
      setTotalSent(summary.totalSent || 0);
      setEntriesLogged(summary.entriesLogged || 0);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error loading remittances:', err);
      showToast('Error loading remittances', 'error');
      setRemittances([]);
      setTotalSent(0);
      setEntriesLogged(0);
    } finally {
      setLoading(false);
    }
  }, [period, showToast]);

  // Pagination
  const totalPages = Math.ceil(remittances.length / itemsPerPage);
  const paginatedItems = remittances.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading && remittances.length === 0) {
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
          <Text style={styles.backLink}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Send Home History</Text>
      </View>

      <View style={styles.body}>
        {/* Period Tabs - Cleaned.html style */}
        <View style={styles.periodTabs}>
          {Object.values(PERIODS).map((config) => (
            <TouchableOpacity
              key={config.key}
              style={[
                styles.periodTab,
                period === config.key && styles.periodTabActive
              ]}
              onPress={() => setPeriod(config.key)}
            >
              <Text
                style={[
                  styles.periodTabText,
                  period === config.key && styles.periodTabTextActive
                ]}
              >
                {config.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary Card - Cleaned.html style */}
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Total Sent</Text>
            <Text style={styles.kvValue}>KSh {totalSent.toLocaleString()}</Text>
          </View>
          <View style={styles.kvDivider} />
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Entries Logged</Text>
            <Text style={styles.kvValue}>{entriesLogged}</Text>
          </View>
        </View>

        {/* Remittances List Card - Cleaned.html style */}
        <View style={styles.card}>
          {paginatedItems.length > 0 ? (
            paginatedItems.map((item, index) => (
              <View key={item.id || index}>
                <View style={styles.tripRow}>
                  <View style={styles.tripRowLeft}>
                    <Text style={styles.tripRowMain}>
                      {item.recipient}
                      {item.relationship ? ` (${item.relationship})` : ''} · {item.channel}
                    </Text>
                    <Text style={styles.tripRowTime}>
                      {new Date(item.ts).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.tripRowRight}>
                    <Text style={styles.tripRowAmount}>
                      KSh {item.amount?.toLocaleString()}
                    </Text>
                  </View>
                </View>
                {index < paginatedItems.length - 1 && <View style={styles.rowDivider} />}
              </View>
            ))
          ) : (
            <Text style={styles.emptyHint}>
              No money sent home for {PERIODS[period].label.toLowerCase()}.
            </Text>
          )}
        </View>

        {/* Pagination - Cleaned.html style */}
        {totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[
                styles.paginationBtn,
                currentPage === 1 && styles.paginationBtnDisabled
              ]}
              onPress={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <Text style={styles.paginationBtnText}>← Prev</Text>
            </TouchableOpacity>
            <Text style={styles.paginationInfo}>
              Page {currentPage} / {totalPages}
            </Text>
            <TouchableOpacity
              style={[
                styles.paginationBtn,
                currentPage === totalPages && styles.paginationBtnDisabled
              ]}
              onPress={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              <Text style={styles.paginationBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Add Button */}
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => navigation.navigate('SendMoneyHome')}
        >
          <Text style={styles.buttonText}>＋ Send Money Home →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

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
  periodTabs: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    alignItems: 'center',
  },
  periodTabActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a',
  },
  periodTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b606c',
    textAlign: 'center',
  },
  periodTabTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  kvKey: {
    fontSize: 12.5,
    color: '#5b606c',
    fontWeight: '500',
  },
  kvValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  kvDivider: {
    height: 1,
    backgroundColor: '#e7e4db',
    marginVertical: 8,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  tripRowLeft: {
    flex: 1,
  },
  tripRowMain: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 4,
  },
  tripRowTime: {
    fontSize: 11,
    color: '#8b92a3',
  },
  tripRowRight: {
    marginLeft: 12,
  },
  tripRowAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e9e6f',
    textAlign: 'right',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#f0ebe5',
  },
  emptyHint: {
    fontSize: 13,
    color: '#8b92a3',
    paddingVertical: 12,
    textAlign: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  paginationBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ff7a1a',
    minWidth: 60,
    alignItems: 'center',
  },
  paginationBtnDisabled: {
    opacity: 0.3,
  },
  paginationBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  paginationInfo: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 40,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#ff7a1a',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
  },
});