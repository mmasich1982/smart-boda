// rider-app/src/offline/chamaSyncService.js
// ============================================================================
// CHAMA SYNC SERVICE
// ============================================================================
// Connects the Chama module to the Smart Boda offline-first framework:
//
//   • SyncQueue      : notification acknowledgements ("I have seen this") are queued and sent in the background.
//                      They are the ONLY Chama items that use the queue. Money actions need a live connection.
//   • SyncOrchestrator: calls runChamaSyncCycle() after every sync check (see syncOrchestrator.js). That refreshes
//                      the rider's group membership (so My Savings / My Loans appear or disappear on their own)
//                      and runs the weekly six-month retention cleanup.
//   • Membership events: screens (Home) subscribe so the tiles update the moment membership changes.
// ============================================================================

import { addToSyncQueue } from './syncQueue';
import { getLocalRiderId, getLocalAuthToken } from './db';
import { isOnlineNow } from './chamaConnectivity';
import { syncAllMgrHistory } from './chamaMgrHistorySync';
import { saveMembership, getMembership, runRetentionCleanup, clearChamaData } from './chamaRepository';

// ---------------------------------------------------------------------------
// Membership change events
// ---------------------------------------------------------------------------
const membershipListeners = new Set();

export function subscribeMembership(fn) {
  membershipListeners.add(fn);
  return () => membershipListeners.delete(fn);
}

function emitMembership(membership) {
  membershipListeners.forEach((fn) => { try { fn(membership); } catch { /* a listener must never break sync */ } });
}

// There is NO "you were added" notice. Adding a member (or replacing one) sends the rider nothing: the tiles appear because
// the membership poll (focus, foreground, every 45 s, after each sync cycle) sees the new membership.

// ---------------------------------------------------------------------------
// Membership refresh (server is the authority; the saved copy keeps Home correct offline)
// ---------------------------------------------------------------------------
let refreshInFlight = null;

/**
 * Ask the server who this rider is in Chama terms and save the answer.
 * Safe to call often: concurrent calls share one request. Never throws.
 * @returns {Promise<{ok:boolean, changed:boolean, membership:object}>}
 */
export function refreshMembership() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      // Nobody is signed in yet (language selection, value preview, Setup My Profile, PIN creation): there is no membership to ask
      // about, and the call would only produce a 401. Skip it quietly.
      if (!(await getLocalRiderId()) || !(await getLocalAuthToken())) return { ok: false, changed: false, membership: await getMembership(), signedOut: true };
      if (!(await isOnlineNow())) return { ok: false, changed: false, membership: await getMembership() };
      // groupsClient imports this file's siblings, so load it lazily to avoid an import cycle
      const { groupProfile } = require('../api/groupsClient');
      const profile = await groupProfile();
      const { changed, membership } = await saveMembership(profile);
      if (changed) emitMembership(membership);
      return { ok: true, changed, membership };
    } catch (err) {
      // 401 before login, 5xx, timeouts: keep what we have
      return { ok: false, changed: false, membership: await getMembership() };
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// ---------------------------------------------------------------------------
// Notification acknowledgements through the SyncQueue
// ---------------------------------------------------------------------------
/**
 * Queue "mark this notice as seen". Returns true when it is safely queued.
 * The backend endpoint is idempotent, so a retry after a half-finished send is harmless.
 */
export async function queueNotificationAck(notificationId) {
  try {
    const riderId = await getLocalRiderId();
    if (!riderId || !notificationId) return false;
    return await addToSyncQueue({
      id: `chama_ack_${riderId}_${notificationId}`,
      type: 'chama_notification_ack',
      endpoint: `/notifications/${notificationId}/complete`,
      data: { rider_id: riderId, notification_id: notificationId },
      riderId,
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn('⚠️ [chamaSync] could not queue notification ack:', err?.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// One cycle, called by the SyncOrchestrator after processPendingSync()
// ---------------------------------------------------------------------------
export async function runChamaSyncCycle() {
  try {
    if (!(await getLocalRiderId()) || !(await getLocalAuthToken())) return { online: false, signedOut: true };
    const online = await isOnlineNow();
    if (!online) return { online: false };
    const refreshed = await refreshMembership();
    const mgrHistory = await syncAllMgrHistory();                // My Contribution History: only what changed, at most every 15 minutes per group
    const cleanup = await runRetentionCleanup({ online: true }); // weekly; returns {skipped:true} when not due
    return { online: true, membershipOk: refreshed.ok, membershipChanged: refreshed.changed, mgrHistory, cleanup };
  } catch (err) {
    console.warn('⚠️ [chamaSync] cycle error (non-fatal):', err?.message);
    return { online: false, error: err?.message };
  }
}

/**
 * Call at logout: removes this rider's Chama data from the phone.
 */
export async function clearChamaOnLogout() {
  try {
    const riderId = await getLocalRiderId();
    emitMembership({ has_group: false, group_type: null, is_treasurer: false, treasurer_invite: false, treasurer_invite_group: null,
      memberships: [], has_mgr: false, has_tb: false, treasurer_groups: [], treasurer_invites: [] });
    return await clearChamaData(riderId);
  } catch { return false; }
}

export default {
  subscribeMembership,
  refreshMembership,
  queueNotificationAck,
  runChamaSyncCycle,
  clearChamaOnLogout,
};