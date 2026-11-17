// rider-app/src/auth/sessionLost.js
// SMART APPS: what the app does when the server says this phone is no longer the one logged-in session.
//   * the phone stops syncing (no token) and shows the Login screen with the reason
//   * the PIN kept on the phone stops opening the app until the person logs in ONLINE again (a lost phone found online stays locked)
//   * the person's saved records stay on the phone: if the SAME person logs in here again they are still there
import { setSessionLostHandler } from '../api/client';
import { endSession } from '../offline/db';
import { resetToSignIn } from '../navigation/rootNavigation';
import { markRevoked } from './sessionFlags';

let handling = false;

export async function handleSessionLost(code, message) {
  if (handling) return;
  handling = true;
  try {
    await markRevoked(code, message);
    await endSession();
    resetToSignIn({ notice: message || null });
  } finally {
    setTimeout(() => { handling = false; }, 3000);
  }
}

export function installSessionLostHandler() { setSessionLostHandler(handleSessionLost); }
