// rider-app/src/admin/adminSession.js
// ADMIN APP: how an Administrator's sign-in is kept on the phone.
//   * the Bearer token goes in the same 'auth_token' slot the rider token uses, so the shared API client sends it on every request
//   * who they are is kept in the saved status under admin_id (NEVER rider_id), so no rider job ever runs for an Administrator
//   * the PIN is NEVER kept on the phone (a rider's is, for offline login; an Administrator signs in against the server every time)
//   * the token lasts a shift; each time the app opens online a still-valid token is swapped for a fresh one
import api from '../api/client';
import { saveLocalAuthToken, getLocalRiderStatus, saveLocalRiderStatus, markSessionActive, endSession } from '../offline/db';

export const isAdminStatus = (status) => !!status && status.user_type === 'admin';

/** After a right PIN (sign-in) or a newly created PIN: keep the token and who this is, and stay signed in until Logout. */
export async function saveAdminSession({ token, admin }) {
  await saveLocalAuthToken(token);
  const prev = (await getLocalRiderStatus()) || {};
  // Only what an Administrator needs. Nothing of an earlier rider / business identity is carried over (no business_id, no fuel type, no rider_id).
  await saveLocalRiderStatus({
    user_type: 'admin', admin_id: admin.id, full_name: admin.name, role: admin.role, mobile_number: admin.mobile_number || prev.mobile_number,
    registration_status: 'active', onboarding_step: 'done',
  });
  await markSessionActive();
}

/** Quietly renew the token while online. Never throws, never signs anyone out (a 401 is handled by the screens, which return to Sign-In). */
export async function renewAdminSession() {
  try {
    const res = await api.post('/admin/app/session/refresh', null, { timeout: 8000 });
    if (res && res.data && res.data.ok && res.data.token) {
      await saveLocalAuthToken(res.data.token);
      return { ok: true, admin: res.data.admin };
    }
    return { ok: false };
  } catch (e) {
    return { ok: false, status: e && e.response && e.response.status };
  }
}

/** Logout: tell the server (best effort, for the log), forget the token, keep who this phone belongs to, show the Sign-In screen. */
export async function adminLogout() {
  try { await api.post('/admin/app/logout', null, { timeout: 5000 }); } catch (e) { /* offline or expired: still leave */ }
  try { await api.post('/auth/logout', null, { timeout: 5000 }); } catch (e) { /* SMART APPS: ends this phone's session on the server; offline is fine */ }
  await endSession();
  try {
    const { resetToSignIn } = require('../navigation/rootNavigation');
    resetToSignIn();
  } catch (e) { /* navigation not ready */ }
}
