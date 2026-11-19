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
import { normalizeFuelType } from './restoreMapping';
import { setAudienceFromStatus } from '../vehicle/vehicleStore';      // SMART CABZ
import { seedBusinesses } from '../offline/businessRepository';      // SMART BIZNA FIX

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
    if (p.fuel_type_code) { try { await saveLocalBikeProfile({ fuel_type_code: normalizeFuelType(p.fuel_type_code) || p.fuel_type_code }); } catch { /* ignore */ } }
  }
  const fresh = statusFromLogin(res);
  if (same) {
    const { rider_id: _kept, ...rest } = status;       // rider_id is merged in by getLocalRiderStatus; it is saved under its own key
    const { rider_id: _r, ...freshFields } = fresh;
    await saveLocalRiderStatus({ ...rest, ...freshFields, rider_id: status.rider_id });     // SMART CABZ: the type may have been changed by an Administrator; SMART BIZNA FIX: so may a business user's role and tile permissions
  }
  if (res.user_type === 'business') { try { await seedBusinesses(res.businesses); } catch { /* the first sync fills them in */ } }      // SMART BIZNA FIX: Home opens with the Administrator's real settings
  setAudienceFromStatus(fresh);
  await savePinLocally(res.rider_id, pin).catch(() => {});        // so the next Logout / Login on this phone needs only the PIN, offline too
  await markSessionActive();
  await clearRevoked();
  return { ok: true, next: same ? 'Home' : 'RestoreAccount', userType: res.user_type, riderId: res.rider_id };
}
