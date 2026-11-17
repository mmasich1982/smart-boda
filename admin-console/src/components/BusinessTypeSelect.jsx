// admin-console/src/components/BusinessTypeSelect.jsx
// SMART BIZNA: the Business Type chosen by the Administrator when a business is pre-registered (or corrected later). The list is the Business Type
// master data and is not exhaustive, so the last option is "+ Add a new business type…": the Administrator types the name, it is SAVED to the master
// list (it then appears here and on the Business Types page, for every later registration) and is selected at once. That is why there is no "Other".
// Business owners and Sales/Service Persons never see or choose a Business Type in the app.
//
// Props: value (the type's code or ''), onChange(code), error (text shown under the field)
import React, { useState } from 'react';
import { listBusinessTypes, addBusinessType } from '../api/businesses';
import { useApiResource } from '../hooks/useApiResource';
import { errText } from './TriChoice';

const ADD = '__add_new__';

export default function BusinessTypeSelect({ value, onChange, error }) {
  const res = useApiResource(() => listBusinessTypes(), []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = ((res.data || {}).items || []).filter((t) => t.is_active || t.code === value);

  const pick = (v) => { if (v === ADD) { setAdding(true); setProblem(null); } else { setAdding(false); onChange(v); } };

  async function addAndSelect() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) { setProblem('Type at least 2 characters.'); return; }
    const same = items.find((t) => t.display_name.toLowerCase() === clean.toLowerCase());
    if (same) { onChange(same.code); setAdding(false); setName(''); return; }              // already on the list: just select it
    setBusy(true); setProblem(null);
    try {
      const created = await addBusinessType({ display_name: clean });                        // saved to the master list
      await res.refresh();
      onChange(created.code);
      setAdding(false); setName('');
    } catch (e) { setProblem(errText(e, 'We could not add that business type.')); } finally { setBusy(false); }
  }

  return (
    <div style={{ margin: '8px 0' }}>
      <label style={{ display: 'block' }}>Business Type *
        <select aria-label="Business Type" value={adding ? ADD : value || ''} onChange={(e) => pick(e.target.value)} style={{ display: 'block', minWidth: 280, padding: 6 }}>
          <option value="">Select business type…</option>
          {items.map((t) => <option key={t.code} value={t.code}>{t.display_name}</option>)}
          <option value={ADD}>➕ Add a new business type…</option>
        </select>
      </label>
      {error && <span role="alert" style={{ color: 'red' }}>{error}</span>}
      {adding && (
        <div className="card" style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <label>New business type
            <input aria-label="New business type name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Car Wash" style={{ display: 'block', padding: 6 }} />
          </label>
          <button className="primary" onClick={addAndSelect} disabled={busy}>{busy ? 'Adding…' : 'Add and select'}</button>
          <button className="secondary" onClick={() => { setAdding(false); setName(''); setProblem(null); }}>Cancel</button>
          {problem && <span role="alert" style={{ color: 'red', flexBasis: '100%' }}>{problem}</span>}
          <span className="muted" style={{ fontSize: 12, flexBasis: '100%' }}>It is saved to the Business Type list and will be available for every business.</span>
        </div>
      )}
    </div>
  );
}
