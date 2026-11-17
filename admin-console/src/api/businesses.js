// admin-console/src/api/businesses.js
// Smart Bizna: businesses, the people in them, their tile choices, and the Business Type master data.
import client from './client';

export const listBusinesses = async (params) => (await client.get('/admin/businesses', { params })).data;
export const createBusiness = async (b) => (await client.post('/admin/businesses', b)).data;
export const updateBusiness = async (id, b) => (await client.patch(`/admin/businesses/${id}`, b)).data;
export const removeBusiness = async (id) => (await client.delete(`/admin/businesses/${id}`)).data;
export const deactivateBusiness = async (id) => (await client.post(`/admin/businesses/${id}/deactivate`)).data;
export const reactivateBusiness = async (id) => (await client.post(`/admin/businesses/${id}/reactivate`)).data;
export const checkBusinessPhone = async (phone) => (await client.get('/admin/businesses/phone-check', { params: { phone } })).data;

export const addBusinessUser = async (id, u) => (await client.post(`/admin/businesses/${id}/users`, u)).data;
export const updateBusinessUser = async (id, uid, u) => (await client.patch(`/admin/businesses/${id}/users/${uid}`, u)).data;
export const removeBusinessUser = async (id, uid) => (await client.delete(`/admin/businesses/${id}/users/${uid}`)).data;
export const deactivateBusinessUser = async (id, uid) => (await client.post(`/admin/businesses/${id}/users/${uid}/deactivate`)).data;
export const reactivateBusinessUser = async (id, uid) => (await client.post(`/admin/businesses/${id}/users/${uid}/reactivate`)).data;
export const changeBusinessOwner = async (id, userId) => (await client.post(`/admin/businesses/${id}/change-owner`, { user_id: userId })).data;

export const listBusinessTypes = async () => (await client.get('/admin/business-types')).data;
export const addBusinessType = async (t) => (await client.post('/admin/business-types', t)).data;
export const updateBusinessType = async (id, t) => (await client.patch(`/admin/business-types/${id}`, t)).data;
