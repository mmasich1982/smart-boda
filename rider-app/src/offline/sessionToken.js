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
import { saveLocalAuthToken, getLocalAuthToken, getLocalRiderId, getLocalDeviceId, getLocalRiderStatus, saveLocalRiderStatus } from './db';
import { deviceLabel } from '../auth/deviceLabel';          // SMART APPS
import { setAudienceFromStatus } from '../vehicle/vehicleStore';      // SMART CABZ
import { isOnlineNow } from './chamaConnectivity';
import indexedDbAdapter from './adapters/indexedDbAdapter';
import { savePinLocally } from './pinUtility';
import { setMissingTokenHandler } from '../api/client';

/** @returns {Promise<{ok:boolean, reason?:string, other?:{device_label?:string}}>}
 *  SMART APPS: reason 'session_elsewhere' = the account is logged in on ANOTHER phone. This quiet call never takes the session from it;
 *  only the Login screen's confirmed "Log in here" does. */
export async function ensureRiderSession(riderId, pin) {
  try {
    if (!riderId || !pin) return { ok: false, reason: 'missing_credentials' };
    if (!(await isOnlineNow())) return { ok: false, reason: 'offline' };

    const device_id = await getLocalDeviceId();
    const res = await api.post('/onboarding/pin/login', { rider_id: String(riderId), pin: String(pin), device_id, device_label: deviceLabel() }, { timeout: 8000 });
    const data = res?.data;
    if (data?.ok && data?.token) {
      await saveLocalAuthToken(data.token);
      savePinLocally(riderId, pin).catch(() => {});      // OFFLINE FIRST: a PIN the server just accepted is always kept on this phone for the next offline sign-in
      blocked = false;
      return { ok: true };
    }
    // {"ok": false, "error": "incorrect" | "locked"} - the server disagrees with the local PIN (e.g. PIN was reset elsewhere)
    return { ok: false, reason: data?.error || 'rejected', other: data?.error === 'session_elsewhere' ? { device_label: data.device_label } : undefined };
  } catch (err) {
    return { ok: false, reason: err?.message || 'request_failed' };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// SESSION RECOVERY (Smart Bizna sync). A person who signs in with NO connection is checked against the PIN saved on the phone, so no token is asked for.
// Smart Boda routes only need ?rider_id=, so those records still sync; every Smart Bizna route needs the token and answered 401 "Missing authorization
// header" for ever. recoverRiderSession() asks for the token as soon as the phone is online, using the PIN this phone already saved (offline first).
// It asks at most once at a time, never twice within RECOVER_GAP_MS after a failure, and never again once the server has said the PIN is wrong or locked
// (asking again would count as failed attempts): the person is then shown the one-time "sign in" box (see needsSignIn / SessionNotice).
// ---------------------------------------------------------------------------------------------------------------------------
const RECOVER_GAP_MS = 30000;
let recovering = null;
let lastFailAt = 0;
let blocked = false;                              // the server refused the saved PIN (reset elsewhere / locked): only the person can fix it
const needListeners = new Set();
let needSignIn = false;
const setNeed = (v) => { if (v !== needSignIn) { needSignIn = v; needListeners.forEach((fn) => { try { fn(v); } catch { /* a listener must never break sync */ } }); } };

/** The PIN saved on this phone (pinUtility keeps it under pin_<riderId>). */
export async function getSavedPin(riderId) {
  try { const v = await indexedDbAdapter.kvGet(`pin_${riderId}`); return v ? String(v) : null; } catch { return null; }
}

/** True while this phone has no token and cannot get one by itself. */
export const needsSignIn = () => needSignIn;
export function subscribeNeedsSignIn(fn) { needListeners.add(fn); return () => needListeners.delete(fn); }

/** @returns {Promise<{ok:boolean, reason?:string}>} reason: has_token | offline | no_rider | no_saved_pin | rejected | waiting | request_failed */
export function recoverRiderSession() {
  if (recovering) return recovering;
  recovering = (async () => {
    try {
      if (await getLocalAuthToken()) { setNeed(false); return { ok: true, reason: 'has_token' }; }
      const riderId = await getLocalRiderId();
      if (!riderId) return { ok: false, reason: 'no_rider' };
      if (!(await isOnlineNow())) return { ok: false, reason: 'offline' };
      if (blocked) { setNeed(true); return { ok: false, reason: 'rejected' }; }
      if (Date.now() - lastFailAt < RECOVER_GAP_MS) return { ok: false, reason: 'waiting' };
      const pin = await getSavedPin(riderId);
      if (!pin) { setNeed(true); return { ok: false, reason: 'no_saved_pin' }; }
      const r = await ensureRiderSession(riderId, pin);
      if (r.ok) { setNeed(false); return r; }
      if (r.reason === 'incorrect' || r.reason === 'locked' || r.reason === 'session_elsewhere') { blocked = true; setNeed(true); }
      else lastFailAt = Date.now();
      return r;
    } catch (err) {
      lastFailAt = Date.now();
      return { ok: false, reason: err?.message || 'request_failed' };
    } finally { recovering = null; }
  })();
  return recovering;
}

/** The one-time sign-in box: the person types the PIN once; it is sent exactly like a login and, if accepted, saved on the phone. */
export async function signInWithPin(pin) {
  const riderId = await getLocalRiderId();
  const r = await ensureRiderSession(riderId, pin);
  if (r.ok) { blocked = false; lastFailAt = 0; setNeed(false); }
  return r;
}

// A Smart Bizna request that went out with no token tells the app to get one (api/client.js cannot import this file: it would be circular).
setMissingTokenHandler(() => { recoverRiderSession().catch(() => {}); });

/**
 * PERSISTENT SESSION: the person stays signed in until an explicit Logout, so the token must not run out under them.
 * While online, swap the stored (still valid) token for a fresh one. Never throws and never signs anyone out:
 * offline, no token, or a refusal simply leave things as they are.
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function renewRiderSession() {
  try {
    const token = await getLocalAuthToken();
    if (!token) return { ok: false, reason: 'no_token' };
    if (!(await isOnlineNow())) return { ok: false, reason: 'offline' };
    const res = await api.post('/onboarding/session/refresh', null, { timeout: 8000 });
    const data = res?.data;
    if (data?.ok && data?.token) {
      await saveLocalAuthToken(data.token);
      if (data.vehicle_type) {                       // SMART CABZ: a Super Admin may have changed this person's vehicle type; the Home follows
        try {
          const st = await getLocalRiderStatus();
          if (st && st.vehicle_type !== data.vehicle_type) await saveLocalRiderStatus({ ...st, vehicle_type: data.vehicle_type });
          setAudienceFromStatus({ ...(st || {}), vehicle_type: data.vehicle_type });
        } catch { /* the token was renewed; the words catch up on the next start */ }
      }
      return { ok: true };
    }
    return { ok: false, reason: 'rejected' };
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

export default { ensureRiderSession, renewRiderSession, hasRiderToken, recoverRiderSession, signInWithPin, getSavedPin, needsSignIn, subscribeNeedsSignIn };