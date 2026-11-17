// rider-app/src/auth/localIdentity.js
// SMART APPS: a phone holds ONE person's data. When someone else (or the same person on a freshly installed app) logs in,
// the previous person's saved data is removed, but the phone keeps its own id and the chosen language.
import indexedDbAdapter from '../offline/adapters/indexedDbAdapter';
import { getLocalDeviceId, getLocalLanguage, saveLocalLanguage } from '../offline/db';
import { countPending } from './loginRules';

export async function wipeLocalUserData() {
  const deviceId = await getLocalDeviceId();
  let language = null;
  try { language = await getLocalLanguage(); } catch { /* ignore */ }
  await indexedDbAdapter.clearAllData();
  await indexedDbAdapter.kvSet('device_id', deviceId);          // the phone keeps its identity
  if (language) { try { await saveLocalLanguage(language); } catch { /* ignore */ } }
}

/** How many records still wait to upload on this phone. Smart Boda AND Smart Bizna records wait in the same queue (offline/syncQueue.js).
 *  Anything not yet uploaded counts, including a record waiting for its next retry; a record the server has refused for good ('failed') does not
 *  (it will never upload, and must not keep the phone from ever changing hands). */
export async function pendingUploadCount() {
  try {
    const q = require('../offline/syncQueue');
    const items = await q.loadSyncQueue();
    return countPending(items);
  } catch { return 0; }
}
