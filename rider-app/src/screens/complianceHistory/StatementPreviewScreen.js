// rider-app/src/screens/complianceHistory/StatementPreviewScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import FormField from '../../components/FormField';
import DigitBoxInput from '../../components/DigitBoxInput';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { generateAndSharePdf, isPdfLibReady } from '../../services/statementPdf';
import api from '../../api/client';

// ADDED (ADDITIONAL_CRITICAL_MVP0_FEATURES.docx #3): "Require Detailed Statement" -- a
// separate, PIN-gated request for a fuller statement to be prepared and emailed, distinct
// from the always-on in-app preview/download above (which needs no PIN or email at all).
const DETAIL_STEP_IDLE = 'idle', DETAIL_STEP_PIN = 'pin', DETAIL_STEP_EMAIL = 'email', DETAIL_STEP_DONE = 'done';

export default function StatementPreviewScreen({ route, riderId, navigation }) {
  const { statementId } = route.params;
  const [stmt, setStmt] = useState(null);
  const [detailStep, setDetailStep] = useState(DETAIL_STEP_IDLE);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(null);
  const [detailEmail, setDetailEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [deliveryHours, setDeliveryHours] = useState(48);
  const { showToast } = useToast();

  useEffect(() => {
    api.get(`/compliance/statements/${statementId}`).then(res => setStmt(res.data));
  }, [statementId]);

  async function handleDownload() {
    if (!isPdfLibReady()) {
      // EXC-SB20-003: never attempt a broken download
      showToast('The PDF tool is still loading — please try again in a moment.', 'warn');
      return;
    }
    await generateAndSharePdf(stmt);  // device save/share sheet
    const res = await api.post(`/compliance/statements/${statementId}/download`);
    setStmt((s) => ({ ...s, download_count: res.data.download_count }));  // BR-SB20-006
    showToast('Statement downloaded.', 'success');  // NTF-SB20-002
  }

  async function handleDetailPinConfirm() {
    const res = await api.post('/compliance/statements/request-detailed/verify-pin', null, { params: { rider_id: riderId, pin } });
    if (!res.data?.ok) { setPinError('Incorrect PIN. Please try again.'); return; }
    setPinError(null);
    setDetailStep(DETAIL_STEP_EMAIL);
  }

  async function handleDetailSubmit() {
    if (!detailEmail || !detailEmail.includes('@')) { setEmailError('Enter a valid email address.'); return; }
    setEmailError(null);
    const res = await api.post(`/compliance/statements/${statementId}/request-detailed`, null, {
      params: { contact_email: detailEmail, pin_verified: true },
    });
    setDeliveryHours(res.data.delivery_window_hours || 48);
    setDetailStep(DETAIL_STEP_DONE);
  }

  if (!stmt) return null;

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('FinancialHistory')} />
      <Text style={styles.title}>Statement Preview</Text>
      <View style={styles.sheet}>
        <Text style={styles.sheetHeading}>Smart Boda Digital — Earnings Statement</Text>
        <Text style={styles.sheetHint}>Period: {stmt.period_start} – {stmt.period_end}</Text>
        <Text style={styles.sheetHint}>Generated: {stmt.generated_at}{stmt.purpose_label ? ` · Purpose: ${stmt.purpose_label}` : ''}</Text>
        <View style={styles.divider} />
        <View style={styles.row}><Text style={styles.k}>Total Income</Text><Text style={styles.v}>KSh {stmt.income.toLocaleString()}</Text></View>
        <View style={styles.row}><Text style={styles.k}>Total Expense</Text><Text style={styles.v}>KSh {stmt.total_expense.toLocaleString()}</Text></View>
        <View style={styles.row}><Text style={styles.k}>Net Profit</Text><Text style={styles.vBold}>KSh {stmt.net_profit.toLocaleString()}</Text></View>
        <View style={styles.divider} />
        <Text style={styles.sheetHint}>Verification Code: {stmt.verification_ref || 'Pending — will register once online'}</Text>  {/* EXC-SB20-002 */}
      </View>
      <PrimaryButton label="⬇️ Download →" onPress={handleDownload} />  {/* BR-SB20-005: this is the only button on the whole journey that can trigger a share sheet */}

      <View style={styles.detailPanel}>
        <Text style={styles.detailTitle}>Require Detailed Statement</Text>
        <Text style={styles.detailSub}>Have a fuller statement prepared and emailed to you.</Text>

        {detailStep === DETAIL_STEP_IDLE && (
          <PrimaryButton label="Request Detailed Statement" onPress={() => setDetailStep(DETAIL_STEP_PIN)} />
        )}
        {detailStep === DETAIL_STEP_PIN && (
          <>
            <Text style={styles.detailSub}>Confirm your PIN to continue.</Text>
            <DigitBoxInput length={4} value={pin} onChange={setPin} masked />
            {pinError && <Text style={styles.error}>⚠️ {pinError}</Text>}
            <PrimaryButton label="Confirm PIN →" onPress={handleDetailPinConfirm} disabled={pin.length !== 4} />
          </>
        )}
        {detailStep === DETAIL_STEP_EMAIL && (
          <>
            <FormField label="Email Address" value={detailEmail} onChangeText={setDetailEmail}
              keyboardType="email-address" placeholder="you@example.com" error={emailError} />
            <PrimaryButton label="Submit Request →" onPress={handleDetailSubmit} />
          </>
        )}
        {detailStep === DETAIL_STEP_DONE && (
          <Text style={styles.detailDone}>
            ✅ Received. We'll send it to {detailEmail} within {deliveryHours} hours.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 14 },
  sheet: { backgroundColor: '#f6f4ef', borderRadius: 14, padding: 18, marginBottom: 18 },
  sheetHeading: { fontFamily: 'Lora', fontSize: 15, fontWeight: '700', color: '#1a1c20', marginBottom: 8 },
  sheetHint: { fontSize: 11.5, color: '#5b606c' },
  divider: { height: 1, backgroundColor: '#e7e4db', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  k: { fontSize: 12.5, color: '#5b606c' },
  v: { fontSize: 12.5, color: '#1a1c20', fontWeight: '700' },
  vBold: { fontSize: 15, color: '#1a1c20', fontWeight: '800' },
  detailPanel: { marginTop: 20, borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 14, padding: 16 },
  detailTitle: { fontSize: 14, fontWeight: '800', color: '#1a1c20', marginBottom: 4 },
  detailSub: { fontSize: 11.5, color: '#5b606c', marginBottom: 10 },
  detailDone: { fontSize: 12, color: '#16a34a', fontWeight: '700' },
  error: { fontSize: 11, color: '#e0453f', marginTop: 6, marginBottom: 6, fontWeight: '700' },
});
