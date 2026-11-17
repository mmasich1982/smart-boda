// admin-console/src/pages/RegisterBusiness.jsx
// Manage Businesses > Register a Business (journey A of the Smart Bizna scope document).
// Business name + one row per person: user 1 is the Business Owner, every other row a Sales/Service Person (no maximum).
// Two choices for the whole business (can Sales/Service Persons see the Business Purchases / Business Expenses tile), both starting
// at No; each Sales/Service Person row may override them with Yes / No, or stay on "Same as business".
// Every number is checked live against the whole of Smart Boda and Smart Bizna before Save; the server checks it again.
// MULTIPLE BUSINESSES: when user 1's number already belongs to a Business Owner, the Administrator may register this business UNDER THE SAME OWNER
// (confirm once; no second registration for the person). Sales/Service Person numbers can never be reused: they stay refused.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createBusiness, checkBusinessPhone } from '../api/businesses';
import BusinessTypeSelect from '../components/BusinessTypeSelect';
import LocationCascade from '../components/LocationCascade';   // REUSED: the same county > sub-county > ward picker as a Treasurer's group
import TriChoice, { errText } from '../components/TriChoice';

const PHONE_RE = /^(\+254|254|0)(7|1)[0-9]{8}$/;
const clean = (v) => (v || '').replace(/[ -]/g, '');
const keyOf = (v) => clean(v).replace(/\D/g, '').slice(-9);
let seq = 0;
const newRow = () => ({ key: ++seq, full_name: '', mobile_number: '', can_see_purchases: null, can_see_expenses: null, same_owner: false });

export default function RegisterBusiness() {
  const [name, setName] = useState('');
  const [type, setType] = useState('');                           // Business Type: chosen here by the Administrator, never by the business users
  const [loc, setLoc] = useState({ county_id: '', sub_county_id: '', ward_id: '' });   // the business location, set here by the Administrator
  const [rows, setRows] = useState(() => [newRow()]);
  const [salesPurchases, setSalesPurchases] = useState(false);   // both start at No
  const [salesExpenses, setSalesExpenses] = useState(false);
  const [checks, setChecks] = useState({});                      // row key -> { value, available, message }
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const asked = useRef({});

  // Check each complete number once it has stopped changing.
  const numbers = rows.map((r) => `${r.key}:${clean(r.mobile_number)}`).join('|');
  useEffect(() => {
    const timers = rows.map((r) => {
      const v = clean(r.mobile_number);
      if (!PHONE_RE.test(v) || asked.current[r.key] === v) return null;
      return setTimeout(() => {
        asked.current[r.key] = v;
        checkBusinessPhone(v)
          .then((res) => setChecks((c) => ({ ...c, [r.key]: { value: v, available: res.available, message: res.message, can_add_as_owner: !!res.can_add_as_owner, owner_name: res.owner_name, owner_of: res.owner_of || [] } })))
          .catch(() => setChecks((c) => { const n = { ...c }; delete n[r.key]; return n; }));
      }, 400);
    });
    return () => timers.forEach((t) => t && clearTimeout(t));
  }, [numbers]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const dupOf = (r) => rows.find((o) => o.key !== r.key && PHONE_RE.test(clean(o.mobile_number)) && keyOf(o.mobile_number) === keyOf(r.mobile_number) && PHONE_RE.test(clean(r.mobile_number)));
  const offer = (r, i) => { const c = checks[r.key]; return i === 0 && c && c.value === clean(r.mobile_number) && c.can_add_as_owner ? c : null; };   // user 1 only
  const taken = (r, i) => { const c = checks[r.key]; return c && c.value === clean(r.mobile_number) && !c.available && !(offer(r, i) && r.same_owner) ? c : null; };
  const free = (r) => { const c = checks[r.key]; return c && c.value === clean(r.mobile_number) && c.available; };
  const blocked = rows.some((r, i) => taken(r, i) || dupOf(r));
  const ownerNames = (c) => (c.owner_of || []).map((b) => b.business_name).join(', ');

  function validate() {
    const e = {};
    if (name.trim().length < 2) e.name = 'Business name is required (2 to 80 characters)';
    if (!type) e.type = 'Choose the business type, or add a new one';
    if (!loc.county_id) e.county_id = 'Select a county';
    if (!loc.sub_county_id) e.sub_county_id = 'Select a sub-county';
    if (!loc.ward_id) e.ward_id = 'Select a ward';
    rows.forEach((r) => {
      if (r.full_name.trim().length < 2) e[`n${r.key}`] = 'Name is required';
      if (!PHONE_RE.test(clean(r.mobile_number))) e[`m${r.key}`] = 'Enter a valid number, e.g. 0712345678';
    });
    return e;
  }

  async function save() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || blocked) return;
    setSaving(true);
    try {
      const res = await createBusiness({
        business_name: name.trim(), business_type_code: type, county_id: Number(loc.county_id), sub_county_id: Number(loc.sub_county_id), ward_id: Number(loc.ward_id),
        sales_can_see_purchases: salesPurchases, sales_can_see_expenses: salesExpenses,
        users: rows.map((r, i) => ({
          full_name: r.full_name.trim(), mobile_number: clean(r.mobile_number),
          ...(i === 0 ? (r.same_owner ? { same_owner: true } : {}) : { can_see_purchases: r.can_see_purchases, can_see_expenses: r.can_see_expenses }),
        })),
      });
      const same = rows[0] && rows[0].same_owner;
      setMsg({ ok: true, text: same
        ? `${res.business_name} was registered under the same Owner (${res.users[0] ? res.users[0].full_name : ''}). ${res.status === 'activated' ? 'The Owner will see it in their app, in the business switcher, the next time they are online.' : 'They will see both businesses after they set up in the Smart Boda app.'}`
        : `${res.business_name} was registered with ${res.users.length} ${res.users.length === 1 ? 'person' : 'people'}. They can now set up in the Smart Boda app with their own mobile numbers.` });
      setName(''); setType(''); setLoc({ county_id: '', sub_county_id: '', ward_id: '' }); setRows([newRow()]); setSalesPurchases(false); setSalesExpenses(false); setChecks({}); setErrors({}); asked.current = {};
    } catch (err) { setMsg({ ok: false, text: errText(err, 'Could not register the business.') }); } finally { setSaving(false); }
  }

  const yesNo = (label, value, set) => (
    <label style={{ display: 'block', margin: '6px 0' }}>{label}
      <select value={value ? 'yes' : 'no'} onChange={(e) => set(e.target.value === 'yes')} style={{ marginLeft: 8, padding: 6 }}>
        <option value="no">No</option><option value="yes">Yes</option>
      </select>
    </label>
  );

  return (
    <div className="page">
      <h1>Register a Business</h1>
      <p className="muted">Register a business and the people who work in it. You choose the business type and set the business location here; nobody on the business side is asked for either. Nobody receives a code or password: each person opens the Smart Boda app and types their own mobile number to finish the registration. To register a single motorcycle rider instead, use <Link to="/riders/individual">Individual Riders</Link>.</p>
      {msg && <div className="card" role="status" style={{ borderColor: msg.ok ? '#43a047' : '#d32f2f' }}>{msg.text} <button className="secondary" onClick={() => setMsg(null)}>OK</button>{msg.ok && <> <Link to="/businesses/list">View businesses</Link></>}</div>}

      <div className="card">
        <label style={{ display: 'block', margin: '8px 0' }}>Business Name *
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} style={{ display: 'block', minWidth: 280 }} />
          {errors.name && <span role="alert" style={{ color: 'red' }}>{errors.name}</span>}
        </label>
        <BusinessTypeSelect value={type} onChange={setType} error={errors.type} />
        <h3 style={{ margin: '14px 0 6px' }}>Business location</h3>
        <LocationCascade value={loc} errors={errors} onChange={(l) => setLoc({ ...loc, ...l })} />
        <div className="muted" style={{ marginBottom: 8 }}>Number of users: <b>{rows.length}</b> (there is no limit)</div>

        {rows.map((r, i) => (
          <div key={r.key} className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>User {i + 1} — {i === 0 ? 'Business Owner' : 'Sales/Service Person'}
              {i > 0 && <button className="secondary" style={{ float: 'right' }} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>Remove</button>}
            </div>
            <label style={{ display: 'block', margin: '6px 0' }}>Full name *
              <input aria-label={`User ${i + 1} full name`} value={r.full_name} maxLength={80} readOnly={!!r.same_owner} onChange={(e) => setRow(r.key, { full_name: e.target.value })} style={{ display: 'block' }} />
              {errors[`n${r.key}`] && <span role="alert" style={{ color: 'red' }}>{errors[`n${r.key}`]}</span>}
            </label>
            <label style={{ display: 'block', margin: '6px 0' }}>Mobile phone number *
              <input aria-label={`User ${i + 1} mobile number`} value={r.mobile_number} placeholder="0712345678" onChange={(e) => setRow(r.key, { mobile_number: e.target.value, same_owner: false })} style={{ display: 'block' }} />
              {errors[`m${r.key}`] && <span role="alert" style={{ color: 'red' }}>{errors[`m${r.key}`]}</span>}
            </label>
            {offer(r, i) && !r.same_owner && (
              <div role="alert" data-testid="same-owner-offer" style={{ background: '#e8f0fe', border: '1px solid #1a4fa0', color: '#0d2a5c', padding: 8, borderRadius: 6, fontSize: 13 }}>
                This person (<b>{offer(r, i).owner_name}</b>) already owns: <b>{ownerNames(offer(r, i))}</b>. Register this business under the same Owner? They will not need to register again.
                <div style={{ marginTop: 6 }}><button className="primary" onClick={() => setRow(r.key, { same_owner: true, full_name: offer(r, i).owner_name })}>Yes, same Owner</button> <span className="muted">Otherwise use a different number.</span></div>
              </div>)}
            {offer(r, i) && r.same_owner && <div role="status" data-testid="same-owner-confirmed" style={{ background: '#e8f5e9', border: '1px solid #43a047', color: '#1b5e20', padding: 8, borderRadius: 6, fontSize: 13 }}>✅ Same Owner: {offer(r, i).owner_name} will own this business as well as {ownerNames(offer(r, i))}. <button className="secondary" onClick={() => setRow(r.key, { same_owner: false })}>Undo</button></div>}
            {taken(r, i) && !offer(r, i) && !(i > 0 && taken(r, i).can_add_as_owner) && <div role="alert" style={{ background: '#ffebee', border: '1px solid #d32f2f', color: '#b71c1c', padding: 8, borderRadius: 6, fontSize: 13 }}>🚫 {taken(r, i).message} Use a different number.</div>}
            {i > 0 && taken(r, i) && taken(r, i).can_add_as_owner && <div role="alert" style={{ background: '#ffebee', border: '1px solid #d32f2f', color: '#b71c1c', padding: 8, borderRadius: 6, fontSize: 13 }}>🚫 This number belongs to a Business Owner, so it cannot be a Sales/Service Person. Use a different number.</div>}
            {dupOf(r) && !taken(r, i) && <div role="alert" style={{ background: '#ffebee', border: '1px solid #d32f2f', color: '#b71c1c', padding: 8, borderRadius: 6, fontSize: 13 }}>🚫 This number is already used by another person in this form.</div>}
            {free(r) && !dupOf(r) && <div role="status" style={{ background: '#e8f5e9', border: '1px solid #43a047', color: '#1b5e20', padding: 8, borderRadius: 6, fontSize: 13 }}>✅ This number is available.</div>}
            {i === 0 ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The Business Owner always sees every tile, so there is nothing to choose here.</div> : (
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
                <label>Business Purchases tile <TriChoice label={`User ${i + 1} purchases tile`} value={r.can_see_purchases} onChange={(v) => setRow(r.key, { can_see_purchases: v })} /></label>
                <label>Business Expenses tile <TriChoice label={`User ${i + 1} expenses tile`} value={r.can_see_expenses} onChange={(v) => setRow(r.key, { can_see_expenses: v })} /></label>
              </div>)}
          </div>
        ))}
        <button className="secondary" onClick={() => setRows([...rows, newRow()])}>+ Add another user</button>

        <h3 style={{ marginTop: 18 }}>For the whole business</h3>
        <div className="muted" style={{ fontSize: 13 }}>These are the default for every Sales/Service Person. You can change one person above without touching the others.</div>
        {yesNo('Sales/Service Persons can see Business Purchases:', salesPurchases, setSalesPurchases)}
        {yesNo('Sales/Service Persons can see Business Expenses:', salesExpenses, setSalesExpenses)}

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button className="primary" onClick={save} disabled={saving || blocked} title={blocked ? 'Fix the numbers marked in red first' : undefined}>{saving ? 'Saving…' : 'Register Business'}</button>
        </div>
      </div>
    </div>
  );
}
