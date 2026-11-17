// rider-app/src/auth/sessionFlags.js
// SMART APPS: what this phone remembers when the server ended its session.
//   revoked = true  -> the PIN kept on the phone no longer opens the app: the person must log in ONLINE (mobile number + PIN) again.
//                      (a lost or old phone found online must not stay usable on its own PIN)
//   notice          -> the words to show on the Login screen once ("You were logged out because your account was used on another device.")
import indexedDbAdapter from '../offline/adapters/indexedDbAdapter';

const REVOKED = 'session_revoked';
const NOTICE = 'login_notice';

export async function markRevoked(code, message) {
  try {
    await indexedDbAdapter.kvSet(REVOKED, code || 'session_ended');
    await indexedDbAdapter.kvSet(NOTICE, message || null);
  } catch { /* storage problems never block a sign-out */ }
}
export async function getRevoked() { try { return (await indexedDbAdapter.kvGet(REVOKED)) || null; } catch { return null; } }
export async function clearRevoked() { try { await indexedDbAdapter.kvSet(REVOKED, null); await indexedDbAdapter.kvSet(NOTICE, null); } catch { /* ignore */ } }
/** Read the notice once. */
export async function takeNotice() {
  try { const n = await indexedDbAdapter.kvGet(NOTICE); if (n) await indexedDbAdapter.kvSet(NOTICE, null); return n || null; } catch { return null; }
}
