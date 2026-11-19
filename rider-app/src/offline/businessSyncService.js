// rider-app/src/offline/businessSyncService.js
// SMART BIZNA sync cycle (journey K), run by the orchestrator after every sync check, the same way runChamaSyncCycle is.
//   (a) the queue is sent by processPendingSync() before this runs (records, corrections, voids, suppliers, Lipa Later payments, profile, requests);
//       every item goes to the business it was made in (syncQueue.js adds X-Business-Id from the item's own business_id)
//   (b) refresh the list of THIS person's businesses (MULTIPLE BUSINESSES): each with its own role, active flag and tile permissions
//   (c) for EACH live business, with that business named explicitly: pull its records (the Owner pulls the whole business snapshot; everyone else pulls
//       their own records) and the Owner's statement requests. One business failing never stops the others.
// DATA ISOLATION: nothing here uses "the open business". Every step names the business it works on, and whatever comes back is saved into THAT
// business's store only (a reply that names a different business is refused by the store).
// Reading never needs the internet; only this cycle does. It never throws and does nothing for a rider.
import { isOnlineNow } from './chamaConnectivity';
import { recoverRiderSession } from './sessionToken';
import { getLocalRiderId, getLocalAuthToken, getLocalRiderStatus } from './db';
import { registry, scoped, readPendingMap, ensureBusinessProfile, ensureMigrated } from './businessRepository';

const listeners = new Set();
const listListeners = new Set();
/** Home subscribes so a changed role or tile permission shows without reopening the app. Called with the profile of the business whose profile changed. */
export function subscribeBusinessProfile(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** The switcher subscribes so a business the Administrator just added (or switched off) shows by itself. */
export function subscribeBusinessList(fn) { listListeners.add(fn); return () => listListeners.delete(fn); }
const emit = (profile) => listeners.forEach((fn) => { try { fn(profile); } catch { /* a listener must never break sync */ } });
const emitList = (list) => listListeners.forEach((fn) => { try { fn(list); } catch { /* a listener must never break sync */ } });

let inFlight = null;

async function isBusinessUser() {
  try { const s = await getLocalRiderStatus(); return !!s && s.user_type === 'business'; } catch { return false; }
}

/** Ask the server which businesses this person holds and keep each one's profile in its own storage. */
export async function refreshMyBusinesses() {
  await ensureMigrated();
  const client = require('../api/businessClient');
  const before = JSON.stringify(await registry.getMine());
  const answer = await client.businessMyBusinesses();
  const list = await registry.saveMine(answer.businesses || []);
  await registry.resolveActive();
  if (JSON.stringify(list) !== before) emitList(list);
  return list;
}

/** Refresh ONE business's own profile (role, active flag, tile permissions). Defaults to the open business. */
export function refreshBusinessProfile(businessId) {
  return (async () => {
    await ensureMigrated();
    let id = businessId || await registry.resolveActive();
    if (!id && !businessId) {            // SMART BIZNA FIX: nothing saved yet (a phone that signed in before the businesses were sent): ask the server NOW, not at the next sync cycle
      try {
        if (!(await getLocalAuthToken())) { const r = await recoverRiderSession(); if (!r.ok) return { changed: false, profile: null, skipped: r.reason }; }
        if (!(await isOnlineNow())) return { changed: false, profile: null, skipped: 'offline' };
        const list = await refreshMyBusinesses();
        id = await registry.resolveActive();
        if (id) { const mine = list.find((b) => b.business_id === id); if (mine) emit(await (await scoped(id)).getProfile()); }
      } catch { /* the sync cycle tries again */ }
    }
    if (!id) return { changed: false, profile: null };
    // No token (the person signed in offline): get one first, or stay quiet. This used to send /business/me with no token every 45 seconds and print a 401 each time.
    if (!(await getLocalAuthToken())) {
      const r = await recoverRiderSession();
      if (!r.ok) return { changed: false, profile: null, skipped: r.reason };
    }
    if (!(await isOnlineNow())) return { changed: false, profile: null, skipped: 'offline' };
    const client = require('../api/businessClient');
    const me = await client.businessMe(id);
    const { changed, profile } = await (await scoped(id)).saveProfile(me);
    if (changed) emit(profile);
    return { changed, profile };
  })();
}

/** Pull one business, naming it explicitly. Returns quietly on any problem so the next business still gets its turn. */
async function pullBusiness(client, entry) {
  const id = entry.business_id;
  const s = await scoped(id);
  const { profile } = await refreshBusinessProfile(id);
  if (!profile || !profile.active) return;
  const keepLocal = new Set((await readPendingMap(id)).keys());                           // changes still waiting on this phone win over the server copy
  const owner = s.isOwner(profile);
  const data = await s.getData();
  if (owner) {
    await s.mergeBundle(await client.businessSnapshot(id, data.meta.snapshotSince), { owner: true, keepLocal });        // Owner: whole business
    try { await s.applyRequests((await client.businessStatementRequests(id)).items); } catch { /* optional */ }
  } else {
    await s.mergeBundle(await client.businessMine(id, data.meta.mineSince), { owner: false, keepLocal });               // own records + suppliers
  }
}

export function runBusinessSyncCycle() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const out = { ok: false, skipped: null, failed: [] };
    try {
      if (!(await getLocalRiderId())) return { ...out, skipped: 'signed_out' };
      if (!(await getLocalAuthToken())) {                                                    // signed in offline: ask for the token now, if we are online
        const r = await recoverRiderSession();
        if (!r.ok) return { ...out, skipped: r.reason === 'offline' ? 'offline' : 'signed_out' };
      }
      if (!(await isBusinessUser())) return { ...out, skipped: 'not_business' };
      await ensureBusinessProfile();                                                         // Home is right even before the first answer
      if (!(await isOnlineNow())) return { ...out, skipped: 'offline' };
      const client = require('../api/businessClient');
      let list;
      try { list = await refreshMyBusinesses(); } catch (err) { return { ...out, error: err && err.message }; }   // (b)
      const live = list.filter((b) => b.active !== false);
      if (!live.length) return { ...out, ok: true, skipped: 'inactive' };
      for (const entry of live) {                                                            // (c) each business, one at a time, each named
        try { await pullBusiness(client, entry); } catch (err) { out.failed.push({ business_id: entry.business_id, error: err && err.message }); }
      }
      return { ...out, ok: out.failed.length === 0 };
    } catch (err) {
      return { ...out, error: err && err.message };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export default { runBusinessSyncCycle, refreshBusinessProfile, refreshMyBusinesses, subscribeBusinessProfile, subscribeBusinessList };
