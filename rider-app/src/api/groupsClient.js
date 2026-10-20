// rider-app/src/api/groupsClient.js
import api from './client';   // existing axios instance: adds the Bearer token automatically

export const validateGroupCode = (group_code) => api.post('/groups/validate-code', { group_code }).then(r => r.data);
export const getMyGroup = () => api.get('/groups/mine').then(r => r.data);
export const listMembers = () => api.get('/groups/mine/members').then(r => r.data);
export const addMember = (b) => api.post('/groups/mine/members', b).then(r => r.data);
export const requestSlots = (b) => api.post('/groups/mine/slot-requests', b).then(r => r.data);
export const latestSlotRequest = () => api.get('/groups/mine/slot-requests/latest').then(r => r.data);
export const listNotifications = () => api.get('/notifications').then(r => r.data);
export const completeNotification = (id) => api.post(`/notifications/${id}/complete`).then(r => r.data);
export const apiError = (e, fallback) => e?.response?.data?.detail || fallback;

const Q = { contributions: '/chama/manage/contributions', repayments: '/chama/manage/loan-payments',
            loanRequests: '/chama/manage/loan-applications',
            personal: '/psv/manage/deposits', spVerify: '/special/manage/requests',
            spFunded: '/special/manage/funded', spPayments: '/special/manage/payments' };
export const chamaConfig = () => api.get('/chama/manage/config').then(r => r.data);
export const saveChamaConfig = (b) => api.put('/chama/manage/config', b).then(r => r.data);
export const saveChamaCategory = (b) => api.put('/chama/manage/categories', b).then(r => r.data);
export const chamaOverview = () => api.get('/chama/manage/overview').then(r => r.data);
export const queueList = (kind) => api.get(Q[kind]).then(r => (kind === 'loanRequests' ? r.data : { items: r.data }));
export const queueDecide = (kind, id, action, reason) =>
  api.post(`${Q[kind]}/${id}/${action}`, action === 'reject' ? { reason } : undefined).then(r => r.data);
export const groupHistory = (params) => api.get('/chama/manage/history', { params }).then(r => r.data);
export const groupStatement = (params) => api.get('/chama/manage/statement', { params }).then(r => r.data);
export const mySummary = () => api.get('/chama/me/summary').then(r => r.data);
export const payContribution = (b) => api.post('/chama/me/contributions', b).then(r => r.data);
export const applyLoan = (b) => api.post('/chama/me/loan-applications', b).then(r => r.data);
export const cancelLoanApp = (id) => api.post(`/chama/me/loan-applications/${id}/cancel`).then(r => r.data);
export const payLoan = (b) => api.post('/chama/me/loan-payments', b).then(r => r.data);
// A result notice is completed once the member has actually opened the screen that shows it.
export async function completeSeen(kinds) {
  try {
    const rows = await listNotifications();
    await Promise.all(rows.filter((n) => kinds.includes(n.kind)).map((n) => completeNotification(n.id)));
  } catch { /* offline: try again next visit */ }
}

// ---- Part 4: Merry-Go-Round, Personal Savings, Special Loans ----
export const groupProfile = () => api.get('/chama/me/profile').then(r => r.data);
export const mgrState = () => api.get('/chama/mgr/state').then(r => r.data);
export const mgrSetOrder = (turns) => api.put('/chama/mgr/order', { turns }).then(r => r.data);
export const mgrStart = () => api.post('/chama/mgr/start').then(r => r.data);
export const mgrPayout = () => api.post('/chama/mgr/payout').then(r => r.data);
export const mgrMine = () => api.get('/chama/mgr/me').then(r => r.data);
export const psvSummary = () => api.get('/psv/me/summary').then(r => r.data);
export const psvDeposit = (b) => api.post('/psv/me/deposits', b).then(r => r.data);
export const spBoard = () => api.get('/special/me').then(r => r.data);
export const spCreate = (b) => api.post('/special/me/requests', b).then(r => r.data);
export const spCancel = (id) => api.post(`/special/me/requests/${id}/cancel`).then(r => r.data);
export const spPledge = (id, amount) => api.post(`/special/me/requests/${id}/pledge`, { amount }).then(r => r.data);
export const spPay = (request_id, b) => api.post('/special/me/payments', b, { params: { request_id } }).then(r => r.data);

// ---- Part 5: officers, turn swaps, pledge withdrawal ----
export const officerOverview = () => api.get('/chama/officer/overview').then(r => r.data);
export const mgrSwapRequest = (b) => api.post('/chama/mgr/me/swaps', b).then(r => r.data);
export const mgrSwapAgree = (id) => api.post(`/chama/mgr/me/swaps/${id}/agree`).then(r => r.data);
export const mgrSwapDecline = (id) => api.post(`/chama/mgr/me/swaps/${id}/decline`).then(r => r.data);
export const mgrSwapCancel = (id) => api.post(`/chama/mgr/me/swaps/${id}/cancel`).then(r => r.data);
export const mgrSwaps = () => api.get('/chama/mgr/swaps').then(r => r.data);
export const mgrSwapApprove = (id) => api.post(`/chama/mgr/swaps/${id}/approve`).then(r => r.data);
export const mgrSwapDeclineAdmin = (id) => api.post(`/chama/mgr/swaps/${id}/decline`).then(r => r.data);
export const spWithdraw = (pledgeId) => api.post(`/special/me/pledges/${pledgeId}/withdraw`).then(r => r.data);