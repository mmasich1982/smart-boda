import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import GhostButton from '../../components/GhostButton';
import { getStatementById, recordStatementDownload } from '../../offline/statementsRepository';
import { generateStatementPDF } from '../../utils/pdfGenerator';

/**
 * StatementPreviewScreen.js - INDEXEDDB MIGRATION v2.0
 * ✅ MIGRATION: Complete IndexedDB integration with 6-month retention
 * ✅ INITIALIZATION: Proper hasLoadedRef/isMounted checks to prevent infinite loops
 * ✅ RIDGERID: Proper rider ID passing from route params to repository functions
 * ✅ UI/UX: 100% preserved - NO visual changes
 * ✅ REMOVED: All LocalStore references completely removed
 */

export default function StatementPreviewScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // ✅ Initialization control refs - prevent infinite loops
  const hasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);

  const { statementId, riderId } = route.params || {};

  // State management
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // ✅ Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      console.log('[StatementPreviewScreen] Component unmounted');
    };
  }, []);

  const loadStatement = async () => {
    // ✅ Prevent multiple concurrent loads
    if (!isMountedRef.current || hasLoadedRef.current || !statementId || !riderId) {
      if (!statementId || !riderId) {
        console.error('[StatementPreviewScreen] Missing statementId or riderId');
        showToast('Required parameters not available', 'error');
      }
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log(`[StatementPreviewScreen] Loading statement ${statementId} for rider ${riderId}`);

      // ✅ Pass riderId to repository function (IndexedDB with retention validation)
      const stmt = await getStatementById(statementId, riderId);

      if (isMountedRef.current) {
        if (stmt) {
          console.log('[StatementPreviewScreen] Statement loaded successfully');
          setStatement(stmt);
          hasLoadedRef.current = true;

          // Show warning if outside retention window
          if (!stmt.isWithinRetention) {
            showToast('This statement is archived. Contact Smart Boda Admin for details.', 'info');
          }
        } else {
          console.error('[StatementPreviewScreen] Statement not found');
          showToast('Statement not found', 'error');
          navigation.goBack();
        }
      }
    } catch (err) {
      console.error('[StatementPreviewScreen] Load statement error:', err);
      if (isMountedRef.current) {
        showToast('Error loading statement', 'error');
        navigation.goBack();
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // ✅ Load data only once on mount
  useEffect(() => {
    if (!hasLoadedRef.current && statementId && riderId) {
      loadStatement();
    }
  }, [statementId, riderId]);

  const handleDownloadPDF = async () => {
    try {
      setDownloading(true);

      if (!statement) {
        showToast('Statement not available for download', 'error');
        return;
      }

      if (!isMountedRef.current) {
        return;
      }

      console.log(`[StatementPreviewScreen] Downloading PDF for statement ${statement.id}`);

      // Generate PDF
      await generateStatementPDF(statement);

      if (isMountedRef.current) {
        showToast('Statement downloaded as PDF', 'success');

        // ✅ Record download in IndexedDB
        try {
          await recordStatementDownload(statement.id, riderId, 'download');
        } catch (recordErr) {
          console.warn('[StatementPreviewScreen] Failed to record download:', recordErr);
          // Continue anyway - PDF was generated
        }

        // Navigate to history after a delay
        setTimeout(() => {
          if (isMountedRef.current) {
            navigation.navigate('StatementHistory');
          }
        }, 1000);
      }
    } catch (err) {
      console.error('[StatementPreviewScreen] Download PDF error:', err);
      if (isMountedRef.current) {
        showToast('Error downloading statement', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setDownloading(false);
      }
    }
  };

  const handleRequestDetailed = () => {
    if (!statement) {
      showToast('Statement not available', 'error');
      return;
    }

    navigation.navigate('ConfirmPinDetailedStatement', {
      statementId: statement.id,
      riderId,
    });
  };

  if (loading || !statement) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading statement...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />

      <Text style={styles.screenTitle}>Statement Preview</Text>

      {/* Statement Preview Card */}
      <View style={styles.statementPreviewCard}>
        <Text style={styles.statementCardTitle}>Smart Boda Digital — Earnings Statement</Text>

        <Text style={styles.statementHint}>
          Period: {new Date(statement.startMs).toLocaleDateString()} –{' '}
          {new Date(statement.endMs).toLocaleDateString()}
        </Text>

        <Text style={styles.statementHint}>
          Generated: {new Date(statement.generatedAt).toLocaleString()}
          {statement.purpose ? ` · Purpose: ${statement.purpose}` : ''}
        </Text>

        <View style={styles.statementDivider} />

        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Total Income</Text>
          <Text style={styles.kvValue}>KSh {statement.summary.income.toLocaleString()}</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Total Expense</Text>
          <Text style={styles.kvValue}>KSh {statement.summary.totalExpense.toLocaleString()}</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Net Profit</Text>
          <Text style={[styles.kvValue, styles.kvValueBold]}>
            KSh {statement.summary.netProfit.toLocaleString()}
          </Text>
        </View>

        <View style={styles.statementDivider} />

        <Text style={styles.statementHint}>
          Verification Code:{' '}
          {statement.verificationRef || 'Pending — will register once online'}
        </Text>
      </View>

      {/* Action Buttons */}
      <PrimaryButton
        label="⬇️ Download →"
        onPress={handleDownloadPDF}
        disabled={downloading}
      />

      <GhostButton
        label="📑 Require Detailed Statement →"
        onPress={handleRequestDetailed}
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
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 20,
  },
  statementPreviewCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  statementCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  statementHint: {
    fontSize: 11,
    color: '#5b606c',
    marginBottom: 4,
  },
  statementDivider: {
    height: 1,
    backgroundColor: '#e7e4db',
    marginVertical: 10,
  },
  kvRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  kvKey: {
    fontSize: 12.5,
    color: '#5b606c',
  },
  kvValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  kvValueBold: {
    fontSize: 14,
  },
});