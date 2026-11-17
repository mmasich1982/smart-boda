// rider-app/src/api/businessClient.js
// Client for the Smart Bizna endpoints (backend/app/routers/business_ops.py). Writes (sales, purchases, expenses, corrections, payments, profile,
// statement requests) never go through here directly: they are saved on the phone and queued, and the sync queue sends them. These calls are the READS
// the sync cycle makes, plus the Admin-free statement list.
//
// MULTIPLE BUSINESSES + DATA ISOLATION: every per-business call NAMES its business (X-Business-Id). There is no default: a call without a business id
// is refused here, before it leaves the phone. Only /my-businesses and the Owner overview (which span the person's own businesses) take no id.
import api from './client';   // existing axios instance: adds the Bearer token automatically

const data = (r) => r.data;
const forBusiness = (businessId, config = {}) => {
  if (typeof businessId !== 'string' || !businessId.trim()) throw new Error('No business was named for this request.');
  return { ...config, headers: { ...(config.headers || {}), 'X-Business-Id': businessId.trim() } };
};
export const businessMyBusinesses = () => api.get('/business/my-businesses').then(data);
export const businessOwnerOverview = (period) => api.get('/business/owner/overview', { params: { period } }).then(data);
export const businessMe = (businessId) => api.get('/business/me', forBusiness(businessId)).then(data);
export const businessSuppliers = (businessId) => api.get('/business/suppliers', forBusiness(businessId)).then(data);
export const businessMine = (businessId, since) => api.get('/business/mine', forBusiness(businessId, { params: since ? { since } : undefined })).then(data);
export const businessSnapshot = (businessId, since) => api.get('/business/snapshot', forBusiness(businessId, { params: since ? { since } : undefined })).then(data);
export const businessStatementRequests = (businessId) => api.get('/business/statement-requests', forBusiness(businessId)).then(data);
export { forBusiness };
