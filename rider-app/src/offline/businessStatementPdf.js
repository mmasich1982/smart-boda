// rider-app/src/offline/businessStatementPdf.js
// SMART BIZNA STATEMENTS. The document is built on the phone from the saved statement (Summary or Detailed). renderBusinessStatementHtml() is pure (and tested);
// downloadBusinessStatement() prints it with expo-print and opens the share sheet.
//
// WHAT THE DOCUMENT SHOWS (and nothing else): the Smart Apps logo and "Simple Smart Apps Hub"; the business and period; Sales, Purchases, Expenses and Net Income;
//   Summary  : one row per month, then the Total, and Net Income by month.
//   Detailed : for each month one row per DAY (that day's total sales, purchases and expenses), then the month's Total, and a Grand Total over a longer period.
// followed by Sales by Payment Method, Where the Money Went (cost breakdown), the Team, and a verification code. Every figure is a daily total, never a single transaction.
// Net Income = Sales - (Purchases + Expenses).
import { PROVIDER_NAME, esc, brandCss, brandHeaderHtml, brandFooterHtml } from './statementBrand';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const num = (v) => Number(v || 0);
const n0 = (v) => num(v).toLocaleString('en-KE', { maximumFractionDigits: 2, minimumFractionDigits: num(v) % 1 ? 2 : 0 });
const ksh = (v) => `KSh ${n0(v)}`;
const day = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number); return d ? `${d} ${MONTHS[m - 1]} ${y}` : ''; };
const longStamp = (iso) => { const t = new Date(new Date(iso).getTime() + 3 * 3600000); return Number.isNaN(t.getTime()) ? '' : `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };
const pct = (v, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round((Math.abs(num(v)) / max) * 100))) : 0);
const NETCLS = (v) => (num(v) < 0 ? 'neg' : 'pos');

function kpis(t) {
  const cell = (l, v, cls = '') => `<td class="${cls}"><div class="l">${l}</div><div class="v">${esc(ksh(v))}</div></td>`;
  return `<table class="kpi"><tr>${cell('Sales', t.income)}<td class="gap"></td>${cell('Purchases', t.purchases)}<td class="gap"></td>${cell('Expenses', t.expenses)}<td class="gap"></td>${cell('Net Income', t.net_profit, `net ${num(t.net_profit) < 0 ? 'neg' : ''}`)}</tr></table>`;
}

const head = (first) => `<tr><th>${first}</th><th class="r">Sales (KSh)</th><th class="r">Purchases (KSh)</th><th class="r">Expenses (KSh)</th><th class="r">Net Income (KSh)</th></tr>`;
const row = (label, r, cls = '', sub = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${label}${sub ? ` <span class="muted">${esc(sub)}</span>` : ''}</td><td class="r">${n0(r.sales)}</td><td class="r">${n0(r.purchases)}</td><td class="r">${n0(r.expenses)}</td><td class="r ${NETCLS(r.net)}">${n0(r.net)}</td></tr>`;
const weekday = (iso) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

function netChart(months) {
  if (!months || months.length < 2) return '';
  const max = Math.max(...months.map((m) => Math.abs(num(m.totals.net))), 1);
  return `<h2>Net Income by Month</h2><table class="t"><tr><th style="width:90px">Month</th><th>Net Income</th><th class="r" style="width:110px">KSh</th></tr>${months.map((m) => `<tr><td>${esc(m.label)}</td><td><div class="bar ${num(m.totals.net) < 0 ? '' : 'g'}"><i style="width:${pct(m.totals.net, max)}%"></i></div></td><td class="r ${NETCLS(m.totals.net)}">${n0(m.totals.net)}</td></tr>`).join('')}</table>`;
}

function renderTables(st) {
  const tb = st.tables;
  if (!tb || !Array.isArray(tb.months)) return '';
  if (st.type !== 'detailed') {
    return `<h2>Summary by Month</h2><table class="t">${head('Month')}${tb.months.map((m) => row(esc(m.label), m.totals, '', m.partial ? `${day(m.from)} – ${day(m.to)}` : '')).join('')}${row('Total', tb.grand, 'tot')}</table>${netChart(tb.months)}`;
  }
  const month = (m, i) => `<div class="month${i ? ' pb' : ''}">${esc(m.label)}${m.partial ? ` <span class="muted" style="font-weight:normal">(${esc(day(m.from))} – ${esc(day(m.to))})</span>` : ''}</div><table class="t">${head('Day')}${m.days.map((d) => row(`${d.dom} <span class="muted">${weekday(d.day)}</span>`, d)).join('')}${row('Total', m.totals, 'tot')}</table>`;
  const grand = tb.multiMonth ? `<h2>Grand Total</h2><table class="t">${head('Period')}${row(`${esc(day(st.date_from))} – ${esc(day(st.date_to))}`, tb.grand, 'tot')}</table>${netChart(tb.months)}` : '';
  return `${tb.months.map(month).join('')}${grand}`;
}

function insights(t) {
  const pm = (t.by_payment_method || []).filter((m) => num(m.count) || num(m.amount));
  const max = Math.max(...pm.map((m) => num(m.amount)), 1);
  const pay = pm.length ? `<h2>Sales by Payment Method</h2><table class="t"><tr><th style="width:90px">Method</th><th>Share of sales</th><th class="r" style="width:70px">Count</th><th class="r" style="width:100px">KSh</th><th class="r" style="width:46px">%</th></tr>${pm.map((m) => `<tr><td>${esc(m.label)}</td><td><div class="bar"><i style="width:${pct(m.amount, max)}%"></i></div></td><td class="r">${n0(m.count)}</td><td class="r">${n0(m.amount)}</td><td class="r">${esc(m.percent)}%</td></tr>`).join('')}</table>` : '';
  const cb = (t.cost_breakdown || []);
  const cmax = Math.max(...cb.map((c) => num(c.amount)), 1);
  const cost = cb.length ? `<h2>Where the Money Went</h2><table class="t"><tr><th style="width:150px">Cost</th><th>Share of costs</th><th class="r" style="width:100px">KSh</th><th class="r" style="width:46px">%</th></tr>${cb.map((c) => `<tr><td>${esc(c.label)}</td><td><div class="bar n"><i style="width:${pct(c.amount, cmax)}%"></i></div></td><td class="r">${n0(c.amount)}</td><td class="r">${esc(c.percent)}%</td></tr>`).join('')}</table>` : '';
  const people = (t.by_person || []).filter((p) => num(p.income) || num(p.costs) || num(p.sales_count));
  const team = people.length > 1 ? `<h2>Team Performance</h2><table class="t"><tr><th>Name</th><th>Role</th><th class="r">Sales made</th><th class="r">Sales (KSh)</th><th class="r">Costs recorded (KSh)</th></tr>${people.map((p) => `<tr><td>${esc(p.full_name)}</td><td>${p.role === 'OWNER' ? 'Owner' : 'Sales/Service'}</td><td class="r">${n0(p.sales_count)}</td><td class="r">${n0(p.income)}</td><td class="r">${n0(p.costs)}</td></tr>`).join('')}</table>` : '';
  return pay + cost + team;
}

/** The whole statement as one HTML document. st.sample = true adds the SAMPLE tag (demonstration documents only). */
export function renderBusinessStatementHtml(st) {
  const t = st.totals || {};
  const detailed = st.type === 'detailed';
  const title = detailed ? 'Detailed Business Statement' : 'Business Summary Statement';
  const when = st.generated_at ? longStamp(st.generated_at) : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · ${esc(st.business_name)}</title><style>${brandCss()}</style></head><body>
${brandHeaderHtml({ app: 'Smart Bizna', title, sample: !!st.sample })}
<h1>${esc(st.business_name)}</h1>
<table class="meta"><tr><td class="k">Statement</td><td>${esc(title)}</td></tr>${st.business_type ? `<tr><td class="k">Business type</td><td>${esc(st.business_type)}</td></tr>` : ''}<tr><td class="k">Period</td><td><b>${esc(day(st.date_from))} – ${esc(day(st.date_to))}</b></td></tr>${when ? `<tr><td class="k">Issued</td><td>${esc(when)}</td></tr>` : ''}</table>
<div style="height:10px"></div>
${kpis(t)}
${renderTables(st)}
<div class="${st.tables && st.tables.months && st.tables.months.length > 6 ? 'pb' : ''}">${insights(t)}</div>
<div class="note">Net Income = Sales − (Purchases + Expenses). Each figure is the total for that day or month. All amounts are in Kenya Shillings (KSh).</div>
${brandFooterHtml({ left: `<div class="muted">Verification code</div><div class="code">${esc(st.verification_code || '')}</div><div class="note">Quote this code to confirm that this statement is genuine.</div>`, right: `${esc(st.business_name)}<br/>${esc(day(st.date_from))} – ${esc(day(st.date_to))}` })}
</body></html>`;
}

export async function downloadBusinessStatement(st) {
  const Print = require('expo-print'), Sharing = require('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html: renderBusinessStatementHtml(st) });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${PROVIDER_NAME} · Statement${st.business_name ? ' - ' + st.business_name : ''} ${st.date_from} to ${st.date_to}` });
  return { uri };
}
