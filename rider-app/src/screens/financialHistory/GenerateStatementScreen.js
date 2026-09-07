// rider-app/src/screens/financialHistory/GenerateStatementScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors trip screens)
// ✅ SEAMLESS ONLINE/OFFLINE: Uses financialHistoryUtils for data aggregation
// ✅ UNIFIED ARCHITECTURE: Removed statementsRepository dependencies
// ✅ INSTANT UPDATES: Statements generated from cached financial data
// ✅ RETENTION POLICY: 6-month rolling window enforced
// ✅ UI/UX: 100% aligned with HTML prototype (RA-18-A/B)

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Picker, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import InfoBanner from '../../components/InfoBanner';
import {
  getFinancialSummaryForRange,
  saveStatement,
} from '../../offline/financialHistoryUtils';
import { addToSyncQueue } from '../../offline/syncQueue';
import api from '../../api/client';

const STATEMENT_PURPOSES = [
  'Loan Application',
  'SACCO Good Standing',
  'Insurance Application',
  'General/Personal Use',
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
    if (!summary) {
      showToast('Financial summary not available', 'error');
      return;
    }

    try {
      setGenerating(true);

      // ✅ Create statement record
      const statementData = {
        purpose: purpose || null, // Optional field
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
        <Text style={styles.screenTitle}>Generate a Statement</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  const periodDisplay = `${new Date(rangeStart).toLocaleDateString()} — ${new Date(rangeEnd).toLocaleDateString()}`;

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Text style={styles.screenTitle}>Generate a Statement</Text>
      <Text style={styles.screenSub}>RA-18-A/B · from your own Financial History only</Text>

      {/* Period Display */}
      <Text style={styles.hint}>Period: {periodDisplay}</Text>

      {/* Purpose Selection */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          Statement Purpose <Text style={styles.optionalLabel}>(optional)</Text>
        </Text>
        <View style={styles.selectContainer}>
          <Picker
            selectedValue={purpose}
            onValueChange={setPurpose}
            style={styles.select}
            enabled={!generating}
          >
            <Picker.Item label="Select..." value="" />
            {STATEMENT_PURPOSES.map((p, idx) => (
              <Picker.Item key={idx} label={p} value={p} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerEmoji}>✅</Text>
        <Text style={styles.infoBannerText}>
          Income / Expense / Net Profit is always included — the statement's foundation.
        </Text>
      </View>

      {/* Generate Button */}
      <PrimaryButton
        label="Generate Statement →"
        onPress={handleGenerateStatement}
        disabled={generating}
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
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 12,
    fontFamily: 'JetBrains Mono',
  },
  hint: {
    fontSize: 13,
    color: '#5b606c',
    marginBottom: 16,
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
  optionalLabel: {
    fontWeight: '500',
    textTransform: 'none',
    color: '#5b606c',
  },
  selectContainer: {
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  select: {
    height: 50,
    color: '#1a1c20',
  },
  infoBanner: {
    backgroundColor: '#e6f5ef',
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoBannerEmoji: {
    fontSize: 16,
    marginTop: 2,
  },
  infoBannerText: {
    fontSize: 12.5,
    color: '#1a1c20',
    lineHeight: 20,
    flex: 1,
  },
});