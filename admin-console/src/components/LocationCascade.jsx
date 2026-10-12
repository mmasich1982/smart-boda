// admin-console/src/components/LocationCascade.jsx
import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Mirrors rider-app ProfileConfirmationScreen: counties on open, sub-counties on county pick,
// wards on sub-county pick; picking a parent clears the children.
const load = async (url, params) =>
  (await client.get(url, { params: { ...params, limit: 500 } })).data.data.map((x) => ({ id: x.id, name: x.name }));

export default function LocationCascade({ value, onChange, errors = {} }) {
  const [counties, setCounties] = useState([]);
  const [subs, setSubs] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => { load('/location-data/counties', {}).then(setCounties).catch(() => setLoadError('Failed to load counties')); }, []);
  useEffect(() => {
    setSubs([]);
    if (value.county_id) load('/location-data/sub-counties', { county_id: value.county_id }).then(setSubs).catch(() => setLoadError('Failed to load sub-counties'));
  }, [value.county_id]);
  useEffect(() => {
    setWards([]);
    if (value.sub_county_id) load('/location-data/wards', { sub_county_id: value.sub_county_id }).then(setWards).catch(() => setLoadError('Failed to load wards'));
  }, [value.sub_county_id]);

  const num = (e) => (e.target.value ? Number(e.target.value) : null);
  const Field = ({ label, val, opts, disabled, onPick, err }) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{label} <span style={{ color: '#d32f2f' }}>*</span></div>
      <select value={val ?? ''} disabled={disabled} onChange={onPick} style={{ width: '100%', padding: 8 }}>
        <option value="">Select {label}…</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {err && <div role="alert" style={{ color: '#d32f2f', fontSize: 12 }}>⚠️ {err}</div>}
    </label>
  );
  return (
    <div>
      {loadError && <div role="alert" style={{ color: '#d32f2f' }}>{loadError}</div>}
      <Field label="County" val={value.county_id} opts={counties} err={errors.county_id}
        onPick={(e) => onChange({ county_id: num(e), sub_county_id: null, ward_id: null })} />
      <Field label="Sub-County" val={value.sub_county_id} opts={subs} disabled={!value.county_id} err={errors.sub_county_id}
        onPick={(e) => onChange({ ...value, sub_county_id: num(e), ward_id: null })} />
      <Field label="Ward" val={value.ward_id} opts={wards} disabled={!value.sub_county_id} err={errors.ward_id}
        onPick={(e) => onChange({ ...value, ward_id: num(e) })} />
    </div>
  );
}