// admin-console/src/api/individualRiders.js
// Individual riders: riders who join on their own, with no Treasurer and no group. The administrator pre-creates them here.
import client from './client';
export const listIndividualRiders = async (params) => (await client.get('/admin/individual-riders', { params })).data;
export const createIndividualRider = async (b) => (await client.post('/admin/individual-riders', b)).data;
export const removeIndividualRider = async (id) => (await client.delete(`/admin/individual-riders/${id}`)).data;
export const checkIndividualPhone = async (phone) => (await client.get('/admin/individual-riders/phone-check', { params: { phone } })).data;

// SMART CABZ: a Super Admin changes a registered person's vehicle type (motorcycle -> Smart Boda, car -> Smart Cabz). The server logs it.
export const changeVehicleType = async (riderId, vehicle_type, reason) =>
  (await client.patch(`/admin/riders/${riderId}/vehicle-type`, { vehicle_type, reason })).data;
