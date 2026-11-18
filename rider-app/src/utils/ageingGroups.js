// rider-app/src/utils/ageingGroups.js
// SMART BIZNA Payment Ageing (customers AND suppliers) in the Smart Boda layout: one entry per person, placed in ONE of four tabs
// (Current 0-30, 31-60, 61-90, 90+ days) by their OLDEST unpaid item, carrying their total outstanding. Pure, so it is tested without the app.

export const AGEING_TABS = [
  { key: 'current', label: '📅 Current (0-30 days)', color: '#1e9e6f' },
  { key: 'thirtyPlus', label: '🟡 31-60 Days', color: '#ff7a1a' },
  { key: 'sixtyPlus', label: '🔶 61-90 Days', color: '#ff5722' },
  { key: 'ninetyPlus', label: '🔴 90+ Days', color: '#e0453f' },
];
// The Smart Bizna buckets (utils/businessFormat AGEING_ORDER) mapped to the four Smart Boda tabs; a higher rank is older.
const TAB_OF = { upcoming: 'current', 'due-today': 'current', 'overdue-30': 'current', 'overdue-60': 'thirtyPlus', 'overdue-90': 'sixtyPlus', 'overdue-90plus': 'ninetyPlus' };
const RANK = { current: 0, thirtyPlus: 1, sixtyPlus: 2, ninetyPlus: 3 };
const cents = (n) => Math.round((Number(n) || 0) * 100);

/**
 * @param {Array} list  rows of store.lipaCustomers() / store.supplierLipaList()
 * @param {'sale'|'purchase'} kind
 * @returns {{current,thirtyPlus,sixtyPlus,ninetyPlus: {count:number,total:number,people:Array}}}
 */
export function groupAgeing(list, kind) {
  const out = Object.fromEntries(AGEING_TABS.map((t) => [t.key, { count: 0, total: 0, people: [] }]));
  const people = new Map();
  for (const row of Array.isArray(list) ? list : []) {
    const rec = row[kind] || {};
    const name = String(rec[kind === 'sale' ? 'customer_name' : 'supplier_name'] || '').trim();
    const phone = String(rec[kind === 'sale' ? 'customer_phone' : 'supplier_phone'] || '').trim();
    const key = `${phone.replace(/\D/g, '') || name.toLowerCase()}`;
    const tab = TAB_OF[row.bucket] || 'current';
    const p = people.get(key) || { key, name, phone, outstandingCents: 0, items: 0, tab };
    p.outstandingCents += cents(row.balance);
    p.items += 1;
    if (RANK[tab] > RANK[p.tab]) p.tab = tab;
    people.set(key, p);
  }
  for (const p of people.values()) {
    const g = out[p.tab];
    g.people.push({ key: p.key, name: p.name, phone: p.phone, outstanding: p.outstandingCents / 100, items: p.items });
    g.count += 1;
    g.total += p.outstandingCents;
  }
  for (const k of Object.keys(out)) { out[k].total /= 100; out[k].people.sort((a, b) => b.outstanding - a.outstanding); }
  return out;
}
export default { AGEING_TABS, groupAgeing };
