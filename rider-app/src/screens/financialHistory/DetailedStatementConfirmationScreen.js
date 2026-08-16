import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import InlineInfo from '../../components/InlineInfo';
import { createDetailedStatementRequest } from '../../offline/statementsRepository';
import { DETAILED_STATEMENT_SLA_HOURS } from '../../constants/financialHistoryConstants';


export default function DetailedStatementConfirmationScreen({ navigation, route }) {
  const { t } = useTranslation();

  const { statementId, email } = route.params || {};

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    submitRequest();
  }, [statementId, email]);

  const submitRequest = async () => {
    try {
      setLoading(true);

      // Create detailed statement request
      const detailedRequest = await createDetailedStatementRequest({
        statementId,
        email,
      });

      setRequest(detailedRequest);
    } catch (err) {
      console.error('Submit request error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    navigation.navigate('StatementHistory');
  };

  if (loading || !request) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Submitting request...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.screenTitle}>✅ Request Submitted</Text>
      <Text style={styles.screenSub}>RA-18-C · submitted to the Smart Boda Admin team</Text>

      {/* Request Details Card */}
      <View style={styles.card}>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Email Address</Text>
          <Text style={[styles.kvValue, styles.kvValueBold]}>{request.email}</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Reference ID</Text>
          <Text style={styles.kvValue}>{request.id}</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>Status</Text>
          <Text style={[styles.kvValue, styles.statusPending]}>Pending</Text>
        </View>
      </View>

      {/* Info Banner */}
      <InlineInfo
        icon="📨"
        title={`Your request has been submitted to the Smart Boda Admin team.`}
        message={`Your detailed statement will be sent to the email address above within ${request.slaHours} hours.`}
        type="info"
      />

      {/* Done Button */}
      <PrimaryButton label="Done →" onPress={handleDone} style={styles.doneButton} />

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
    color: '#8b5cf6',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  kvRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  kvRow_last: {
    borderBottomWidth: 0,
  },
  kvKey: {
    fontSize: 12.5,
    color: '#5b606c',
  },
  kvValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1a1c20',
  },
  kvValueBold: {
    fontWeight: '700',
  },
  statusPending: {
    color: '#c98a12',
    backgroundColor: '#fdf3df',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '700',
  },
  doneButton: {
    marginTop: 14,
  },
});