// admin-console/src/api/individualRiders.js
// Individual riders: riders who join on their own, with no Treasurer and no group. The administrator pre-creates them here.
import client from './client';
export const listIndividualRiders = async (params) => (await client.get('/admin/individual-riders', { params })).data;
export const createIndividualRider = async (b) => (await client.post('/admin/individual-riders', b)).data;
export const removeIndividualRider = async (id) => (await client.delete(`/admin/individual-riders/${id}`)).data;
export const checkIndividualPhone = async (phone) => (await client.get('/admin/individual-riders/phone-check', { params: { phone } })).data;
