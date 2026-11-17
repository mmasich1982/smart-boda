// admin-console/src/api/businessStatements.js
// Smart Bizna statements older than the six months kept on the Owner's phone (journey O).
import client from './client';

export const listStatementRequests = async (params) => (await client.get('/admin/business-statements', { params })).data;
export const prepareStatement = async (id) => (await client.post(`/admin/business-statements/${id}/prepare`)).data;
