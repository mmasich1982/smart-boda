// rider-app/src/utils/complianceUtils.js

export const DOCUMENT_TYPES = [
  { name: 'Driving License', expires: true },
  { name: 'Motor Vehicle Insurance', expires: true },
  { name: 'Roadworthiness Certificate', expires: true },
];

export function getDocumentStatus(expiryDateMs) {
  if (!expiryDateMs) return 'valid';
  
  const now = Date.now();
  const daysLeft = (expiryDateMs - now) / (24 * 60 * 60 * 1000);
  
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 1) return 'due';
  if (daysLeft <= 30) return 'expiring-1mo';
  if (daysLeft <= 60) return 'expiring-2mo';
  
  return 'valid';
}

export function getDocumentStatusLabel(status) {
  const labels = {
    expired: '🔴 Expired',
    due: '🔴 Due today',
    'expiring-1mo': '🟡 Expiring within 1 month',
    'expiring-2mo': '🟠 Expiring within 2 months',
    valid: '✅ Valid',
  };
  return labels[status] || '✅ Valid';
}