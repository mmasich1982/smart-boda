// admin-console/src/pages/BusinessesMap.jsx
// Manage Businesses > Businesses Map. Every registered business that has a GPS position, as a dot on a map, coloured by status. Tap a dot for the business, its
// type, Owner, number of people and how accurate the position is. Businesses registered before GPS capture existed are listed below the map so the position can
// be added from Businesses and Users > Edit type and location. Filters: search, status, business type (the same search as the list).
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBusinessesMap, listBusinessTypes } from '../api/businesses';
import { useApiResource } from '../hooks/useApiResource';
import BusinessMapFrame from '../components/BusinessMapFrame';
import { STATUS_COLOR, STATUS_LABEL } from '../utils/mapHtml';

export default function BusinessesMap() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const types = useApiResource(() => listBusinessTypes(), []);
  const res = useApiResource(() => getBusinessesMap({ q: q || undefined, status: status || undefined, business_type_code: type || undefined }), [q, status, type]);
  const d = res.data || {};
  const pins = useMemo(() => d.items || [], [d.items]);
  const card = (t, v, color) => <div className="card" style={{ flex: 1, minWidth: 130 }}><div className="muted" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 700, color }}>{v ?? '—'}</div></div>;
  return (
    <div className="page">
      <h1>Businesses Map</h1>
      <p className="muted">Every registered business with a GPS position. Dot colour shows the status. To add a position to a business registered earlier, open <Link to="/businesses/list">Businesses and Users</Link> and use Edit type and location.</p>
      {res.error && <p role="alert" style={{ color: 'red' }}>{String(res.error)}</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {card('On the map', d.located)}{card('Without a position', d.not_located, d.not_located ? '#8a5a00' : undefined)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input placeholder="Search business, person or phone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, padding: 8 }} />
        <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8 }}>
          <option value="">All statuses</option><option value="pending_setup">Pending setup</option><option value="activated">Activated</option><option value="inactive">Switched off</option>
        </select>
        <select aria-label="Business type filter" value={type} onChange={(e) => setType(e.target.value)} style={{ padding: 8 }}>
          <option value="">All business types</option>
          {((types.data && types.data.items) || []).map((t) => <option key={t.code} value={t.code}>{t.display_name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
        {Object.keys(STATUS_LABEL).map((k) => <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[k], marginRight: 5 }} />{STATUS_LABEL[k]}</span>)}
      </div>
      {res.loading && !res.data ? <p className="muted">Loading the map…</p> : pins.length ? <BusinessMapFrame points={pins} /> : <div className="card" data-testid="map-empty">No business with a GPS position matches. {d.not_located ? 'Add positions to the businesses listed below.' : ''}</div>}
      {d.pins_truncated && <p className="muted">Only the first 5,000 positions are drawn. Narrow the search to see the rest.</p>}

      {(d.missing || []).length > 0 && (
        <div className="card" style={{ marginTop: 14 }} data-testid="map-missing">
          <h3 style={{ marginTop: 0 }}>Businesses without a GPS position ({d.not_located})</h3>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>These were registered before GPS capture. Their old place name is shown where there is one.</div>
          <table><thead><tr><th>Business</th><th>Type</th><th>Owner</th><th>Old place name</th></tr></thead>
            <tbody>{d.missing.map((b) => <tr key={b.id}><td>{b.business_name}</td><td>{b.business_type || '—'}</td><td>{b.owner_name || '—'}</td><td>{b.place || '—'}</td></tr>)}</tbody></table>
          {d.missing_truncated && <p className="muted">Only the first 500 are listed. Narrow the search to see the rest.</p>}
        </div>
      )}
    </div>
  );
}
