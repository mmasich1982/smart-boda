// rider-app/src/utils/businessFormat.js
// SMART BIZNA display helpers, kept pure (no React Native) so they are tested. All times are shown in East Africa Time, whatever the phone's zone.
import * as R from '../offline/businessReportUtils';

export const kes = (n) => `KSh ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const signedKes = (n, sign) => (sign === 0 ? kes(n) : `${sign > 0 ? '+' : '−'} ${kes(n)}`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDateTime(v) {
  const d = new Date(R.toMs(v) + R.EAT_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}
export function fmtDate(v) {
  const s = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : R.eatDateString(R.toMs(v));
  const [y, m, d] = s.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

export const HIST_TABS = [{ key: 'thisMonth', label: 'This Month' }, { key: 'lastMonth', label: 'Last Month' }, { key: 'last6', label: '6 Months' }, { key: 'sinceJoining', label: 'Since Joining' }];
export const FIN_TABS = [{ key: 'thisMonth', label: 'This Month' }, { key: 'lastMonth', label: 'Last Month' }, { key: 'last3', label: 'Last 3 Months' }, { key: 'last6', label: 'Last 6 Months' }, { key: 'sinceJoining', label: 'Since Joining' }];
export const PERF_TABS = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }];
export const histRange = (key, nowMs = Date.now()) => R.quickRange(key, nowMs);
export const rangeLabel = ([a, z]) => `${fmtDate(a + R.EAT_MS + 1)} – ${fmtDate(z - 1)}`;

export const methodLabel = (m) => R.METHOD_LABEL[m] || m || '';
export const KIND_LABEL = { SALE: 'Sale/Service', PURCHASE: 'Purchase', EXPENSE: 'Expense', LIPA_PAYMENT: 'Lipa Later payment received', SUPPLIER_PAYMENT: 'Supplier payment made' };

/** First line of a history row, e.g. "2 items · Cash". A Lipa Later purchase names its supplier. */
export function recordTitle(r) {
  if (r.kind === 'EXPENSE') return r.details;
  if (r.kind === 'PURCHASE' && r.payment_method === 'LIPA_LATER' && r.supplier_name) return `Lipa Later · ${r.supplier_name}`;
  const n = (r.items || []).length || 1;
  return `${n} item${n === 1 ? '' : 's'} · ${methodLabel(r.payment_method)}`;
}
/** Small tag under a row: Corrected / VOID. (Syncing is silent: the user is never told about it.) */
export function recordTags(r) {
  const tags = [];
  if (r.status === 'corrected') tags.push({ text: 'Corrected', tone: 'amber' });
  if (r.status === 'voided') tags.push({ text: `VOID${r.void_reason ? ' · ' + r.void_reason : ''}`, tone: 'red' });
  return tags;
}

export const BADGE = { upcoming: { text: 'Upcoming', tone: 'green' }, 'due-today': { text: 'Due Today', tone: 'amber' }, 'overdue-30': { text: 'Overdue', tone: 'red' },
  'overdue-60': { text: 'Overdue', tone: 'red' }, 'overdue-90': { text: 'Overdue', tone: 'red' }, 'overdue-90plus': { text: 'Overdue', tone: 'red' } };
export const AGEING_ORDER = [['upcoming', 'Due Soon'], ['due-today', 'Due Today'], ['overdue-30', '1–30 days overdue'], ['overdue-60', '31–60 days overdue'],
  ['overdue-90', '61–90 days overdue'], ['overdue-90plus', '90+ days overdue']];

/** Lipa Later Suppliers Report banner: how many suppliers are overdue and how many are due today (v48 wording). */
export const supplierBanner = (list) => {
  const overdue = list.filter((c) => c.bucket.startsWith('overdue')).length, today = list.filter((c) => c.bucket === 'due-today').length;
  if (!overdue && !today) return null;
  return [overdue ? `${overdue} overdue` : null, today ? `${today} due today` : null].filter(Boolean).join(', ');
};

/** The Lipa Later banner: how many customers are overdue or due today. */
export const lipaBanner = (customers) => {
  const n = customers.filter((c) => c.bucket !== 'upcoming').length;
  return n ? `${n} customer${n === 1 ? ' is' : 's are'} overdue or due today` : null;
};

/** The default due date offered on the Lipa Later form: a week from today, EAT. */
export const defaultDueDate = (nowMs = Date.now()) => R.eatDateString(nowMs + 7 * 86400000);

export const todayEat = (nowMs = Date.now()) => R.eatDateString(nowMs);
