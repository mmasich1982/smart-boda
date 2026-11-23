// rider-app/src/offline/businessStore.js
// SMART BIZNA offline store: EVERY business record is saved here first, on the phone (offline first), shown at once, queued for the
// server, and sent by the sync orchestrator when there is a connection. Nothing a user types is lost to a bad network.
//
// This file is deliberately free of React Native imports: its four outside needs are injected (see createBusinessStore), so the whole
// store is tested in plain Jest with an in-memory key-value map. businessRepository.js wires it to IndexedDB, the sync queue and the clock.
//
// END-OF-DAY CLOSE (architecture): lines (sales, purchases, expenses and their payments) stay on the phone only until the end of THEIR day. Then one daily summary is
// made (offline/businessDaily.js), the lines are deleted, and only the summary is kept (3 months here, 1 year on the server). Open Lipa Later records and their payments
// are the exception: they are money still owed, so they stay in full until settled. Only credit records and the daily summaries are sent to the server, never the lines.
//
// Local record shapes use the SERVER's snake_case names, so a record that comes back from the server merges in without translation:
//   sale     {client_id, kind:'SALE', items, total, payment_method, trading_at, status, version, recorded_by, customer_name,
//             customer_phone, due_date}
//   purchase {client_id, kind:'PURCHASE', items, total, payment_method (Cash, M-Pesa, Card, Lipa Later), ...; a Lipa Later purchase also has supplier_name,
//             supplier_phone, due_date. It is OWED, not a cost, until paid: each payment made to the supplier is the cost}
//   expense  {client_id, kind:'EXPENSE', details, total, ...}
//   payment  {client_id, sale_client_id, amount, pay_type, notes, received_by, trading_at}   (Lipa Later: the business's own server tables, the rider's rules)
//   supplierPayment {client_id, purchase_client_id, amount, pay_type, notes, received_by (= who paid the supplier), trading_at}
import { KENYA_MSISDN, cleanMobile } from '../utils/setupProfileLogic';
import * as R from './businessReportUtils';
import * as D from './businessDaily';

// MULTIPLE BUSINESSES + DATA ISOLATION: a store belongs to ONE business. Every key it uses carries that business's id (`biz_data_v1:<business_id>`),
// so there is no shared "current data" anywhere on the phone to read or write by mistake. A store cannot even be created without a business id.
// The old single-business keys (no id) are only ever read by the one-time migration in businessRegistry.js.
const DATA_KEY = 'biz_data_v1';
const PROFILE_KEY = 'biz_profile_v1';
const STMT_KEY = 'biz_statements_v1';
const REQ_KEY = 'biz_statement_requests_v1';
const KINDS = { SALE: 'sales', PURCHASE: 'purchases', EXPENSE: 'expenses' };
export const VOID_REASONS = ['Entered by mistake', 'Wrong amount', 'Customer cancelled', 'Duplicate', 'Other'];   // prototype v46 list

export const LEGACY_KEYS = { data: DATA_KEY, profile: PROFILE_KEY, statements: STMT_KEY, requests: REQ_KEY };
export const scopedKey = (base, businessId) => `${base}:${businessId}`;
export const DRAFT_KEY = 'biz_draft_v1';          // + ':<business_id>:<name>'  (a half-entered sale / purchase / expense stays with its own business)

export class BusinessRuleError extends Error {
  constructor(code, message) { super(message); this.code = code; this.isBusinessRule = true; }
}
const rule = (code, message) => { throw new BusinessRuleError(code, message); };

// daily: the DAILY SUMMARIES, keyed `${user_id}|${YYYY-MM-DD}`: this person's own closed days and (for the Owner) the other people's, pulled from the server.
const emptyData = () => ({ sales: [], purchases: [], expenses: [], payments: [], supplierPayments: [], users: [], daily: {}, meta: { snapshotSince: null, mineSince: null } });
const rid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * @param {{kv:{get:Function,set:Function}, enqueue:(item:object)=>Promise<any>, now?:()=>number,
 *          identity:()=>Promise<{rider_id:string}>, businessId:string}} deps   businessId is REQUIRED: there is no default business.
 */
export function createBusinessStore({ kv, enqueue, now = () => Date.now(), identity, businessId }) {
  if (typeof businessId !== 'string' || !businessId.trim()) rule('NO_BUSINESS', 'No business was chosen, so nothing was opened.');   // fail closed
  const BID = businessId.trim().toLowerCase();
  const K = (base) => scopedKey(base, BID);
  const read = async (key, fallback) => { const v = await kv.get(key); if (v == null) return fallback; return typeof v === 'string' ? JSON.parse(v) : v; };
  const write = (key, value) => kv.set(key, JSON.stringify(value));
  const getData = async () => { const d = { ...emptyData(), ...(await read(K(DATA_KEY), emptyData())) }; if (!d.daily) d.daily = {}; return d; };
  const saveData = (d) => write(K(DATA_KEY), d);

  // ---------------------------------------------------------------------------------------------- profile (who am I, what may I see)
  const getProfile = async () => {
    const p = await read(K(PROFILE_KEY), null);
    if (p && p.business_id && String(p.business_id).toLowerCase() !== BID) rule('BUSINESS_MISMATCH', 'The saved profile belongs to a different business and was not used.');
    return p;
  };
  async function saveProfile(me) {
    if (!me || (me.business_id != null && String(me.business_id).trim().toLowerCase() !== BID)) rule('BUSINESS_MISMATCH', 'This profile is for a different business and was not saved.');   // never file B's profile under A (a partial update that names no business merges into this one)
    const old = await getProfile();
    const next = { ...(old || {}), ...me, business_id: (me.business_id != null ? String(me.business_id).trim().toLowerCase() : (old && old.business_id)) || undefined, fetchedAt: now() };
    const changed = !old || ['role', 'business_id', 'business_name', 'active', 'can_see_purchases', 'can_see_expenses', 'business_type_code', 'business_type_name']
      .some((k) => old[k] !== next[k]);
    await write(K(PROFILE_KEY), next);
    return { changed, profile: next };
  }
  const isOwner = (p) => !!p && p.role === 'OWNER';
  const canSee = (p, kind) => !!p && p.active !== false && (kind === 'SALE' || isOwner(p) || (kind === 'PURCHASE' ? !!p.can_see_purchases : !!p.can_see_expenses));

  async function ctx() {
    const p = await getProfile();
    if (!p || !p.business_id) rule('NO_PROFILE', 'Your business profile has not loaded yet. Connect to the internet once.');
    if (p.active === false) rule('ACCOUNT_INACTIVE', 'This account has been switched off by the Administrator.');
    const id = await identity();
    return { p, riderId: id.rider_id, me: { user_id: p.business_user_id, name: p.full_name, role: p.role } };
  }

  async function queue(type, endpoint, data, priority) {
    const { p, riderId } = await ctx();
    const id = `${type}_${data.client_id}`;
    try {
      await enqueue({ id, type, endpoint, data: { rider_id: riderId, business_id: p.business_id, ...data }, riderId, priority, timestamp: new Date(now()).toISOString() });
      return true;
    } catch { return false; /* offline first: the record is already saved; the orchestrator re-checks the queue */ }
  }

  // ---------------------------------------------------------------------------------------------- daily summaries (what is sent to the server instead of the lines)
  const todayStr = () => R.eatDateString(now());
  const isCredit = (r) => !!r && (r.kind === 'SALE' || r.kind === 'PURCHASE') && r.payment_method === 'LIPA_LATER';   // owed money: still sent line by line, until settled
  const queueSummary = (s) => queue('business_daily_summary', '/business/daily-summaries', { client_id: `${BID}:${s.user_id}:${s.day}`, day: s.day, final: !!s.final, summary: s }, 'normal');

  /** This person's own lines as inputs for a summary. Other people's records are kept only as "ghosts" (outside every range) so a payment the Owner takes on a
   *  staff sale still finds its sale; they are never counted here: each person's own phone summarises their own lines. */
  function ownInputsFrom(d, p) {
    const me = p && p.business_user_id;
    const sale = (r) => ({ id: r.client_id, kind: r.kind, user_id: r.recorded_by && r.recorded_by.user_id, total: r.total, payment_method: r.payment_method || null, status: r.status, trading_at: r.trading_at, details: r.details || null });
    const all = [];
    ['sales', 'purchases', 'expenses'].forEach((k) => d[k].forEach((r) => all.push(sale(r))));
    const mineRec = all.filter((r) => r.user_id === me);
    const records = all.map((r) => (r.user_id === me ? r : { ...r, trading_at: 0 }));
    const mine = (x) => (x.received_by && x.received_by.user_id) === me;
    const payments = d.payments.filter(mine).map((x) => ({ record_id: x.sale_client_id, amount: x.amount, received_by: me, trading_at: x.trading_at }));
    const supplierPayments = (d.supplierPayments || []).filter(mine).map((x) => ({ record_id: x.purchase_client_id, amount: x.amount, received_by: me, trading_at: x.trading_at }));
    return { me, records, ownRecords: mineRec, payments, supplierPayments, users: p ? [{ id: me, full_name: p.full_name, role: p.role }] : [] };
  }
  const ownSummary = (day, o, final) => D.summarizeDay(day, o, { user_id: o.me, business_id: BID, final });

  /** Today's running summary, sent to the server in place of the lines (a newer one replaces the older one still waiting in the queue). */
  async function pushToday() {
    const p = await getProfile(); if (!p || !p.business_user_id) return;
    const o = ownInputsFrom(await getData(), p);
    await queueSummary(ownSummary(todayStr(), o, false));
  }

  /** Every summary inside [startMs, endMs): other people's (pulled) and this person's own: the stored one for a closed day, live from today's lines for today
   *  and for any past day not yet closed. */
  async function summariesInRange(startMs, endMs, { onlyMine = false } = {}) {
    const [p, d] = [await getProfile(), await getData()];
    if (!p) return [];
    const o = ownInputsFrom(d, p); const today = todayStr();
    const inRange = (day) => { const a = D.dayBounds(day)[0]; return a >= startMs && a < endMs; };
    const out = [];
    Object.values(d.daily).forEach((s) => { if (s.user_id !== o.me && !onlyMine && inRange(s.day)) out.push(s); });
    const days = new Set(Object.values(d.daily).filter((s) => s.user_id === o.me).map((s) => s.day));
    o.ownRecords.forEach((r) => days.add(D.dayOf(r.trading_at)));
    o.payments.concat(o.supplierPayments).forEach((x) => days.add(D.dayOf(x.trading_at)));
    days.add(today);
    [...days].sort().forEach((day) => {
      if (!inRange(day)) return;
      const stored = d.daily[`${o.me}|${day}`];
      if (day !== today && stored) out.push(stored); else out.push(ownSummary(day, o, false));
    });
    return out;
  }

  // ---------------------------------------------------------------------------------------------- recording
  const cleanItems = (items) => (items || []).map((i) => ({ label: String(i.label || '').slice(0, 60), amount: Math.round(Number(i.amount) * 100) / 100 }));

  async function recordSale({ items, paymentMethod, customerName, customerPhone, dueDate, clientId }) {
    const { me } = await ctx();
    const its = cleanItems(items);
    const total = R.money(its.reduce((s, i) => s + R.cents(i.amount), 0));
    if (!its.length || !(total > 0)) rule('NO_AMOUNT', 'Please enter the sale/service amount first.');
    const pm = String(paymentMethod || '').toUpperCase();
    if (!R.METHODS.includes(pm)) rule('BAD_METHOD', 'Choose Cash, M-Pesa, Card or Lipa Later.');
    const rec = { client_id: clientId || rid('sale'), kind: 'SALE', items: its, total, payment_method: pm, trading_at: new Date(now()).toISOString(), status: 'active',
      version: 1, recorded_by: me, local: true };
    if (pm === 'LIPA_LATER') {
      const name = String(customerName || '').trim().replace(/\s+/g, ' ');
      const phone = cleanMobile(customerPhone);
      if (name.length < 2) rule('NO_CUSTOMER', "Enter the customer's name.");
      if (!KENYA_MSISDN.test(phone)) rule('BAD_PHONE', 'Enter a valid Kenyan mobile number.');
      if (!dueDate || dueDate <= R.eatDateString(now())) rule('BAD_DUE', 'Due date must be after today. Lipa Later is for future payment.');
      Object.assign(rec, { customer_name: name, customer_phone: phone, due_date: dueDate });
    }
    const d = await getData(); d.sales.push(rec); await saveData(d);
    if (isCredit(rec)) await queue('sale_service_entry', '/business/sales', { client_id: rec.client_id, items: rec.items, total, payment_method: pm, trading_at: rec.trading_at,
      customer_name: rec.customer_name, customer_phone: rec.customer_phone, due_date: rec.due_date }, 'high');      // owed money is sent as a record; every other sale goes to the server only inside the daily summary
    await pushToday();
    return rec;
  }

  async function recordPurchase({ items, paymentMethod, supplierName, supplierPhone, dueDate, clientId }) {
    const { p, me } = await ctx();
    if (!canSee(p, 'PURCHASE')) rule('TILE_NOT_ALLOWED', 'The Administrator has not allowed Business Purchases for you.');
    const its = cleanItems(items);
    const total = R.money(its.reduce((s, i) => s + R.cents(i.amount), 0));
    if (!its.length || its.some((i) => !(i.amount > 0)) || !(total > 0)) rule('NO_AMOUNT', 'Please enter the purchase amount first.');
    const pm = String(paymentMethod || 'CASH').toUpperCase();
    if (!R.METHODS.includes(pm)) rule('BAD_METHOD', 'Choose Cash, M-Pesa, Card or Lipa Later.');
    const rec = { client_id: clientId || rid('purch'), kind: 'PURCHASE', items: its, total, payment_method: pm, trading_at: new Date(now()).toISOString(), status: 'active',
      version: 1, recorded_by: me, local: true };
    if (pm === 'LIPA_LATER') {                                 // what the business owes a supplier: the supplier's details are needed (Lipa Later Details)
      const name = String(supplierName || '').trim().replace(/\s+/g, ' ');
      const phone = cleanMobile(supplierPhone);
      if (name.length < 2) rule('NO_SUPPLIER', "Enter the supplier's name.");
      if (!KENYA_MSISDN.test(phone)) rule('BAD_PHONE', 'Enter a valid Kenyan mobile number.');
      if (!dueDate || dueDate <= R.eatDateString(now())) rule('BAD_DUE', 'Due date must be after today. Lipa Later is for future payment.');
      Object.assign(rec, { supplier_name: name, supplier_phone: phone, due_date: dueDate });
    }
    const d = await getData(); d.purchases.push(rec); await saveData(d);
    if (isCredit(rec)) await queue('purchase_entry', '/business/purchases', { client_id: rec.client_id, items: its, total, payment_method: pm, trading_at: rec.trading_at,
      supplier_name: rec.supplier_name, supplier_phone: rec.supplier_phone, due_date: rec.due_date }, 'high');
    await pushToday();
    return rec;
  }

  async function recordExpense({ details, amount, clientId }) {
    const { p, me } = await ctx();
    if (!canSee(p, 'EXPENSE')) rule('TILE_NOT_ALLOWED', 'The Administrator has not allowed Business Expenses for you.');
    const det = String(details || '').trim().replace(/\s+/g, ' ');
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!det || !(amt > 0)) rule('NO_AMOUNT', 'Please enter the expense details and amount.');
    const rec = { client_id: clientId || rid('exp'), kind: 'EXPENSE', details: det, total: amt, items: [{ label: det, amount: amt }], trading_at: new Date(now()).toISOString(),
      status: 'active', version: 1, recorded_by: me, local: true };
    const d = await getData(); d.expenses.push(rec); await saveData(d);
    await pushToday();                                           // expenses are sent only inside the daily summary
    return rec;
  }

  // ---------------------------------------------------------------------------------------------- reading (always from the phone)
  const mineOnly = (p, r) => isOwner(p) || (r.recorded_by && r.recorded_by.user_id === p.business_user_id);

  /** Records the signed-in person may see, newest first. Owner: all (with who recorded). Others: their own, and only kinds they are allowed. */
  async function listRecords(kind, range) {
    const [p, d] = [await getProfile(), await getData()];
    if (!p || !canSee(p, kind)) return [];
    const [a, z] = range || [0, Infinity];
    return d[KINDS[kind]].filter((r) => mineOnly(p, r)).filter((r) => { const t = R.toMs(r.trading_at); return t >= a && t < z; })
      .sort((x, y) => R.toMs(y.trading_at) - R.toMs(x.trading_at));
  }

  const paymentsOf = (d, saleClientId) => d.payments.filter((x) => x.sale_client_id === saleClientId);

  /** Money inputs for the shared report functions. Owner: the whole business. Others never call this (reports are Owner-only). */
  async function reportInputs() {
    const [p, d] = [await getProfile(), await getData()];
    const saleIds = new Map();
    const records = [];
    ['sales', 'purchases', 'expenses'].forEach((k) => d[k].forEach((r) => {
      saleIds.set(r.client_id, r.client_id);
      records.push({ id: r.client_id, kind: r.kind, user_id: r.recorded_by && r.recorded_by.user_id, total: r.total, payment_method: r.payment_method || null,
        status: r.status, trading_at: r.trading_at, details: r.details || null });
    }));
    const payments = d.payments.map((x) => ({ record_id: x.sale_client_id, amount: x.amount, received_by: x.received_by && x.received_by.user_id, trading_at: x.trading_at }));
    const supplierPayments = (d.supplierPayments || []).map((x) => ({ record_id: x.purchase_client_id, amount: x.amount, received_by: x.received_by && x.received_by.user_id, trading_at: x.trading_at }));
    const users = d.users.length ? d.users.map((u) => ({ id: u.user_id, full_name: u.name, role: u.role }))
      : (p ? [{ id: p.business_user_id, full_name: p.full_name, role: p.role }] : []);
    return { records, payments, supplierPayments, users, businessId: p && p.business_id };
  }

  /** Totals for any period: the daily summaries inside it (closed days) plus today's own lines. Same shape as before, so every report screen is unchanged. */
  const report = async (startMs, endMs) => { const i = await reportInputs(); return D.mergeSummaries(await summariesInRange(startMs, endMs), i.users); };

  /** The signed-in person's own totals for a period (Home shows a Sales/Service Person only their own). */
  async function myTotals(startMs, endMs) {
    const p = await getProfile();
    if (!p) return null;
    return D.mergeSummaries(await summariesInRange(startMs, endMs, { onlyMine: true }), []);
  }

  /** Home: today's Sales/Service total (Owner: whole business; others: own) and the number of sales. */
  async function homeToday() {
    const p = await getProfile();
    const [a, z] = R.periodBounds('today', now());
    const t = isOwner(p) ? await report(a, z) : await myTotals(a, z);
    return { income: t ? t.income : 0, sales: t ? t.sales_made : 0 };
  }

  // ---------------------------------------------------------------------------------------------- Lipa Later (the rider app's logic, on the phone)
  async function lipaCustomers({ includeSettled = false } = {}) {
    const [p, d] = [await getProfile(), await getData()];
    return d.sales.filter((s) => s.payment_method === 'LIPA_LATER' && s.status !== 'voided' && mineOnly(p, s)).map((s) => {
      const pays = paymentsOf(d, s.client_id);
      const balance = R.lipaBalance(s.total, pays);
      return { sale: s, payments: pays, paid: R.money(R.cents(s.total) - R.cents(balance)), balance, bucket: R.ageingBucket(s.due_date, now()),
        days_overdue: R.daysOverdue(s.due_date, now()) };
    }).filter((x) => includeSettled || x.balance > 0).sort((a, b) => (a.sale.due_date < b.sale.due_date ? -1 : a.sale.due_date > b.sale.due_date ? 1 : 0));
  }

  async function recordLipaPayment({ saleClientId, type, amount, notes, clientId }) {
    const { p, me } = await ctx();
    const d = await getData();
    const sale = d.sales.find((s) => s.client_id === saleClientId && s.payment_method === 'LIPA_LATER');
    if (!sale || sale.status === 'voided') rule('NOT_FOUND', 'This Lipa Later sale was not found.');
    if (!mineOnly(p, sale)) rule('NOT_YOURS', 'You can only take payments on your own Lipa Later sales.');
    const balance = R.lipaBalance(sale.total, paymentsOf(d, saleClientId));
    if (balance <= 0) rule('SETTLED', 'This sale is already settled.');
    const err = R.paymentError(type, amount, balance);
    if (err) rule('BAD_PAYMENT', err);
    const pay = { client_id: clientId || rid('pay'), sale_client_id: saleClientId, amount: Math.round(Number(amount) * 100) / 100,
      pay_type: type, notes: String(notes || '').trim(), received_by: me, trading_at: new Date(now()).toISOString(), local: true };
    d.payments.push(pay); await saveData(d);
    // The business's own server route. The payment names its sale by the sale's client id, so it does not matter which of the two reaches the
    // server first: if the payment arrives before its sale, the server answers "not found" and the queue simply tries again.
    await queue('business_lipa_payment', '/business/lipa-later/payments',
      { client_id: pay.client_id, sale_client_id: saleClientId, pay_type: type, amount: pay.amount, notes: pay.notes, paid_at: pay.trading_at }, 'high');
    await pushToday();
    return { payment: pay, balance: R.lipaBalance(sale.total, paymentsOf(await getData(), saleClientId)) };
  }

  // ---------------------------------------------------------------------------------------------- Lipa Later for SUPPLIERS (what the business owes)
  // The same rules as customers, the other way round. A Lipa Later purchase is OWED, not a cost, until the supplier is paid; each payment is the cost.
  const supplierPaymentsOf = (d, purchaseClientId) => (d.supplierPayments || []).filter((x) => x.purchase_client_id === purchaseClientId);

  async function supplierLipaList({ includeSettled = false } = {}) {
    const [p, d] = [await getProfile(), await getData()];
    if (!p || !canSee(p, 'PURCHASE')) return [];
    return d.purchases.filter((r) => r.payment_method === 'LIPA_LATER' && r.status !== 'voided' && mineOnly(p, r)).map((r) => {
      const pays = supplierPaymentsOf(d, r.client_id);
      const balance = R.lipaBalance(r.total, pays);
      return { purchase: r, payments: pays, paid: R.money(R.cents(r.total) - R.cents(balance)), balance, bucket: R.ageingBucket(r.due_date, now()),
        days_overdue: R.daysOverdue(r.due_date, now()) };
    }).filter((x) => includeSettled || x.balance > 0).sort((a, b) => (a.purchase.due_date < b.purchase.due_date ? -1 : a.purchase.due_date > b.purchase.due_date ? 1 : 0));
  }

  async function recordSupplierPayment({ purchaseClientId, type, amount, notes, clientId }) {
    const { p, me } = await ctx();
    if (!canSee(p, 'PURCHASE')) rule('TILE_NOT_ALLOWED', 'The Administrator has not allowed Business Purchases for you.');
    const d = await getData();
    const purchase = d.purchases.find((r) => r.client_id === purchaseClientId && r.payment_method === 'LIPA_LATER');
    if (!purchase || purchase.status === 'voided') rule('NOT_FOUND', 'This Lipa Later purchase was not found.');
    if (!mineOnly(p, purchase)) rule('NOT_YOURS', 'You can only record payments on your own Lipa Later purchases.');
    const balance = R.lipaBalance(purchase.total, supplierPaymentsOf(d, purchaseClientId));
    if (balance <= 0) rule('SETTLED', 'This supplier is already fully paid.');
    const err = R.paymentError(type, amount, balance);
    if (err) rule('BAD_PAYMENT', err);
    const pay = { client_id: clientId || rid('spay'), purchase_client_id: purchaseClientId, amount: Math.round(Number(amount) * 100) / 100, pay_type: type,
      notes: String(notes || '').trim(), received_by: me, trading_at: new Date(now()).toISOString(), local: true };
    d.supplierPayments = (d.supplierPayments || []).concat([pay]); await saveData(d);
    await queue('supplier_lipa_payment', '/business/lipa-later/supplier-payments',
      { client_id: pay.client_id, purchase_client_id: purchaseClientId, pay_type: type, amount: pay.amount, notes: pay.notes, paid_at: pay.trading_at }, 'high');
    await pushToday();
    return { payment: pay, balance: R.lipaBalance(purchase.total, supplierPaymentsOf(await getData(), purchaseClientId)) };
  }

  /** Purchase History's "Total Spent (paid)": cash/M-Pesa/Card purchases plus the supplier payments made in the range (from the daily summaries and today's lines). */
  async function purchaseSpent(range) {
    const p = await getProfile();
    if (!p || !canSee(p, 'PURCHASE')) return { total: 0, count: 0 };
    const [a, z] = range || [0, Infinity];
    const t = isOwner(p) ? await report(a, z) : await myTotals(a, z);
    return { total: t ? t.purchases : 0, count: t ? t.purchases_count : 0 };
  }

  // ---------------------------------------------------------------------------------------------- correct / void (ONLY on the day it was recorded, before the end-of-day close)
  async function findRecord(d, clientId) {
    for (const k of Object.keys(KINDS)) { const r = d[KINDS[k]].find((x) => x.client_id === clientId); if (r) return r; }
    return null;
  }

  async function canChange(rec) {
    const p = await getProfile();
    if (!p || !rec || rec.status === 'voided' || p.active === false) return false;
    if (!canSee(p, rec.kind) || !mineOnly(p, rec)) return false;
    return R.withinCorrectionWindow(rec.trading_at, now());
  }

  async function change(clientId, kindOfChange, apply) {
    const { me } = await ctx();
    const d = await getData();
    const rec = await findRecord(d, clientId);
    if (!rec) rule('NOT_FOUND', 'Record not found.');
    if (rec.status === 'voided') rule('ALREADY_VOIDED', 'A voided record cannot be changed again.');
    if (!(await canChange(rec))) rule('NOT_ALLOWED', 'This record can only be changed on the day it was recorded, and only by the person who recorded it (or the Owner).');
    const sale = (rec.kind === 'SALE' || rec.kind === 'PURCHASE') && rec.payment_method === 'LIPA_LATER';        // owed to / by the business
    const paid = !sale ? 0 : (rec.kind === 'SALE' ? paymentsOf(d, rec.client_id) : supplierPaymentsOf(d, rec.client_id)).reduce((s, x) => s + R.cents(x.amount), 0);
    const actedAt = new Date(now()).toISOString(), changeId = rid(kindOfChange === 'CORRECTED' ? 'corr' : 'void');
    const queued = apply(rec, { sale, paid });
    rec.version = (rec.version || 1) + 1;
    await saveData(d);
    return { rec, queued, changeId, actedAt };
  }

  async function correctRecord(clientId, c) {
    const out = await change(clientId, 'CORRECTED', (rec, { sale, paid }) => {
      const q = {};
      if (rec.kind === 'EXPENSE') {
        const det = c.details !== undefined ? String(c.details).trim().replace(/\s+/g, ' ') : rec.details;
        const amt = c.amount !== undefined ? Math.round(Number(c.amount) * 100) / 100 : rec.total;
        if (!det) rule('NO_AMOUNT', 'Enter the expense details.');
        if (!(amt > 0)) rule('NO_AMOUNT', 'Enter an amount above zero.');
        rec.details = det; rec.total = amt; rec.items = [{ label: det, amount: amt }]; Object.assign(q, { details: det, amount: amt });
      } else {
        if (c.amount !== undefined) {
          const amt = Math.round(Number(c.amount) * 100) / 100;
          if (!(amt > 0)) rule('NO_AMOUNT', 'Enter an amount above zero.');
          rec.items = [{ label: rec.items && rec.items[0] ? rec.items[0].label : '', amount: amt }]; rec.total = amt; q.items = rec.items;
        }
        if (c.paymentMethod !== undefined) {
          const pm = String(c.paymentMethod).toUpperCase();
          if (!R.METHODS.includes(pm)) rule('BAD_METHOD', 'That payment method is not allowed here.');
          // a purchase needs the supplier's details to go on Lipa Later, so neither a sale nor a purchase can be switched to or from it
          if ((pm === 'LIPA_LATER') !== sale) rule('BAD_METHOD', 'A record cannot be switched to or from Lipa Later. Void it and record it again.');
          rec.payment_method = pm; q.payment_method = pm;
        }
        if (sale && R.cents(rec.total) < paid) rule('BAD_AMOUNT', 'The amount cannot be lower than what has already been paid.');
      }
      rec.status = 'corrected'; rec.corrected_at = new Date(now()).toISOString();
      return q;
    });
    if (isCredit(out.rec)) await queue('record_correction', `/business/records/${encodeURIComponent(clientId)}/correct`,
      { client_id: out.changeId, record_client_id: clientId, acted_at: out.actedAt, ...out.queued }, 'high');      // only owed-money records exist on the server as records
    await pushToday();                                                                                        // every record's change reaches the server inside today's summary
    return out.rec;
  }

  async function voidRecord(clientId, reason) {
    const why = String(reason || '').trim();
    if (!why) rule('NO_REASON', 'Choose a reason.');
    const out = await change(clientId, 'VOIDED', (rec, { sale, paid }) => {
      if (sale && paid > 0) rule('HAS_PAYMENTS', 'A Lipa Later record that already has a payment cannot be voided.');
      rec.status = 'voided'; rec.void_reason = why; rec.voided_at = new Date(now()).toISOString(); return {};
    });
    if (isCredit(out.rec)) await queue('record_void', `/business/records/${encodeURIComponent(clientId)}/void`, { client_id: out.changeId, record_client_id: clientId, reason: why, acted_at: out.actedAt }, 'high');
    await pushToday();
    return out.rec;
  }

  /** Every line of the business in a range (sales +, purchases −, expenses −, Lipa Later "on credit" 0, each customer payment its own + line). */
  async function transactions(startMs, endMs, filter = 'all') {
    const d = await getData();
    const inR = (t) => { const x = R.toMs(t); return x >= startMs && x < endMs; };
    const rows = [];
    d.sales.filter((s) => inR(s.trading_at)).forEach((s) => rows.push({ type: 'SALE', sign: s.payment_method === 'LIPA_LATER' ? 0 : 1, amount: s.total, when: s.trading_at, client_id: s.client_id,
      payment_method: s.payment_method, status: s.status, details: (s.items || []).map((i) => i.label).filter(Boolean).join(', '), recorded_by: s.recorded_by, record: s }));
    d.purchases.filter((s) => inR(s.trading_at)).forEach((s) => rows.push({ type: 'PURCHASE', sign: s.payment_method === 'LIPA_LATER' ? 0 : -1, amount: s.total, when: s.trading_at, client_id: s.client_id,
      payment_method: s.payment_method, status: s.status, details: (s.items || []).map((i) => i.label).filter(Boolean).join(', '), recorded_by: s.recorded_by, record: s }));
    d.expenses.filter((s) => inR(s.trading_at)).forEach((s) => rows.push({ type: 'EXPENSE', sign: -1, amount: s.total, when: s.trading_at, client_id: s.client_id,
      status: s.status, details: s.details, recorded_by: s.recorded_by, record: s }));
    d.payments.filter((x) => inR(x.trading_at)).forEach((x) => {
      const s = d.sales.find((y) => y.client_id === x.sale_client_id);
      rows.push({ type: 'LIPA_PAYMENT', sign: 1, amount: x.amount, when: x.trading_at, client_id: x.client_id, payment_method: 'LIPA_LATER', status: s ? s.status : 'active',
        details: s ? s.customer_name : '', recorded_by: x.received_by, record: null });
    });
    (d.supplierPayments || []).filter((x) => inR(x.trading_at)).forEach((x) => {          // what the business paid a supplier: the cost, on the day it is paid
      const pu = d.purchases.find((y) => y.client_id === x.purchase_client_id);
      rows.push({ type: 'SUPPLIER_PAYMENT', sign: -1, amount: x.amount, when: x.trading_at, client_id: x.client_id, payment_method: 'LIPA_LATER', status: pu ? pu.status : 'active',
        details: pu ? pu.supplier_name : '', recorded_by: x.received_by, record: null });
    });
    rows.sort((a, b) => R.toMs(b.when) - R.toMs(a.when));
    return rows.filter((r) => filter === 'all' || (filter === 'SALE' && (r.type === 'SALE' || r.type === 'LIPA_PAYMENT')) || (filter === 'PURCHASE' && (r.type === 'PURCHASE' || r.type === 'SUPPLIER_PAYMENT')) || r.type === filter);
  }

  // ---------------------------------------------------------------------------------------------- statements (built on the phone only)
  /** A statement from the daily summaries (and today's lines). type 'summary': Month | Sales | Purchases | Expenses | Net Income. type 'detailed': one row per DAY for each
   *  month, with the month's total. Only the periods on the phone (this month and the 3 before) can be built here; older ones are requested from the Administrator. */
  async function buildStatement({ type, fromMs, toMs: toM, from, to }) {
    const p = await getProfile();
    const [a, z] = [fromMs, toM];
    if (a < R.retentionCutoffMs(now())) rule('TOO_OLD', 'This period is older than the 3 months kept on your phone. Request it from the Smart Bizna Administrator.');
    const i = await reportInputs();
    const sums = await summariesInRange(a, z);
    const totals = D.mergeSummaries(sums, i.users);
    const df = from || R.eatDateString(a), dt = to || R.eatDateString(z - 1);
    const tables = D.buildStatementTables({ type, fromDay: df, toDay: dt, summaries: sums, lastDay: todayStr() });
    return { type, business_id: p.business_id, business_name: p.business_name, business_type: p.business_type_name, date_from: df, date_to: dt,
      generated_at: new Date(now()).toISOString(), source: 'phone', totals, tables, verification_code: R.statementCode(p.business_id, df, dt, totals) };
  }
  const listStatements = async () => (await read(K(STMT_KEY), [])).sort((a, b) => b.saved_at - a.saved_at);
  async function saveStatement(st) {
    const all = await read(K(STMT_KEY), []);
    const entry = { id: rid('stmt'), saved_at: now(), type: st.type, date_from: st.date_from, date_to: st.date_to, verification_code: st.verification_code, statement: st };
    all.push(entry); await write(K(STMT_KEY), all); return entry;
  }

  const listRequests = async () => (await read(K(REQ_KEY), [])).sort((a, b) => b.requested_at - a.requested_at);
  async function requestStatement({ type, from, to, purpose, fees }) {
    const { p } = await ctx();
    if (!isOwner(p)) rule('OWNER_ONLY', 'Only the Business Owner can request a statement.');
    if (!from || !to || to < from) rule('BAD_RANGE', 'Choose a valid From and To date.');
    if (to > R.eatDateString(now())) rule('FUTURE', 'The period cannot be in the future.');
    const cutoff = R.eatDateString(R.retentionCutoffMs(now()));
    if (from >= cutoff) rule('WITHIN_WINDOW', 'This period is on your phone. Choose This Month, Last Month, Last 2 Months or Last 3 Months and generate it yourself.');
    const fee = D.statementFee(from, now(), fees);
    if (!fee.available) rule('NOT_AVAILABLE', 'Statements are kept for one year only. This period is older than that.');
    const req = { client_id: rid('stmtreq'), statement_type: type, period_from: from, period_to: to, purpose: purpose || null, status: 'queued', requested_at: now(), statement: null, fee: fee.fee };
    const all = await read(K(REQ_KEY), []); all.push(req); await write(K(REQ_KEY), all);
    await queue('business_statement_request', '/business/statement-requests', { client_id: req.client_id, statement_type: type, period_from: from, period_to: to, purpose: purpose || null, fee_ksh: req.fee }, 'normal');
    return req;
  }

  // ---------------------------------------------------------------------------------------------- merging what the server sends
  const upsert = (list, rec, keep) => {
    const i = list.findIndex((x) => x.client_id === rec.client_id);
    if (i < 0) list.push(rec);
    else if (!keep.has(rec.client_id)) list[i] = rec;                    // the server is the authority, except where this phone has a change still waiting
  };

  /** bundle = response of GET /business/snapshot (Owner) or /business/mine. `keepLocal` = client ids with a queued change. */
  async function mergeBundle(bundle, { owner, keepLocal = new Set() } = {}) {
    if (bundle && bundle.business_id && String(bundle.business_id).toLowerCase() !== BID) rule('BUSINESS_MISMATCH', 'These records belong to a different business and were not saved.');
    const d = await getData();
    (bundle.records || []).forEach((r) => {
      const list = d[KINDS[r.kind]];
      if (!list) return;
      upsert(list, { ...r, local: false }, keepLocal);
    });
    // payments: the server's copy replaces ours, but a payment still waiting in the queue is kept
    (bundle.payments || []).forEach((x) => {
      const mine = d.payments.findIndex((y) => y.client_id === x.client_id);
      if (mine < 0) d.payments.push({ ...x, local: false }); else if (!keepLocal.has(x.client_id)) d.payments[mine] = { ...x, local: false };
    });
    (bundle.supplier_payments || []).forEach((x) => {
      const list = d.supplierPayments || (d.supplierPayments = []);
      const mine = list.findIndex((y) => y.client_id === x.client_id);
      if (mine < 0) list.push({ ...x, local: false }); else if (!keepLocal.has(x.client_id)) list[mine] = { ...x, local: false };
    });
    (bundle.daily_summaries || []).forEach((s) => {                          // the daily summaries of the business (the Owner gets everyone's, others only their own)
      const key = `${s.user_id}|${s.day}`; const mineLocal = d.daily[key];
      if (mineLocal && mineLocal.queued === false) return;                  // my own closed day still waiting to be sent: mine wins
      if (!mineLocal || !mineLocal.final || !s.provisional) d.daily[key] = { ...s, queued: true };
    });
    if (bundle.users) d.users = bundle.users;
    if (bundle.server_time) {                                              // 60 seconds of overlap: merging is idempotent, so nothing is ever missed
      const since = new Date(Date.parse(bundle.server_time) - 60000).toISOString();
      if (owner) d.meta.snapshotSince = since; else d.meta.mineSince = since;
    }
    d.meta.lastPullAt = now();
    await saveData(d);
    return d;
  }

  async function applyRequests(list, readyKeep = []) {
    const local = await read(K(REQ_KEY), []);
    const merged = (list || []).map((r) => {
      const mine = local.find((x) => x.client_id === r.client_id);
      return { client_id: r.client_id, statement_type: r.statement_type, period_from: r.period_from, period_to: r.period_to, purpose: r.purpose, status: r.status,
        requested_at: mine ? mine.requested_at : Date.parse(r.requested_at), ready_at: r.ready_at ? Date.parse(r.ready_at) : null, statement: r.statement || null };
    });
    local.filter((x) => x.status === 'queued' && !merged.some((m) => m.client_id === x.client_id)).forEach((x) => merged.push(x));
    await write(K(REQ_KEY), merged);
    return merged;
  }

  /** The Total + Entries Logged cards of the History screens, for a period, from the daily summaries (Owner: whole business; others: their own). */
  async function periodTotals(kind, range) {
    const p = await getProfile();
    if (!p || !canSee(p, kind)) return { total: 0, count: 0 };
    const [a, z] = range || [0, Infinity];
    const t = isOwner(p) ? await report(a, z) : await myTotals(a, z);
    if (!t) return { total: 0, count: 0 };
    return kind === 'SALE' ? { total: t.income, count: t.sales_made } : kind === 'PURCHASE' ? { total: t.purchases, count: t.purchases_count } : { total: t.expenses, count: t.expenses_count };
  }

  /** View Transactions: today's lines (this person's own) and one row per earlier day (Sales, Purchases, Expenses, Net). The Owner's day rows cover the whole business. */
  async function transactionsView(range, filter = 'all') {
    const p = await getProfile();
    if (!p) return { today: [], days: [] };
    const [a, z] = range || [0, Infinity]; const today = todayStr(); const [ts, te] = D.dayBounds(today);
    const me = p.business_user_id;
    const lines = (a < te && z > ts) ? (await transactions(Math.max(a, ts), Math.min(z, te), filter)).filter((r) => { const rec = r.record || r; return !rec.recorded_by || rec.recorded_by.user_id === me; }) : [];
    const sums = (await summariesInRange(a, z, { onlyMine: !isOwner(p) })).filter((s) => s.day < today);
    const byDay = new Map(); sums.forEach((s) => { if (!byDay.has(s.day)) byDay.set(s.day, []); byDay.get(s.day).push(s); });
    const days = [...byDay.keys()].sort().reverse().map((day) => {
      const t = D.mergeSummaries(byDay.get(day), []);
      return { day, sales: t.income, purchases: t.purchases, expenses: t.expenses, net: t.net_profit, sales_made: t.sales_made };
    }).filter((r) => (filter === 'all' ? (r.sales || r.purchases || r.expenses || r.sales_made) : filter === 'SALE' ? (r.sales || r.sales_made) : filter === 'PURCHASE' ? r.purchases : r.expenses));
    return { today: lines, days };
  }

  // ---------------------------------------------------------------------------------------------- THE END-OF-DAY CLOSE
  /**
   * For every PAST day this person has lines for: make the daily summary (final), then delete the day's lines. Run when the app opens and at midnight (EAT), so a phone that
   * was off at midnight, or offline for days, still closes every missed day; the summaries are queued and reach the server as soon as there is a connection.
   * The summaries and the deletions are saved in ONE write, so a line is never deleted without its summary. Kept in full: owed-money (Lipa Later) records and their
   * payments until settled (and a record settled today until tomorrow, because today's payment belongs to today's figures).
   */
  async function closeDays({ nowMs = now() } = {}) {
    const p = await getProfile();
    if (!p || !p.business_user_id) return { closed: [], deleted: 0 };
    const d = await getData(); const today = R.eatDateString(nowMs); const me = p.business_user_id;
    const o = ownInputsFrom(d, p);
    const before = d.sales.length + d.purchases.length + d.expenses.length + d.payments.length + (d.supplierPayments || []).length;
    const days = new Set();
    o.ownRecords.forEach((r) => days.add(D.dayOf(r.trading_at)));
    o.payments.concat(o.supplierPayments).forEach((x) => days.add(D.dayOf(x.trading_at)));
    const closed = [];
    [...days].sort().forEach((day) => {
      if (day >= today || d.daily[`${me}|${day}`]) return;                          // today stays open; an already-closed day is never re-made
      d.daily[`${me}|${day}`] = { ...ownSummary(day, o, true), queued: false };
      closed.push(day);
    });
    const past = (t) => D.dayOf(t) < today;
    const openSale = new Set(d.sales.filter((s) => s.payment_method === 'LIPA_LATER' && s.status !== 'voided' && R.lipaBalance(s.total, paymentsOf(d, s.client_id)) > 0).map((s) => s.client_id));
    const openPur = new Set(d.purchases.filter((r) => r.payment_method === 'LIPA_LATER' && r.status !== 'voided' && R.lipaBalance(r.total, supplierPaymentsOf(d, r.client_id)) > 0).map((r) => r.client_id));
    const payToday = (list, key, id) => list.some((x) => x[key] === id && !past(x.trading_at));
    d.sales = d.sales.filter((s) => !past(s.trading_at) || openSale.has(s.client_id) || (s.payment_method === 'LIPA_LATER' && payToday(d.payments, 'sale_client_id', s.client_id)));
    d.purchases = d.purchases.filter((r) => !past(r.trading_at) || openPur.has(r.client_id) || (r.payment_method === 'LIPA_LATER' && payToday(d.supplierPayments || [], 'purchase_client_id', r.client_id)));
    d.expenses = d.expenses.filter((e) => !past(e.trading_at));
    const saleIds = new Set(d.sales.map((s) => s.client_id)); const purIds = new Set(d.purchases.map((r) => r.client_id));
    d.payments = d.payments.filter((x) => !past(x.trading_at) || saleIds.has(x.sale_client_id));
    d.supplierPayments = (d.supplierPayments || []).filter((x) => !past(x.trading_at) || purIds.has(x.purchase_client_id));
    const deleted = before - (d.sales.length + d.purchases.length + d.expenses.length + d.payments.length + d.supplierPayments.length);
    if (closed.length || deleted) await saveData(d);                                // summaries and deletions together
    return { closed, deleted, queued: await flushSummaries() };
  }

  /** Queue every closed summary of this person that has not been queued yet (also after a failed attempt). Returns how many were queued. */
  async function flushSummaries() {
    const p = await getProfile(); if (!p || !p.business_user_id) return 0;
    const d = await getData(); let n = 0;
    for (const s of Object.values(d.daily)) {
      if (s.user_id !== p.business_user_id || !s.final || s.queued) continue;
      if (await queueSummary(s)) { s.queued = true; n += 1; }              // marked queued ONLY when the queue really took it; otherwise the next open tries again
    }
    if (n) await saveData(d);
    return n;
  }

  /**
   * The History lists (Sales/Service, Purchases, Expenses): the individual records of TODAY only, then ONE daily total per earlier day (from the daily summaries).
   * An Owner's daily totals cover the whole business; others' only their own. kind: 'SALE' | 'PURCHASE' | 'EXPENSE'. range = [startMs, endMs).
   */
  async function historyView(kind, range) {
    const p = await getProfile();
    if (!p || !canSee(p, kind)) return { today: [], days: [], totals: null };
    const [a, z] = range || [0, Infinity]; const today = todayStr();
    const todayRows = (await listRecords(kind, [Math.max(a, D.dayBounds(today)[0]), Math.min(z, D.dayBounds(today)[1])]));
    const sums = (await summariesInRange(a, z, { onlyMine: !isOwner(p) })).filter((s) => s.day < today);
    const byDay = new Map(); sums.forEach((s) => { if (!byDay.has(s.day)) byDay.set(s.day, []); byDay.get(s.day).push(s); });
    const days = [...byDay.keys()].sort().reverse().map((day) => {
      const t = D.mergeSummaries(byDay.get(day), []);
      const row = kind === 'SALE' ? { count: t.sales_made, total: t.income, label: 'Sales/Services' } : kind === 'PURCHASE' ? { count: t.purchases_count, total: t.purchases, label: 'Purchases' } : { count: t.expenses_count, total: t.expenses, label: 'Expenses' };
      return { day, ...row };
    }).filter((r) => r.count || r.total);
    return { today: todayRows, days };
  }

  // ---------------------------------------------------------------------------------------------- 3-month clean-up
  /** Closes any past days first (so nothing is lost), then removes daily summaries older than the 3 months kept on the phone (1 Aug on 22 Nov), plus old saved statements
   *  and requests. Summaries still waiting to be sent are kept. Owed-money records stay until settled. */
  async function runRetention({ unsyncedIds = new Set(), nowMs = now() } = {}) {
    await closeDays({ nowMs });
    const cutoff = R.retentionCutoffMs(nowMs); const cutDay = R.eatDateString(cutoff);
    const [p, d] = [await getProfile(), await getData()];
    const removed = { summaries: 0, statements: 0, requests: 0 };
    Object.keys(d.daily).forEach((k) => {
      const s = d.daily[k]; const mineWaiting = p && s.user_id === p.business_user_id && s.final && !s.queued;       // my own closed day not yet queued: keep it
      if (s.day < cutDay && !mineWaiting && !unsyncedIds.has(`business_daily_summary_${BID}:${s.user_id}:${s.day}`)) { delete d.daily[k]; removed.summaries += 1; }
    });
    if (removed.summaries) await saveData(d);
    const stm = await read(K(STMT_KEY), []); const keepStm = stm.filter((s) => s.saved_at >= cutoff);
    removed.statements = stm.length - keepStm.length; if (removed.statements) await write(K(STMT_KEY), keepStm);
    const rq = await read(K(REQ_KEY), []); const keepRq = rq.filter((r) => r.status === 'queued' || r.status === 'requested' || (r.requested_at || 0) >= cutoff);
    removed.requests = rq.length - keepRq.length; if (removed.requests) await write(K(REQ_KEY), keepRq);
    return removed;
  }

  async function clearAll() { await kv.set(K(DATA_KEY), null); await kv.set(K(PROFILE_KEY), null); await kv.set(K(STMT_KEY), null); await kv.set(K(REQ_KEY), null); }

  // ---------------------------------------------------------------------------------------------- drafts (half-entered forms stay with their business)
  const draftKey = (name) => `${DRAFT_KEY}:${BID}:${String(name).replace(/[^a-z0-9_-]/gi, '')}`;
  const getDraft = (name) => read(draftKey(name), null);
  const saveDraft = (name, value) => write(draftKey(name), { value, saved_at: now() });
  const clearDraft = (name) => kv.set(draftKey(name), null);

  return { businessId: BID, getDraft, saveDraft, clearDraft, getData, getProfile, saveProfile, isOwner, canSee, recordSale, recordPurchase, recordExpense, listRecords,
    reportInputs, report, myTotals, homeToday, lipaCustomers, recordLipaPayment, supplierLipaList, recordSupplierPayment, purchaseSpent, canChange, correctRecord, voidRecord, transactions, buildStatement, closeDays, flushSummaries, historyView, periodTotals, transactionsView, summariesInRange,
    listStatements, saveStatement, listRequests, requestStatement, mergeBundle, applyRequests, runRetention, clearAll };
}
