// rider-app/src/auth/businessStatus.js
// SMART BIZNA FIX: what the phone keeps about WHO a person is, kept out of the screens so it can be tested without a phone.
//   * The server sends a business user's businesses (role + the two tile permissions) with the set-up, the login and the session renewal.
//     These helpers turn that into the saved status, so the first Smart Bizna Home is already the right one (no waiting for the first sync).
//   * keepStatus() is what CreatePin now writes: it ADDS to the saved status. It used to REPLACE it, which dropped user_type / role / business_id,
//     so the person was sent to the Smart Boda Home.
// Pure functions: no React Native, no storage.

const norm = (id) => String(id || '').trim().toLowerCase();

/** The fields of the saved status that come from a business profile (the first live business, else the first). {} for anyone with no business. */
export function businessFields(profiles) {
  const list = (Array.isArray(profiles) ? profiles : []).filter((p) => p && norm(p.business_id));
  if (!list.length) return {};
  const p = list.find((x) => x.active !== false) || list[0];
  return {
    role: p.role, business_id: norm(p.business_id), business_name: p.business_name, business_type_code: p.business_type_code || null, business_type_name: p.business_type_name || null,
    business_user_id: p.business_user_id, can_see_purchases: !!p.can_see_purchases, can_see_expenses: !!p.can_see_expenses,
    business_profiles: list,
  };
}

/** A person is a business user when the saved status says so, or when it still carries the business they belong to (a status an older build damaged). */
export const isBusinessStatus = (st) => !!st && (st.user_type === 'business' || (!st.user_type && !!st.business_id));

/** The profile the phone may open Smart Bizna with before the server has answered, or null when it does not really know it.
 *  It never invents a role: a Sales/Service Person with nothing enabled is NOT a safe guess for an Owner. */
export function profileFromStatus(st) {
  if (!isBusinessStatus(st) || !st.business_id || !st.role) return null;
  return {
    business_user_id: st.business_user_id || st.rider_id, role: st.role, full_name: st.full_name, business_id: st.business_id, business_name: st.business_name,
    business_type_code: st.business_type_code || null, business_type_name: st.business_type_name || null, active: true,
    can_see_purchases: !!st.can_see_purchases, can_see_expenses: !!st.can_see_expenses,
  };
}

/** The status CreatePin saves: everything already saved is kept; only what PIN creation knows is added. */
export function keepStatus(prev, server) {
  const { rider_id: _ignored, ...kept } = prev || {};        // getLocalRiderStatus merges rider_id in; it is saved under its own key
  const r = server || {};
  return {
    ...kept,
    rider_id: r.rider_id || (prev && prev.rider_id),
    registration_status: 'active',
    onboarding_step: 'createPin',
    ...(r.vehicle_type ? { vehicle_type: r.vehicle_type } : {}),
    ...((kept.user_type || r.user_type) ? { user_type: kept.user_type || r.user_type } : {}),
  };
}

/** Repair a saved status from what the server says now (session renewal). Returns the status to save, or null when nothing needs to change. */
export function healStatus(st, answer) {
  if (!st || !answer) return null;
  let next = null;
  const set = (patch) => { next = { ...(next || st), ...patch }; };
  if (answer.user_type && answer.user_type !== st.user_type && st.user_type !== 'admin') set({ user_type: answer.user_type });
  if (answer.vehicle_type && answer.vehicle_type !== st.vehicle_type) set({ vehicle_type: answer.vehicle_type });
  if (answer.user_type === 'business' && Array.isArray(answer.businesses) && answer.businesses.length) {
    const f = businessFields(answer.businesses);
    if (['role', 'business_id', 'can_see_purchases', 'can_see_expenses'].some((k) => st[k] !== f[k])) set(f);
  }
  return next;
}

export default { businessFields, isBusinessStatus, profileFromStatus, keepStatus, healStatus };
