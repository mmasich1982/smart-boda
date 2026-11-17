// admin-console/src/components/TriChoice.jsx
// A person's own choice for one tile: "Same as business" (no choice of their own), Yes, or No.
// The server stores it as null / true / false; the select works with 'same' / 'yes' / 'no'.
import React from 'react';

export const toTri = (v) => (v === true ? 'yes' : v === false ? 'no' : 'same');
export const fromTri = (t) => (t === 'yes' ? true : t === 'no' ? false : null);
export const errText = (e, fallback) => {            // detail is a string for our errors, a LIST for a 422
  const d = e?.response?.data?.detail;
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  const x = Array.isArray(d) ? d[0] || {} : {};
  return String(x.msg || fallback).replace(/^Value error,\s*/, '');
};

export default function TriChoice({ value, onChange, label, disabled = false }) {
  return (
    <select aria-label={label} value={toTri(value)} disabled={disabled} onChange={(e) => onChange(fromTri(e.target.value))} style={{ padding: 6 }}>
      <option value="same">Same as business</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}
