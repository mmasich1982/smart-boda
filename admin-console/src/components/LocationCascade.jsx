// admin-console/src/components/LocationCascade.jsx
// County -> Sub-County -> Ward, mirroring rider-app ProfileConfirmationScreen:
// counties load on open, sub-counties on county pick, wards on sub-county pick;
// picking a parent clears its children.
//
// Props:  value    { county_id, sub_county_id, ward_id }   (the form object works as-is)
//         onChange (loc) => void, called with ONLY { county_id, sub_county_id, ward_id }
//         errors   { county_id?, sub_county_id?, ward_id? }  message under each select
import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Public endpoints /location-data/* (defined in backend main.py); max page size is 500.
const load = async (url, params) =>
  (await client.get(url, { params: { ...params, limit: 500 } })).data.data.map((x) => ({ id: x.id, name: x.name }));

// Defined OUTSIDE LocationCascade on purpose: a component declared inside another is a new
// component type on every render, so React would remount (and close) the <select> each time.
function Field({ label, val, opts, disabled, onPick, err }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{label} <span style={{ color: '#d32f2f' }}>*</span></div>
      <select value={val ?? ''} disabled={disabled} onChange={onPick} style={{ width: '100%', padding: 8 }}>
        <option value="">Select {label}…</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {err && <div role="alert" style={{ color: '#d32f2f', fontSize: 12 }}>⚠️ {err}</div>}
    </label>
  );
}

export default function LocationCascade({ value, onChange, errors = {} }) {
  const [counties, setCounties] = useState([]);
  const [subs, setSubs] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    load('/location-data/counties', {}).then(setCounties).catch(() => setLoadError('Failed to load counties'));
  }, []);

  // `alive` stops a slow response for a previously picked county from overwriting the new list.
  useEffect(() => {
    let alive = true;
    setSubs([]);
    if (value.county_id) {
      load('/location-data/sub-counties', { county_id: value.county_id })
        .then((r) => alive && setSubs(r)).catch(() => alive && setLoadError('Failed to load sub-counties'));
    }
    return () => { alive = false; };
  }, [value.county_id]);

  useEffect(() => {
    let alive = true;
    setWards([]);
    if (value.sub_county_id) {
      load('/location-data/wards', { sub_county_id: value.sub_county_id })
        .then((r) => alive && setWards(r)).catch(() => alive && setLoadError('Failed to load wards'));
    }
    return () => { alive = false; };
  }, [value.sub_county_id]);

  const num = (e) => (e.target.value ? Number(e.target.value) : null);
  const loc = (patch) => onChange({ county_id: value.county_id ?? null, sub_county_id: value.sub_county_id ?? null, ward_id: value.ward_id ?? null, ...patch });

  return (
    <div>
      {loadError && <div role="alert" style={{ color: '#d32f2f' }}>{loadError}</div>}
      <Field label="County" val={value.county_id} opts={counties} err={errors.county_id}
        onPick={(e) => { setLoadError(null); loc({ county_id: num(e), sub_county_id: null, ward_id: null }); }} />
      <Field label="Sub-County" val={value.sub_county_id} opts={subs} disabled={!value.county_id} err={errors.sub_county_id}
        onPick={(e) => loc({ sub_county_id: num(e), ward_id: null })} />
      <Field label="Ward" val={value.ward_id} opts={wards} disabled={!value.sub_county_id} err={errors.ward_id}
        onPick={(e) => loc({ ward_id: num(e) })} />
    </div>
  );
}
