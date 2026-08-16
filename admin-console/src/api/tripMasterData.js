// admin-console/src/api/tripMasterData.js
// Backs PaymentChannelMasterData.jsx and TripEntryRuleConfiguration.jsx (Module B/C).
import api from './client';

export async function listPaymentChannels() {
  const { data } = await api.get('/admin/trip-master-data/payment-channels');
  return data;
}

export async function updatePaymentChannel(id, patch) {
  const { data } = await api.patch(`/admin/trip-master-data/payment-channels/${id}`, patch);
  return data;
}

export async function listCorrectionReasons() {
  const { data } = await api.get('/admin/trip-master-data/correction-reasons');
  return data;
}

export async function createCorrectionReason(code, label) {
  const { data } = await api.post('/admin/trip-master-data/correction-reasons', { code, label });
  return data;
}

// BR-SB07-001/007: the two numbers that govern every correction-window/out-of-window decision.
export async function getRuleConfig() {
  const { data } = await api.get('/admin/trip-master-data/rule-config');
  return data;
}

export async function updateRuleConfig(key, value) {
  const { data } = await api.patch('/admin/trip-master-data/rule-config', { [key]: value });
  return data;
}
