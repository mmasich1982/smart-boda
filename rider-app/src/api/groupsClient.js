// rider-app/src/api/groupsClient.js
// ============================================================================
// Client for every Chama / group endpoint. Each function matches a REAL backend route
// (backend/app/routers: rider_groups, chama_treasurer, chama_mgr, chama_member, group_officer).
// A rider can run or belong to SEVERAL groups, so almost every call takes an optional trailing `groupId`
// that is sent as ?group_id=. Without it the server uses the rider's oldest matching group.
// ============================================================================
import api from './client';   // existing axios instance: adds the Bearer token automatically
import { getNotifications } from '../offline/chamaRepository';

const G = (groupId) => (groupId ? { params: { group_id: groupId } } : undefined);
const gp = (groupId, extra) => ({ params: { ...(extra || {}), ...(groupId ? { group_id: groupId } : {}) } });
const data = (r) => r.data;

// ---- Becoming / running a Treasurer (/groups) ----
export const validateGroupCode = (group_code) => api.post('/groups/validate-code', { group_code }).then(data);
export const managedGroups = () => api.get('/groups/managed').then(data);
export const getMyGroup = (groupId) => api.get('/groups/mine', G(groupId)).then(data);
export const listMembers = (groupId) => api.get('/groups/mine/members', G(groupId)).then(data);
export const addMember = (b, groupId) => api.post('/groups/mine/members', b, G(groupId)).then(data);
export const requestSlots = (b, groupId) => api.post('/groups/mine/slot-requests', b, G(groupId)).then(data);
export const latestSlotRequest = (groupId) => api.get('/groups/mine/slot-requests/latest', G(groupId)).then(data);

// ---- Notifications ----
export const listNotifications = () => api.get('/notifications').then(data);
export const completeNotification = (id) => api.post(`/notifications/${id}/complete`).then(data);
export const savedNotifications = () => getNotifications();           // bell items kept on the phone (offline-first)
export const apiError = (e, fallback) => e?.response?.data?.detail || fallback;

// ---- Treasurer: group rules, queues, history (/chama/manage) ----
const Q = { contributions: '/chama/manage/contributions', repayments: '/chama/manage/loan-payments',
            loanRequests: '/chama/manage/loan-applications' };
export const chamaConfig = (groupId) => api.get('/chama/manage/config', G(groupId)).then(data);
export const saveChamaConfig = (b, groupId) => api.put('/chama/manage/config', b, G(groupId)).then(data);
export const saveChamaCategory = (b, groupId) => api.put('/chama/manage/categories', b, G(groupId)).then(data);
export const chamaOverview = (groupId) => api.get('/chama/manage/overview', G(groupId)).then(data);
export const queueList = (kind, groupId) => api.get(Q[kind], G(groupId)).then((r) => (kind === 'loanRequests' ? r.data : { items: r.data }));
export const queueDecide = (kind, id, action, reason, groupId) =>
  api.post(`${Q[kind]}/${id}/${action}`, action === 'reject' ? { reason } : undefined, G(groupId)).then(data);
export const groupHistory = (params) => api.get('/chama/manage/history', { params }).then(data);
export const groupStatement = (params) => api.get('/chama/manage/statement', { params }).then(data);

// ---- Treasurer: loan security rules and the security register ----
export const securityRules = (groupId) => api.get('/chama/manage/security', G(groupId)).then(data);
export const saveSecurityRules = (b, groupId) => api.put('/chama/manage/security', b, G(groupId)).then(data);
export const securityHeld = (groupId) => api.get('/chama/manage/security-held', G(groupId)).then(data);
export const holdSecurity = (id, groupId) => api.post(`/chama/manage/loan-securities/${id}/hold`, undefined, G(groupId)).then(data);
export const declineSecurity = (id, reason, groupId) => api.post(`/chama/manage/loan-securities/${id}/decline`, { reason }, G(groupId)).then(data);
export const releaseSecurity = (memberId, groupId) => api.post(`/chama/manage/borrowers/${memberId}/release-security`, undefined, G(groupId)).then(data);

// ---- Rider: My Savings / My Loans / paying in (/chama/me) ----
export const groupProfile = () => api.get('/chama/me/profile').then(data);
export const mySavings = () => api.get('/chama/me/savings').then(data);
export const mySummary = (groupId) => api.get('/chama/me/summary', G(groupId)).then(data);
export const myLoans = () => api.get('/chama/me/loans').then(data);
export const groupLoans = (groupId) => api.get('/chama/me/group-loans', G(groupId)).then(data);
export const payContribution = (b, groupId) => api.post('/chama/me/contributions', b, G(groupId)).then(data);
export const payLoan = (b, groupId) => api.post('/chama/me/loan-payments', b, G(groupId)).then(data);
export const applyLoan = (b, groupId) => api.post('/chama/me/loan-applications', b, G(groupId)).then(data);
export const cancelLoanApp = (id) => api.post(`/chama/me/loan-applications/${id}/cancel`).then(data);
export const addSecurity = (applicationId, b) => api.post(`/chama/me/loan-applications/${applicationId}/securities`, b).then(data);
export const guarantorCandidates = (groupId) => api.get('/chama/me/guarantor-candidates', G(groupId)).then(data);
export const guaranteeRequests = () => api.get('/chama/me/guarantee-requests').then(data);
export const answerGuarantee = (id, yes) => api.post(`/chama/me/guarantee-requests/${id}/${yes ? 'accept' : 'decline'}`).then(data);

// ---- Merry-Go-Round: Treasurer (/chama/mgr) ----
export const mgrCircles = (groupId) => api.get('/chama/mgr/circles', G(groupId)).then(data);
export const mgrCircle = (circleId, groupId) => api.get(`/chama/mgr/circles/${circleId}`, G(groupId)).then(data);
export const mgrCreateCircle = (b, groupId) => api.post('/chama/mgr/circles', b, G(groupId)).then(data);
export const mgrUpdateCircle = (circleId, b, groupId) => api.put(`/chama/mgr/circles/${circleId}`, b, G(groupId)).then(data);
export const mgrDeleteCircle = (circleId, groupId) => api.delete(`/chama/mgr/circles/${circleId}`, G(groupId)).then(data);
export const mgrSetPerson = (circleId, memberId, hands, groupId) => api.put(`/chama/mgr/circles/${circleId}/people/${memberId}`, { hands }, G(groupId)).then(data);
export const mgrRemovePerson = (circleId, memberId, groupId) => api.delete(`/chama/mgr/circles/${circleId}/people/${memberId}`, G(groupId)).then(data);
export const mgrReplacePerson = (circleId, memberId, replacementMemberId, groupId) =>
  api.post(`/chama/mgr/circles/${circleId}/people/${memberId}/replace`, { replacement_member_id: replacementMemberId }, G(groupId)).then(data);
export const mgrSetOrder = (circleId, turns, groupId) => api.put(`/chama/mgr/circles/${circleId}/order`, { turns }, G(groupId)).then(data);
export const mgrStart = (circleId, groupId) => api.post(`/chama/mgr/circles/${circleId}/start`, undefined, G(groupId)).then(data);
export const mgrPayout = (circleId, groupId) => api.post(`/chama/mgr/circles/${circleId}/payout`, undefined, G(groupId)).then(data);
export const mgrNote = (circleId, b, groupId) => api.post(`/chama/mgr/circles/${circleId}/exceptions`, b, G(groupId)).then(data);
export const mgrUnnote = (circleId, memberId, groupId) => api.delete(`/chama/mgr/circles/${circleId}/exceptions/${memberId}`, G(groupId)).then(data);
export const mgrSwaps = (groupId) => api.get('/chama/mgr/swaps', G(groupId)).then(data);
export const mgrSwapApprove = (id, groupId) => api.post(`/chama/mgr/swaps/${id}/approve`, undefined, G(groupId)).then(data);
export const mgrSwapDeclineAdmin = (id, groupId) => api.post(`/chama/mgr/swaps/${id}/decline`, undefined, G(groupId)).then(data);
export const mgrActivity = (groupId) => api.get('/chama/mgr/activity', G(groupId)).then(data);

// ---- Merry-Go-Round: rider (/chama/mgr/me) ----
export const mgrMine = (groupId) => api.get('/chama/mgr/me', G(groupId)).then(data);
export const mgrMyActivity = (groupId) => api.get('/chama/mgr/me/activity', G(groupId)).then(data);
export const mgrSwapRequest = (circleId, b, groupId) => api.post(`/chama/mgr/me/circles/${circleId}/swaps`, b, G(groupId)).then(data);
export const mgrSwapAgree = (id, groupId) => api.post(`/chama/mgr/me/swaps/${id}/agree`, undefined, G(groupId)).then(data);
export const mgrSwapCancel = (id, groupId) => api.post(`/chama/mgr/me/swaps/${id}/cancel`, undefined, G(groupId)).then(data);

// A result notice is completed once the member has actually opened the screen that shows it.
export async function completeSeen(kinds) {
  try {
    const rows = await listNotifications();
    await Promise.all(rows.filter((n) => kinds.includes(n.kind)).map((n) => completeNotification(n.id)));
  } catch { /* offline: try again next visit */ }
}

export const officerOverview = () => api.get('/chama/officer/overview').then(data);
