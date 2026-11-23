// rider-app/src/utils/lipaPaymentRules.js
// THE LIPA LATER PAYMENT RULES, one set for Smart Bizna customers and suppliers and Smart Boda / Smart Cabz customers. Pure, so they are tested without a phone.
//   * A payment can NEVER be more than what is owed.
//   * FULL payment: the amount is the whole balance. The box shows it, greyed out and NOT editable.
//   * PARTIAL payment: the box starts blank and is editable; the amount must be more than 0 and LESS than the balance.
//   * A settled record (nothing owed) takes no payment.
// Money is compared in whole cents, so 100.10 against 100.11 is never a rounding accident. The server applies the same rules (422) as the final check.
export const cents = (v) => Math.round(Number(v) * 100);
export const round2 = (v) => Math.round(Number(v) * 100) / 100;
const fmt = (c) => `KSh ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const PAYMENT_TABS = [{ key: 'full', label: 'Full payment' }, { key: 'partial', label: 'Partial payment' }];

/** Full: the amount box is greyed out and cannot be edited. Partial: editable. */
export const isAmountLocked = (type) => type === 'full';

/** What the amount box holds when the type is chosen: the whole balance for Full (locked), blank for Partial. */
export function defaultAmount(type, balance) {
  return type === 'full' ? String(round2(balance)) : '';
}

/** The line under the amount box. */
export function amountHint(type, balance) {
  const b = cents(balance);
  return type === 'full' ? `Full payment settles the whole balance of ${fmt(b)}.` : `Enter less than ${fmt(b)}.`;
}

/** The amount that will be saved: for Full always the exact balance (whatever is in the box), for Partial what was typed. */
export function amountToSave(type, typed, balance) {
  return type === 'full' ? round2(balance) : Number(typed);
}

/** { ok, message }. message is null when ok, or when nothing has been typed yet on Partial (the button is simply disabled). */
export function validatePayment(type, typed, balance) {
  const b = cents(balance);
  if (!(b > 0)) return { ok: false, message: 'Nothing is owed on this record: it is already settled.' };
  if (type === 'full') return { ok: true, message: null };
  if (typed === '' || typed == null) return { ok: false, message: null };
  const a = cents(typed);
  if (!Number.isFinite(a) || !(a > 0)) return { ok: false, message: 'Enter an amount greater than zero.' };
  if (a >= b) return { ok: false, message: `Enter less than ${fmt(b)}. To pay it all, choose Full payment.` };
  return { ok: true, message: null };
}

/** The same rules for the offline store (Smart Bizna): an error text or null. Full must EQUAL the balance; Partial is above 0 and below it; nothing exceeds it. */
export function paymentError(type, amount, balance) {
  const a = cents(amount); const b = cents(balance);
  if (!(a > 0)) return 'Enter a payment amount greater than zero.';
  if (a > b) return `The payment cannot be more than the balance of ${fmt(b)}.`;
  if (type === 'full' && a !== b) return `A full payment must be exactly the balance of ${fmt(b)}. Use a partial payment for less.`;
  if (type === 'partial' && a >= b) return `A partial payment must be less than the balance of ${fmt(b)}. Use a full payment to settle it.`;
  return null;
}
