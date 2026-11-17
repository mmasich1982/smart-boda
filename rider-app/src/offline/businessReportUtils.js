// rider-app/src/offline/businessReportUtils.js
// SMART BIZNA: the ONE place the phone works out business money (the server twin is backend/app/services/business_net_profit_service.py).
// Every Owner screen (Daily Trade Summary, Financial Performance, Financial History, statements, Home totals) calls these pure functions,
// so the figures can never disagree. Tests feed this file and the server the SAME data and compare the answers.
//
//   Net Profit = Sales/Services Income - (Purchases + Expenses)
//   * Income = CASH, M-PESA and CARD sales on the day they were made, plus Lipa Later money ONLY on the day each payment is received.
//     A Lipa Later sale is a receivable, not income (but it is still a sale made).
//   * The same rule for PURCHASES (v48): a Lipa Later purchase is owed, not a cost, until the supplier is paid. It still counts as a purchase made, but only
//     the PAYMENTS MADE count as a purchase cost, on the day each is paid. Cash, M-Pesa and Card purchases count on the day recorded.
//   * Voided records are left out of EVERY figure. Corrected records count with their corrected values.
//   * A day runs midnight to midnight in East Africa Time (UTC+3). All arithmetic is in whole cents.
import { sha256Hex } from './sha256';

export const EAT_MS = 3 * 3600 * 1000;
const DAY = 86400000;
export const METHODS = ['CASH', 'MPESA', 'CARD', 'LIPA_LATER'];
export const METHOD_LABEL = { CASH: 'Cash', MPESA: 'M-Pesa', CARD: 'Card', LIPA_LATER: 'Lipa Later' };
export const CORRECTION_WINDOW_HOURS = 24;
export const RETENTION_MONTHS = 6;

/** Whole cents, rounding half up exactly like the server (Decimal ROUND_HALF_UP). */
export const cents = (v) => Math.round(parseFloat((Number(v || 0) * 100).toPrecision(15)));
export const money = (c) => c / 100;
export const toMs = (v) => (typeof v === 'number' ? v : new Date(v).getTime());

const eatDayStart = (ms) => Math.floor((ms + EAT_MS) / DAY) * DAY - EAT_MS;
export const eatDateString = (ms) => new Date(ms + EAT_MS).toISOString().slice(0, 10);
const dayFromString = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) - EAT_MS; };

/** [start, end) in ms for 'today' | 'week' (Monday to now) | 'month' (1st to now) | 'yesterday', in EAT. */
export function periodBounds(period, nowMs = Date.now()) {
  const today = eatDayStart(nowMs), end = today + DAY;
  if (period === 'today') return [today, end];
  if (period === 'yesterday') return [today - DAY, today];
  if (period === 'week') { const wd = (Math.floor((nowMs + EAT_MS) / DAY) + 3) % 7; return [today - wd * DAY, end]; }
  if (period === 'month') { const d = new Date(nowMs + EAT_MS); return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - EAT_MS, end]; }
  throw new Error('period must be today, yesterday, week or month');
}

/** The quick selects of Financial History: thisMonth | lastMonth | last3 | last6 | sinceJoining (since joining = the six months kept on the phone). */
export function quickRange(key, nowMs = Date.now()) {
  const d = new Date(nowMs + EAT_MS), y = d.getUTCFullYear(), m = d.getUTCMonth(), end = eatDayStart(nowMs) + DAY;
  const first = (yy, mm) => Date.UTC(yy, mm, 1) - EAT_MS;
  if (key === 'thisMonth') return [first(y, m), end];
  if (key === 'lastMonth') return [first(y, m - 1), first(y, m)];
  if (key === 'last3') return [first(y, m - 2), end];
  if (key === 'last6' || key === 'sinceJoining') return [retentionCutoffMs(nowMs), end];
  throw new Error('unknown range');
}

export const rangeBounds = (fromStr, toStr) => [dayFromString(fromStr), dayFromString(toStr) + DAY];

/** The start of the six months kept on the phone: six calendar months before today (EAT), clamped to the month's last day. */
export function retentionCutoffMs(nowMs = Date.now()) {
  const d = new Date(nowMs + EAT_MS);
  let y = d.getUTCFullYear(), m = d.getUTCMonth() - RETENTION_MONTHS;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last)) - EAT_MS;
}

/** Whole-number percentages that add up to exactly 100 (or all 0 when the total is 0). Same tie-break as the server. */
export function largestRemainder(values, total) {
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v * 100) / total), out = raw.map(Math.floor);
  const order = raw.map((r, i) => i).sort((a, b) => (raw[b] - out[b]) - (raw[a] - out[a]) || a - b);
  order.slice(0, 100 - out.reduce((s, x) => s + x, 0)).forEach((i) => { out[i] += 1; });
  return out;
}

const live = (r) => r.status !== 'voided';
const collapse = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).join(' ');

/**
 * records:  {id, kind: SALE|PURCHASE|EXPENSE, user_id, total, payment_method, status, trading_at, details}
 * payments: {record_id, amount, received_by, trading_at}      users: {id, full_name, role}  (everyone listed even with no activity)
 * supplierPayments: what the business paid suppliers {record_id = the purchase, amount, received_by = who paid, trading_at}
 */
export function compute(records, payments, startMs, endMs, users = [], supplierPayments = []) {
  const liveIds = new Set(records.filter(live).map((r) => String(r.id)));
  const inRng = (t) => { const x = toMs(t); return x >= startMs && x < endMs; };
  const by = {}; METHODS.forEach((m) => { by[m] = { count: 0, cents: 0 }; });
  let purchases = 0, expenses = 0, salesMade = 0;
  const person = {};
  users.forEach((u) => { person[String(u.id)] = { user_id: String(u.id), full_name: u.full_name ?? null, role: u.role ?? null, income: 0, sales_count: 0, costs: 0 }; });
  const P = (id) => person[String(id)] || (person[String(id)] = { user_id: String(id), full_name: null, role: null, income: 0, sales_count: 0, costs: 0 });
  const expGroups = new Map();
  records.forEach((r) => {
    if (!live(r) || !inRng(r.trading_at)) return;
    const c = cents(r.total);
    if (r.kind === 'SALE') {
      salesMade += 1; P(r.user_id).sales_count += 1;
      if (['CASH', 'MPESA', 'CARD'].includes(r.payment_method)) { by[r.payment_method].count += 1; by[r.payment_method].cents += c; P(r.user_id).income += c; }
    } else if (r.kind === 'PURCHASE') { if (r.payment_method !== 'LIPA_LATER') { purchases += c; P(r.user_id).costs += c; } }   // a Lipa Later purchase is owed, not a cost, until paid
    else if (r.kind === 'EXPENSE') {
      expenses += c; P(r.user_id).costs += c;
      const key = collapse(r.details).toLowerCase() || 'other';
      if (!expGroups.has(key)) expGroups.set(key, { label: collapse(r.details) || 'Other', cents: 0 });
      expGroups.get(key).cents += c;
    }
  });
  payments.forEach((p) => {
    if (liveIds.has(String(p.record_id)) && inRng(p.trading_at)) {
      const c = cents(p.amount);
      by.LIPA_LATER.count += 1; by.LIPA_LATER.cents += c; P(p.received_by).income += c;
    }
  });
  supplierPayments.forEach((p) => {                                  // money actually paid out to suppliers: counts on the day it is paid
    if (liveIds.has(String(p.record_id)) && inRng(p.trading_at)) { const c = cents(p.amount); purchases += c; P(p.received_by).costs += c; }
  });
  const income = METHODS.reduce((s, m) => s + by[m].cents, 0);
  const net = income - (purchases + expenses);
  const pcts = largestRemainder(METHODS.map((m) => by[m].cents), income);
  const lines = (purchases ? [{ label: 'Purchases', cents: purchases }] : [])
    .concat([...expGroups.values()].sort((a, b) => (b.cents - a.cents) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)));
  const cp = largestRemainder(lines.map((l) => l.cents), purchases + expenses);
  return {
    income: money(income), purchases: money(purchases), expenses: money(expenses), net_profit: money(net), sales_made: salesMade,
    by_payment_method: METHODS.map((m, i) => ({ method: m, label: METHOD_LABEL[m], count: by[m].count, amount: money(by[m].cents), percent: pcts[i] })),
    total_received: money(income),
    cost_breakdown: lines.map((l, i) => ({ label: l.label, amount: money(l.cents), percent: cp[i] })),
    by_person: Object.values(person).map((v) => ({ ...v, income: money(v.income), costs: money(v.costs) })),
  };
}

/** The verification code printed on a statement: SHA-256 over business, period and the four totals in whole cents, as XXXX-XXXX-XXXX. */
export function statementCode(businessId, dateFrom, dateTo, totals) {
  const s = ['SBZ1', businessId, dateFrom, dateTo, cents(totals.income), cents(totals.purchases), cents(totals.expenses), cents(totals.net_profit)].join('|');
  const h = sha256Hex(s).slice(0, 12).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

/** A record can be corrected or voided for 24 hours from when it was made (the same rule as rider trips). `actedMs` defaults to now. */
export const withinCorrectionWindow = (madeAt, actedMs = Date.now(), hours = CORRECTION_WINDOW_HOURS) => toMs(actedMs) - toMs(madeAt) < hours * 3600000;

// -------------------------------------------------------------------------------------------------- Lipa Later (phone side)
/** What the customer still owes, from the sale total and the payments recorded against it. */
export const lipaBalance = (total, payments) => money(Math.max(0, cents(total) - payments.reduce((s, p) => s + cents(p.amount), 0)));

/** v46 ageing buckets from the due date (YYYY-MM-DD) and today's date in EAT. */
export function ageingBucket(dueDate, nowMs = Date.now()) {
  const days = Math.floor((dayFromString(eatDateString(nowMs)) - dayFromString(dueDate)) / DAY);
  if (days < 0) return 'upcoming';
  if (days === 0) return 'due-today';
  if (days <= 30) return 'overdue-30';
  if (days <= 60) return 'overdue-60';
  if (days <= 90) return 'overdue-90';
  return 'overdue-90plus';
}
export const daysOverdue = (dueDate, nowMs = Date.now()) => Math.floor((dayFromString(eatDateString(nowMs)) - dayFromString(dueDate)) / DAY);

/** Payment checks shared by Record Payment: Full must cover the balance, Partial must be below it. Returns an error text or null. */
export function paymentError(type, amount, balance) {
  const a = cents(amount), b = cents(balance);
  if (!(a > 0)) return 'Enter a payment amount greater than zero.';
  if (type === 'full' && a < b) return `Full payment must be at least KSh ${money(b).toLocaleString()} (remaining balance).`;
  if (type === 'partial' && a >= b) return `Partial payment must be less than KSh ${money(b).toLocaleString()} (remaining).`;
  return null;
}
