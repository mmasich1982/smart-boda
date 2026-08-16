// admin-console/src/utils/pii.js
// AUDIT FIX (Admin Console, Medium): phone numbers were masked inconsistently -- some
// screens showed the full mobile_number the API returned, others relied on the backend
// having already masked it, with no consistent client-side rule and no way to
// deliberately reveal a number when support genuinely needs to. Centralized here.
export function maskPhone(value) {
  if (!value) return '—';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 6) return value;
  return `${digits.slice(0, 4)}***${digits.slice(-2)}`;
}

export function maskEmail(value) {
  if (!value || !value.includes('@')) return value || '—';
  const [user, domain] = value.split('@');
  if (user.length <= 2) return `${user[0]}***@${domain}`;
  return `${user.slice(0, 2)}***@${domain}`;
}
