// admin-console/src/pages/MasterDataLegalContent.jsx
// "Legal Content (Terms, Privacy)" -- edits the same content rider-app's
// screens/legal/TermsOfServiceScreen.js and DataPrivacyScreen.js render.
// Backed by GET/PUT /admin/master-data/legal-content.
import React, { useEffect, useState } from 'react';
import { getLegalContent, updateLegalContent } from '../api/masterData';

const DOCS = [
  { key: 'terms_of_service', label: 'Terms of Service' },
  { key: 'data_privacy', label: 'Data Privacy Policy' },
];

export default function MasterDataLegalContent() {
  const [active, setActive] = useState('terms_of_service');
  const [content, setContent] = useState({});
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getLegalContent()
      .then((data) => {
        setContent(data);
        setDraft(data[active] || '');
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || err.message || 'Failed to load legal content');
      })
      .finally(() => setLoading(false));
    // Intentionally runs once on mount only; the effect below re-derives `draft` on tab change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDraft(content[active] || '');
    // `content` intentionally excluded: including it would re-run this on every handleSave()
    // and stomp any in-progress edit in the textarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function handleSave() {
    setSaving(true);
    setSavedMsg('');
    setError('');
    try {
      await updateLegalContent(active, draft);
      setContent((c) => ({ ...c, [active]: draft }));
      setSavedMsg('Saved ✅ -- riders will see this the next time they open the screen.');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save legal content');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading legal content...</p>;
  if (error && !content[active]) return <p role="alert" style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <h2>Legal Content (Terms, Privacy)</h2>
      {error && <p role="alert" style={{ color: 'red', marginBottom: 16 }}>❌ {error}</p>}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {DOCS.map((d) => (
          <button key={d.key} className={active === d.key ? 'primary' : ''} onClick={() => setActive(d.key)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--line)', background: active === d.key ? undefined : '#fff' }}>
            {d.label}
          </button>
        ))}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={20}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}
      />
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {savedMsg && <span style={{ color: '#1e9e6f', fontSize: 13 }}>{savedMsg}</span>}
      </div>
    </div>
  );
}
