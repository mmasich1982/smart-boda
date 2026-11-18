// admin-console/src/components/BusinessPerformance.jsx
// The "Business Performance" tab under a business card (Businesses and Users). READ ONLY. Daily, monthly, quarterly, half-yearly and yearly performance,
// the trend, and advice prompts the Administrator can use when advising the owner. Figures come from GET /admin/businesses/{id}/performance
// (the same money formula as the Owner's reports); this component only draws them.
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getBusinessPerformance } from '../api/businesses';
import { errText } from './TriChoice';

const VIEWS = [['daily', 'Daily'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['half_yearly', 'Half-yearly'], ['yearly', 'Yearly']];
const kes = (n) => `KSh ${Math.round(Number(n) || 0).toLocaleString()}`;
const arrow = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '▲' : v < 0 ? '▼' : '■'} ${Math.abs(v).toFixed(0)}%`);
const colour = (v) => (v === null || v === undefined || Math.abs(v) < 2 ? '#666' : v > 0 ? '#2e7d32' : '#c62828');
const LEVEL = { red: { bg: '#ffebee', bd: '#e0453f' }, amber: { bg: '#fff8e1', bd: '#f5a623' }, info: { bg: '#e8f5e9', bd: '#43a047' } };

export default function BusinessPerformance({ businessId }) {
  const [view, setView] = useState('monthly');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true; setData(null); setErr(null);
    getBusinessPerformance(businessId, view).then((d) => live && setData(d)).catch((e) => live && setErr(errText(e, 'Could not load the performance.')));
    return () => { live = false; };
  }, [businessId, view]);
  const h = data && data.headline;
  return (
    <div style={{ marginTop: 10 }} data-testid={`performance-${businessId}`}>
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {VIEWS.map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'primary' : 'secondary'} onClick={() => setView(k)}>{l}</button>)}
      </div>
      {err && <div className="card" role="alert" style={{ borderColor: '#d32f2f' }}>{err}</div>}
      {!data && !err && <p className="muted">Loading…</p>}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: 1, minWidth: 180 }}>
              <div className="muted" style={{ fontSize: 12 }}>Net profit · {h.label}{h.complete ? '' : ' (so far)'}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: h.net_profit < 0 ? '#c62828' : '#2e7d32' }}>{kes(h.net_profit)}</div>
              <div style={{ fontSize: 13, color: colour(h.net_profit_change_pct) }}>{h.previous_label ? `${arrow(h.net_profit_change_pct)} on ${h.previous_label}` : 'no earlier period'}</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 180 }}><div className="muted" style={{ fontSize: 12 }}>Income</div><div style={{ fontSize: 22, fontWeight: 700 }}>{kes(h.income)}</div><div style={{ fontSize: 13, color: colour(h.income_change_pct) }}>{arrow(h.income_change_pct)}</div></div>
            <div className="card" style={{ flex: 1, minWidth: 180 }}><div className="muted" style={{ fontSize: 12 }}>Purchases / Expenses</div><div style={{ fontSize: 16, fontWeight: 700 }}>{kes(h.purchases)} / {kes(h.expenses)}</div></div>
          </div>

          <h4>Advice for the Administrator</h4>
          {data.advice.map((a) => <div key={a.code} className="card" style={{ background: (LEVEL[a.level] || LEVEL.info).bg, borderLeft: `4px solid ${(LEVEL[a.level] || LEVEL.info).bd}`, marginBottom: 8 }}>{a.text}</div>)}

          <h4>Trend</h4>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip formatter={(v) => kes(v)} /><Legend />
                <Bar dataKey="income" name="Income" fill="#2e7d32" /><Bar dataKey="purchases" name="Purchases" fill="#f5a623" /><Bar dataKey="expenses" name="Expenses" fill="#e0453f" /><Bar dataKey="net_profit" name="Net profit" fill="#1565c0" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Period</th><th>Income</th><th>Purchases</th><th>Expenses</th><th>Net profit</th><th>Change in net profit</th><th>Sales</th></tr></thead>
              <tbody>
                {data.series.slice().reverse().map((r) => (
                  <tr key={r.label}><td>{r.label}{r.complete ? '' : ' (so far)'}</td><td>{kes(r.income)}</td><td>{kes(r.purchases)}</td><td>{kes(r.expenses)}</td>
                    <td style={{ color: r.net_profit < 0 ? '#c62828' : undefined }}>{kes(r.net_profit)}</td><td style={{ color: colour(r.net_profit_change_pct) }}>{arrow(r.net_profit_change_pct)}</td><td>{r.sales_count}</td></tr>))}
              </tbody>
            </table>
          </div>

          <h4>Lipa Later</h4>
          <p>Customers owe <b>{kes(data.lipa_later.customers_owe)}</b> ({data.lipa_later.customers_count}); {kes(data.lipa_later.customers_overdue)} is over 60 days overdue. The business owes suppliers <b>{kes(data.lipa_later.business_owes)}</b> ({data.lipa_later.suppliers_count}).</p>

          {data.selected.cost_breakdown.length > 0 && (<><h4>Where the money went in {data.selected.label}</h4>
            <ul>{data.selected.cost_breakdown.map((c) => <li key={c.label}>{c.label} · {kes(c.amount)} · {c.percent}%</li>)}</ul></>)}
          {data.selected.by_person.length > 0 && (<><h4>By person in {data.selected.label}</h4>
            <ul>{data.selected.by_person.map((p) => <li key={p.user_id}>{p.full_name || 'Person'} · {kes(p.income)} from {p.sales_count} sale{p.sales_count === 1 ? '' : 's'}</li>)}</ul></>)}
        </>
      )}
    </div>
  );
}
