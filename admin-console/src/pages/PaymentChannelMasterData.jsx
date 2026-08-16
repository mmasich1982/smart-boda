// admin-console/src/pages/PaymentChannelMasterData.jsx
import React, { useEffect, useState } from 'react';
import { listPaymentChannels, updatePaymentChannel, listCorrectionReasons, createCorrectionReason } from '../api/tripMasterData';

// BR-SB05-003: this screen is the ONLY place the five payment-channel labels/icons are edited.
export default function PaymentChannelMasterData() {
  const [channels, setChannels] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [newReasonCode, setNewReasonCode] = useState('');
  const [newReasonName, setNewReasonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { refresh(); }, []);
  
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [c, r] = await Promise.all([listPaymentChannels(), listCorrectionReasons()]);
      setChannels(c);
      setReasons(r);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load payment channels');
    } finally {
      setLoading(false);
    }
  }

  // AUDIT FIX: createCorrectionReason was imported but never called from anywhere --
  // there was no way to actually add a correction reason through this screen.
  async function handleAddReason() {
    if (!newReasonCode || !newReasonName) return;
    try {
      await createCorrectionReason(newReasonCode, newReasonName);
      setNewReasonCode(''); 
      setNewReasonName('');
      refresh();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to add correction reason');
    }
  }

  if (loading) return <div className="page"><h1>Payment Channel & Correction Reason Master Data</h1><p>Loading...</p></div>;

  return (
    <div className="page">
      <h1>Payment Channel & Correction Reason Master Data</h1>
      {error && <p role="alert" style={{ color: 'red', marginBottom: 16 }}>❌ {error}</p>}
      <section>
        <h2>Payment Channels (all five are equally-weighted manual-entry options — BR-SB05-004)</h2>
        <table>
          <thead><tr><th>Code</th><th>Display Name</th><th>Active</th></tr></thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td>{c.emoji} {c.code}</td>
                <td>{c.display_name}</td>
                <td><input type="checkbox" checked={c.is_active}
                  onChange={(e) => updatePaymentChannel(c.id, { is_active: e.target.checked }).then(refresh)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Correction Reason List</h2>
        <table>
          <thead><tr><th>Code</th><th>Display Name</th></tr></thead>
          <tbody>{reasons.map((r) => (<tr key={r.id}><td>{r.code}</td><td>{r.display_name}</td></tr>))}</tbody>
        </table>
        <div className="add-row">
          <input placeholder="code e.g. wrong_amount" value={newReasonCode} onChange={(e) => setNewReasonCode(e.target.value)} />
          <input placeholder="display name e.g. Wrong Amount Entered" value={newReasonName} onChange={(e) => setNewReasonName(e.target.value)} />
          <button onClick={handleAddReason}>+ Add Correction Reason</button>
        </div>
      </section>
    </div>
  );
}
