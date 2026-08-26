// rider-app/src/screens/financialHistory/GenerateStatementScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors trip screens)
// ✅ SEAMLESS ONLINE/OFFLINE: Uses financialHistoryUtils for data aggregation
// ✅ UNIFIED ARCHITECTURE: Removed statementsRepository dependencies
// ✅ INSTANT UPDATES: Statements generated from cached financial data
// ✅ RETENTION POLICY: 6-month rolling window enforced
// ✅ UI/UX: 100% preserved from original

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Picker, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import {
  getFinancialSummaryForRange,
  saveStatement,
} from '../../offline/financialHistoryUtils';
import { addToSyncQueue } from '../../offline/syncQueue';
import api from '../../api/client';

const STATEMENT_PURPOSES = [
  { code: 'bank_loan', label: 'Bank Loan Application' },
  { code: 'sme_loan', label: 'SME Loan' },
  { code: 'supplier_credit', label: 'Supplier Credit' },
  { code: 'personal_record', label: 'Personal Record' },
  { code: 'tax', label: 'Tax Documentation' },
  { code: 'other', label: 'Other' },
];

export default function GenerateStatementScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const hasLoadedRef = useRef(false);
  const { rangeStart, rangeEnd, selectedPeriod, riderId } = route.params || {
    rangeStart: Date.now(),
    rangeEnd: Date.now(),
    selectedPeriod: 'thisMonth',
    riderId: null,
  };

  const [purpose, setPurpose] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // ✅ Load financial summary on mount
  useEffect(() => {
    if (!hasLoadedRef.current && riderId) {
      loadSummary();
    }
  }, [riderId]);

  const loadSummary = async () => {
    if (!riderId) {
      console.error('❌ No rider ID provided');
      showToast('Rider ID not available', 'error');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log(`📊 Loading summary for rider ${riderId}, range: ${rangeStart} - ${rangeEnd}`);

      // ✅ Load financial summary from IndexedDB
      const financialSummary = await getFinancialSummaryForRange(riderId, rangeStart, rangeEnd);

      console.log('✅ Summary loaded:', {
        income: financialSummary.income,
        expense: financialSummary.totalExpense,
        profit: financialSummary.netProfit,
        isWithinRetention: financialSummary.isWithinRetention,
      });

      setSummary(financialSummary);
      hasLoadedRef.current = true;

      if (!financialSummary.isWithinRetention) {
        showToast('Data beyond 6-month window. Contact Smart Boda Admin for historical data.', 'info');
      }
    } catch (err) {
      console.error('❌ Load summary error:', err);
      showToast('Error loading financial summary', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStatement = async () => {
    if (!purpose) {
      showToast('Please select a statement purpose', 'error');
      return;
    }

    if (!summary) {
      showToast('Financial summary not available', 'error');
      return;
    }

    try {
      setGenerating(true);

      // ✅ Create statement record
      const statementData = {
        purpose,
        period_start: new Date(rangeStart).toISOString(),
        period_end: new Date(rangeEnd).toISOString(),
        selected_period: selectedPeriod,
        financial_summary: summary,
        riderId,
      };

      // ✅ Save to IndexedDB
      const savedStatement = await saveStatement(riderId, statementData);

      if (!savedStatement) {
        showToast('Error saving statement', 'error');
        return;
      }

      console.log('✅ Statement generated:', savedStatement.id);

      // ✅ Queue for sync
      await addToSyncQueue({
        id: savedStatement.id,
        type: 'statement',
        endpoint: `/financial/statements?rider_id=${riderId}`,
        data: statementData,
        timestamp: new Date(),
      });

      // Try immediate sync if online
      try {
        await api.post(`/financial/statements?rider_id=${riderId}`, statementData);
        console.log('✅ Statement synced to API');
      } catch (apiErr) {
        console.warn('⚠️ API sync failed (will retry):', apiErr.message);
      }

      showToast('Statement generated successfully', 'success');

      // Navigate to preview
      setTimeout(() => {
        navigation.navigate('StatementPreview', {
          statementId: savedStatement.id,
          riderId,
        });
      }, 800);
    } catch (err) {
      console.error('❌ Error generating statement:', err);
      showToast('Error generating statement', 'error');
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !summary) {
    return (
      <ScrollView style={styles.container}>
        <BackLink label="← Back" onPress={() => navigation.goBack()} />
        <Text style={styles.screenTitle}>Generate Statement</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Text style={styles.screenTitle}>Generate Statement</Text>

      {/* Summary Preview */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Financial Summary</Text>
        <View style={styles.summaryItem}>
          <Text style={styles.label}>Period</Text>
          <Text style={styles.value}>{selectedPeriod}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.label}>Income</Text>
          <Text style={[styles.value, styles.positive]}>+KSh {(summary.income || 0).toLocaleString()}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.label}>Expenses</Text>
          <Text style={[styles.value, styles.negative]}>-KSh {(summary.totalExpense || 0).toLocaleString()}</Text>
        </View>
        <View style={[styles.summaryItem, styles.netProfitItem]}>
          <Text style={styles.label}>Net Profit</Text>
          <Text
            style={[
              styles.value,
              styles.valueBold,
              (summary.netProfit || 0) < 0 ? styles.negative : styles.positive,
            ]}
          >
            KSh {(summary.netProfit || 0).toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Purpose Selection */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          Statement Purpose <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={purpose}
            onValueChange={setPurpose}
            style={styles.picker}
            enabled={!generating}
          >
            <Picker.Item label="Select purpose..." value="" />
            {STATEMENT_PURPOSES.map((p) => (
              <Picker.Item key={p.code} label={p.label} value={p.code} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Generate Button */}
      <PrimaryButton
        label="Generate Statement →"
        onPress={handleGenerateStatement}
        disabled={generating || !purpose}
        loading={generating}
        style={styles.generateButton}
      />
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
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  netProfitItem: {
    borderBottomWidth: 0,
    borderTopWidth: 1.5,
    borderTopColor: '#e7e4db',
    marginTop: 4,
    paddingTop: 12,
  },
  label: {
    fontSize: 12.5,
    color: '#5b606c',
    fontWeight: '600',
  },
  value: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
  },
  valueBold: {
    fontSize: 14,
    fontWeight: '700',
  },
  positive: {
    color: '#2e7d32',
  },
  negative: {
    color: '#c62828',
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 8,
  },
  required: {
    color: '#e5650a',
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
    color: '#1a1c20',
  },
  generateButton: {
    marginBottom: 10,
  },
});