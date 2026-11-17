// rider-app/src/offline/logout.js
// EXPLICIT LOGOUT - the only thing that brings the Sign-In screen back for a signed-in person.
//   1. removes this rider's Chama copy from the phone (as before)
//   2. ends the session: 'session_active' = false and the server token is forgotten (rider identity, saved PIN and unsynced records are KEPT)
//   3. clears navigation and shows the Sign-In (PIN) screen
// Never throws.
import { endSession } from './db';
import { serverLogout } from '../auth/loginApi';          // SMART APPS: tell the server this phone logged out (best effort)
import { clearChamaOnLogout } from './chamaSyncService';
import { resetToSignIn } from '../navigation/rootNavigation';

/** @returns {Promise<{ok:boolean, navigated:boolean}>} */
export async function performLogout() {
  try { await clearChamaOnLogout(); } catch (e) { /* a Chama clean-up problem must not block Logout */ }
  await serverLogout();                                  // before the token is forgotten; offline it simply does not happen
  const ok = await endSession();
  const navigated = resetToSignIn();
  return { ok, navigated };
}

export default { performLogout };
