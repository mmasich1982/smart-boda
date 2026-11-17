// admin-console/src/pages/BusinessStatementRequests.jsx
// Manage Businesses > Statement Requests. (1) Every request from a Business Owner for a statement older than the six months kept on their phone:
// business, period, type and status. The Administrator prepares it FROM THE SERVER RECORDS and marks it Ready; it then appears in the Owner's app
// (Saved Statements and Requests) ready to download. Nothing is e-mailed. Service time is the same as for riders: 24 hours.
import React, { useState } from 'react';
import { listStatementRequests, prepareStatement } from '../api/businessStatements';
import { useApiResource } from '../hooks/useApiResource';
import { errText } from '../components/TriChoice';

const STATUS = { requested: '🟡 Requested', ready: '🟢 Ready' };
const TYPE = { summary: 'Summary', detailed: 'Detailed' };
const when = (v) => (v ? new Date(v).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function BusinessStatementRequests() {
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const res = useApiResource(() => listStatementRequests({ status: status || undefined }), [status]);
  const d = res.data || {};
  const items = d.items || [];

  async function prepare(r) {
    setBusyId(r.id);
    try {
      const out = await prepareStatement(r.id);
      setMsg({ ok: true, text: `Statement for ${r.business_name} is Ready. Verification code ${out.verification_code}.` });
      res.refresh();
    } catch (e) { setMsg({ ok: false, text: errText(e, 'We could not prepare that statement.') }); } finally { setBusyId(null); }
  }

  return (
    <div className="page">
      <h1>Statement Requests</h1>
      <p className="muted">Business Owners ask here for statements older than the six months kept on their phone. Prepare each one from the server records within 24 hours; it then appears in the Owner's app, ready to download.</p>
      {msg && <div className="card" role="status" style={{ borderColor: msg.ok ? '#43a047' : '#d32f2f' }}>{msg.text} <button className="secondary" onClick={() => setMsg(null)}>OK</button></div>}
      {res.error && <p role="alert" style={{ color: 'red' }}>{String(res.error)}</p>}
      <div style={{ marginBottom: 12 }}>
        <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8 }}>
          <option value="">All requests</option><option value="requested">Requested</option><option value="ready">Ready</option>
        </select>
      </div>
      <table className="table" style={{ width: '100%' }}>
        <thead><tr><th>Business</th><th>Period</th><th>Type</th><th>Purpose</th><th>Requested</th><th>Status</th><th /></tr></thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>{r.business_name}</td><td>{r.period_from} → {r.period_to}</td><td>{TYPE[r.statement_type]}</td><td>{r.purpose || '—'}</td><td>{when(r.requested_at)}</td>
              <td>{STATUS[r.status]}{r.status === 'ready' ? <div className="muted" style={{ fontSize: 12 }}>{when(r.ready_at)}</div> : null}</td>
              <td>{r.status === 'requested' ? <button onClick={() => prepare(r)} disabled={busyId === r.id}>{busyId === r.id ? 'Preparing…' : 'Prepare and mark Ready'}</button>
                : <button className="secondary" onClick={() => prepare(r)} disabled={busyId === r.id} title="Rebuild from the latest server records">Prepare again</button>}</td>
            </tr>
          ))}
          {!items.length && !res.loading && <tr><td colSpan={7} className="muted">No statement requests.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
