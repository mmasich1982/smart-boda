// rider-app/src/offline/businessOverview.js
// ALL MY BUSINESSES (Owner only): one card per business the person OWNS plus a plain-sum total. TOTALS ONLY: never a record, customer or supplier.
// Online the server's answer is used (each card is worked out by the same function as that business's own Net Profit report). Offline the same
// figures are worked out on the phone from each business's OWN store, and every card says when it was last updated ("as of").
// Pure: the registry, the clock and the server call are injected.
import * as R from './businessReportUtils';

const FIELDS = ['income', 'purchases', 'expenses', 'net_profit', 'owed_to_business', 'owed_by_business'];

/** Plain sum of the live cards that have figures. A switched-off business, or one never loaded on this phone, is listed but left out. */
export function sumTotals(cards) {
  const t = Object.fromEntries(FIELDS.map((k) => [k, 0]));
  cards.filter((c) => c.active && c.loaded !== false).forEach((c) => FIELDS.forEach((k) => { t[k] += R.cents(c[k] || 0); }));
  return Object.fromEntries(FIELDS.map((k) => [k, R.money(t[k])]));
}

export async function localOverview(registry, period, nowMs = Date.now()) {
  const [a, z] = R.periodBounds(period, nowMs);
  const cards = [];
  for (const b of (await registry.getMine()).filter((x) => x.role === 'OWNER')) {
    const card = { business_id: b.business_id, business_name: b.business_name, business_type_code: b.business_type_code || null, active: b.active !== false };
    if (card.active) {
      const st = await registry.status(b.business_id);
      if (!st.loaded) Object.assign(card, { loaded: false, asOf: null });
      else {
        const s = await registry.store(b.business_id);
        const t = await s.report(a, z);
        const sum = (rows) => R.money(rows.reduce((x, r) => x + R.cents(r.balance), 0));
        Object.assign(card, { loaded: true, income: t.income, purchases: t.purchases, expenses: t.expenses, net_profit: t.net_profit, sales_made: t.sales_made,
          owed_to_business: sum(await s.lipaCustomers()), owed_by_business: sum(await s.supplierLipaList()), asOf: st.lastPullAt });
      }
    }
    cards.push(card);
  }
  return { source: 'phone', period, businesses: cards, total: sumTotals(cards), asOf: null };
}

/** Server answer -> the same card shape. */
export function fromServer(d) {
  const cards = (d.businesses || []).map((c) => ({ ...c, loaded: true, asOf: Date.parse(d.server_time) || null }));
  return { source: 'server', period: d.period, businesses: cards, total: d.total || sumTotals(cards), asOf: Date.parse(d.server_time) || null };
}

/** Online: the server's figures (fresh). Offline or any failure: the phone's own. */
export async function loadOverview({ registry, fetchServer, online, period, nowMs = Date.now() }) {
  if (online) {
    try { return fromServer(await fetchServer(period)); } catch { /* fall through to the phone's own figures */ }
  }
  return localOverview(registry, period, nowMs);
}

export default { localOverview, loadOverview, fromServer, sumTotals };
