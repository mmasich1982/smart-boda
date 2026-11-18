// rider-app/src/auth/restoreService.js
// SMART APPS: "set up my account on this phone". After a login on a phone that does not hold this person's data, bring it down from the server.
// What comes down today:
//   profile       saved by the login itself (name, language, fuel type)
//   business      Smart Bizna: every business, its people and records, via the existing sync cycle (businessSyncService.runBusinessSyncCycle)
//   groups        Chama / group membership and history, via the existing sync cycle (chamaSyncService.runChamaSyncCycle)
//   trips         Smart Boda Cash and M-Pesa trips of the last six months            (GET /restore/rider/trips)
//   fuel          fuel entries                                                        (GET /restore/rider/fuel)
//   maintenance   maintenance entries                                                 (GET /restore/rider/maintenance)
//   expenses      other expenses, into the phone's financial history                  (GET /restore/rider/other-expenses)
//   lipa          a rider's Lipa Later customers, records and payments                (GET /restore/rider/lipa-later)
//                 (Smart Bizna Lipa Later, customers AND suppliers, payments included, comes down with the business step)
//   groups        membership, then each group's contribution / payment history and totals (savings and loan repayments). My Savings and My Loans
//                 themselves are read live from the server whenever they are opened, so a new phone shows them as soon as it is online.
// Not restored yet (see the scope document): battery, personal savings, goals, targets, documents, statements.
import api from '../api/client';
import indexedDbAdapter from '../offline/adapters/indexedDbAdapter';
import { restoreSteps } from './loginRules';
import { tripRow, fuelRow, maintenanceRow, expenseRow, buildLipaRestore, isBatteryMode, normalizeFuelType, mergeById, expenseSummary } from './restoreMapping';
import { getLocalRiderId, getActiveBikeProfile, saveLocalBikeProfile } from '../offline/db';

const MAX_PAGES = 40;                    // 40 x 500 trips; the server only sends the last six months

/** Reads one restore route page by page and writes each page into a phone store. Returns how many rows came down. */
async function pull(path, mapRow, store) {
  let after = null; let pages = 0; let total = 0;
  do {
    const res = await api.get(path, { params: { after: after || undefined, limit: 500 }, timeout: 30000 });
    const items = (res.data && res.data.items) || [];
    if (items.length) { await indexedDbAdapter.putRows(store, items.map(mapRow)); total += items.length; }
    after = res.data && res.data.next_cursor;
    pages += 1;
  } while (after && pages < MAX_PAGES);
  return total;
}

export const restoreTrips = () => pull('/restore/rider/trips', tripRow, 'trips');
/** Fuel (mode 'petrol') goes to the phone's fuel store; battery entries (mode 'charging' / 'swap') go to the battery store the Battery History reads. */
export async function restoreFuel() {
  let after = null; let pages = 0; let total = 0;
  do {
    const res = await api.get('/restore/rider/fuel', { params: { after: after || undefined, limit: 500 }, timeout: 30000 });
    const items = (res.data && res.data.items) || [];
    const fuel = items.filter((f) => !isBatteryMode(f.mode)).map(fuelRow);
    const battery = items.filter((f) => isBatteryMode(f.mode)).map(fuelRow);
    if (fuel.length) await indexedDbAdapter.putRows('fuelEntry', fuel);
    if (battery.length) await indexedDbAdapter.putRows('batteryEntry', battery);
    total += items.length;
    after = res.data && res.data.next_cursor;
    pages += 1;
  } while (after && pages < MAX_PAGES);
  return total;
}
export const restoreMaintenance = () => pull('/restore/rider/maintenance', maintenanceRow, 'maintenanceEntry');
export const restoreExpenses = () => pull('/restore/rider/other-expenses', expenseRow, 'financialHistory');

/** The bike profile (fuel type). Without it a new phone shows neither the Fuel Motorcycle nor the Charge Battery tile. Never replaces a profile the phone already has. */
export async function restoreProfile() {
  const have = await getActiveBikeProfile().catch(() => null);
  if (have && normalizeFuelType(have.fuel_type_code)) return true;
  const res = await api.get('/restore/rider/profile', { timeout: 30000 });
  const p = res.data && res.data.profile;
  if (!p || !normalizeFuelType(p.fuel_type_code)) return true;               // the rider has not set a vehicle yet: nothing to restore
  await saveLocalBikeProfile({ fuel_type_code: normalizeFuelType(p.fuel_type_code), id: p.id });
  return true;
}

/** The history screens and Financial Performance read per-rider caches (fuel_history_, battery_history_, maintenance_history_, other_expenses_summary_,
 *  trip_history_), not the stores restore writes. Rebuild each from the stores so every restored record shows everywhere. Merged by id: nothing the phone holds is lost. */
export async function rebuildHistoryCaches(riderId) {
  const rid = riderId || await getLocalRiderId();
  if (!rid) return false;
  const mine = (row) => String(row.rider_id) === String(rid);
  const merge = async (key, store, filter = mine) => {
    const rows = await indexedDbAdapter.queryRows(store, filter);
    let existing = [];
    try { const c = await indexedDbAdapter.kvGet(key); existing = typeof c === 'string' ? JSON.parse(c) : c; } catch { existing = []; }
    if (!Array.isArray(existing)) existing = [];
    const out = mergeById(existing, rows);
    await indexedDbAdapter.kvSet(key, JSON.stringify(out));
    return out;
  };
  try { await require('../offline/financialPerformanceUtils').invalidateFinancialCaches(rid); } catch { /* totals are recomputed on open */ }   // first: it also clears other_expenses_summary_
  await merge(`fuel_history_${rid}`, 'fuelEntry');
  await merge(`battery_history_${rid}`, 'batteryEntry');
  await merge(`maintenance_history_${rid}`, 'maintenanceEntry');
  await merge(`trip_history_${rid}`, 'trips');
  const exp = await indexedDbAdapter.queryRows('financialHistory', (r) => mine(r) && r.type === 'other_expense');
  await indexedDbAdapter.kvSet(`other_expenses_summary_${rid}`, JSON.stringify(expenseSummary(exp)));
  return true;
}

/** A rider's Lipa Later: trips into the phone's trips, then the customer list, summary and payment histories the Lipa Later screens read. */
export async function restoreLipaLater(riderId) {
  let after = null; let pages = 0; const records = [];
  do {
    const res = await api.get('/restore/rider/lipa-later', { params: { after: after || undefined, limit: 200 }, timeout: 30000 });
    records.push(...((res.data && res.data.items) || []));
    after = res.data && res.data.next_cursor;
    pages += 1;
  } while (after && pages < MAX_PAGES);
  const { rows, lipaIds, histories } = buildLipaRestore(records, riderId);
  if (!rows.length) return 0;
  const U = require('../offline/lipaLaterUtils');
  await indexedDbAdapter.putRows('trips', rows);
  await U.syncLipaLaterFromApi(riderId, rows);                              // customers, summary and one entry per trip (the phone's own routine)
  const customers = await U.loadLipaLaterCustomersCache(riderId);          // new payments must go to a real server record
  customers.forEach((c) => { if (lipaIds[c.customerId]) c.lipaLaterId = lipaIds[c.customerId]; });
  await U.saveLipaLaterCustomersCache(riderId, customers);
  for (const [customerId, payments] of Object.entries(histories)) await U.saveCustomerPaymentHistory(customerId, payments);
  return rows.length;
}

/** Group membership first, then every group's history (the background cycle only follows groups whose history was opened once on this phone,
 *  so a new phone must ask for each one itself). */
export async function restoreGroups() {
  const cycle = await require('../offline/chamaSyncService').runChamaSyncCycle();
  if (!cycle || !cycle.online || !cycle.membershipOk) return false;          // could not even learn the groups: offline or signed out
  const { getMembership } = require('../offline/chamaRepository');
  const tb = require('../offline/chamaTbHistorySync');
  const mgr = require('../offline/chamaMgrHistorySync');
  const m = await getMembership();
  let ok = true;
  for (const g of (m.memberships || []).filter((x) => x && x.group_id && x.group_active !== false)) {
    const r = g.group_type === 'tb' ? await tb.syncTbHistory(g.group_id, { force: true }) : g.group_type === 'mgr' ? await mgr.syncMgrHistory(g.group_id, { force: true }) : null;
    if (g.group_type === 'tb') { await tb.refreshTbSummary(g.group_id); }
    if (r && (r.offline || r.error)) ok = false;
  }
  return ok;
}

async function runStep(id, riderId) {
  if (id === 'profile') { if (riderId || await getLocalRiderId()) { try { await restoreProfile(); } catch { return false; } } return true; }
  if (id === 'business') { const r = await require('../offline/businessSyncService').runBusinessSyncCycle(); return !!(r && (r.ok || r.skipped === 'inactive')); }
  if (id === 'groups') return restoreGroups();
  if (id === 'trips') { await restoreTrips(); return true; }
  if (id === 'fuel') { await restoreFuel(); return true; }
  if (id === 'maintenance') { await restoreMaintenance(); return true; }
  if (id === 'expenses') { await restoreExpenses(); await rebuildHistoryCaches(riderId); return true; }     // the LAST rider step: every store is filled, so build the caches now
  if (id === 'lipa') { await restoreLipaLater(riderId); return true; }
  return true;
}

/** Runs every step; one failing step never stops the next. onStep(id, 'running'|'ok'|'failed'). Never throws. */
export async function restoreAccount({ userType, riderId, onStep }) {
  const results = [];
  for (const step of restoreSteps(userType)) {
    if (onStep) onStep(step.id, 'running');
    let ok = false;
    try { ok = await runStep(step.id, riderId); } catch { ok = false; }
    results.push({ id: step.id, ok });
    if (onStep) onStep(step.id, ok ? 'ok' : 'failed');
  }
  return { ok: results.every((r) => r.ok), results };
}
