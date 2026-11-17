// rider-app/src/auth/loginApi.js
// SMART APPS: the one server call behind the Login screen (POST /auth/login) and the Logout call.
import api from '../api/client';
import { getLocalDeviceId } from '../offline/db';
import { isOnlineNow } from '../offline/chamaConnectivity';
import { deviceLabel } from './deviceLabel';
import { cleanPhone } from './loginRules';

/** Never throws. Resolves with the server's answer ({ok, token, ...} or {ok:false, error, ...}) or {ok:false, error:'offline'}. */
export async function loginWithMobile({ mobile, pin, takeover = false }) {
  try {
    if (!(await isOnlineNow())) return { ok: false, error: 'offline' };
    const device_id = await getLocalDeviceId();
    const res = await api.post('/auth/login', { mobile_number: cleanPhone(mobile), pin: String(pin), device_id, device_label: deviceLabel(), takeover: !!takeover }, { timeout: 20000 });
    return res && res.data ? res.data : { ok: false, error: 'failed' };
  } catch (err) {
    if (err && err.response == null) return { ok: false, error: 'offline' };       // no answer at all: treat like offline
    return { ok: false, error: 'failed' };
  }
}

/** Tell the server this phone is logging out (frees the account; best effort, offline is fine). Never throws. */
export async function serverLogout() {
  try {
    if (!(await isOnlineNow())) return false;
    await api.post('/auth/logout', null, { timeout: 5000 });
    return true;
  } catch { return false; }
}
