/**
 * rider-app/src/offline/offlineStatementDownload.js
 * 
 * ✅ CRITICAL FIX: Enables statement PDF downloads when OFFLINE
 * Provides two fallback mechanisms:
 * 1. Generate PDF from cached statement data in IndexedDB
 * 2. Queue download request for sync when connection restored
 * 
 * ADDRESSES ISSUE: "Offline PDF Download Issue"
 * Users can now download statements even when completely offline
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import indexedDbAdapter from './adapters/indexedDbAdapter';
import { addToSyncQueue } from './syncQueue';

/**
 * ✅ Generate detailed HTML for statement PDF
 * Uses the same format as online statements for consistency
 */
function renderStatementHtml(statement) {
  const income = statement.income || statement.financial_summary?.income || 0;
  const expense = statement.total_expense || statement.financial_summary?.totalExpense || 0;
  const netProfit = statement.net_profit || statement.financial_summary?.netProfit || 0;
  const purpose = statement.purpose || statement.purpose_code || 'General';
  const periodStart = new Date(statement.period_start || statement.startMs).toLocaleDateString();
  const periodEnd = new Date(statement.period_end || statement.endMs).toLocaleDateString();
  const verification = statement.verification_ref || statement.verificationRef || 'N/A';

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Smart Boda Financial Statement</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 32px;
            background: #f6f4ef;
            color: #1a1c20;
          }
          .container {
            max-width: 800px;
            background: white;
            padding: 32px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          h1 {
            color: #0f5c46;
            margin: 0 0 24px 0;
            font-size: 28px;
            border-bottom: 3px solid #ff7a1a;
            padding-bottom: 12px;
          }
          .header-info {
            background: #f6f4ef;
            padding: 16px;
            border-radius: 6px;
            margin-bottom: 24px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 14px;
          }
          .info-label {
            font-weight: 600;
            color: #5b606c;
          }
          .info-value {
            color: #1a1c20;
          }
          .summary-table {
            width: 100%;
            border-collapse: collapse;
            margin: 24px 0;
          }
          .summary-table td {
            padding: 12px;
            border-bottom: 1px solid #e7e4db;
          }
          .summary-label {
            font-weight: 600;
            color: #5b606c;
          }
          .summary-value {
            text-align: right;
            color: #1a1c20;
            font-size: 16px;
          }
          .summary-value.highlight {
            font-weight: 700;
            color: #0f5c46;
            font-size: 18px;
          }
          .verification {
            background: #e6f5ef;
            padding: 16px;
            border-left: 4px solid #1e9e6f;
            border-radius: 4px;
            margin-top: 24px;
            font-size: 12px;
          }
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #e7e4db;
            font-size: 11px;
            color: #5b606c;
            text-align: center;
          }
          .offline-badge {
            display: inline-block;
            background: #fff3e0;
            color: #e65100;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Smart Boda — Financial Statement</h1>
          
          <div class="header-info">
            <div class="info-row">
              <span class="info-label">Period:</span>
              <span class="info-value">${periodStart} – ${periodEnd}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Purpose:</span>
              <span class="info-value">${purpose}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Generated:</span>
              <span class="info-value">${new Date(statement.ts || statement.generatedAt || Date.now()).toLocaleString()}</span>
            </div>
          </div>

          <table class="summary-table">
            <tr>
              <td class="summary-label">Total Income (KSh)</td>
              <td class="summary-value">${income.toLocaleString()}</td>
            </tr>
            <tr>
              <td class="summary-label">Total Expenses (KSh)</td>
              <td class="summary-value">${expense.toLocaleString()}</td>
            </tr>
            <tr>
              <td class="summary-label">Net Profit (KSh)</td>
              <td class="summary-value highlight">${netProfit.toLocaleString()}</td>
            </tr>
          </table>

          <div class="verification">
            <strong>Verification Code:</strong> ${verification}<br/>
            <strong>Document ID:</strong> ${statement.id || 'N/A'}<br/>
            <strong>Status:</strong> ${statement.verified ? '✅ Verified' : '⏳ Pending Verification'}
          </div>

          <div class="footer">
            <p>This statement was generated on your device and is valid for 6 months from creation.</p>
            <p>For inquiries, contact Smart Boda Customer Support.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * ✅ Check if PDF library is available
 * Returns false on web/browser environments where Print module may not be available
 */
export function isPdfLibReady() {
  try {
    return typeof Print?.printToFileAsync === 'function' && typeof Sharing?.shareAsync === 'function';
  } catch {
    return false;
  }
}

/**
 * ✅ Download statement PDF when OFFLINE
 * Generates PDF from IndexedDB-cached statement data
 * Falls back to queuing download if generation fails
 */
export async function downloadStatementOffline(statementId, riderId) {
  console.log(`📥 OFFLINE: Attempting to download statement ${statementId} from local cache...`);

  try {
    // ✅ Step 1: Load statement from IndexedDB
    let statement = null;
    try {
      statement = await indexedDbAdapter.kvGet(`statement_${statementId}`);
      if (typeof statement === 'string') {
        statement = JSON.parse(statement);
      }
    } catch (err) {
      console.warn('⚠️ Failed to load statement from IndexedDB:', err.message);
    }

    if (!statement) {
      console.error('❌ Statement not found in local cache');
      // Queue for sync when online
      await queueDownloadForSync(statementId, riderId);
      return {
        success: false,
        queued: true,
        message: 'Statement not cached locally. Download queued for when connection is restored.',
      };
    }

    // ✅ Step 2: Verify PDF library is available
    if (!isPdfLibReady()) {
      console.warn('⚠️ PDF library not available on this platform');
      // Queue for sync
      await queueDownloadForSync(statementId, riderId);
      return {
        success: false,
        queued: true,
        message: 'PDF generation not available. Download queued for sync.',
      };
    }

    // ✅ Step 3: Generate PDF from cached statement
    console.log('📝 Generating PDF from cached statement...');
    const html = renderStatementHtml(statement);
    const { uri } = await Print.printToFileAsync({ html });
    console.log('✅ PDF generated:', uri);

    // ✅ Step 4: Share/Save the PDF
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      console.log('📤 Opening share dialog...');
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTType: 'com.adobe.pdf',
        dialogTitle: `Smart Boda Statement - ${statementId}`,
      });
    } else {
      console.warn('⚠️ Sharing not available on this device');
    }

    // ✅ Record this offline download locally
    try {
      const statement_updated = await indexedDbAdapter.updateRow('statements', statementId, {
        shared: [
          ...(statement.shared || []),
          {
            method: 'offline_download',
            timestamp: Date.now(),
            sharedAt: new Date().toISOString(),
          }
        ],
        lastSharedAt: Date.now(),
        updatedAt: Date.now()
      });
      console.log('✅ Offline download recorded in IndexedDB');
    } catch (recordErr) {
      console.warn('⚠️ Could not record offline download:', recordErr.message);
      // Not critical - continue anyway
    }

    return {
      success: true,
      queued: false,
      message: '✅ Statement downloaded successfully (offline)',
      uri,
    };

  } catch (err) {
    console.error('❌ Offline download failed:', err);
    
    // ✅ Final fallback: Queue for sync
    try {
      await queueDownloadForSync(statementId, riderId);
      return {
        success: false,
        queued: true,
        message: 'Download failed. Queued for retry when online.',
      };
    } catch (queueErr) {
      return {
        success: false,
        queued: false,
        message: 'Download failed. Please try again when online.',
      };
    }
  }
}

/**
 * ✅ Queue a statement download request for sync
 * Used when download fails offline and connection unavailable
 */
export async function queueDownloadForSync(statementId, riderId) {
  try {
    console.log(`📡 Queuing download for sync: ${statementId}`);
    
    await addToSyncQueue({
      id: `download_${statementId}_${Date.now()}`,
      type: 'statement_download',
      endpoint: `/compliance/statements/${statementId}/download`,
      data: {
        statement_id: statementId,
        rider_id: riderId,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
    
    console.log('✅ Download queued for sync');
    return true;
  } catch (err) {
    console.error('❌ Failed to queue download:', err);
    throw err;
  }
}

/**
 * ✅ Download statement - intelligent fallback:
 * 1. If online: Try API first
 * 2. If API fails or offline: Use IndexedDB cache
 * 3. If cache unavailable: Queue for later
 */
export async function downloadStatementIntelligent(statementId, riderId, isConnected, apiCall) {
  console.log(`📥 Download request: ${statementId} (connected: ${isConnected})`);

  // ✅ If OFFLINE: Use local cache immediately
  if (!isConnected) {
    console.log('🔴 OFFLINE: Using local cache for statement download');
    return downloadStatementOffline(statementId, riderId);
  }

  // ✅ If ONLINE: Try API first
  try {
    console.log('🟢 ONLINE: Attempting API download...');
    const result = await apiCall();
    console.log('✅ API download successful');
    return {
      success: true,
      queued: false,
      message: '✅ Statement downloaded successfully',
    };
  } catch (apiErr) {
    console.warn('⚠️ API download failed:', apiErr.message);
    
    // ✅ API failed but we're online: Try cached copy
    const cachedResult = await downloadStatementOffline(statementId, riderId);
    if (cachedResult.success) {
      console.log('✅ Fallback to cached copy successful');
      return {
        ...cachedResult,
        message: '✅ Downloaded from cache (online sync failed)',
      };
    }
    
    // ✅ Both API and cache failed: Queue for later
    console.log('📡 Both API and cache failed: Queuing for sync');
    return cachedResult;
  }
}

export default {
  isPdfLibReady,
  downloadStatementOffline,
  queueDownloadForSync,
  downloadStatementIntelligent,
};