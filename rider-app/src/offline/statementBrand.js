// rider-app/src/offline/statementBrand.js
// THE LOOK OF EVERY STATEMENT AND REPORT: the Smart Apps logo, the provider name and one colour scheme, so a statement from any part of the apps looks like it comes from
// the same company. Used by Smart Bizna, Smart Boda / Smart Cabz and Smart Chama documents. Table based layout and plain CSS only (no flexbox / grid), so it prints the
// same on every phone's print engine.
export const PROVIDER_NAME = 'Simple Smart Apps Hub';
export const LOGO_DATA_URI = 'data:image/png;base64,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';
export const BRAND = { orange: '#F26B0F', orangeDark: '#C8530A', orangeSoft: '#FFF1E6', ink: '#1F2933', slate: '#52606D', line: '#E4E7EB', zebra: '#F7F8FA', green: '#0E7C4A', greenSoft: '#E6F4EC', red: '#C0392B', redSoft: '#FBEAE8', navy: '#14213D' };

export const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The shared CSS. `extra` is appended for a document's own classes. */
export const brandCss = (extra = '') => `
@page{size:A4;margin:12mm 11mm 14mm 11mm}
*{box-sizing:border-box}
body{font-family:Helvetica,Arial,sans-serif;color:${BRAND.ink};font-size:11px;margin:0;line-height:1.4}
table{width:100%;border-collapse:collapse}
.hd{background:${BRAND.navy};color:#fff;border-bottom:4px solid ${BRAND.orange}}
.hd td{padding:12px 14px;vertical-align:middle}
.hd .name{font-size:17px;font-weight:bold;letter-spacing:.3px}
.hd .app{font-size:10.5px;color:#FFD3B0;letter-spacing:.6px;text-transform:uppercase}
.hd .doc{text-align:right;font-size:10.5px;color:#D9E2EC}
.hd .doc b{display:block;font-size:13px;color:#fff;letter-spacing:.3px}
.tag{display:inline-block;background:${BRAND.orange};color:#fff;font-size:9px;font-weight:bold;padding:2px 7px;border-radius:9px;letter-spacing:.5px}
h1{font-size:21px;margin:16px 0 2px;color:${BRAND.navy}}
h2{font-size:13px;margin:18px 0 6px;color:${BRAND.navy};border-left:4px solid ${BRAND.orange};padding-left:8px}
.muted{color:${BRAND.slate};font-size:10px}
.meta td{padding:2px 0;font-size:11px} .meta td.k{color:${BRAND.slate};width:92px}
.kpi{table-layout:fixed}
.kpi td{width:23.5%;padding:10px 12px;border:1px solid ${BRAND.line};border-top:4px solid ${BRAND.orange};background:#fff;vertical-align:top}
.kpi .l{font-size:9.5px;color:${BRAND.slate};text-transform:uppercase;letter-spacing:.5px}
.kpi .v{font-size:15px;white-space:nowrap;font-weight:bold;margin-top:3px}
.kpi td.net{border-top-color:${BRAND.green};background:${BRAND.greenSoft}} .kpi td.net.neg{border-top-color:${BRAND.red};background:${BRAND.redSoft}}
.kpi td.net .v{color:${BRAND.green}} .kpi td.net.neg .v{color:${BRAND.red}}
.kpi td.gap{width:2%;border:0 !important;padding:0 !important;background:transparent !important}
table.t th{background:${BRAND.navy};color:#fff;font-size:10px;text-align:left;padding:6px 8px;letter-spacing:.3px}
table.t td{padding:5px 8px;border-bottom:1px solid ${BRAND.line};font-size:10.5px}
table.t tr:nth-child(even) td{background:${BRAND.zebra}}
table.t .r{text-align:right}
table.t tr.tot td{background:${BRAND.orangeSoft};font-weight:bold;border-top:2px solid ${BRAND.orange};font-size:11px}
table.t td.pos{color:${BRAND.green};font-weight:bold} table.t td.neg{color:${BRAND.red};font-weight:bold}
.bar{height:8px;background:${BRAND.line};border-radius:4px} .bar i{display:block;height:8px;background:${BRAND.orange};border-radius:4px}
.bar.g i{background:${BRAND.green}} .bar.n i{background:${BRAND.navy}}
.month{background:${BRAND.orangeSoft};border:1px solid #F8C9A3;border-left:5px solid ${BRAND.orange};padding:7px 10px;margin:16px 0 0;font-size:13px;font-weight:bold;color:${BRAND.navy}}
.ft{margin-top:22px;border-top:3px solid ${BRAND.orange};padding-top:8px} .ft td{font-size:9.5px;color:${BRAND.slate};vertical-align:top}
.code{font-family:Courier,monospace;font-size:13px;font-weight:bold;color:${BRAND.navy};letter-spacing:1.5px;border:1px dashed ${BRAND.orange};padding:4px 10px;display:inline-block;background:${BRAND.orangeSoft}}
.note{font-size:9.5px;color:${BRAND.slate};margin-top:6px}
.pb{page-break-before:always} tr{page-break-inside:avoid} h2,.month{page-break-after:avoid}
${extra}`;

/** The top band of a document. title: e.g. "Business Summary Statement"; app: "Smart Bizna". `sample` adds a SAMPLE tag (demonstration documents). */
export const brandHeaderHtml = ({ app = 'Smart Apps', title = '', sample = false } = {}) => `
<table class="hd"><tr>
<td style="width:56px"><img src="${LOGO_DATA_URI}" width="46" height="46" style="border-radius:8px;display:block" alt=""/></td>
<td><div class="name">${esc(PROVIDER_NAME)}</div><div class="app">${esc(app)}</div></td>
<td class="doc"><b>${esc(title)}</b>${sample ? '<span class="tag">SAMPLE · SIMULATED DATA</span>' : ''}</td>
</tr></table>`;

/** The bottom band: who issued the document. */
export const brandFooterHtml = ({ left = '', right = '' } = {}) => `
<table class="ft"><tr><td>${left}</td><td style="text-align:right">${right}<br/><b style="color:${BRAND.navy}">${esc(PROVIDER_NAME)}</b></td></tr></table>`;

/**
 * Put the brand on a document that is already a complete HTML page (the Smart Boda / Smart Cabz / Smart Chama statements and reports): the logo and
 * "Simple Smart Apps Hub" band at the top, the issuer line at the bottom, and the old "automatically generated / for inquiries / valid for 6 months / pending
 * verification" wording removed, so every document carries the same clear identity and only relevant business information.
 */
export function applyBrand(html, { app = 'Smart Boda', title = 'Statement' } = {}) {
  const css = `<style>${brandCss('body{padding:0}')}</style>`;
  let out = String(html);
  out = out.replace(/<div class="footer">[\s\S]*?<\/div>/g, '');
  out = out.replace(/<div class="verification">([\s\S]*?)<\/div>/g, (m, inner) => (/Pending|N\/A/.test(inner)
    ? `<div class="verification">${inner.replace(/<strong>Document ID:<\/strong>[^<]*<br\/>\s*/g, '').replace(/<strong>Status:<\/strong>[^<]*/g, '').replace(/<br\/>\s*$/g, '')}</div>`.replace(/<strong>Verification Code:<\/strong>\s*Pending[^<]*/g, '')
    : m));
  out = out.replace(/<\/head>/i, `${css}</head>`);
  out = out.replace(/<body([^>]*)>/i, (m) => `${m}${brandHeaderHtml({ app, title })}<div style="height:12px"></div>`);
  out = out.replace(/<\/body>/i, `${brandFooterHtml({ left: '<div class="muted">Issued by</div>', right: '' })}</body>`);
  return out;
}
