// admin-console/src/pages/PaymentHistory.jsx
// "Payment History (filterable)" -- backed by GET /admin/payments.
import React, { useEffect, useState } from 'react';
import api from '../api/client';

const STATUS_OPTIONS = ['All', 'Pending Super Admin Review', 'Verified', 'Rejected — Code Not Found'];

export default function PaymentHistory() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = { page, page_size: 20 };
    if (status !== 'All') params.status = status;
    api.get('/admin/payments', { params })
      .then((res) => {
        setItems(res.data.items);
        setTotalPages(res.data.total_pages);
      })
      .catch((err) => setError(err?.response?.data?.detail || err.message || 'Failed to load payment history'))
      .finally(() => setLoading(false));
  }, [status, page]);

  return (
    <div>
      <h2>Payment History</h2>
      <div style={{ marginBottom: 16 }}>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: 8 }} disabled={loading}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && <p role="alert" style={{ color: 'red', marginBottom: 16 }}>❌ {error}</p>}
      {loading ? <p>Loading...</p> : (
        <table>
          <thead>
            <tr><th>Rider</th><th>Phone</th><th>M-Pesa Code</th><th>Plan</th><th>Amount</th><th>Status</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.rider_name}</td>
                <td>{p.rider_phone}</td>
                <td>{p.mpesa_code}</td>
                <td>{p.label}</td>
                <td>KSh {p.amount.toLocaleString()}</td>
                <td>{p.reconciliation}</td>
                <td>{new Date(p.submitted_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <span>Page {page} of {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}
