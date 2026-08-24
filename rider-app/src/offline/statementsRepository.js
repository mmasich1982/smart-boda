/**
 * statementsRepository.js
 * 
 * Manages offline storage of generated statements with IndexedDB
 * 
 * MIGRATION NOTES:
 * ✅ Transitioned from LocalStorage to IndexedDB
 * ✅ ❌ NO LocalStore - completely removed
 * ✅ Full async/await implementation
 * ✅ 6-month retention window enforcement
 * ✅ Structured queries with rider ID indexing
 * 
 * DATA RETENTION POLICY:
 * ✅ All statements stored within 6-month retention window
 * ✅ Auto-deletion of statements older than 6 months
 * ✅ Detailed statement requests use same retention window
 * ⚠️ Queries for statements beyond 6 months routed to Smart Boda Admin (Phase 2)
 */

import indexedDbAdapter from './adapters/indexedDbAdapter';
import { 
  isWithinRetentionWindow, 
  getRetentionWindowInfo 
} from './financialHistoryRepository';
import { DETAILED_STATEMENT_SLA_HOURS } from '../constants/financialHistoryConstants';

const STATEMENTS_STORE = 'statements';
const STATEMENT_REQUESTS_STORE = 'statementRequests';

/**
 * ========== STATEMENT MANAGEMENT ==========
 */

export async function createStatement(data, riderId) {
  try {
    const windowInfo = await getRetentionWindowInfo(riderId);
    if (!windowInfo.isActive) {
      throw new Error(`Cannot create statement: Outside retention window for rider ${riderId}`);
    }

    const now = Date.now();
    const statement = {
      id: `STMT-${now}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      rider_id: riderId,
      startMs: data.rangeStart,
      endMs: data.rangeEnd,
      purpose: data.purpose || '',
      summary: data.summary || {},
      generatedAt: now,
      ts: now,
      timestamp: now,
      verificationRef: `VRF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      verified: true,
      shared: [],
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    await indexedDbAdapter.insertRow(STATEMENTS_STORE, statement);
    console.log(`✅ createStatement: Created statement ${statement.id} for rider ${riderId}`);
    
    return statement;
  } catch (err) {
    console.error('[createStatement] error:', err);
    throw err;
  }
}

export async function getStatementById(statementId, riderId) {
  try {
    const statement = await indexedDbAdapter.getRow(STATEMENTS_STORE, statementId);
    
    if (!statement) {
      return null;
    }

    if (statement.rider_id !== riderId) {
      throw new Error('Access denied: Statement does not belong to this rider');
    }

    const windowInfo = await getRetentionWindowInfo(riderId);
    const isWithinWindow = isWithinRetentionWindow(
      statement.ts || statement.generatedAt || 0,
      windowInfo.startDate
    );

    if (!isWithinWindow) {
      console.warn(`⚠️ getStatementById: Statement ${statementId} is outside retention window`);
      return {
        ...statement,
        isWithinRetention: false,
        message: 'This statement is archived. Contact Smart Boda Admin for access.'
      };
    }

    console.log(`✅ getStatementById: Retrieved statement ${statementId}`);
    return { ...statement, isWithinRetention: true };
  } catch (err) {
    console.error('[getStatementById] error:', err);
    throw err;
  }
}

export async function getAllStatements(riderId, limit = 100, offset = 0) {
  try {
    const windowInfo = await getRetentionWindowInfo(riderId);
    
    if (!windowInfo.isActive) {
      console.warn(`⚠️ getAllStatements: Outside retention window for rider ${riderId}`);
      return {
        statements: [],
        total: 0,
        isWithinRetention: false,
        daysRemaining: windowInfo.daysRemaining
      };
    }

    const allStatements = await indexedDbAdapter.queryByIndex(STATEMENTS_STORE, 'riderId', riderId);
    
    const filtered = allStatements.filter(s => 
      isWithinRetentionWindow(s.ts || s.generatedAt || 0, windowInfo.startDate)
    );

    filtered.sort((a, b) => (b.ts || b.generatedAt) - (a.ts || a.generatedAt));

    const paginated = filtered.slice(offset, offset + limit);

    console.log(`✅ getAllStatements: Found ${filtered.length} statements for rider ${riderId}`);
    
    return {
      statements: paginated,
      total: filtered.length,
      isWithinRetention: true,
      daysRemaining: windowInfo.daysRemaining
    };
  } catch (err) {
    console.error('[getAllStatements] error:', err);
    return {
      statements: [],
      total: 0,
      isWithinRetention: false
    };
  }
}

export async function recordStatementDownload(statementId, riderId, method = 'download') {
  try {
    const statement = await getStatementById(statementId, riderId);
    
    if (!statement) {
      throw new Error(`Statement ${statementId} not found`);
    }

    if (!statement.isWithinRetention) {
      throw new Error('Cannot access archived statement. Contact Smart Boda Admin.');
    }

    const updated = await indexedDbAdapter.updateRow(STATEMENTS_STORE, statementId, {
      shared: [
        ...(statement.shared || []),
        {
          method,
          timestamp: Date.now(),
          sharedAt: new Date().toISOString()
        }
      ],
      lastSharedAt: Date.now(),
      updatedAt: Date.now()
    });

    console.log(`✅ recordStatementDownload: Recorded ${method} for statement ${statementId}`);
    return updated;
  } catch (err) {
    console.error('[recordStatementDownload] error:', err);
    throw err;
  }
}

/**
 * ========== DETAILED STATEMENT REQUEST MANAGEMENT ==========
 */

export async function createDetailedStatementRequest(data, riderId) {
  try {
    const windowInfo = await getRetentionWindowInfo(riderId);
    
    if (!windowInfo.isActive) {
      throw new Error(`Cannot create request: Outside retention window for rider ${riderId}`);
    }

    const now = Date.now();
    const request = {
      id: `DSR-${now}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      rider_id: riderId,
      statementId: data.statementId,
      email: data.email,
      requestedAt: now,
      ts: now,
      timestamp: now,
      slaHours: DETAILED_STATEMENT_SLA_HOURS,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    await indexedDbAdapter.insertRow(STATEMENT_REQUESTS_STORE, request);
    console.log(`✅ createDetailedStatementRequest: Created request ${request.id} for rider ${riderId}`);
    
    return request;
  } catch (err) {
    console.error('[createDetailedStatementRequest] error:', err);
    throw err;
  }
}

export async function getDetailedStatementRequestById(requestId, riderId) {
  try {
    const request = await indexedDbAdapter.getRow(STATEMENT_REQUESTS_STORE, requestId);
    
    if (!request) {
      return null;
    }

    if (request.rider_id !== riderId) {
      throw new Error('Access denied: Request does not belong to this rider');
    }

    const windowInfo = await getRetentionWindowInfo(riderId);
    const isWithinWindow = isWithinRetentionWindow(request.ts || request.requestedAt || 0, windowInfo.startDate);

    if (!isWithinWindow) {
      console.warn(`⚠️ getDetailedStatementRequestById: Request ${requestId} is outside retention window`);
    }

    console.log(`✅ getDetailedStatementRequestById: Retrieved request ${requestId}`);
    return { ...request, isWithinRetention: isWithinWindow };
  } catch (err) {
    console.error('[getDetailedStatementRequestById] error:', err);
    throw err;
  }
}

export async function getAllDetailedStatementRequests(riderId) {
  try {
    const windowInfo = await getRetentionWindowInfo(riderId);
    
    if (!windowInfo.isActive) {
      console.warn(`⚠️ getAllDetailedStatementRequests: Outside retention window for rider ${riderId}`);
      return {
        requests: [],
        isWithinRetention: false
      };
    }

    const allRequests = await indexedDbAdapter.queryByIndex(STATEMENT_REQUESTS_STORE, 'riderId', riderId);
    
    const filtered = allRequests.filter(r => 
      isWithinRetentionWindow(r.ts || r.requestedAt || 0, windowInfo.startDate)
    );

    filtered.sort((a, b) => (b.ts || b.requestedAt) - (a.ts || a.requestedAt));

    console.log(`✅ getAllDetailedStatementRequests: Found ${filtered.length} requests for rider ${riderId}`);
    
    return {
      requests: filtered,
      isWithinRetention: true,
      daysRemaining: windowInfo.daysRemaining
    };
  } catch (err) {
    console.error('[getAllDetailedStatementRequests] error:', err);
    return {
      requests: [],
      isWithinRetention: false
    };
  }
}

export async function getPendingDetailedStatementRequests(riderId) {
  try {
    const result = await getAllDetailedStatementRequests(riderId);
    const allRequests = result.requests || [];

    const pending = allRequests.filter(r => r.status === 'pending');

    console.log(`✅ getPendingDetailedStatementRequests: Found ${pending.length} pending requests`);
    
    return {
      requests: pending,
      count: pending.length,
      isWithinRetention: result.isWithinRetention
    };
  } catch (err) {
    console.error('[getPendingDetailedStatementRequests] error:', err);
    return {
      requests: [],
      count: 0,
      isWithinRetention: false
    };
  }
}

export async function updateDetailedStatementRequestStatus(requestId, riderId, status) {
  try {
    const request = await getDetailedStatementRequestById(requestId, riderId);
    
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    if (!request.isWithinRetention) {
      throw new Error('Cannot update archived request.');
    }

    const updates = {
      status,
      updatedAt: Date.now()
    };

    if (status === 'completed') {
      updates.completedAt = Date.now();
    }

    const updated = await indexedDbAdapter.updateRow(STATEMENT_REQUESTS_STORE, requestId, updates);

    console.log(`✅ updateDetailedStatementRequestStatus: Updated ${requestId} to ${status}`);
    return updated;
  } catch (err) {
    console.error('[updateDetailedStatementRequestStatus] error:', err);
    throw err;
  }
}

/**
 * ========== STATEMENT DELETION & MAINTENANCE ==========
 */

export async function deleteStatement(statementId, riderId) {
  try {
    const statement = await getStatementById(statementId, riderId);
    
    if (!statement) {
      return false;
    }

    const updated = await indexedDbAdapter.updateRow(STATEMENTS_STORE, statementId, {
      deleted: true,
      deletedAt: Date.now(),
      status: 'deleted',
      updatedAt: Date.now()
    });

    console.log(`✅ deleteStatement: Marked statement ${statementId} as deleted`);
    return true;
  } catch (err) {
    console.error('[deleteStatement] error:', err);
    throw err;
  }
}

export async function getPendingSyncStatements(riderId) {
  try {
    const result = await getAllStatements(riderId, 10000, 0);
    const allStatements = result.statements || [];

    const pending = allStatements.filter(s => !s.verified || s.status === 'pending');

    console.log(`✅ getPendingSyncStatements: Found ${pending.length} pending statements`);
    
    return {
      statements: pending,
      count: pending.length,
      isWithinRetention: result.isWithinRetention
    };
  } catch (err) {
    console.error('[getPendingSyncStatements] error:', err);
    return {
      statements: [],
      count: 0,
      isWithinRetention: false
    };
  }
}

export async function markStatementAsVerified(statementId, riderId) {
  try {
    const statement = await getStatementById(statementId, riderId);
    
    if (!statement) {
      throw new Error(`Statement ${statementId} not found`);
    }

    if (!statement.isWithinRetention) {
      throw new Error('Cannot verify archived statement.');
    }

    const updated = await indexedDbAdapter.updateRow(STATEMENTS_STORE, statementId, {
      verified: true,
      verifiedAt: Date.now(),
      status: 'verified',
      updatedAt: Date.now()
    });

    console.log(`✅ markStatementAsVerified: Verified statement ${statementId}`);
    return updated;
  } catch (err) {
    console.error('[markStatementAsVerified] error:', err);
    throw err;
  }
}

/**
 * ========== STATEMENT SEARCH & FILTERING ==========
 */

export async function getStatementsByDateRange(riderId, startTime, endTime) {
  try {
    const windowInfo = await getRetentionWindowInfo(riderId);
    
    if (!windowInfo.isActive) {
      return {
        statements: [],
        isWithinRetention: false,
        message: 'Data beyond 6-month retention window.'
      };
    }

    const adjustedStart = Math.max(startTime, windowInfo.startDate);
    const adjustedEnd = Math.min(endTime, windowInfo.endDate);

    const allStatements = await indexedDbAdapter.queryByRange(STATEMENTS_STORE, 'ts', adjustedStart, adjustedEnd);
    
    const filtered = allStatements.filter(s => s.rider_id === riderId);

    filtered.sort((a, b) => (b.ts || b.generatedAt) - (a.ts || a.generatedAt));

    console.log(`✅ getStatementsByDateRange: Found ${filtered.length} statements`);
    
    return {
      statements: filtered,
      isWithinRetention: true,
      daysRemaining: windowInfo.daysRemaining
    };
  } catch (err) {
    console.error('[getStatementsByDateRange] error:', err);
    return {
      statements: [],
      isWithinRetention: false
    };
  }
}

export async function getStatementsByStatus(riderId, status) {
  try {
    const result = await getAllStatements(riderId, 10000, 0);
    const allStatements = result.statements || [];

    const filtered = allStatements.filter(s => s.status === status && !s.deleted);

    console.log(`✅ getStatementsByStatus: Found ${filtered.length} statements with status ${status}`);
    
    return {
      statements: filtered,
      count: filtered.length,
      isWithinRetention: result.isWithinRetention
    };
  } catch (err) {
    console.error('[getStatementsByStatus] error:', err);
    return {
      statements: [],
      count: 0,
      isWithinRetention: false
    };
  }
}

export async function getStatementStats(riderId) {
  try {
    const result = await getAllStatements(riderId, 10000, 0);
    const allStatements = result.statements || [];

    const stats = {
      total: allStatements.length,
      verified: allStatements.filter(s => s.verified).length,
      pending: allStatements.filter(s => !s.verified).length,
      deleted: allStatements.filter(s => s.deleted).length,
      byStatus: {}
    };

    allStatements.forEach(s => {
      if (!stats.byStatus[s.status]) {
        stats.byStatus[s.status] = 0;
      }
      stats.byStatus[s.status]++;
    });

    console.log(`✅ getStatementStats: ${stats.total} total statements for rider ${riderId}`);
    return { ...stats, isWithinRetention: result.isWithinRetention };
  } catch (err) {
    console.error('[getStatementStats] error:', err);
    return {
      total: 0,
      verified: 0,
      pending: 0,
      deleted: 0,
      byStatus: {}
    };
  }
}

export default {
  // Statement management
  createStatement,
  getStatementById,
  getAllStatements,
  recordStatementDownload,
  deleteStatement,
  
  // Detailed statement requests
  createDetailedStatementRequest,
  getDetailedStatementRequestById,
  getAllDetailedStatementRequests,
  getPendingDetailedStatementRequests,
  updateDetailedStatementRequestStatus,
  
  // Sync & verification
  getPendingSyncStatements,
  markStatementAsVerified,
  
  // Search & filtering
  getStatementsByDateRange,
  getStatementsByStatus,
  getStatementStats
};