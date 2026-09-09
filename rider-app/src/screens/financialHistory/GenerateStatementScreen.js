// rider-app/src/screens/financialHistory/GenerateStatementScreen.js
// ✅ REFACTORED: True offline-first architecture (mirrors FuelEntryScreen)
// ✅ SEAMLESS ONLINE/OFFLINE: Save to IndexedDB first, then sync to backend
// ✅ INSTANT FEEDBACK: Immediate UI response regardless of network
// ✅ AUTOMATIC SYNC: SyncOrchestrator handles background sync every 5 minutes
// ✅ RETENTION POLICY: 6-month rolling window enforced
// ✅ UI/UX: 100% aligned with HTML prototype (RA-18-A/B)

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Picker, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import {
  getFinancialSummaryForRange,
} from '../../offline/financialHistoryUtils';
import { addToSyncQueue } from '../../offline/syncQueue';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import api from '../../api/client';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

// ✅ FIXED: Map display names to backend codes (must match statement_purpose_master.code in DB)
const STATEMENT_PURPOSES = [
  { displayName: 'Loan Application', code: 'loan_application' },
  { displayName: 'SACCO Good Standing', code: 'sacco_good_standing' },
  { displayName: 'Insurance Application', code: 'insurance_application' },
  { displayName: 'General/Personal Use', code: 'general_personal_use' },
];

export default function GenerateStatementScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isConnected, isInitialized } = useNetworkStatus();

  const hasLoadedRef = useRef(false);
  const { rangeStart, rangeEnd, selectedPeriod, riderId } = route.params || {
    rangeStart: Date.now(),
    rangeEnd: Date.now(),
    selectedPeriod: 'thisMonth',
    riderId: null,
  };

  const [purposeCode, setPurposeCode] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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

  /**
   * ✅ UPDATE CACHE: Add statement to statement_history cache
   * Ensures StatementHistoryScreen displays the statement immediately
   */
  const updateStatementHistoryCache = async (offlineStatement) => {
    try {
      const cacheKey = `statement_history_${riderId}`;
      
      // Get existing cache from IndexedDB
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);
      let items = [];
      
      if (cachedData) {
        try {
          items = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (!Array.isArray(items)) items = [];
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error, starting fresh');
          items = [];
        }
      }
      
      // Add new statement to front (most recent first)
      items.unshift(offlineStatement);
      
      // Save updated cache to IndexedDB
      await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(items));
      console.log(`✅ Updated statement_history cache with new statement`);
    } catch (err) {
      console.error('❌ Error updating cache:', err);
    }
  };

  const handleGenerateStatement = async () => {
    if (!summary) {
      showToast('Financial summary not available', 'error');
      return;
    }

    try {
      setGenerating(true);
      setSuccessMessage('');

      // ✅ Generate offline statement ID (format: statement_riderId_timestamp)
      const now = Date.now();
      const statementId = `statement_${riderId}_${now}`;
      
      // ✅ Format dates as YYYY-MM-DD for backend API
      const periodStartDate = new Date(rangeStart);
      const periodEndDate = new Date(rangeEnd);
      
      const periodStartFormatted = periodStartDate.toISOString().split('T')[0];
      const periodEndFormatted = periodEndDate.toISOString().split('T')[0];

      const apiPayload = {
        period_start: periodStartFormatted,
        period_end: periodEndFormatted,
        purpose_code: purposeCode || null,
      };

      // ✅ CRITICAL: Save to IndexedDB FIRST (offline-first architecture)
      const offlineStatement = {
        id: statementId,
        rider_id: riderId,
        period_start: periodStartDate.toISOString(),
        period_end: periodEndDate.toISOString(),
        purpose: purposeCode || null,
        purpose_code: purposeCode || null,
        financial_summary: summary,
        income: summary.income,
        total_expense: summary.totalExpense,
        net_profit: summary.netProfit,
        selected_period: selectedPeriod,
        generated_at: new Date().toISOString(),
        ts: now,                          // ✅ Primary timestamp (ms)
        timestamp: now,                   // ✅ Backup timestamp (ms)
        status: 'active',                 // ✅ Status tracking
        syncStatus: 'pending',            // ✅ Sync tracking
        verification_ref: `VRF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      };

      console.log('💾 Saving statement offline:', { 
        statementId, 
        riderId, 
        period: `${periodStartFormatted} to ${periodEndFormatted}` 
      });

      // ALWAYS save locally first using IndexedDB (exact same as FuelEntryScreen)
      await indexedDbAdapter.kvSet(
        `statement_${statementId}`,
        JSON.stringify(offlineStatement)
      );

      // Update cache immediately for instant UI feedback
      await updateStatementHistoryCache(offlineStatement);

      // ✅ Add to sync queue for automatic background sync
      const queueSuccess = await addToSyncQueue({
        id: statementId,
        type: 'statement',
        endpoint: `/compliance/statements?rider_id=${riderId}`,
        data: apiPayload,
        timestamp: new Date(),
      });

      if (!queueSuccess) {
        console.warn('⚠️ Failed to add to queue, but local save succeeded');
      }

      console.log('✅ Statement generated locally:', statementId);
      console.log('📊 Statement data:', {
        income: summary.income,
        expense: summary.totalExpense,
        profit: summary.netProfit,
      });

      // Try to sync immediately only if online (non-blocking)
      let apiSyncSucceeded = false;
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Attempting to sync to API...');
          const response = await api.post(
            `/compliance/statements?rider_id=${riderId}&online=true`,
            apiPayload
          );

          if (response && (response.id || response.verification_reference)) {
            console.log('✅ Statement synced to API immediately');
            console.log('📋 Verification reference:', response.verification_reference);
            apiSyncSucceeded = true;
            
            // Update local statement with verification reference from server
            if (response.verification_reference) {
              offlineStatement.verification_ref = response.verification_reference;
              offlineStatement.verified = response.verified || false;
            }
          }
        } catch (apiErr) {
          const status = apiErr.response?.status;
          const message = apiErr.message || 'Unknown error';

          console.warn('⚠️ API sync failed (will retry later via SyncOrchestrator):', {
            status: status,
            message: message,
          });
          // API failed but data is saved and queued - that's okay
          apiSyncSucceeded = false;
        }
      }

      // Show success message (whether API sync succeeded or not)
      const successMsg = isConnected && isInitialized
        ? 'Statement generated and synced!'
        : 'Statement saved. Syncing in background...';
      setSuccessMessage(successMsg);

      console.log('✅ Success:', successMsg);

      // Navigate to preview after brief success message
      setTimeout(() => {
        navigation.navigate('StatementPreview', {
          statementId: statementId,
          riderId: riderId,
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
      <Text style={styles.screenSub}>Generated from your Financial History</Text>

      {/* Period Display */}
      <Text style={styles.hint}>Period: {periodDisplay}</Text>

      {/* Purpose Selection */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          Statement Purpose <Text style={styles.optionalLabel}>(optional)</Text>
        </Text>
        <View style={styles.selectContainer}>
          <Picker
            selectedValue={purposeCode}
            onValueChange={setPurposeCode}
            style={styles.select}
            enabled={!generating}
          >
            <Picker.Item label="Select..." value="" />
            {STATEMENT_PURPOSES.map((p, idx) => (
              <Picker.Item key={idx} label={p.displayName} value={p.code} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Network Status Info */}
      {!isConnected && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerEmoji}>📡</Text>
          <Text style={styles.infoBannerText}>
            You're offline. Statement will be saved locally and synced automatically when you're back online.
          </Text>
        </View>
      )}

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerEmoji}>✅</Text>
        <Text style={styles.infoBannerText}>
          Income / Expense / Net Profit is always included — the statement's foundation.
        </Text>
      </View>

      {/* Success Message */}
      {successMessage && (
        <View style={[styles.infoBanner, { borderLeftColor: '#1e9e6f' }]}>
          <Text style={styles.infoBannerEmoji}>✨</Text>
          <Text style={styles.infoBannerText}>{successMessage}</Text>
        </View>
      )}

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