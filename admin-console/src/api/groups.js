// admin-console/src/api/groups.js
import client from './client';
export const getGroupStats = async () => (await client.get('/admin/groups/stats')).data;
export const listGroups = async (params) => (await client.get('/admin/groups', { params })).data;
export const createGroup = async (b) => (await client.post('/admin/groups', b)).data;
export const updateGroup = async (id, b) => (await client.put(`/admin/groups/${id}`, b)).data;
export const setGroupActive = async (id, active) => (await client.patch(`/admin/groups/${id}/status`, null, { params: { active } })).data;
export const listSlotRequests = async (status = 'pending') => (await client.get('/admin/groups/slot-requests', { params: { status } })).data;
export const approveSlotRequest = async (id, approved_slots, comment) => (await client.post(`/admin/groups/slot-requests/${id}/approve`, { approved_slots, comment })).data;
export const declineSlotRequest = async (id, comment) => (await client.post(`/admin/groups/slot-requests/${id}/decline`, { comment })).data;