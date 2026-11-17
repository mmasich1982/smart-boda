// admin-console/src/pages/BusinessTilePermissions.jsx
// Manage Businesses > Tile Permissions. Two Yes / No choices decide whether a Sales/Service Person sees the Business Purchases tile and
// the Business Expenses tile. They are set once for the whole business (the default) and may be overridden for one person with Yes / No;
// a person left on "Same as business" follows the business. The Owner always sees both. Every change is saved at once and reaches
// each affected phone at its next sync (the tile appears or disappears by itself). Records already made stay in the reports.
import React, { useState } from 'react';
import { listBusinesses, updateBusiness, updateBusinessUser } from '../api/businesses';
import { useApiResource } from '../hooks/useApiResource';
import Pagination from '../components/Pagination';
import TriChoice, { errText } from '../components/TriChoice';

const tick = (ok) => (ok ? '✅ sees it' : '🚫 hidden');

export default function BusinessTilePermissions() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [msg, setMsg] = useState(null);
  const res = useApiResource(() => listBusinesses({ q: q || undefined, page, page_size: pageSize }), [q, page, pageSize]);
  const d = res.data || {};

  async function save(fn, ok) {
    try { await fn(); setMsg({ ok: true, text: ok }); res.refresh(); }
    catch (err) { setMsg({ ok: false, text: errText(err, 'That did not save.') }); }
  }

  return (
    <div className="page">
      <h1>Tile Permissions</h1>
      <p className="muted">Decide who sees the <b>Business Purchases</b> and <b>Business Expenses</b> tiles. Set the default for the whole business, then change one person without touching the others. Changing the business default moves everyone on “Same as business”; people with their own Yes or No keep it.</p>
      {msg && <div className="card" role="status" style={{ borderColor: msg.ok ? '#43a047' : '#d32f2f' }}>{msg.text} <button className="secondary" onClick={() => setMsg(null)}>OK</button></div>}
      {res.error && <p role="alert" style={{ color: 'red' }}>{String(res.error)}</p>}
      <input placeholder="Search business, person or phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ padding: 8, minWidth: 280, marginBottom: 12 }} />

      {(d.items || []).map((b) => {
        const sellers = b.users.filter((u) => u.role !== 'OWNER');
        return (
          <div key={b.id} className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{b.business_name}</h3>
              <label>Sales/Service Persons see Business Purchases
                <select aria-label={`${b.business_name} default purchases`} value={b.sales_can_see_purchases ? 'yes' : 'no'} style={{ marginLeft: 6, padding: 6 }}
                  onChange={(e) => save(() => updateBusiness(b.id, { sales_can_see_purchases: e.target.value === 'yes' }), `Purchases default for ${b.business_name} saved.`)}>
                  <option value="no">No</option><option value="yes">Yes</option></select></label>
              <label>Business Expenses
                <select aria-label={`${b.business_name} default expenses`} value={b.sales_can_see_expenses ? 'yes' : 'no'} style={{ marginLeft: 6, padding: 6 }}
                  onChange={(e) => save(() => updateBusiness(b.id, { sales_can_see_expenses: e.target.value === 'yes' }), `Expenses default for ${b.business_name} saved.`)}>
                  <option value="no">No</option><option value="yes">Yes</option></select></label>
            </div>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table>
                <thead><tr><th>Person</th><th>Purchases tile (own choice)</th><th>Now</th><th>Expenses tile (own choice)</th><th>Now</th></tr></thead>
                <tbody>
                  <tr><td>{b.users.find((u) => u.role === 'OWNER')?.full_name || '—'} <span className="muted">(Owner)</span></td><td colSpan={4} className="muted">The Owner always sees both tiles.</td></tr>
                  {sellers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}{u.status === 'inactive' ? ' (switched off)' : ''}</td>
                      <td><TriChoice label={`${u.full_name} purchases tile`} value={u.can_see_purchases} onChange={(v) => save(() => updateBusinessUser(b.id, u.id, { can_see_purchases: v }), `${u.full_name}: Purchases tile saved.`)} /></td>
                      <td>{tick(u.purchases_allowed)}</td>
                      <td><TriChoice label={`${u.full_name} expenses tile`} value={u.can_see_expenses} onChange={(v) => save(() => updateBusinessUser(b.id, u.id, { can_see_expenses: v }), `${u.full_name}: Expenses tile saved.`)} /></td>
                      <td>{tick(u.expenses_allowed)}</td>
                    </tr>))}
                  {sellers.length === 0 && <tr><td colSpan={5} className="muted">No Sales/Service Persons in this business yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>);
      })}
      {res.loading && <p className="muted">Loading…</p>}
      {!res.loading && (d.items || []).length === 0 && <p className="muted">No businesses found.</p>}
      <Pagination page={page} pageSize={pageSize} total={d.total || 0} disabled={res.loading} pageSizes={[5, 10, 20, 50]} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
    </div>
  );
}
