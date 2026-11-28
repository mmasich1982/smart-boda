// rider-app/src/offline/businessDaily.js
// SMART BIZNA DAILY SUMMARIES: the pure rules of the end-of-day close. No React Native, no storage: the store (businessStore.js) calls these and is tested with them.
//
// THE IDEA. A business can record hundreds of sales a day, from several phones. During the day every phone sends its lines to the server and keeps them. At the END OF
// THE DAY the SERVER counts all users' lines of that day into ONE summary row per business per day (backend/app/services/business_daily_service.py) and deletes them. The phones
// receive those rows and, once a day's row is here and its lines have been sent, delete their own lines of that day. Every report, statement and history reads the daily rows,
// plus the lines of the days not yet consolidated (always today). A row holds exactly what the screens need:
//   { day, income, purchases, expenses, net_profit, sales_made, purchases_count, expenses_count,
//     by_payment_method:[{method,count,amount}], cost_breakdown:[{label,amount}],
//     by_person:[{user_id,full_name,role,income,sales_count,purchases,expenses,purchases_count,expenses_count}] }
// A Sales/Service Person's phone receives only their OWN figures of each day (own: true). "Days with sales" = the days whose sales_made is above 0.
// Net Profit = Sales/Service Income - (Purchases + Expenses), worked out by the SAME function as before (businessReportUtils.compute).
import * as R from './businessReportUtils';

const cents = R.cents;
const money = R.money;
const collapse = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).join(' ');

export const dayOf = (ms) => R.eatDateString(R.toMs(ms));
export const dayBounds = (day) => R.rangeBounds(day, day);                       // [start, end) in ms, EAT
export const monthKeyOfDay = (day) => String(day).slice(0, 7);

/**
 * The summary rows of ONE day from lines held on this phone: one row per person who has lines that day (like the server builds them). Lines of other people are only "ghosts"
 * (outside the day) so a payment finds its sale. records / payments / supplierPayments are the shapes reportInputs() gives; users: [{id, full_name, role}].
 */
export function summarizeLines(day, { records = [], payments = [], supplierPayments = [], users = [] }) {
  const [a, z] = dayBounds(day);
  const ids = new Set();
  records.forEach((r) => { if (r.user_id != null) ids.add(String(r.user_id)); });
  payments.concat(supplierPayments).forEach((p) => { if (p.received_by != null) ids.add(String(p.received_by)); });
  const items = [];
  ids.forEach((uid) => {
    const recs = records.map((r) => (String(r.user_id) === uid ? r : { ...r, trading_at: 0 }));
    const pays = payments.filter((p) => String(p.received_by) === uid);
    const spays = supplierPayments.filter((p) => String(p.received_by) === uid);
    const real = recs.filter((r) => String(r.user_id) === uid && r.status !== 'voided' && R.toMs(r.trading_at) >= a && R.toMs(r.trading_at) < z);
    const inDay = (x) => R.toMs(x.trading_at) >= a && R.toMs(x.trading_at) < z;
    if (!real.length && !pays.some(inDay) && !spays.some(inDay)) return;
    const u = users.find((x) => String(x.id) === uid) || { id: uid };
    const t = R.compute(recs, pays, a, z, [{ id: uid, full_name: u.full_name, role: u.role }], spays);
    const n = (k) => real.filter((r) => r.kind === k).length;
    items.push({ day, income: t.income, purchases: t.purchases, expenses: t.expenses, sales_made: t.sales_made, purchases_count: n('PURCHASE'), expenses_count: n('EXPENSE'),
      by_payment_method: t.by_payment_method.map((m) => ({ method: m.method, count: m.count, amount: m.amount })), cost_breakdown: t.cost_breakdown.map((c) => ({ label: c.label, amount: c.amount })),
      by_person: [{ user_id: uid, full_name: u.full_name ?? null, role: u.role ?? null, income: t.income, sales_count: t.sales_made, purchases: t.purchases, expenses: t.expenses, purchases_count: n('PURCHASE'), expenses_count: n('EXPENSE') }] });
  });
  return items;
}

/** A Sales/Service Person's own figures of a business-day row (the server sends these already; the Owner's phone uses it for "my own" totals). */
export function ownView(row, userId) {
  const p = (row.by_person || []).find((x) => String(x.user_id) === String(userId));
  if (!p) return null;
  const inc = cents(p.income), pu = cents(p.purchases), ex = cents(p.expenses);
  return { day: row.day, own: true, income: money(inc), purchases: money(pu), expenses: money(ex), net_profit: money(inc - pu - ex), sales_made: Number(p.sales_count) || 0,
    purchases_count: Number(p.purchases_count) || 0, expenses_count: Number(p.expenses_count) || 0, by_payment_method: [], cost_breakdown: [], by_person: [p] };
}

/**
 * Add summaries (any days, any people) into ONE totals object of exactly the shape businessReportUtils.compute returns, so every existing screen works unchanged.
 * Money is added in whole cents. Percentages are recomputed with the same whole-number rule. `users` lists everyone (even with no activity) like compute does.
 */
export function mergeSummaries(list = [], users = []) {
  const by = {}; R.METHODS.forEach((m) => { by[m] = { count: 0, cents: 0 }; });
  let income = 0; let purchases = 0; let expenses = 0; let salesMade = 0; let purchasesCount = 0; let expensesCount = 0; const saleDays = new Set();
  const groups = new Map();                                                       // cost_breakdown lines other than Purchases, grouped like compute (collapsed, lower-case)
  const person = {};
  const newPerson = (p) => ({ user_id: String(p.user_id ?? p.id), full_name: p.full_name ?? null, role: p.role ?? null, income: 0, sales_count: 0, purchases: 0, expenses: 0, purchases_count: 0, expenses_count: 0 });
  users.forEach((u) => { person[String(u.id)] = newPerson(u); });
  list.forEach((s) => {
    income += cents(s.income); purchases += cents(s.purchases); expenses += cents(s.expenses); salesMade += Number(s.sales_made) || 0;
    if ((Number(s.sales_made) || 0) > 0 && s.day) saleDays.add(String(s.day));
    purchasesCount += Number(s.purchases_count) || 0; expensesCount += Number(s.expenses_count) || 0;
    (s.by_payment_method || []).forEach((m) => { if (by[m.method]) { by[m.method].count += Number(m.count) || 0; by[m.method].cents += cents(m.amount); } });
    (s.cost_breakdown || []).forEach((c) => {
      if (c.label === 'Purchases') return;                                        // Purchases are carried by s.purchases
      const key = collapse(c.label).toLowerCase() || 'other';
      if (!groups.has(key)) groups.set(key, { label: collapse(c.label) || 'Other', cents: 0 });
      groups.get(key).cents += cents(c.amount);
    });
    (s.by_person || []).forEach((p) => {
      const k = String(p.user_id);
      const row = person[k] || (person[k] = newPerson(p));
      if (!row.full_name && p.full_name) { row.full_name = p.full_name; row.role = p.role; }
      row.income += cents(p.income); row.sales_count += Number(p.sales_count) || 0; row.purchases += cents(p.purchases); row.expenses += cents(p.expenses);
      row.purchases_count += Number(p.purchases_count) || 0; row.expenses_count += Number(p.expenses_count) || 0;
    });
  });
  const methodsTotal = R.METHODS.reduce((s, m) => s + by[m].cents, 0);
  const net = income - (purchases + expenses);
  const pcts = R.largestRemainder(R.METHODS.map((m) => by[m].cents), methodsTotal);
  const lines = (purchases ? [{ label: 'Purchases', cents: purchases }] : [])
    .concat([...groups.values()].sort((x, y) => (y.cents - x.cents) || (x.label < y.label ? -1 : x.label > y.label ? 1 : 0)));
  const cp = R.largestRemainder(lines.map((l) => l.cents), purchases + expenses);
  return {
    income: money(income), purchases: money(purchases), expenses: money(expenses), net_profit: money(net), sales_made: salesMade, purchases_count: purchasesCount, expenses_count: expensesCount, days_with_sales: saleDays.size,
    by_payment_method: R.METHODS.map((m, i) => ({ method: m, label: R.METHOD_LABEL[m], count: by[m].count, amount: money(by[m].cents), percent: pcts[i] })),
    total_received: money(income),
    cost_breakdown: lines.map((l, i) => ({ label: l.label, amount: money(l.cents), percent: cp[i] })),
    by_person: Object.values(person).map((v) => ({ ...v, income: money(v.income), purchases: money(v.purchases), expenses: money(v.expenses), costs: money(v.purchases + v.expenses) })),
  };
}

// ---------------------------------------------------------------------------------------------- the statements (daily and monthly tables)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabelOf = (key) => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const lastDayOf = (key) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const pad = (n) => String(n).padStart(2, '0');

/** Sales, Purchases, Expenses and Net of ONE day, from every person's summary for that day. */
function dayRow(day, byDay) {
  const t = mergeSummaries(byDay.get(day) || []);
  return { day, date: day, dom: Number(day.slice(8, 10)), sales: t.income, purchases: t.purchases, expenses: t.expenses, net: t.net_profit, sales_made: t.sales_made };
}
const addUp = (rows) => {
  const c = rows.reduce((a, r) => ({ s: a.s + cents(r.sales), p: a.p + cents(r.purchases), e: a.e + cents(r.expenses) }), { s: 0, p: 0, e: 0 });
  return { sales: money(c.s), purchases: money(c.p), expenses: money(c.e), net: money(c.s - (c.p + c.e)) };
};

/**
 * The statement tables for a period.   summaries: every summary (any people) whose day is inside [fromDay, toDay].
 *   detailed -> for each month (oldest first): one row per DAY  Day | Sales | Purchases | Expenses | Net Income, then the month TOTAL.
 *   summary  -> one row per MONTH  Month | Sales | Purchases | Expenses | Net Income, then the TOTAL.
 * A day with no summary shows zeros (like the sample), up to `lastDay` (today, for this month). Net Income = Sales - (Purchases + Expenses).
 */
export function buildStatementTables({ type, fromDay, toDay, summaries = [], lastDay }) {
  const byDay = new Map();
  summaries.forEach((s) => { if (s.day >= fromDay && s.day <= toDay) { if (!byDay.has(s.day)) byDay.set(s.day, []); byDay.get(s.day).push(s); } });
  const limit = lastDay && lastDay < toDay ? lastDay : toDay;
  const months = [];
  for (let key = monthKeyOfDay(fromDay); key <= monthKeyOfDay(toDay); key = nextMonthKey(key)) {
    const first = key === monthKeyOfDay(fromDay) ? fromDay : `${key}-01`;
    const lastOfMonth = `${key}-${pad(lastDayOf(key))}`;
    const last = lastOfMonth < limit ? lastOfMonth : limit;
    const days = [];
    for (let d = Number(first.slice(8, 10)); `${key}-${pad(d)}` <= last; d += 1) days.push(dayRow(`${key}-${pad(d)}`, byDay));
    months.push({ key, label: monthLabelOf(key), days, totals: addUp(days), partial: first !== `${key}-01` || last !== lastOfMonth, from: first, to: last });
  }
  const grand = addUp(months.map((m) => m.totals));
  return { type, months, grand, multiMonth: months.length > 1 };
}
function nextMonthKey(key) { const [y, m] = key.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; }

/** Do the tables' grand totals equal the totals the verification code covers? (the tests and the PDF's safety net) */
export function tablesMatchTotals(tables, totals) {
  const g = tables.grand;
  return cents(g.sales) === cents(totals.income) && cents(g.purchases) === cents(totals.purchases) && cents(g.expenses) === cents(totals.expenses) && cents(g.net) === cents(totals.net_profit);
}

// ---------------------------------------------------------------------------------------------- statements older than the 3 months on the phone
/** Default fees (KSh), CONFIGURABLE on the server (admin console) and fetched by the phone; these are only the fallback. Months are counted back from the current month. */
export const DEFAULT_STATEMENT_FEES = [{ from: 4, to: 6, fee: 500 }, { from: 7, to: 9, fee: 800 }, { from: 10, to: 12, fee: 1000 }];
export const ARCHIVE_MONTHS = 12;

/** Whole calendar months between the month of `day` and the current month (EAT). 0 = this month. */
export function monthsBack(day, nowMs = Date.now()) {
  const n = new Date(nowMs + R.EAT_MS); const [y, m] = String(day).split('-').map(Number);
  return (n.getUTCFullYear() - y) * 12 + (n.getUTCMonth() + 1 - m);
}

/**
 * What a statement for the period [fromDay, toDay] costs. The OLDEST month decides the band.
 *   within the phone (0 to 3 months back)  -> { onPhone:true, fee:0 }
 *   4 to 12 months back                    -> { onPhone:false, available:true, fee, monthsBack } by the configured bands
 *   older than 12 months                   -> { available:false } (the archive is kept for one year)
 */
export function statementFee(fromDay, nowMs = Date.now(), tiers = DEFAULT_STATEMENT_FEES) {
  const mb = monthsBack(fromDay, nowMs);
  if (mb < 0) return { onPhone: false, available: false, fee: null, monthsBack: mb };
  if (mb <= R.RETENTION_MONTHS) return { onPhone: true, available: true, fee: 0, monthsBack: mb };
  if (mb > ARCHIVE_MONTHS) return { onPhone: false, available: false, fee: null, monthsBack: mb };
  const t = (tiers || []).find((x) => mb >= x.from && mb <= x.to);
  return { onPhone: false, available: !!t, fee: t ? Number(t.fee) : null, monthsBack: mb };
}


// ---------------------------------------------------------------------------------------------- the dates of an OLDER statement request
/** The dates the calendar offers for an older statement: From and To are both on or after one year ago and on or before the day BEFORE the 3 months kept on the phone
 *  (on 22 Nov 2026: from 22 Nov 2025 to 31 Jul 2026). */
export function olderDateBounds(nowMs = Date.now()) {
  const n = new Date(nowMs + R.EAT_MS);
  const y = n.getUTCFullYear() - 1, m = n.getUTCMonth(), d = n.getUTCDate();
  const lastOfThatMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const pad2 = (v) => String(v).padStart(2, '0');
  const min = `${y}-${pad2(m + 1)}-${pad2(Math.min(d, lastOfThatMonth))}`;
  const windowStart = R.eatDateString(R.retentionCutoffMs(nowMs));
  const max = R.eatDateString(R.toMs(`${windowStart}T00:00:00+03:00`) - 86400000);
  return { min, max, windowStart };
}
