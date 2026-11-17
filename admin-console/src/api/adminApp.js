// admin-console/src/api/adminApp.js
// Admin App access: which Administrators may sign in to the mobile app (Super Admin only on the server).
import client from './client';

export const listAppAccess = async (params) => (await client.get('/admin/app/access', { params })).data;
export const setAppAccess = async (id, enabled) => (await client.patch(`/admin/app/access/${id}`, { enabled })).data;
export const resetAppPin = async (id) => (await client.post(`/admin/app/access/${id}/reset-pin`)).data;
