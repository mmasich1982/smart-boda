import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import GhostButton from '../../components/GhostButton';
import { getStatementById } from '../../offline/statementsRepository';
import { generateStatementPDF } from '../../utils/pdfGenerator';


export default function StatementPreviewScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const { statementId } = route.params || {};

  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadStatement();
  }, [statementId]);

  const loadStatement = async () => {
    try {
      setLoading(true);
      const stmt = await getStatementById(statementId);
      if (stmt) {
        setStatement(stmt);
      } else {
        showToast('Statement not found', 'error');
        navigation.goBack();
      }
    } catch (err) {
      console.error('Load statement error:', err);
      showToast('Error loading statement', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setDownloading(true);

      if (!statement) return;

      await generateStatementPDF(statement);

      showToast('Statement downloaded as PDF', 'success');

      // Mark as downloaded
      statement.shared = statement.shared || [];
      statement.shared.push({
        method: 'download',
        timestamp: Date.now(),
      });

      // Navigate to history
      setTimeout(() => {
        navigation.navigate('StatementHistory');
      }, 1000);
    } catch (err) {
      console.error('Download PDF error:', err);
      showToast('Error downloading statement', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleRequestDetailed = () => {
    navigation.navigate('ConfirmPinDetailedStatement', {
      statementId: statement?.id,
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