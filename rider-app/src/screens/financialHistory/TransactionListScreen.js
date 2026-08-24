import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PaginationControls from '../../components/PaginationControls';
import { getTransactionList } from '../../offline/financialHistoryRepository';

/**
 * TransactionListScreen.js - INDEXEDDB MIGRATION v2.0
 * ✅ MIGRATION: Complete IndexedDB integration with 6-month retention
 * ✅ INITIALIZATION: Proper hasLoadedRef/isMounted checks to prevent infinite loops
 * ✅ RIDGERID: Proper rider ID passing from route params
 * ✅ UI/UX: 100% preserved - NO visual changes
 * ✅ REMOVED: All LocalStore references completely removed
 */

const TRANSACTION_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'Trip', label: 'Trips' },
  { key: 'Fuel', label: 'Fuel' },
  { key: 'Service', label: 'Service' },
  { key: 'Other', label: 'Other Expense' },
];

const PERIOD_PHRASES = {
  thisMonth: 'for This Month',
  lastMonth: 'for Last Month',
  last3: 'for the Last 3 Months',
  last6: 'for the Last 6 Months',
  sinceJoining: 'Since Joining',
};

const ITEMS_PER_PAGE = 15;

export default function TransactionListScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // ✅ Initialization control refs - prevent infinite loops
  const hasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);

  const { rangeStart, rangeEnd, selectedPeriod, riderId } = route.params || {
    rangeStart: Date.now(),
    rangeEnd: Date.now(),
    selectedPeriod: 'thisMonth',
    riderId: null,
  };

  // State management
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // ✅ Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      console.log('[TransactionListScreen] Component unmounted');
    };
  }, []);

  const loadTransactions = useCallback(async () => {
    // ✅ Prevent multiple concurrent loads
    if (!isMountedRef.current || hasLoadedRef.current || !riderId) {
      if (!riderId) {
        console.error('[TransactionListScreen] No rider ID provided');
        showToast('Rider ID not available', 'error');
      }
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log(`[TransactionListScreen] Loading transactions for rider ${riderId}, range: ${rangeStart} - ${rangeEnd}`);

      // ✅ Pass riderId to repository function (IndexedDB with retention validation)
      const txList = await getTransactionList(riderId, rangeStart, rangeEnd);
      
      if (isMountedRef.current) {
        console.log(`[TransactionListScreen] Loaded ${txList.length} transactions`);
        setTransactions(txList);
        applyFilter(txList, 'all');
        hasLoadedRef.current = true;
      }
    } catch (err) {
      console.error('[TransactionListScreen] Load transactions error:', err);
      if (isMountedRef.current) {
        showToast('Error loading transactions', 'error');
        setLoading(false);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [rangeStart, rangeEnd, riderId, showToast]);

  // ✅ Load data only once on mount
  useEffect(() => {
    if (!hasLoadedRef.current && riderId) {
      loadTransactions();
    }
  }, [riderId]); // Only depend on riderId for initial load

  // ✅ Apply filter logic
  const applyFilter = (txList, filter) => {
    setTypeFilter(filter);
    let filtered = txList;

    if (filter !== 'all') {
      filtered = txList.filter((tx) => {
        const normalizedType = tx.type;
        const normalizedFilter = filter;
        return normalizedType === normalizedFilter;
      });
    }

    setFilteredTransactions(filtered);
    setCurrentPage(1);
  };

  const handleTypeFilterChange = (filter) => {
    applyFilter(transactions, filter);
  };

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTransactions = filteredTransactions.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const periodPhrase = PERIOD_PHRASES[selectedPeriod] || 'for the Selected Period';

  const renderTransaction = ({ item: tx }) => {
    let typeLabel = 'Unknown';
    
    if (tx.type === 'Trip') {
      typeLabel = 'Trip';
    } else if (tx.type === 'Fuel') {
      typeLabel = 'Fuel/Energy';
    } else if (tx.type === 'Service') {
      typeLabel = 'Service';
    } else if (tx.type === 'Other' || tx.type === 'other') {
      typeLabel = `Other Expense`;
      if (tx.category && tx.category !== 'Other' && tx.category !== 'Miscellaneous') {
        typeLabel = `${tx.category}`;
      }
    }

    const isVoided = tx.status === 'voided';
    const isCorrected = tx.correctionReason !== undefined && tx.correctionReason !== null;

    return (
      <View style={[styles.transactionRow, isVoided && styles.transactionRowVoided]}>
        <View style={styles.transactionLeft}>
          <Text style={styles.transactionType}>
            {typeLabel}
            {isCorrected ? ' · Corrected' : ''}
          </Text>
          <Text style={styles.transactionTime}>{new Date(tx.timestamp).toLocaleString()}</Text>
        </View>
        <View style={styles.transactionRight}>
          <Text style={styles.transactionAmount}>KSh {tx.amount.toLocaleString()}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading transactions...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />

      <Text style={styles.screenTitle}>My Transactions {periodPhrase}</Text>
      <Text style={styles.screenSub}>
        {new Date(rangeStart).toLocaleDateString()} — {new Date(rangeEnd).toLocaleDateString()}
      </Text>

      {/* Type Filter Chips */}
      <View style={styles.typeFilterRow}>
        {TRANSACTION_TYPES.map((txType) => (
          <TouchableOpacity
            key={txType.key}
            style={[
              styles.typeChip,
              typeFilter === txType.key && styles.typeChipActive,
            ]}
            onPress={() => handleTypeFilterChange(txType.key)}
          >
            <Text
              style={[
                styles.typeChipText,
                typeFilter === txType.key && styles.typeChipTextActive,
              ]}
            >
              {txType.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Transactions List */}
      <View style={styles.card}>
        {paginatedTransactions.length > 0 ? (
          <FlatList
            data={paginatedTransactions}
            renderItem={renderTransaction}
            keyExtractor={(item, idx) => idx.toString()}
            scrollEnabled={false}
          />
        ) : (
          <Text style={styles.noDataHint}>No transactions match this filter.</Text>
        )}
      </View>

      {/* Pagination */}
      {totalPages > 1 && (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 20,
  },
  typeFilterRow: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeChip: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  typeChipActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a',
  },
  typeChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#5b606c',
  },
  typeChipTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  transactionRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  transactionRowVoided: {
    opacity: 0.5,
  },
  transactionLeft: {
    flex: 1,
  },
  transactionType: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 3,
  },
  transactionTime: {
    fontSize: 11,
    color: '#5b606c',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  noDataHint: {
    fontSize: 12,
    color: '#5b606c',
    textAlign: 'center',
    paddingVertical: 16,
  },
});