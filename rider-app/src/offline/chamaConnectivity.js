// rider-app/src/offline/chamaConnectivity.js
// ============================================================================
// CHAMA / LOANS ONLINE-REQUIRED POLICY
// ============================================================================
//
// Smart Boda is offline-first. Fuel, Service, Trips, Financial History, Lipa Later and the rest keep working
// without a connection and sync later through the SyncQueue.
//
// THREE modules are the deliberate exception. They show balances, approvals, repayments and messages that
// belong to OTHER people (the Treasurer, the group), so a saved copy on
// the phone can be out of date. Money must never move against a stale balance. For these modules only,
// an active internet connection is REQUIRED:
//
//    'savings' -> My Savings   (Merry-Go-Round and Table Banking savings)
//    'loans'   -> My Loans     (Table Banking loans, guarantees)
//    'chama'   -> My Chama     (Manage Chama: Treasurer work)
//
// This file is the single place that decides (a) whether we are online, (b) what we tell the person when
// we are not. It has NO React in it, so the API client, the repository and the UI all share it.
//
// The wording is intentionally calm and professional: it says what is happening, why, and what to do next.
// ============================================================================

import NetInfo from '@react-native-community/netinfo';

// ---------------------------------------------------------------------------
// The three online-required modules
// ---------------------------------------------------------------------------
export const CHAMA_MODULES = {
  savings: {
    key: 'savings',
    // i18n keys (en/sw fallbacks ship in en-fallback.js / kiswahili-fallback.js). English below is the safety net.
    titleKey: 'chama.offline.savings_title',
    title: 'Internet connection required',
    moduleLabelKey: 'chama.offline.savings_module',
    moduleLabel: 'My Savings',
    bodyKey: 'chama.offline.savings_body',
    body:
      'My Savings needs an active internet connection. This lets you see your latest balances, contributions ' +
      'and confirmations from your Treasurer, or group, and makes sure any payment you record reaches them ' +
      'correctly. Please connect to Wi-Fi or mobile data and try again.',
  },
  loans: {
    key: 'loans',
    titleKey: 'chama.offline.loans_title',
    title: 'Internet connection required',
    moduleLabelKey: 'chama.offline.loans_module',
    moduleLabel: 'My Loans',
    bodyKey: 'chama.offline.loans_body',
    body:
      'My Loans needs an active internet connection. This lets you see your latest loan balances, approvals and ' +
      'repayment confirmations from your Treasurer or group, and makes sure any application or ' +
      'repayment you submit is received. Please connect to Wi-Fi or mobile data and try again.',
  },
  chama: {
    key: 'chama',
    titleKey: 'chama.offline.chama_title',
    title: 'Internet connection required',
    moduleLabelKey: 'chama.offline.chama_module',
    moduleLabel: 'My Chama',
    bodyKey: 'chama.offline.chama_body',
    body:
      'My Chama needs an active internet connection. This lets you receive the latest contributions, requests and ' +
      'approvals from your group, and makes sure every confirmation you make is recorded for everyone at the same ' +
      'time. Please connect to Wi-Fi or mobile data and try again.',
  },
};

export const CHAMA_OFFLINE_REASSURANCE = {
  key: 'chama.offline.reassurance',
  text: 'The rest of Smart Boda (trips, fuel, service and your financial history) keeps working offline.',
};

export const CHAMA_OFFLINE_RETRY = { key: 'chama.offline.retry', text: 'Try again' };
export const CHAMA_OFFLINE_CHECKING = { key: 'chama.offline.checking', text: 'Checking connection…' };
export const CHAMA_OFFLINE_BACK = { key: 'chama.offline.back_home', text: '← Back to Home' };
export const CHAMA_BACK_ONLINE = { key: 'chama.offline.back_online', text: 'You are back online. Loading your latest information…' };

export const CHAMA_STALE_NOTICE = {
  key: 'chama.stale.notice',
  // {when} is replaced with a friendly time such as "today 14:05"
  text: 'We could not reach the server just now. Showing the information last saved on this phone ({when}). Pull down or reopen this screen to refresh.',
};

export function getModuleCopy(moduleKey) {
  return CHAMA_MODULES[moduleKey] || CHAMA_MODULES.chama;
}

// ---------------------------------------------------------------------------
// The error thrown whenever a Chama API call is attempted with no connection
// ---------------------------------------------------------------------------
export class OfflineRequiredError extends Error {
  constructor(moduleKey = 'chama') {
    const copy = getModuleCopy(moduleKey);
    super(copy.body);
    this.name = 'OfflineRequiredError';
    this.code = 'OFFLINE_REQUIRED';
    this.module = copy.key;
    this.isOfflineRequired = true;
  }
}

export const isOfflineRequiredError = (e) => !!(e && (e.isOfflineRequired || e.code === 'OFFLINE_REQUIRED'));

// ---------------------------------------------------------------------------
// Which Chama API paths belong to which module (used by groupsClient to pick the right message)
// ---------------------------------------------------------------------------
export function moduleForPath(path = '') {
  const p = String(path);
  // Treasurer / group-admin endpoints -> My Chama (checked FIRST: "/chama/manage/loan-applications" is Treasurer work)
  // (/chama/mgr/me... is the RIDER's Merry-Go-Round view -> My Savings; everything else under /chama/mgr is Treasurer work)
  if (p.startsWith('/chama/manage') || p.startsWith('/groups') ||
      (p.startsWith('/chama/mgr') && !p.startsWith('/chama/mgr/me'))) return 'chama';
  // Member loan endpoints -> My Loans
  if (p.startsWith('/chama/me/loan') || p.startsWith('/chama/me/group-loans') || p.startsWith('/chama/me/guarant')) return 'loans';
  // Everything else a member does (summary, contributions, Merry-Go-Round, swaps) -> My Savings
  return 'savings';
}

// ---------------------------------------------------------------------------
// Connectivity probe
// ---------------------------------------------------------------------------
/**
 * Is the phone online RIGHT NOW?
 *
 * NetInfo reports isInternetReachable === null while it is still working it out. That is "unknown", not
 * "offline", so only an explicit false counts as offline. If NetInfo itself fails we assume online and let the
 * real request decide (the API client turns a failed request into the same friendly message).
 */
export async function isOnlineNow() {
  try {
    const state = await NetInfo.fetch();
    if (state?.isConnected === false) return false;
    if (state?.isInternetReachable === false) return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Throws OfflineRequiredError when there is no connection. Call before any Chama request.
 */
export async function ensureOnline(moduleKey = 'chama') {
  if (!(await isOnlineNow())) throw new OfflineRequiredError(moduleKey);
  return true;
}

/**
 * True when an axios error means "the request never reached the server" (no response at all).
 */
export function isNetworkFailure(err) {
  if (!err || err.response) return false;
  const code = err.code || '';
  const msg = String(err.message || '');
  return (
    code === 'ECONNABORTED' || code === 'ERR_NETWORK' || code === 'ENOTFOUND' || code === 'ERR_INTERNET_DISCONNECTED' ||
    /network (request failed|error)|timeout|internet/i.test(msg)
  );
}

/**
 * Friendly time for the "last saved" notice, e.g. "today 14:05" or "12 Oct 14:05".
 */
export function friendlyWhen(ts) {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'earlier';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const now = new Date();
    const same = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (same) return `today ${hh}:${mm}`;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${hh}:${mm}`;
  } catch {
    return 'earlier';
  }
}

// ---------------------------------------------------------------------------
// "Served from the saved copy" signal (so the gate can show a small notice, without every screen changing)
// ---------------------------------------------------------------------------
const staleListeners = new Set();
let lastStale = null;

export function reportStaleServed(savedAt) {
  lastStale = { savedAt: savedAt || Date.now(), reportedAt: Date.now() };
  staleListeners.forEach((fn) => { try { fn(lastStale); } catch { /* listener errors must never break a screen */ } });
}

export function clearStaleServed() {
  lastStale = null;
  staleListeners.forEach((fn) => { try { fn(null); } catch { /* ignore */ } });
}

export function getStaleServed() {
  return lastStale;
}

export function subscribeStaleServed(fn) {
  staleListeners.add(fn);
  return () => staleListeners.delete(fn);
}

export default {
  CHAMA_MODULES,
  CHAMA_OFFLINE_REASSURANCE,
  CHAMA_OFFLINE_RETRY,
  CHAMA_OFFLINE_CHECKING,
  CHAMA_OFFLINE_BACK,
  CHAMA_BACK_ONLINE,
  CHAMA_STALE_NOTICE,
  getModuleCopy,
  OfflineRequiredError,
  isOfflineRequiredError,
  moduleForPath,
  isOnlineNow,
  ensureOnline,
  isNetworkFailure,
  friendlyWhen,
  reportStaleServed,
  clearStaleServed,
  getStaleServed,
  subscribeStaleServed,
};
