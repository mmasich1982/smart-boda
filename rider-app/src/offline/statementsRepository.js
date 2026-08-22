/**
 * Statements Repository - COMPLETE INDEXEDDB MIGRATION
 * Manages offline storage of financial statements including:
 * - Detailed statements (daily, weekly, monthly)
 * - Statement requests/generation
 * - Statement history and retrieval
 * 
 * MIGRATION NOTES:
 * ✅ Transitioned from LocalStorage to IndexedDB
 * ✅ All operations are fully async/await
 * ✅ Structured queries with indexes on period, status, timestamp
 * ✅ Maintains backward compatibility with statement generation logic
 */

import * as db from './adapters/indexeddb-adapter';

const STATEMENTS_STORE = 'statements';
const STATEMENT_REQUEST_STORE = 'statementRequests';

/**
 * Save statement record
 * Statement types: 'daily', 'weekly', 'monthly'
 */
export async function saveStatement(statement) {
  try {
    // Validate required fields
    if (!statement.period || !statement.type) {
      throw new Error('Statement must have period and type');
    }

    // Ensure timestamps and IDs
    const ts = statement.ts || statement.timestamp || Date.now();
    statement.ts = statement.ts || ts;
    statement.timestamp = statement.timestamp || ts;
    statement.id = statement.id || `stmt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Ensure status
    statement.status = statement.status || 'generated';
    statement.generatedAt = statement.generatedAt || Date.now();

    const saved = await db.insertRow(STATEMENTS_STORE, statement);
    console.log(`✅ saveStatement: Saved ${statement.type} statement for ${statement.period}`);
    return statement.id;
  } catch (err) {
    console.error('[saveStatement] error:', err);
    throw err;
  }
}

/**
 * Get statement by ID
 */
export async function getStatement(statementId) {
  try {
    const statement = await db.getRow(STATEMENTS_STORE, statementId);
    
    if (!statement) {
      throw new Error(`Statement ${statementId} not found`);
    }
    
    console.log(`✅ getStatement: Retrieved statement ${statementId}`);
    return statement;
  } catch (err) {
    console.error('[getStatement] error:', err);
    throw err;
  }
}

/**
 * Update statement
 */
export async function updateStatement(statementId, updates) {
  try {
    const updated = await db.updateRow(STATEMENTS_STORE, statementId, {
      ...updates,
      updatedAt: Date.now()
    });
    
    console.log(`✅ updateStatement: Updated statement ${statementId}`);
    return updated;
  } catch (err) {
    console.error('[updateStatement] error:', err);
    throw err;
  }
}

/**
 * Delete statement
 */
export async function deleteStatement(statementId) {
  try {
    await db.deleteRow(STATEMENTS_STORE, statementId);
    console.log(`✅ deleteStatement: Deleted statement ${statementId}`);
    return true;
  } catch (err) {
    console.error('[deleteStatement] error:', err);
    throw err;
  }
}

/**
 * Get all statements (paginated for performance)
 */
export async function getAllStatements(limit = 500, offset = 0) {
  try {
    const allStatements = await db.queryRows(STATEMENTS_STORE);
    
    // Sort by timestamp descending (most recent first)
    allStatements.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    // Paginate
    const paginated = allStatements.slice(offset, offset + limit);
    
    console.log(`✅ getAllStatements: Found ${allStatements.length} total, returning ${paginated.length}`);
    return paginated;
  } catch (err) {
    console.error('[getAllStatements] error:', err);
    return [];
  }
}

/**
 * Get statements by type
 * Types: 'daily', 'weekly', 'monthly'
 */
export async function getStatementsByType(type, limit = 500) {
  try {
    const statements = await db.queryByIndex(STATEMENTS_STORE, 'type', type);
    
    // Sort by timestamp descending
    statements.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    // Apply limit
    const limited = statements.slice(0, limit);
    
    console.log(`✅ getStatementsByType: Found ${limited.length} ${type} statements`);
    return limited;
  } catch (err) {
    console.error('[getStatementsByType] error:', err);
    return [];
  }
}

/**
 * Get statements by period
 * period format: "2024-01" (YYYY-MM for monthly), "2024-W05" (for weekly), "2024-01-15" (for daily)
 */
export async function getStatementsByPeriod(period) {
  try {
    const statements = await db.queryByIndex(STATEMENTS_STORE, 'period', period);
    
    // Sort by timestamp descending
    statements.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    console.log(`✅ getStatementsByPeriod: Found ${statements.length} statements for period ${period}`);
    return statements;
  } catch (err) {
    console.error('[getStatementsByPeriod] error:', err);
    return [];
  }
}

/**
 * Get statements by date range
 */
export async function getStatementsByDateRange(startTime, endTime) {
  try {
    const statements = await db.queryByRange(STATEMENTS_STORE, 'ts', startTime, endTime);
    
    // Sort by timestamp descending
    statements.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    console.log(`✅ getStatementsByDateRange: Found ${statements.length} statements`);
    return statements;
  } catch (err) {
    console.error('[getStatementsByDateRange] error:', err);
    return [];
  }
}

/**
 * Get latest statement of a specific type
 */
export async function getLatestStatement(type) {
  try {
    const statements = await db.queryByIndex(STATEMENTS_STORE, 'type', type);
    
    // Sort by timestamp descending and get first
    statements.sort((a, b) => (b.ts || b.timestamp) - (a.ts || a.timestamp));
    
    const latest = statements.length > 0 ? statements[0] : null;
    
    console.log(`✅ getLatestStatement: Retrieved latest ${type} statement`);
    return latest;
  } catch (err) {
    console.error('[getLatestStatement] error:', err);
    return null;
  }
}

/**
 * Get statements pending approval
 */
export async function getPendingStatements() {
  try {
    const allStatements = await db.queryRows(STATEMENTS_STORE);
    
    const pending = allStatements.filter(s => s.status === 'pending' || s.status === 'draft');
    
    console.log(`✅ getPendingStatements: Found ${pending.length} pending statements`);
    return pending;
  } catch (err) {
    console.error('[getPendingStatements] error:', err);
    return [];
  }
}

/**
 * Mark statement as reviewed/approved
 */
export async function approveStatement(statementId) {
  try {
    const approved = await updateStatement(statementId, {
      status: 'approved',
      approvedAt: Date.now()
    });
    
    console.log(`✅ approveStatement: Approved statement ${statementId}`);
    return approved;
  } catch (err) {
    console.error('[approveStatement] error:', err);
    throw err;
  }
}

/**
 * Mark statement as submitted/sent
 */
export async function markStatementSubmitted(statementId, submissionDetails) {
  try {
    const submitted = await updateStatement(statementId, {
      status: 'submitted',
      submittedAt: Date.now(),
      submissionDetails: submissionDetails || {}
    });
    
    console.log(`✅ markStatementSubmitted: Marked statement ${statementId} as submitted`);
    return submitted;
  } catch (err) {
    console.error('[markStatementSubmitted] error:', err);
    throw err;
  }
}

/**
 * Save statement request
 * Tracks when riders request statements
 */
export async function saveStatementRequest(request) {
  try {
    // Validate required fields
    if (!request.type || !request.period) {
      throw new Error('Statement request must have type and period');
    }

    const ts = request.ts || request.timestamp || Date.now();
    request.ts = request.ts || ts;
    request.timestamp = request.timestamp || ts;
    request.id = request.id || `sreq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    request.status = request.status || 'pending';

    const saved = await db.insertRow(STATEMENT_REQUEST_STORE, request);
    console.log(`✅ saveStatementRequest: Saved request for ${request.type} statement`);
    return request.id;
  } catch (err) {
    console.error('[saveStatementRequest] error:', err);
    throw err;
  }
}

/**
 * Get statement request by ID
 */
export async function getStatementRequest(requestId) {
  try {
    const request = await db.getRow(STATEMENT_REQUEST_STORE, requestId);
    
    if (!request) {
      throw new Error(`Statement request ${requestId} not found`);
    }
    
    console.log(`✅ getStatementRequest: Retrieved request ${requestId}`);
    return request;
  } catch (err) {
    console.error('[getStatementRequest] error:', err);
    throw err;
  }
}

/**
 * Get pending statement requests
 */
export async function getPendingStatementRequests() {
  try {
    const allRequests = await db.queryRows(STATEMENT_REQUEST_STORE);
    
    const pending = allRequests.filter(r => r.status === 'pending' || r.status === 'processing');
    
    console.log(`✅ getPendingStatementRequests: Found ${pending.length} pending requests`);
    return pending;
  } catch (err) {
    console.error('[getPendingStatementRequests] error:', err);
    return [];
  }
}

/**
 * Mark request as processed
 */
export async function markRequestProcessed(requestId, statementId) {
  try {
    const updated = await db.updateRow(STATEMENT_REQUEST_STORE, requestId, {
      status: 'processed',
      processedAt: Date.now(),
      statementId: statementId
    });
    
    console.log(`✅ markRequestProcessed: Marked request ${requestId} as processed`);
    return updated;
  } catch (err) {
    console.error('[markRequestProcessed] error:', err);
    throw err;
  }
}

/**
 * Get statement download history
 */
export async function getDownloadHistory(statementId) {
  try {
    const statement = await getStatement(statementId);
    
    if (!statement) {
      return [];
    }
    
    return statement.downloadHistory || [];
  } catch (err) {
    console.error('[getDownloadHistory] error:', err);
    return [];
  }
}

/**
 * Record statement download
 */
export async function recordStatementDownload(statementId, downloadDetails) {
  try {
    const statement = await getStatement(statementId);
    
    const downloadHistory = statement.downloadHistory || [];
    downloadHistory.push({
      downloadedAt: Date.now(),
      ...downloadDetails
    });
    
    const updated = await updateStatement(statementId, {
      downloadHistory: downloadHistory,
      lastDownloadedAt: Date.now()
    });
    
    console.log(`✅ recordStatementDownload: Recorded download for statement ${statementId}`);
    return updated;
  } catch (err) {
    console.error('[recordStatementDownload] error:', err);
    throw err;
  }
}

/**
 * Get most recently downloaded statement
 */
export async function getMostRecentlyDownloadedStatement() {
  try {
    const allStatements = await db.queryRows(STATEMENTS_STORE);
    
    // Filter statements that have been downloaded and sort by lastDownloadedAt
    const downloaded = allStatements
      .filter(s => s.lastDownloadedAt)
      .sort((a, b) => b.lastDownloadedAt - a.lastDownloadedAt);
    
    const mostRecent = downloaded.length > 0 ? downloaded[0] : null;
    
    console.log(`✅ getMostRecentlyDownloadedStatement: Retrieved most recent`);
    return mostRecent;
  } catch (err) {
    console.error('[getMostRecentlyDownloadedStatement] error:', err);
    return null;
  }
}

/**
 * Generate statement summary for a period
 * Used by DailyTradeSummaryScreen, FinancialHistoryScreen
 */
export async function generateStatementSummary(startTime, endTime, type = 'daily') {
  try {
    const statements = await db.queryByRange(STATEMENTS_STORE, 'ts', startTime, endTime);
    
    const typedStatements = statements.filter(s => s.type === type);
    
    const summary = {
      type,
      periodStart: new Date(startTime).toISOString(),
      periodEnd: new Date(endTime).toISOString(),
      statementCount: typedStatements.length,
      statements: typedStatements,
      latestStatement: typedStatements.length > 0 ? typedStatements[0] : null
    };
    
    console.log(`✅ generateStatementSummary: Generated summary for ${type} statements`);
    return summary;
  } catch (err) {
    console.error('[generateStatementSummary] error:', err);
    throw err;
  }
}

/**
 * Clear all statements (use with caution!)
 */
export async function clearAllStatements() {
  try {
    await db.clearStore(STATEMENTS_STORE);
    console.log(`⚠️ clearAllStatements: Cleared all statements`);
  } catch (err) {
    console.error('[clearAllStatements] error:', err);
    throw err;
  }
}

/**
 * Clear all statement requests (use with caution!)
 */
export async function clearAllStatementRequests() {
  try {
    await db.clearStore(STATEMENT_REQUEST_STORE);
    console.log(`⚠️ clearAllStatementRequests: Cleared all statement requests`);
  } catch (err) {
    console.error('[clearAllStatementRequests] error:', err);
    throw err;
  }
}

export default {
  saveStatement,
  getStatement,
  updateStatement,
  deleteStatement,
  getAllStatements,
  getStatementsByType,
  getStatementsByPeriod,
  getStatementsByDateRange,
  getLatestStatement,
  getPendingStatements,
  approveStatement,
  markStatementSubmitted,
  saveStatementRequest,
  getStatementRequest,
  getPendingStatementRequests,
  markRequestProcessed,
  getDownloadHistory,
  recordStatementDownload,
  getMostRecentlyDownloadedStatement,
  generateStatementSummary,
  clearAllStatements,
  clearAllStatementRequests
};