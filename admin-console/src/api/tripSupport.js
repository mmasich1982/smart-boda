// admin-console/src/api/tripSupport.js
// Backs OutOfWindowCorrectionQueue.jsx (Module B). SLA-bound trip-correction requests
// that fall outside the normal self-service correction window (see rule-config above).
import api from './client';

export async function listOowRequests() {
  const { data } = await api.get('/admin/trip-support/out-of-window-requests?status=pending');
  return data;
}

export async function resolveOowRequest(id, note) {
  const { data } = await api.patch(`/admin/trip-support/out-of-window-requests/${id}/resolve`, {
    resolution_note: note,
  });
  return data;
}
