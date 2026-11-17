// rider-app/src/offline/businessStatementPdf.js
// SMART BIZNA statements: the PDF is built ON THE PHONE from the saved statement (Summary or Detailed). No email, no internet, no server call.
// renderBusinessStatementHtml() is pure (tested); downloadBusinessStatement() prints it with expo-print and opens the share sheet.
import { kes, fmtDateTime, methodLabel, KIND_LABEL } from '../utils/businessFormat';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => esc(kes(n));

export function renderBusinessStatementHtml(st) {
  const t = st.totals || {};
  const rows = (arr, cols) => arr.map((r) => `<tr>${cols.map((c) => `<td${c.right ? ' class="r"' : ''}>${c.f(r)}</td>`).join('')}</tr>`).join('');
  const detailed = st.type === 'detailed' && Array.isArray(st.lines);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Helvetica,Arial,sans-serif;color:#1a1c20;font-size:11px;padding:24px}h1{font-size:18px;margin:0 0 2px}h2{font-size:13px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #e7e4db;text-align:left}.r{text-align:right}.big{font-size:15px;font-weight:bold}
.void{text-decoration:line-through;color:#999}.code{font-family:monospace;font-size:13px;border:1px solid #999;padding:4px 8px;display:inline-block}.muted{color:#666}</style></head><body>
<h1>Smart Bizna ${detailed ? 'Detailed' : 'Summary'} Statement</h1>
<div>${esc(st.business_name)}${st.business_type ? ' (' + esc(st.business_type) + ')' : ''}</div>
<div class="muted">Period: ${esc(st.date_from)} to ${esc(st.date_to)} · Generated: ${esc(fmtDateTime(st.generated_at))} · ${st.source === 'server' ? 'Prepared by Smart Bizna Admin from the server records' : 'Built on this phone'}</div>
<h2>Summary</h2>
<table><tr><td>Total Income (Sales/Services)</td><td class="r">${money(t.income)}</td></tr><tr><td>Total Purchases (paid)</td><td class="r">${money(t.purchases)}</td></tr>
<tr><td>Total Expenses</td><td class="r">${money(t.expenses)}</td></tr><tr class="big"><td>Net Profit</td><td class="r">${money(t.net_profit)}</td></tr></table>
<div class="muted">Net Profit = Sales/Services Income − (Purchases + Expenses). A Lipa Later sale counts as income only when the customer pays. A Lipa Later purchase counts as a cost only as the supplier is paid.</div>
<h2>By Payment Method</h2>
<table>${rows(t.by_payment_method || [], [{ f: (r) => esc(r.label) }, { f: (r) => `${esc(r.count)} ${r.method === 'LIPA_LATER' ? 'repayments' : 'sales'}` }, { f: (r) => money(r.amount), right: true }, { f: (r) => `${esc(r.percent)}%`, right: true }])}</table>
<h2>Cost Breakdown</h2>
<table>${rows(t.cost_breakdown || [], [{ f: (r) => esc(r.label) }, { f: (r) => money(r.amount), right: true }, { f: (r) => `${esc(r.percent)}%`, right: true }]) || '<tr><td class="muted">No costs in this period.</td></tr>'}</table>
<h2>By Sales/Service Person</h2>
<table><tr><th>Person</th><th class="r">Income</th><th class="r">Sales</th><th class="r">Costs recorded</th></tr>${rows(t.by_person || [], [{ f: (r) => `${esc(r.full_name)} (${esc(r.role === 'OWNER' ? 'Owner' : 'Sales/Service')})` },
    { f: (r) => money(r.income), right: true }, { f: (r) => esc(r.sales_count), right: true }, { f: (r) => money(r.costs), right: true }])}</table>
${detailed ? `<h2>Every transaction</h2><table><tr><th>Date &amp; time</th><th>Type</th><th>Details</th><th>Payment</th><th class="r">Amount</th><th>Recorded by</th></tr>${st.lines.map((l) => `<tr class="${l.status === 'voided' ? 'void' : ''}">
<td>${esc(fmtDateTime(l.when))}</td><td>${esc(KIND_LABEL[l.type] || l.type)}${l.status === 'voided' ? ' · VOID' : ''}${l.status === 'corrected' || l.corrected ? ' · Corrected' : ''}</td><td>${esc(l.details)}</td><td>${esc(methodLabel(l.payment_method))}</td>
<td class="r">${money(l.amount)}</td><td>${esc(l.recorded_by)}${l.role ? ' (' + esc(l.role === 'OWNER' ? 'Owner' : 'Sales/Service') + ')' : ''}</td></tr>`).join('')}</table><div class="muted">Voided records are listed but not counted in any total.</div>` : ''}
<h2>Verification code</h2><div class="code">${esc(st.verification_code)}</div>
<div class="muted">The code is worked out from the business, the period and the four totals. If any figure above is changed, it will no longer match.</div></body></html>`;
}

export async function downloadBusinessStatement(st) {
  const Print = require('expo-print'), Sharing = require('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html: renderBusinessStatementHtml(st) });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Smart Bizna Statement${st.business_name ? ' - ' + st.business_name : ''} ${st.date_from} to ${st.date_to}` });
  return { uri };
}
