// rider-app/src/services/documentStatus.js
// Referenced by useUrgentAlerts.js and covered by an existing test
// (services/__tests__/documentStatusService.test.js, BR-SB18-005) but never implemented in
// any guide. Tier boundaries below match that test's exact expectations:
//   > ~2 months out  -> 'valid'
//   within 2 months  -> 'expiring_2mo'
//   within 1 month   -> 'expiring_1mo'
//   on/after due date, still within grace -> 'due'
//   past due          -> 'expired'

const DAY_MS = 24 * 60 * 60 * 1000;

export function documentStatus(expiryDate, today = new Date()) {
  const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  const todayDate = today instanceof Date ? today : new Date(today);
  const daysUntilExpiry = Math.round((expiry.getTime() - todayDate.getTime()) / DAY_MS);

  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry === 0) return 'due';
  if (daysUntilExpiry <= 30) return 'expiring_1mo';
  if (daysUntilExpiry <= 61) return 'expiring_2mo'; // ~2 calendar months, matches the test's Aug-20/Jul-1 case
  return 'valid';
}
