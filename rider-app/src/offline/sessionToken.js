// rider-app/src/offline/sessionToken.js
// ============================================================================
// RIDER SESSION TOKEN
// ============================================================================
// PIN login in this app is verified OFFLINE against the PIN saved on the phone (pinUtility.verifyPinLocally).
// That is fine for opening the app, but the backend's authenticated routes (/chama/me/*, /psv/*, /special/*, ...)
// need a Bearer JWT, which is issued ONLY by POST /onboarding/pin/login. Nothing in the app called that endpoint,
// so 'auth_token' was never stored and every authenticated request went out with no Authorization header -> 401.
//
// ensureRiderSession(riderId, pin) asks the server for a token and stores it. It never throws and is safe to call
// right after a successful local PIN check, or right after the PIN is created. Offline = quietly skipped
// (the token is fetched the next time the rider logs in while online).
// ============================================================================
import api from '../api/client';
import { saveLocalAuthToken, getLocalAuthToken, getLocalRiderId } from './db';
import { isOnlineNow } from './chamaConnectivity';

/** @returns {Promise<{ok:boolean, reason?:string}>} */
export async function ensureRiderSession(riderId, pin) {
  try {
    if (!riderId || !pin) return { ok: false, reason: 'missing_credentials' };
    if (!(await isOnlineNow())) return { ok: false, reason: 'offline' };

    const res = await api.post('/onboarding/pin/login', { rider_id: String(riderId), pin: String(pin) }, { timeout: 8000 });
    const data = res?.data;
    if (data?.ok && data?.token) {
      await saveLocalAuthToken(data.token);
      return { ok: true };
    }
    // {"ok": false, "error": "incorrect" | "locked"} - the server disagrees with the local PIN (e.g. PIN was reset elsewhere)
    return { ok: false, reason: data?.error || 'rejected' };
  } catch (err) {
    return { ok: false, reason: err?.message || 'request_failed' };
  }
}

/**
 * True only when this phone has a signed-in rider: a stored rider_id AND a stored token.
 * Before onboarding / PIN login (language screen, value preview, ...) both are empty, so background jobs
 * (sync orchestrator, membership poll) must not call authenticated endpoints yet.
 */
export async function hasRiderToken() {
  try {
    const [token, riderId] = await Promise.all([getLocalAuthToken(), getLocalRiderId()]);
    return !!token && !!riderId;
  } catch { return false; }
}

export default { ensureRiderSession, hasRiderToken };