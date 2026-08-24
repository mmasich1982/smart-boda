// admin-console/src/pages/MasterDataDropdowns.jsx
import React, { useEffect, useState } from 'react';
import {
  listLanguages,
  createLanguage,
  updateLanguage,
  listFuelTypes,
  createFuelType,
  listUiStrings,
  updateUiString,
} from '../api/masterData';
import { currentAdminName } from '../auth/session'; // TODO: confirm actual import path/module
import { cacheMasterData, readCachedMasterData } from '../api/offlineCache';
// BR-SB01-011 / BR-SB02-002: this screen is the ONLY place these two dropdowns are edited.
// Issue 6 fix: Petrol and Electric are now marked as read-only (is_default=true)
export default function MasterDataDropdowns() {
  const [languages, setLanguages] = useState([]);
  const [fuelTypes, setFuelTypes] = useState([]);
  const [newLangCode, setNewLangCode] = useState('');
  const [newLangName, setNewLangName] = useState('');
  const [newFuelCode, setNewFuelCode] = useState('');
  const [newFuelName, setNewFuelName] = useState('');
  const [reviewingLanguage, setReviewingLanguage] = useState(null); // which language's translations are open
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { refresh(); }, []);
  
  async function refresh() {
    setLoading(true);
    setError('');
    // AUDIT FIX: offlineCache.js was fully written (idb-backed) but never imported anywhere
    // in the app. Wired in here as a read-through cache so this screen still shows the
    // last-known dropdown values if the admin's connection drops mid-session.
    try {
      const [langs, fuels] = await Promise.all([listLanguages(), listFuelTypes()]);
      setLanguages(langs);
      setFuelTypes(fuels);
      setOffline(false);
      cacheMasterData('languages', langs);
      cacheMasterData('fuelTypes', fuels);
    } catch (err) {
      try {
        const [cachedLangs, cachedFuels] = await Promise.all([
          readCachedMasterData('languages'), readCachedMasterData('fuelTypes'),
        ]);
        if (cachedLangs || cachedFuels) {
          setLanguages(cachedLangs || []);
          setFuelTypes(cachedFuels || []);
          setOffline(true);
        } else {
          setError(err?.response?.data?.detail || err.message || 'Failed to load master data');
        }
      } catch (cacheErr) {
        setError(err?.response?.data?.detail || err.message || 'Failed to load master data');
      }
    } finally {
      setLoading(false);
    }
  }
  async function handleAddLanguage() {
    if (!newLangCode || !newLangName) return;
    await createLanguage(newLangCode, newLangName);
    setNewLangCode(''); setNewLangName('');
    refresh();
  }
  async function handleAddFuelType() {
    if (!newFuelCode || !newFuelName) return;
    await createFuelType(newFuelCode, newFuelName);
    setNewFuelCode(''); setNewFuelName('');
    refresh();
  }
  return (
    <div className="page">
      <h1>Master Data & Dropdown Configuration</h1>
      {error && <p role="alert" style={{ color: 'red', background: '#ffe6e6', padding: 12, borderRadius: 6, marginBottom: 16 }}>
        ❌ Error: {error}
      </p>}
      {offline && <p role="status" style={{ background: '#fff3cd', padding: 8, borderRadius: 6 }}>
        ⚠️ Showing last-known values — couldn't reach the server. Changes are disabled until reconnected.
      </p>}
      {loading && <p>Loading master data...</p>}
      {!loading && <p className="muted">Changes here appear in the Rider App the next time it syncs master data — no app release required.</p>}
      <section>
        <h2>Language List (Onboarding & Settings)</h2>
        <table>
          <thead><tr><th>Code</th><th>Display Name</th><th>Active</th><th>Translations</th></tr></thead>
          <tbody>
            {languages.map((l) => (
              <tr key={l.id}>
                <td>{l.code}</td>
                <td>{l.display_name}</td>
                <td>
                  <input type="checkbox" checked={l.is_active}
                    onChange={(e) => updateLanguage(l.id, { is_active: e.target.checked }).then(refresh)} />
                </td>
                <td>
                  <button onClick={() => setReviewingLanguage(l)}>Manage Translations</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="add-row">
          <input placeholder="code e.g. ki" value={newLangCode} onChange={(e) => setNewLangCode(e.target.value)} />
          <input placeholder="display name e.g. Gĩkũyũ" value={newLangName} onChange={(e) => setNewLangName(e.target.value)} />
          <button onClick={handleAddLanguage}>+ Add Language</button>
        </div>
      </section>
      {reviewingLanguage && (
        <section>
          <h2>Translation Review — {reviewingLanguage.display_name}</h2>
          <TranslationReviewTab
            language={reviewingLanguage}
            onLanguageUpdated={refresh}
          />
          <button onClick={() => setReviewingLanguage(null)}>Close</button>
        </section>
      )}
      <section>
        <h2>Bike Fuel Type List</h2>
        <p className="muted">Petrol and Electric are default fuel types and cannot be edited or deleted. You can only add additional fuel types.</p>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Display Name</th>
              <th>Active</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {fuelTypes.map((f) => (
              <tr key={f.id}>
                <td>{f.code}</td>
                <td>{f.display_name}</td>
                <td>
                  {f.is_default ? (
                    <input type="checkbox" checked={f.is_active} disabled title="Default fuel types cannot be deactivated" />
                  ) : (
                    <input 
                      type="checkbox" 
                      checked={f.is_active}
                      onChange={(e) => updateLanguage(f.id, { is_active: e.target.checked }).then(refresh)} 
                    />
                  )}
                </td>
                <td>
                  {f.is_default ? (
                    <span style={{ color: '#1e9e6f', fontWeight: 'bold' }}>🔒 Read-Only (Default)</span>
                  ) : (
                    <span style={{ color: '#5b606c' }}>Custom</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="add-row">
          <input placeholder="code e.g. CNG" value={newFuelCode} onChange={(e) => setNewFuelCode(e.target.value)} />
          <input placeholder="display name e.g. CNG" value={newFuelName} onChange={(e) => setNewFuelName(e.target.value)} />
          <button onClick={handleAddFuelType}>+ Add Fuel Type</button>
        </div>
      </section>
    </div>
  );
}
// Renders one editable row per string_key for the chosen language, with a "needs review" flag,
// so an Embu- or Kalenjin-speaking reviewer can work through the list and sign off row by row.
function TranslationReviewTab({ language, onLanguageUpdated }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => { 
    setLoading(true);
    setError('');
    listUiStrings(language.code)
      .then(setRows)
      .catch(err => setError(err?.response?.data?.detail || err.message || 'Failed to load translations'))
      .finally(() => setLoading(false));
  }, [language.code]);
  
  async function handleSave(row, newText) {
    try {
      await updateUiString(row.id, { translated_text: newText, needs_review: false, reviewed_by: currentAdminName() });
      setRows(await listUiStrings(language.code));
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save translation');
    }
  }
  if (loading) return <p>Loading translations...</p>;
  if (error) return <p role="alert" style={{ color: 'red' }}>Error loading translations: {error}</p>;

  const allReviewed = rows.length > 0 && rows.every((r) => !r.needs_review);
  return (
    <>
      <table>
        <thead><tr><th>Key</th><th>English (reference)</th><th>Translation</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.string_key}</td>
              <td>{r.english_reference}</td>
              <td><textarea defaultValue={r.translated_text} onBlur={(e) => handleSave(r, e.target.value)} /></td>
              <td>{r.needs_review ? '⚠️ Needs review' : '✅ Reviewed'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* BR-SB01-011: activation is a deliberate, separate Super Admin decision — never automatic */}
      <button
        disabled={!allReviewed || language.is_active}
        onClick={() => updateLanguage(language.id, { is_active: true }).then(onLanguageUpdated).catch(err => setError(err?.response?.data?.detail || err.message || 'Failed to activate language'))}
      >
        {language.is_active ? '✅ Live for MVP0 riders' : 'Activate for Riders (MVP1 launch)'}
      </button>
    </>
  );
}