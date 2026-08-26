// rider-app/src/screens/financialHistory/StatementHistoryScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors trip screens)
// ✅ SEAMLESS ONLINE/OFFLINE: Loads statement history from IndexedDB cache
// ✅ UNIFIED ARCHITECTURE: Removed repository dependencies
// ✅ INSTANT UPDATES: useFocusEffect ensures current data on screen focus
// ✅ RETENTION POLICY: 6-month rolling window enforced
// ✅ UI/UX: 100% preserved from original

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import { getLocalRiderId } from '../../offline/db';
import { getStatementHistory } from '../../offline/financialHistoryUtils';

export default function StatementHistoryScreen({ navigation }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const hasLoadedRef = useRef(false);
  const [riderId, setRiderId] = useState(null);
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Load rider ID on mount
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
          console.log('✅ StatementHistory: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
        showToast('Error loading rider information', 'error');
      }
    };
    loadRiderId();
  }, [showToast]);

  const loadStatements = useCallback(async () => {
    if (!riderId) return;

    try {
      setLoading(true);
      console.log(`📄 Loading statement history for rider ${riderId}`);

      const history = await getStatementHistory(riderId);
      setStatements(history);

      console.log(`✅ Loaded ${history.length} statements`);
    } catch (err) {
      console.error('❌ Error loading statements:', err);
      showToast('Error loading statements', 'error');
    } finally {
      setLoading(false);
    }
  }, [riderId, showToast]);

  // ✅ Load data on mount (single execution)
  useEffect(() => {
    if (riderId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadStatements();
    }
  }, [riderId, loadStatements]);

  // ✅ Refresh on screen focus - ensures current data
  useFocusEffect(
    useCallback(() => {
      if (riderId && hasLoadedRef.current) {
        loadStatements();
      }
    }, [riderId, loadStatements])
  );

  const renderStatement = ({ item }) => {
    const generatedDate = new Date(item.generated_at).toLocaleDateString();
    const purposeLabel =
      item.purpose === 'bank_loan'
        ? 'Bank Loan'
        : item.purpose === 'sme_loan'
        ? 'SME Loan'
        : item.purpose === 'supplier_credit'
        ? 'Supplier Credit'
        : item.purpose === 'tax'
        ? 'Tax'
        : item.purpose === 'personal_record'
        ? 'Personal Record'
        : 'Other';

    return (
      <TouchableOpacity
        style={styles.statementRow}
        onPress={() =>
          navigation.navigate('StatementPreview', {
            statementId: item.id,
            riderId,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.statementLeft}>
          <Text style={styles.statementPeriod}>{item.selected_period}</Text>
          <Text style={styles.statementMeta}>
            {purposeLabel} · {generatedDate}
          </Text>
        </View>
        <View style={styles.statementRight}>
          <Text style={styles.statementAmount}>
            KSh {(item.financial_summary?.netProfit || 0).toLocaleString()}
          </Text>
          <Text style={styles.statementArrow}>→</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!riderId || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink label="← Back" onPress={() => navigation.goBack()} />
        <Text style={styles.screenTitle}>Statement History</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Text style={styles.screenTitle}>Statement History</Text>

      <View style={styles.card}>
        {statements.length > 0 ? (
          <FlatList
            data={statements}
            renderItem={renderStatement}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        ) : (
          <Text style={styles.emptyText}>No statements generated yet</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.generateButton}
        onPress={() => navigation.navigate('FinancialHistory')}
        activeOpacity={0.7}
      >
        <Text style={styles.generateButtonText}>Generate New Statement →</Text>
      </TouchableOpacity>
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
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  statementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  statementLeft: {
    flex: 1,
  },
  statementPeriod: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  statementMeta: {
    fontSize: 11,
    color: '#5b606c',
  },
  statementRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statementAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  statementArrow: {
    fontSize: 14,
    color: '#ff7a1a',
    fontWeight: '700',
  },
  separator: {
    height: 1,
    backgroundColor: '#e7e4db',
  },
  emptyText: {
    fontSize: 12,
    color: '#5b606c',
    paddingVertical: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  generateButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});