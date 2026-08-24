// admin-console/src/pages/TripEntryRuleConfiguration.jsx
import React, { useEffect, useState } from 'react';
import { getRuleConfig, updateRuleConfig } from '../api/tripMasterData';

// BR-SB07-001/007: the two numbers that govern every correction-window/OOW decision app-wide.
export default function TripEntryRuleConfiguration() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    getRuleConfig()
      .then(setConfig)
      .catch(err => setError(err?.response?.data?.detail || err.message || 'Failed to load configuration'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(key, value) {
    setSaving(true);
    setError('');
    try {
      await updateRuleConfig(key, Number(value));
      setConfig(await getRuleConfig());
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page"><h1>Trip & Entry Rule Configuration</h1><p>Loading configuration...</p></div>;

  return (
    <div className="page">
      <h1>Trip & Entry Rule Configuration</h1>
      {error && <p role="alert" style={{ color: 'red', marginBottom: 16 }}>❌ {error}</p>}
      <div className="field">
        <label>Correction Window (hours)</label>
        <input type="number" defaultValue={config.correction_window_hours}
          onBlur={(e) => handleSave('correction_window_hours', e.target.value)}
          disabled={saving} />
      </div>
      <div className="field">
        <label>Out-of-Window Request SLA (hours)</label>
        <input type="number" defaultValue={config.oow_request_sla_hours}
          onBlur={(e) => handleSave('oow_request_sla_hours', e.target.value)}
          disabled={saving} />
      </div>
      {saving && <p style={{ color: 'var(--ink-soft)' }}>Saving...</p>}
      <p className="muted">Changes apply the next time a rider's app syncs this configuration — no app release required.</p>
    </div>
  );
}
