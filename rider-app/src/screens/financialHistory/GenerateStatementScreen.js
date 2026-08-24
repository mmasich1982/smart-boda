import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Picker } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import InlineInfo from '../../components/InlineInfo';
import { getFinancialSummary } from '../../offline/financialHistoryRepository';
import { createStatement } from '../../offline/statementsRepository';
import { STATEMENT_PURPOSES } from '../../constants/financialHistoryConstants';

/**
 * GenerateStatementScreen.js - INDEXEDDB MIGRATION v2.0
 * ✅ MIGRATION: Complete IndexedDB integration with 6-month retention
 * ✅ INITIALIZATION: Proper hasLoadedRef/isMounted checks to prevent infinite loops
 * ✅ RIDGERID: Proper rider ID passing from route params to repository functions
 * ✅ UI/UX: 100% preserved - NO visual changes
 * ✅ REMOVED: All LocalStore references completely removed
 */

export default function GenerateStatementScreen({ navigation, route }) {
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
  const [purpose, setPurpose] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // ✅ Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      console.log('[GenerateStatementScreen] Component unmounted');
    };
  }, []);

  const loadSummary = async () => {
    // ✅ Prevent multiple concurrent loads
    if (!isMountedRef.current || hasLoadedRef.current || !riderId) {
      if (!riderId) {
        console.error('[GenerateStatementScreen] No rider ID provided');
        showToast('Rider ID not available', 'error');
      }
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log(`[GenerateStatementScreen] Loading summary for rider ${riderId}, range: ${rangeStart} - ${rangeEnd}`);

      // ✅ Pass riderId to repository function (IndexedDB with retention validation)
      const financialSummary = await getFinancialSummary(riderId, rangeStart, rangeEnd);
      
      if (isMountedRef.current) {
        console.log('[GenerateStatementScreen] Summary loaded:', {
          income: financialSummary.income,
          expense: financialSummary.totalExpense,
          profit: financialSummary.netProfit,
          isWithinRetention: financialSummary.isWithinRetention,
        });

        setSummary(financialSummary);
        hasLoadedRef.current = true;

        // Show warning if outside retention window
        if (!financialSummary.isWithinRetention) {
          showToast('Data beyond 6-month window. Contact Smart Boda Admin for historical data.', 'info');
        }
      }
    } catch (err) {
      console.error('[GenerateStatementScreen] Load summary error:', err);
      if (isMountedRef.current) {
        showToast('Error loading financial summary', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ✅ Load data only once on mount
  useEffect(() => {
    if (!hasLoadedRef.current && riderId) {
      loadSummary();
    }
  }, [riderId]); // Only depend on riderId for initial load

  const handleGenerateStatement = async () => {
    try {
      setGenerating(true);

      if (!riderId) {
        showToast('Rider ID not available', 'error');
        setGenerating(false);
        return;
      }

      console.log(`[GenerateStatementScreen] Generating statement for rider ${riderId}`);

      // ✅ Pass riderId to repository function
      const statement = await createStatement({
        rangeStart,
        rangeEnd,
        purpose,
        summary,
      }, riderId);

      console.log('[GenerateStatementScreen] Statement generated:', statement.id);
      showToast('Statement generated successfully', 'success');

      if (isMountedRef.current) {
        navigation.navigate('StatementPreview', {
          statementId: statement.id,
          riderId,
        });
      }
    } catch (err) {
      console.error('[GenerateStatementScreen] Generate statement error:', err);
      if (isMountedRef.current) {
        showToast('Error generating statement', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setGenerating(false);
      }
    }
  };

  if (loading || !summary) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />

      <Text style={styles.screenTitle}>Generate a Statement</Text>

      {/* Date Range Display */}
      <Text style={styles.dateRangeHint}>
        Period: {new Date(rangeStart).toLocaleDateString()} —{' '}
        {new Date(rangeEnd).toLocaleDateString()}
      </Text>

      {/* Purpose Selection */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          Statement Purpose{' '}
          <Text style={styles.fieldLabelOptional}>(optional)</Text>
        </Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={purpose}
            onValueChange={setPurpose}
            style={styles.picker}
          >
            <Picker.Item label="Select..." value="" />
            {STATEMENT_PURPOSES.map((p) => (
              <Picker.Item key={p} label={p} value={p} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Info Banner */}
      <InlineInfo
        icon="✅"
        title="Income / Expense / Net Profit is always included"
        message="The statement's foundation."
        type="info"
      />

      {/* Summary Preview */}
      <View style={styles.summaryPreview}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Income</Text>
          <Text style={styles.summaryValue}>KSh {summary.income.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Expense</Text>
          <Text style={styles.summaryValue}>KSh {summary.totalExpense.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Net Profit</Text>
          <Text style={styles.summaryValueBold}>KSh {summary.netProfit.toLocaleString()}</Text>
        </View>
      </View>

      {/* Generate Button */}
      <PrimaryButton
        label="Generate Statement →"
        onPress={handleGenerateStatement}
        disabled={generating}
        style={styles.generateButton}
      />

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
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 20,
  },
  dateRangeHint: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  fieldLabelOptional: {
    fontWeight: '500',
    textTransform: 'none',
    color: '#5b606c',
    fontSize: 11,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    height: 50,
  },
  summaryPreview: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  summaryRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 12.5,
    color: '#5b606c',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  summaryValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#e7e4db',
    marginVertical: 4,
  },
  generateButton: {
    marginBottom: 10,
  },
});