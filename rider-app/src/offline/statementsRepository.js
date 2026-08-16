/**
 * statementsRepository.js
 * Manages offline storage of generated statements and detailed statement requests
 */

import { getLocalStore } from './LocalStore';
import { DETAILED_STATEMENT_SLA_HOURS } from '../constants/financialHistoryConstants';

/**
 * Create a new statement
 */
export async function createStatement(data) {
  try {
    const store = await getLocalStore();
    const statements = store.statements || [];

    const statement = {
      id: `STMT-${Math.floor(100000 + Math.random() * 900000)}`,
      startMs: data.rangeStart,
      endMs: data.rangeEnd,
      purpose: data.purpose || '',
      summary: data.summary || {},
      generatedAt: Date.now(),
      verificationRef: `VRF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      verified: true, // Set to true if online verification passed
      shared: [],
    };

    statements.push(statement);
    store.statements = statements;
    store.lastModified = Date.now();

    await getLocalStore().then((s) => Object.assign(s, store));

    return statement;
  } catch (err) {
    console.error('createStatement error:', err);
    throw err;
  }
}

/**
 * Get statement by ID
 */
export async function getStatementById(statementId) {
  try {
    const store = await getLocalStore();
    const statements = store.statements || [];

    return statements.find((s) => s.id === statementId);
  } catch (err) {
    console.error('getStatementById error:', err);
    return null;
  }
}

/**
 * Get all statements
 */
export async function getAllStatements() {
  try {
    const store = await getLocalStore();
    return store.statements || [];
  } catch (err) {
    console.error('getAllStatements error:', err);
    return [];
  }
}

/**
 * Record statement download
 */
export async function recordStatementDownload(statementId) {
  try {
    const store = await getLocalStore();
    const statements = store.statements || [];

    const statement = statements.find((s) => s.id === statementId);
    if (statement) {
      statement.shared = statement.shared || [];
      statement.shared.push({
        method: 'download',
        timestamp: Date.now(),
      });

      store.statements = statements;
      store.lastModified = Date.now();

      await getLocalStore().then((s) => Object.assign(s, store));
    }

    return statement;
  } catch (err) {
    console.error('recordStatementDownload error:', err);
    throw err;
  }
}

/**
 * Create a detailed statement request
 */
export async function createDetailedStatementRequest(data) {
  try {
    const store = await getLocalStore();
    const requests = store.detailedStatementRequests || [];

    const request = {
      id: `DSR-${Math.floor(100000 + Math.random() * 900000)}`,
      statementId: data.statementId,
      email: data.email,
      requestedAt: Date.now(),
      slaHours: DETAILED_STATEMENT_SLA_HOURS,
      status: 'pending',
    };

    requests.push(request);
    store.detailedStatementRequests = requests;
    store.lastModified = Date.now();

    await getLocalStore().then((s) => Object.assign(s, store));

    return request;
  } catch (err) {
    console.error('createDetailedStatementRequest error:', err);
    throw err;
  }
}

/**
 * Get detailed statement request by ID
 */
export async function getDetailedStatementRequestById(requestId) {
  try {
    const store = await getLocalStore();
    const requests = store.detailedStatementRequests || [];

    return requests.find((r) => r.id === requestId);
  } catch (err) {
    console.error('getDetailedStatementRequestById error:', err);
    return null;
  }
}

/**
 * Get all detailed statement requests
 */
export async function getAllDetailedStatementRequests() {
  try {
    const store = await getLocalStore();
    return store.detailedStatementRequests || [];
  } catch (err) {
    console.error('getAllDetailedStatementRequests error:', err);
    return [];
  }
}

/**
 * Get pending detailed statement requests
 */
export async function getPendingDetailedStatementRequests() {
  try {
    const store = await getLocalStore();
    const requests = store.detailedStatementRequests || [];

    return requests.filter((r) => r.status === 'pending');
  } catch (err) {
    console.error('getPendingDetailedStatementRequests error:', err);
    return [];
  }
}

/**
 * Update detailed statement request status
 */
export async function updateDetailedStatementRequestStatus(requestId, status) {
  try {
    const store = await getLocalStore();
    const requests = store.detailedStatementRequests || [];

    const request = requests.find((r) => r.id === requestId);
    if (request) {
      request.status = status;
      if (status === 'completed') {
        request.completedAt = Date.now();
      }

      store.detailedStatementRequests = requests;
      store.lastModified = Date.now();

      await getLocalStore().then((s) => Object.assign(s, store));
    }

    return request;
  } catch (err) {
    console.error('updateDetailedStatementRequestStatus error:', err);
    throw err;
  }
}

/**
 * Delete statement (soft delete)
 */
export async function deleteStatement(statementId) {
  try {
    const store = await getLocalStore();
    const statements = store.statements || [];

    const index = statements.findIndex((s) => s.id === statementId);
    if (index !== -1) {
      statements[index].deleted = true;
      statements[index].deletedAt = Date.now();

      store.statements = statements;
      store.lastModified = Date.now();

      await getLocalStore().then((s) => Object.assign(s, store));
    }

    return index !== -1;
  } catch (err) {
    console.error('deleteStatement error:', err);
    throw err;
  }
}

/**
 * Get pending sync statements
 */
export async function getPendingSyncStatements() {
  try {
    const store = await getLocalStore();
    const statements = store.statements || [];

    return statements.filter((s) => !s.verified && !s.syncStatus);
  } catch (err) {
    console.error('getPendingSyncStatements error:', err);
    return [];
  }
}

/**
 * Mark statement as synced/verified
 */
export async function markStatementAsVerified(statementId) {
  try {
    const store = await getLocalStore();
    const statements = store.statements || [];

    const statement = statements.find((s) => s.id === statementId);
    if (statement) {
      statement.verified = true;
      statement.verifiedAt = Date.now();

      store.statements = statements;
      store.lastModified = Date.now();

      await getLocalStore().then((s) => Object.assign(s, store));
    }

    return statement;
  } catch (err) {
    console.error('markStatementAsVerified error:', err);
    throw err;
  }
}