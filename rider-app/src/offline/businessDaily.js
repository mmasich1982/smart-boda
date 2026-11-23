// rider-app/src/offline/businessDaily.js
// SMART BIZNA DAILY SUMMARIES: the pure rules of the end-of-day close. No React Native, no storage: the store (businessStore.js) calls these and is tested with them.
//
// THE IDEA. A business can record hundreds of sales a day. Every line stays on the phone ONLY until the end of its day. Then ONE daily summary is made, the line-level
// rows are deleted, and only the summary is kept (3 months on the phone, 1 year on the server). Every report, dashboard and statement reads summaries; today alone
// is read from the day's own lines. A summary holds exactly what the reports need, so nothing needs the old lines:
//   { day:'2026-11-20', user_id, final, income, purchases, expenses, net_profit, sales_made,
//     by_payment_method:[{method,count,amount}], cost_breakdown:[{label,amount}], by_person:[{user_id,full_name,role,income,sales_count,costs}] }
// Net Profit = Sales/Service Income - (Purchases + Expenses), worked out by the SAME function as before (businessReportUtils.compute), so the day's figures cannot differ.
//
// One summary is made per PHONE (per recording person) per day, because several phones record into one business; the business's figure for a day is the sum of its
// people's summaries (mergeSummaries). That is still one small row per person per day, instead of one row per sale.
import * as R from './businessReportUtils';

const cents = R.cents;
const money = R.money;
const collapse = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).join(' ');

export const dayOf = (ms) => R.eatDateString(R.toMs(ms));
export const dayBounds = (day) => R.rangeBounds(day, day);                       // [start, end) in ms, EAT
export const monthKeyOfDay = (day) => String(day).slice(0, 7);

/** One person's summary of one EAT day, from that person's own lines. records / payments / supplierPayments are the shapes reportInputs() gives. */
export function summarizeDay(day, { records = [], payments = [], supplierPayments = [], users = [] }, meta = {}) {
  const [a, z] = dayBounds(day);
  const t = R.compute(records, payments, a, z, users, supplierPayments);
  const live = (r) => r.status !== 'voided' && R.toMs(r.trading_at) >= a && R.toMs(r.trading_at) < z;
  const count = (kind) => records.filter((r) => r.kind === kind && live(r)).length;
  return {
    day, ...meta, final: !!meta.final,
    income: t.income, purchases: t.purchases, expenses: t.expenses, net_profit: t.net_profit, sales_made: t.sales_made,
    purchases_count: count('PURCHASE'), expenses_count: count('EXPENSE'),
    by_payment_method: t.by_payment_method.map((m) => ({ method: m.method, count: m.count, amount: m.amount })),
    cost_breakdown: t.cost_breakdown.map((c) => ({ label: c.label, amount: c.amount })),
    by_person: t.by_person.filter((p) => p.income || p.costs || p.sales_count).map((p) => ({ user_id: p.user_id, full_name: p.full_name, role: p.role, income: p.income, sales_count: p.sales_count, costs: p.costs })),
  };
}

/**
 * Add summaries (any days, any people) into ONE totals object of exactly the shape businessReportUtils.compute returns, so every existing screen works unchanged.
 * Money is added in whole cents. Percentages are recomputed with the same whole-number rule. `users` lists everyone (even with no activity) like compute does.
 */
export function mergeSummaries(list = [], users = []) {
  const by = {}; R.METHODS.forEach((m) => { by[m] = { count: 0, cents: 0 }; });
  let purchases = 0; let expenses = 0; let salesMade = 0; let purchasesCount = 0; let expensesCount = 0;
  const groups = new Map();                                                       // cost_breakdown lines other than Purchases, grouped like compute (collapsed, lower-case)
  const person = {};
  users.forEach((u) => { person[String(u.id)] = { user_id: String(u.id), full_name: u.full_name ?? null, role: u.role ?? null, income: 0, sales_count: 0, costs: 0 }; });
  list.forEach((s) => {
    purchases += cents(s.purchases); expenses += cents(s.expenses); salesMade += Number(s.sales_made) || 0;
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
      const row = person[k] || (person[k] = { user_id: k, full_name: p.full_name ?? null, role: p.role ?? null, income: 0, sales_count: 0, costs: 0 });
      if (!row.full_name && p.full_name) { row.full_name = p.full_name; row.role = p.role; }
      row.income += cents(p.income); row.sales_count += Number(p.sales_count) || 0; row.costs += cents(p.costs);
    });
  });
  const income = R.METHODS.reduce((s, m) => s + by[m].cents, 0);
  const net = income - (purchases + expenses);
  const pcts = R.largestRemainder(R.METHODS.map((m) => by[m].cents), income);
  const lines = (purchases ? [{ label: 'Purchases', cents: purchases }] : [])
    .concat([...groups.values()].sort((x, y) => (y.cents - x.cents) || (x.label < y.label ? -1 : x.label > y.label ? 1 : 0)));
  const cp = R.largestRemainder(lines.map((l) => l.cents), purchases + expenses);
  return {
    income: money(income), purchases: money(purchases), expenses: money(expenses), net_profit: money(net), sales_made: salesMade, purchases_count: purchasesCount, expenses_count: expensesCount,
    by_payment_method: R.METHODS.map((m, i) => ({ method: m, label: R.METHOD_LABEL[m], count: by[m].count, amount: money(by[m].cents), percent: pcts[i] })),
    total_received: money(income),
    cost_breakdown: lines.map((l, i) => ({ label: l.label, amount: money(l.cents), percent: cp[i] })),
    by_person: Object.values(person).map((v) => ({ ...v, income: money(v.income), costs: money(v.costs) })),
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
export const DEFAULT_STATEMENT_FEES = [{ from: 4, to: 6, fee: 250 }, { from: 7, to: 9, fee: 500 }, { from: 10, to: 12, fee: 1000 }];
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
