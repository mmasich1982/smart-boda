// rider-app/src/admin/adminFormat.js
// ADMIN APP: the small rules the console pages carry inline (phone check, masking, error text), kept here so they can be tested without a phone.
export const PHONE_RE = /^(\+254|254|0)(7|1)[0-9]{8}$/;
export const cleanPhone = (v) => (v || '').replace(/[ -]/g, '');
export const isPhone = (v) => PHONE_RE.test(cleanPhone(v));
export const phoneKey = (v) => cleanPhone(v).replace(/\D/g, '').slice(-9);

/** Same rule as the console (utils/pii.js): 0757***81. A support person sees the full number only by tapping it. */
export function maskPhone(value) {
  if (!value) return '—';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 6) return String(value);
  return `${digits.slice(0, 4)}***${digits.slice(-2)}`;
}

/** The server's `detail` is a string for our own errors and a LIST for a 422. */
export function errText(e, fallback) {
  const d = e && e.response && e.response.data && e.response.data.detail;
  if (!d) return (e && e.response == null && e.message) ? 'No connection. Check your internet and try again.' : fallback;
  if (typeof d === 'string') return d;
  const x = Array.isArray(d) ? d[0] || {} : {};
  return String(x.msg || fallback).replace(/^Value error,\s*/, '');
}

/** Yes / No / Same-as-business, exactly the console's TriChoice: the server stores true / false / null. */
export const toTri = (v) => (v === true ? 'yes' : v === false ? 'no' : 'same');
export const fromTri = (t) => (t === 'yes' ? true : t === 'no' ? false : null);

export const when = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const BIZ_STATUS = { pending_setup: '🟡 Pending setup', activated: '🟢 Activated', inactive: '⚫ Switched off' };
export const USER_STATUS = { awaiting_registration: '🟡 Awaiting registration', registered: '🟢 Registered', inactive: '⚫ Switched off' };
export const RIDER_STATUS = { awaiting_registration: '🟡 Awaiting rider registration', registered: '🟢 Registered' };
