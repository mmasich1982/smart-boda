// rider-app/src/auth/loginRules.js
// SMART APPS: the rules of the new Login screen, kept out of the screen so they can be tested without a phone.
//   * the Login screen is the first screen a new person sees; Register leads to Language Selection (the existing onboarding)
//   * the screen asks for the MOBILE NUMBER and the PIN. After onboarding on a phone the number is already filled in
//   * which check applies: the quick check against the PIN kept on THIS phone (works offline), or the server (new phone, another number,
//     an Administrator, or a phone whose session the server ended)
//   * ONE active session per person: a login on another phone must be confirmed ("takeover") and ends the first phone's session
import { isPhone, cleanPhone, phoneKey } from '../admin/adminFormat';

export { isPhone, cleanPhone, phoneKey };

/** 'local' when this phone already belongs to that rider/business user, the number matches, and the server has not ended its session. Otherwise 'server'. */
export function choosePath({ mobile, status, revoked }) {
  if (revoked) return 'server';
  if (!status || !status.rider_id || status.user_type === 'admin') return 'server';
  return phoneKey(mobile) && phoneKey(mobile) === phoneKey(status.mobile_number) ? 'local' : 'server';
}

/** Does the person who just logged in already own this phone's saved data? */
export function sameIdentity(status, res) {
  if (!status || !res) return false;
  if (res.user_type === 'admin') return !!(res.admin && status.admin_id && status.admin_id === res.admin.id);
  return !!(res.rider_id && status.rider_id && String(status.rider_id) === String(res.rider_id));
}

/** A phone may switch to another person's data only when nothing is waiting to upload for the person it holds now. */
export const canSwitchAccount = (pendingCount) => !(Number(pendingCount) > 0);

/** How many queue items still have to upload: anything not uploaded yet (a record waiting for its next retry included). A record the server refused
 *  for good ('failed') is not counted: it will never upload and must not keep the phone from ever changing hands. */
export function countPending(items) {
  return (Array.isArray(items) ? items : []).filter((it) => it && it.status !== 'synced' && it.status !== 'failed').length;
}

/** What to put in the saved status after a server login (rider or business user). */
export function statusFromLogin(res) {
  const p = res.profile || {};
  return {
    rider_id: res.rider_id, user_type: res.user_type === 'business' ? 'business' : 'rider', mobile_number: res.mobile_number || p.mobile_number,
    full_name: p.full_name || '', registration_status: 'active', onboarding_step: 'done', language_code: p.language_code || null,
  };
}

/** The steps of "setting up your account on this phone", in order, for the person's kind. */
export function restoreSteps(userType) {
  const steps = [{ id: 'profile', label: 'Your profile' }];
  if (userType === 'business') steps.push({ id: 'business', label: 'Your businesses and records' });
  steps.push({ id: 'groups', label: 'Your groups, savings and loans' });
  if (userType === 'rider') {
    steps.push({ id: 'trips', label: 'Your trips and income' });
    steps.push({ id: 'lipa', label: 'Your Lipa Later customers and payments' });
    steps.push({ id: 'fuel', label: 'Your fuel entries' });
    steps.push({ id: 'maintenance', label: 'Your maintenance entries' });
    steps.push({ id: 'expenses', label: 'Your other expenses' });
  }
  return steps;
}

export const MESSAGES = {
  offline: 'Connect to the internet to log in on this phone. After that the app works offline as before.',
  incorrect: 'Mobile number or PIN is incorrect. New here? Tap Register.',
  locked: (min) => `Too many wrong attempts. Try again in about ${min || 15} minutes.`,
  disabled: 'This account has been switched off. Please contact support.',
  pendingOther: 'This phone still has records waiting to upload for another account. Log in as that account and let them upload first.',
  needNumber: 'Enter your mobile number first.',
  failed: 'We could not log you in. Please try again.',
};

/** The words for a refused login (everything except active_elsewhere, which asks a question instead). */
export function messageFor(res) {
  if (!res) return MESSAGES.failed;
  if (res.error === 'offline') return MESSAGES.offline;
  if (res.error === 'locked') return MESSAGES.locked(res.minutes);
  if (res.error === 'disabled') return MESSAGES.disabled;
  if (res.error === 'pending_other_account') return MESSAGES.pendingOther;
  if (res.error === 'incorrect') return MESSAGES.incorrect;
  return MESSAGES.failed;
}

/** The question asked before a login on this phone ends the session on another phone. */
export function takeoverQuestion(res) {
  const where = (res && res.device_label) || 'another device';
  return { title: 'Already logged in', message: `Your account is logged in on ${where}. Log in here and log out there? You can only be logged in on one device at a time.`, confirmText: 'Log in here' };
}
