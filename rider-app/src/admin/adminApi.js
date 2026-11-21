// rider-app/src/admin/adminApi.js
// ADMIN APP: one place for every call an admin screen makes. They are the SAME routes the Administrator console calls
// (admin-console/src/api/*.js), so the app and the console read and write the same tables. The Bearer token is added by the shared API client.
// A 401 (token expired, app access switched off, PIN reset) sends the person back to Sign-In once.
import api from '../api/client';

let leaving = false;
function sessionEnded() {
  if (leaving) return;
  leaving = true;
  Promise.resolve()
    .then(async () => {
      const { endSession } = require('../offline/db');
      const { resetToSignIn } = require('../navigation/rootNavigation');
      await endSession();
      resetToSignIn();
    })
    .catch(() => {})
    .finally(() => { setTimeout(() => { leaving = false; }, 3000); });
}

const run = (p) => p.then((r) => r.data).catch((e) => {
  if (e && e.response && e.response.status === 401) sessionEnded();
  throw e;
});
const get = (url, params) => run(api.get(url, { params, timeout: 30000 }));
const post = (url, body, params) => run(api.post(url, body === undefined ? null : body, { params, timeout: 30000 }));
const patch = (url, body, params) => run(api.patch(url, body === undefined ? null : body, { params, timeout: 30000 }));
const del = (url) => run(api.delete(url, { timeout: 30000 }));

// Dashboard
export const getDashboard = () => get('/admin/app/dashboard');
export const getMe = () => get('/admin/app/me');

// Manage Riders
export const riderStats = () => get('/admin/riders/stats');
export const listActiveRiders = (page, page_size) => get('/admin/riders', { status: 'active', page, page_size });
export const listIndividualRiders = (params) => get('/admin/individual-riders', params);
export const createIndividualRider = (b) => post('/admin/individual-riders', b);
export const removeIndividualRider = (id) => del(`/admin/individual-riders/${id}`);
// SMART CABZ: a Super Admin changes a registered person's vehicle type (logged on the server)
export const changeVehicleType = (riderId, vehicle_type, reason) => patch(`/admin/riders/${riderId}/vehicle-type`, { vehicle_type, reason });
export const checkIndividualPhone = (phone) => get('/admin/individual-riders/phone-check', { phone });

// Manage Groups
export const getGroupStats = () => get('/admin/groups/stats');
export const listGroups = (params) => get('/admin/groups', params);
export const createGroup = (b) => post('/admin/groups', b);
export const updateGroup = (id, b) => run(api.put(`/admin/groups/${id}`, b, { timeout: 30000 }));
export const setGroupActive = (id, active) => patch(`/admin/groups/${id}/status`, null, { active });
export const getGroupFinance = (id) => get(`/admin/groups/${id}/finance`);
export const checkTreasurerPhone = (phone, group_type, exclude_group_id, members_type, treasurer_kind) => get('/admin/groups/phone-check', { phone, group_type, exclude_group_id, members_type, treasurer_kind });      // SMART CABZ
export const listSlotRequests = (status = 'pending') => get('/admin/groups/slot-requests', { status });
export const approveSlotRequest = (id, approved_slots, comment) => post(`/admin/groups/slot-requests/${id}/approve`, { approved_slots, comment });
export const declineSlotRequest = (id, comment) => post(`/admin/groups/slot-requests/${id}/decline`, { comment });

// Manage Businesses
export const listBusinesses = (params) => get('/admin/businesses', params);
export const createBusiness = (b) => post('/admin/businesses', b);
export const updateBusiness = (id, b) => patch(`/admin/businesses/${id}`, b);
export const getBusinessPerformance = (id, view = 'monthly', periods) => get(`/admin/businesses/${id}/performance`, { view, ...(periods ? { periods } : {}) });
export const getBusinessesMap = (params) => get('/admin/businesses/map', params);        // BUSINESSES MAP
export const removeBusiness = (id) => del(`/admin/businesses/${id}`);
export const deactivateBusiness = (id) => post(`/admin/businesses/${id}/deactivate`);
export const reactivateBusiness = (id) => post(`/admin/businesses/${id}/reactivate`);
export const checkBusinessPhone = (phone) => get('/admin/businesses/phone-check', { phone });
export const addBusinessUser = (id, u) => post(`/admin/businesses/${id}/users`, u);
export const updateBusinessUser = (id, uid, u) => patch(`/admin/businesses/${id}/users/${uid}`, u);
export const removeBusinessUser = (id, uid) => del(`/admin/businesses/${id}/users/${uid}`);
export const deactivateBusinessUser = (id, uid) => post(`/admin/businesses/${id}/users/${uid}/deactivate`);
export const reactivateBusinessUser = (id, uid) => post(`/admin/businesses/${id}/users/${uid}/reactivate`);
export const changeBusinessOwner = (id, userId) => post(`/admin/businesses/${id}/change-owner`, { user_id: userId });
export const listBusinessTypes = () => get('/admin/business-types');
export const addBusinessType = (t) => post('/admin/business-types', t);
export const updateBusinessType = (id, t) => patch(`/admin/business-types/${id}`, t);
export const listStatementRequests = (params) => get('/admin/business-statements', params);
export const prepareStatement = (id) => post(`/admin/business-statements/${id}/prepare`);

// County > Sub-county > Ward (public master data, the same lists the console uses)
const place = (url, params) => get(url, { ...params, limit: 500 }).then((d) => (d.data || []).map((x) => ({ id: x.id, name: x.name })));
export const listCounties = () => place('/location-data/counties');
export const listSubCounties = (county_id) => place('/location-data/sub-counties', { county_id });
export const listWards = (sub_county_id) => place('/location-data/wards', { sub_county_id });
