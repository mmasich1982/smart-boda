// rider-app/src/auth/restoreMapping.js
// SMART APPS: server record -> the row the phone keeps. Plain function, tested without a phone.
/** Server trip -> the row the phone keeps (same fields NewTripScreen writes). Already uploaded, so it is marked synced. */
export function tripRow(t) {
  const ts = Number(t.ts) || Date.parse(t.created_at) || Date.now();
  return {
    id: String(t.id), rider_id: String(t.rider_id), amount: Number(t.amount) || 0, paymentMethod: t.method, method: t.method, note: t.note || '',
    timestamp: ts, ts, status: t.status === 'voided' ? 'voided' : 'active', syncStatus: 'synced', createdAt: ts, date: t.date || new Date(ts).toISOString().split('T')[0],
    created_at: t.created_at || new Date(ts).toISOString(),
  };
}

const toMs = (iso, fallback) => { const t = Date.parse(iso); return Number.isNaN(t) ? fallback : t; };

/** Server fuel_entry -> the row the phone keeps in 'fuelEntry' (already uploaded). */
export function fuelRow(f) {
  const ts = Number(f.ts) || toMs(f.submitted_at, Date.now());
  return {
    id: String(f.id), rider_id: String(f.rider_id), mode: f.mode, litres: f.litres === null || f.litres === undefined ? null : Number(f.litres), cost: Number(f.cost) || 0,
    swap_partner_id: f.swap_partner_id || null, odometer_reading: f.odometer_reading === undefined ? null : f.odometer_reading,
    submitted_at: f.submitted_at, created_at: f.submitted_at, ts, synced: 1, sync_status: 'synced',
  };
}

/** Server maintenance_entry -> the row the phone keeps in 'maintenanceEntry'. `category` is the phone's name for the service type. */
export function maintenanceRow(m) {
  const ts = Number(m.ts) || toMs(m.submitted_at, Date.now());
  return {
    id: String(m.id), rider_id: String(m.rider_id), cost: Number(m.cost) || 0, category: m.service_type_code || 'Service', service_type_code: m.service_type_code || null,
    description: m.description || '', maintenance_date: m.maintenance_date || null, service_provider: m.service_provider || null,
    odometer_reading: m.odometer_reading === undefined ? null : m.odometer_reading, oil_type_code: m.oil_type_code || null,
    next_service_odometer: m.next_service_odometer === undefined ? null : m.next_service_odometer, submitted_at: m.submitted_at, ts, sync_status: 'synced',
  };
}

/** Server other_expenses -> the row the phone keeps in its financial history (type 'other_expense', confirmed, already uploaded). */
export function expenseRow(e) {
  const ts = Number(e.ts) || toMs(e.expense_date, Date.now());
  return {
    id: String(e.id), rider_id: String(e.rider_id), type: 'other_expense', category: e.category, amount: Number(e.amount) || 0, description: e.description || '',
    expense_date: e.expense_date, ts, timestamp: ts, status: 'confirmed', sync_status: 'synced', created_at: e.expense_date,
  };
}

const phoneDigits = (v) => String(v || '').replace(/\D/g, '').slice(-9);
/** One customer per phone number: the phone keeps its customers under an id of this form. */
export const customerIdOf = (mobile) => `cust_${phoneDigits(mobile)}`;

/** Server lipa_later_record (+ its payments) -> the trip row the phone keeps, with its `lipaLater` part. Already uploaded. */
export function lipaTripRow(rec, riderId) {
  const ts = Number(rec.ts) || toMs(rec.trip_date, Date.now());
  // The phone records a Lipa Later payment as { amount, date, paymentMethod: 'Manual', status: 'completed', paymentType: 'full' | 'partial', notes }; the server keeps only
  // the amount, the date and a reference, so a restored payment is written the same way (the reference goes into notes).
  let running = 0;
  const payments = (rec.payments || []).map((p) => {
    const amount = Number(p.amount) || 0; running += amount;
    return { id: String(p.id), amount, date: p.date, paymentMethod: 'Manual', status: 'completed', paymentType: running >= (Number(rec.amount) || 0) ? 'full' : 'partial', notes: p.reference || '', reference: p.reference || '' };
  });
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const settled = rec.status === 'paid' || paid >= (Number(rec.amount) || 0);
  return {
    id: String(rec.trip_id), rider_id: String(riderId), amount: Number(rec.amount) || 0, paymentMethod: 'LipaLater', method: 'LipaLater',
    status: rec.trip_status === 'voided' ? 'voided' : 'active', syncStatus: 'synced', ts, timestamp: ts, created_at: rec.trip_date, date: String(rec.trip_date || '').slice(0, 10),
    lipaLater: {
      customerId: customerIdOf(rec.customer_mobile), lipaLaterId: String(rec.id), customerName: rec.customer_name, customerPhone: rec.customer_mobile,
      originalAmount: Number(rec.amount) || 0, dueDate: rec.due_date, settled, settledDate: settled && rec.paid_at ? String(rec.paid_at).slice(0, 10) : null, payments,
    },
  };
}

/** All the Lipa Later records of a rider -> { rows (voided ones left out), lipaIds (customer id -> the record new payments must go to), histories (customer id -> payments, newest first) }.
 *  New payments are sent against the customer's latest record that is not fully paid (else the latest). */
export function buildLipaRestore(records, riderId) {
  const rows = (records || []).map((r) => lipaTripRow(r, riderId)).filter((r) => r.status !== 'voided');
  const lipaIds = {}; const histories = {};
  rows.slice().sort((a, b) => a.ts - b.ts).forEach((r) => {
    const c = r.lipaLater.customerId;
    if (!lipaIds[c] || !r.lipaLater.settled || lipaIds[c].settled) lipaIds[c] = { id: r.lipaLater.lipaLaterId, settled: r.lipaLater.settled };
    histories[c] = (histories[c] || []).concat(r.lipaLater.payments);
  });
  Object.keys(histories).forEach((c) => { histories[c].sort((a, b) => String(b.date).localeCompare(String(a.date))); });
  return { rows, lipaIds: Object.fromEntries(Object.entries(lipaIds).map(([c, v]) => [c, v.id])), histories };
}
