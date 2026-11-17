// rider-app/src/auth/completeLogin.js
// SMART APPS: what happens after the server says yes to a login (POST /auth/login).
//   same person as the phone's saved data  -> keep the data, save the new token, go Home
//   another person / a new phone / a fresh install -> (only if nothing waits to upload) clear the old data, save who this is, then set up the account
// Returns { ok:true, next:'Home'|'RestoreAccount', userType, riderId? } or { ok:false, error }.
import { getLocalRiderStatus, saveLocalAuthToken, saveLocalRiderStatus, saveLocalRiderId, saveLocalBikeProfile, saveLocalLanguage, markSessionActive } from '../offline/db';
import { savePinLocally } from '../offline/pinUtility';
import { saveAdminSession } from '../admin/adminSession';
import { sameIdentity, canSwitchAccount, statusFromLogin } from './loginRules';
import { wipeLocalUserData, pendingUploadCount } from './localIdentity';
import { clearRevoked } from './sessionFlags';

export async function completeLogin(res, pin) {
  const status = (await getLocalRiderStatus().catch(() => null)) || null;
  const same = sameIdentity(status, res);
  const holdsSomeone = !!(status && (status.rider_id || status.admin_id));

  if (!same && holdsSomeone && !canSwitchAccount(await pendingUploadCount())) return { ok: false, error: 'pending_other_account' };
  if (!same && holdsSomeone) await wipeLocalUserData();

  if (res.user_type === 'admin') {
    await saveAdminSession({ token: res.token, admin: res.admin });          // kept under admin_id, never rider_id; the PIN is not kept on the phone
    await clearRevoked();
    return { ok: true, next: 'Home', userType: 'admin' };
  }

  await saveLocalAuthToken(res.token);
  if (!same) {
    await saveLocalRiderId(res.rider_id);
    await saveLocalRiderStatus(statusFromLogin(res));
    const p = res.profile || {};
    if (p.language_code) { try { await saveLocalLanguage(p.language_code); } catch { /* ignore */ } }
    if (p.fuel_type_code) { try { await saveLocalBikeProfile({ fuel_type_code: p.fuel_type_code }); } catch { /* ignore */ } }
  }
  await savePinLocally(res.rider_id, pin).catch(() => {});        // so the next Logout / Login on this phone needs only the PIN, offline too
  await markSessionActive();
  await clearRevoked();
  return { ok: true, next: same ? 'Home' : 'RestoreAccount', userType: res.user_type, riderId: res.rider_id };
}
