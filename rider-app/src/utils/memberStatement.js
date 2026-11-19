// rider-app/src/utils/memberStatement.js
// SMART CHAMA: the totals on "My Financial History and Statements" (a Chama member's own group money). Pure, so it is tested without a phone.
//   Paid in        savings contributions confirmed by the Treasurer (Table Banking) and Merry-Go-Round contributions confirmed
//   Loan repaid    loan repayments confirmed by the Treasurer
//   Received       loans paid out to the member and Merry-Go-Round payouts (only what the server has told the phone)
//   Balance owing  what is still owed on the member's loan (from the server; blank when it has not been read yet)
// Only CONFIRMED payments count. Periods: This Month, Last Month, 6 Months (what the phone keeps), Since Joining (server totals, any age).
export const PERIODS = [['thisMonth', 'This Month'], ['lastMonth', 'Last Month'], ['sixMonths', '6 Months'], ['sinceJoining', 'Since Joining']];

const t = (e) => new Date(e.at).getTime();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function periodStarts(now = new Date()) {
  return {
    thisStart: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    lastStart: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
    windowStart: new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime(),
  };
}

/** Rows (confirmed only) falling in a period. */
export function inPeriod(rows, period, now = new Date()) {
  const ok = (Array.isArray(rows) ? rows : []).filter((e) => e && e.status === 'confirmed' && Number.isFinite(t(e)));
  const { thisStart, lastStart, windowStart } = periodStarts(now);
  if (period === 'thisMonth') return ok.filter((e) => t(e) >= thisStart);
  if (period === 'lastMonth') return ok.filter((e) => t(e) >= lastStart && t(e) < thisStart);
  if (period === 'sixMonths') return ok.filter((e) => t(e) >= windowStart);
  return ok;
}

/**
 * @param {{savings?:Array, repayments?:Array, mgr?:Array, received?:Array}} src   rows shaped { amount, status, at }
 * @param {string} period
 * @param {{owing?:number|null, sinceJoining?:{paid_in?:number, repaid?:number, received?:number}|null}} extra  server figures
 */
export function memberTotals(src, period, now = new Date(), extra = {}) {
  const s = src || {};
  const sum = (rows) => rows.reduce((n, r) => n + num(r.amount), 0);
  const paidIn = sum(inPeriod(s.savings, period, now)) + sum(inPeriod(s.mgr, period, now));
  const repaid = sum(inPeriod(s.repayments, period, now));
  const received = sum(inPeriod(s.received, period, now));
  const out = { paidIn, repaid, received, owing: extra.owing === undefined || extra.owing === null ? null : num(extra.owing) };
  const sj = extra.sinceJoining;
  if (period === 'sinceJoining' && sj) {      // the server covers payments older than the phone keeps: never show less than the phone knows
    out.paidIn = Math.max(out.paidIn, num(sj.paid_in));
    out.repaid = Math.max(out.repaid, num(sj.repaid));
    out.received = Math.max(out.received, num(sj.received));
  }
  return out;
}

/** The lines of the detailed statement: confirmed rows of every kind in the period, newest first. */
export function statementLines(src, period, now = new Date()) {
  const s = src || {};
  const tag = (rows, label) => inPeriod(rows, period, now).map((r) => ({ at: r.at, label, amount: num(r.amount), reference: r.reference || '' }));
  return [...tag(s.savings, 'Savings paid in'), ...tag(s.mgr, 'Merry-Go-Round contribution'), ...tag(s.repayments, 'Loan repayment'), ...tag(s.received, 'Received')]
    .sort((a, b) => t(b) - t(a));
}

/** The groups a person sees a loan balance for: Table Banking only. */
export const hasLoans = (groupType) => groupType === 'tb';
