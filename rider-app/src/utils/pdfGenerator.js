/**
 * pdfGenerator.js - Cross-Platform PDF Generation
 * FIXED VERSION: Uses expo-print for better mobile/web compatibility
 * 
 * Recommended Solution: Uses expo-print which is already in dependencies
 * - ✅ Works on Web
 * - ✅ Works on Android  
 * - ✅ Works on iOS
 * - ✅ Better performance
 * - ✅ Native PDF rendering
 */

import * as Print from 'expo-print';

/**
 * Generate statement PDF
 * @param {Object} statement - Statement object with summary and metadata
 * @returns {Promise<void>}
 */
export async function generateStatementPDF(statement) {
  try {
    if (!statement) {
      throw new Error('No statement data provided');
    }

    // Build HTML for PDF
    const htmlContent = generateStatementHTML(statement);

    // Print to PDF
    await Print.printAsync({
      html: htmlContent,
      fileName: `SmartBoda-Statement-${statement.id}`,
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    throw err;
  }
}

/**
 * Generate detailed expense report PDF
 * @param {Object} statement - Statement object
 * @param {Array} transactions - Transaction list
 * @returns {Promise<void>}
 */
export async function generateDetailedReportPDF(statement, transactions) {
  try {
    if (!statement || !Array.isArray(transactions)) {
      throw new Error('Invalid statement or transactions data');
    }

    const htmlContent = generateDetailedReportHTML(statement, transactions);

    await Print.printAsync({
      html: htmlContent,
      fileName: `SmartBoda-DetailedReport-${statement.id}`,
    });
  } catch (err) {
    console.error('Detailed report PDF error:', err);
    throw err;
  }
}

/**
 * Generate HTML for Statement PDF
 * @private
 */
function generateStatementHTML(statement) {
  const startDate = new Date(statement.startMs).toLocaleDateString();
  const endDate = new Date(statement.endMs).toLocaleDateString();
  const generatedDate = new Date(statement.generatedAt).toLocaleString();

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Smart Boda Statement</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 100%;
            height: 100%;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Roboto, sans-serif;
            padding: 40px;
            background: white;
            color: #333;
            line-height: 1.5;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
          }
          .header {
            margin-bottom: 30px;
          }
          h1 {
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 16px;
            color: #1a1a1a;
          }
          .metadata {
            font-size: 11px;
            color: #666;
            margin-bottom: 12px;
            line-height: 1.8;
          }
          .metadata-line {
            margin-bottom: 4px;
          }
          .divider {
            height: 1px;
            background: #ddd;
            margin: 20px 0;
          }
          .summary-section {
            margin-bottom: 24px;
          }
          .summary-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            font-size: 13px;
            border-bottom: 1px solid #eee;
          }
          .summary-item:last-child {
            border-bottom: none;
          }
          .summary-label {
            font-weight: 500;
            color: #555;
          }
          .summary-value {
            font-weight: 700;
            color: #1a1a1a;
            text-align: right;
          }
          .breakdown-section {
            margin-top: 20px;
            margin-bottom: 20px;
          }
          .breakdown-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #333;
          }
          .breakdown-item {
            font-size: 12px;
            padding: 6px 0 6px 20px;
            color: #666;
            border-left: 2px solid #f0f0f0;
          }
          .verification {
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid #eee;
            font-size: 10px;
            color: #999;
          }
          .footer {
            margin-top: 40px;
            font-size: 9px;
            color: #aaa;
            text-align: center;
            line-height: 1.6;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Smart Boda Digital — Earnings Statement</h1>
          </div>

          <div class="metadata">
            <div class="metadata-line">📅 Period: ${startDate} - ${endDate}</div>
            <div class="metadata-line">🕐 Generated: ${generatedDate}</div>
            ${statement.purpose ? `<div class="metadata-line">📋 Purpose: ${statement.purpose}</div>` : ''}
            <div class="metadata-line">📝 Summarized Statement</div>
          </div>

          <div class="divider"></div>

          <div class="summary-section">
            <div class="summary-item">
              <span class="summary-label">Total Income</span>
              <span class="summary-value">KSh ${statement.summary.income.toLocaleString()}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Total Expense</span>
              <span class="summary-value">KSh ${statement.summary.totalExpense.toLocaleString()}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Net Profit</span>
              <span class="summary-value">KSh ${statement.summary.netProfit.toLocaleString()}</span>
            </div>
          </div>

          <div class="divider"></div>

          ${generateBreakdownHTML(statement.summary)}

          <div class="verification">
            <strong>Verification Code:</strong> ${statement.verificationRef || 'Pending — will register once online'}
          </div>

          <div class="footer">
            <p>This is an automatically generated statement.</p>
            <p>For inquiries or support, contact Smart Boda customer service.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate HTML for Detailed Report PDF
 * @private
 */
function generateDetailedReportHTML(statement, transactions) {
  const startDate = new Date(statement.startMs).toLocaleDateString();
  const endDate = new Date(statement.endMs).toLocaleDateString();

  const transactionRows = transactions
    .map((tx, idx) => {
      const typeLabel = {
        trip: 'Trip',
        fuel: 'Fuel/Energy',
        maintenance: 'Service',
        other: 'Expense',
      }[tx.type] || tx.type;

      const date = new Date(tx.timestamp).toLocaleString();
      const rowClass = idx % 2 === 0 ? 'even' : 'odd';
      
      return `
        <tr class="row-${rowClass}">
          <td class="cell-date">${date}</td>
          <td class="cell-type">${typeLabel}</td>
          <td class="cell-amount">KSh ${tx.amount.toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Smart Boda Detailed Report</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 100%;
            height: 100%;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Roboto, sans-serif;
            padding: 40px 20px;
            background: white;
            color: #333;
            font-size: 12px;
          }
          .container {
            max-width: 700px;
            margin: 0 auto;
          }
          h1 {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 20px;
            color: #1a1a1a;
          }
          h2 {
            font-size: 14px;
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 12px;
            color: #333;
          }
          .metadata {
            color: #666;
            margin-bottom: 24px;
            line-height: 1.8;
            font-size: 11px;
          }
          .metadata-line {
            margin-bottom: 4px;
          }
          .summary-section {
            background: #f9f9f9;
            padding: 16px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          .summary-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
          }
          .summary-line:last-child {
            margin-bottom: 0;
          }
          .summary-label {
            font-weight: 500;
            color: #555;
          }
          .summary-value {
            font-weight: 700;
            color: #1a1a1a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }
          thead {
            background: #f0f0f0;
          }
          th {
            padding: 10px 8px;
            text-align: left;
            font-weight: 600;
            border: 1px solid #ddd;
            font-size: 11px;
            color: #333;
          }
          td {
            padding: 8px;
            border: 1px solid #eee;
            font-size: 11px;
          }
          .row-odd {
            background: #fafafa;
          }
          .row-even {
            background: white;
          }
          .cell-date {
            width: 35%;
            color: #666;
          }
          .cell-type {
            width: 30%;
            color: #666;
          }
          .cell-amount {
            width: 35%;
            text-align: right;
            font-weight: 600;
            color: #1a1a1a;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 9px;
            color: #aaa;
            text-align: center;
            line-height: 1.6;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Smart Boda Digital — Detailed Earnings Report</h1>

          <div class="metadata">
            <div class="metadata-line">📅 Period: ${startDate} - ${endDate}</div>
            <div class="metadata-line">🕐 Generated: ${new Date().toLocaleString()}</div>
          </div>

          <h2>Financial Summary</h2>
          <div class="summary-section">
            <div class="summary-line">
              <span class="summary-label">Total Income:</span>
              <span class="summary-value">KSh ${statement.summary.income.toLocaleString()}</span>
            </div>
            <div class="summary-line">
              <span class="summary-label">Total Expense:</span>
              <span class="summary-value">KSh ${statement.summary.totalExpense.toLocaleString()}</span>
            </div>
            <div class="summary-line">
              <span class="summary-label">Net Profit:</span>
              <span class="summary-value">KSh ${statement.summary.netProfit.toLocaleString()}</span>
            </div>
          </div>

          <h2>Transaction Details</h2>
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Transaction Type</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${transactionRows}
            </tbody>
          </table>

          <div class="footer">
            <p>This is an automatically generated detailed report.</p>
            <p>For inquiries or support, contact Smart Boda customer service.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generate breakdown section HTML
 * @private
 */
function generateBreakdownHTML(summary) {
  if (!summary.otherByCategory || Object.keys(summary.otherByCategory).length === 0) {
    return '';
  }

  let breakdownHTML = '<div class="breakdown-section"><div class="breakdown-title">💰 Expense Breakdown</div>';

  // Fuel
  if (summary.fuel > 0) {
    breakdownHTML += `<div class="breakdown-item">⚡ Fuel/Energy: KSh ${summary.fuel.toLocaleString()}</div>`;
  }

  // Maintenance
  if (summary.maintenance > 0) {
    breakdownHTML += `<div class="breakdown-item">🔧 Service: KSh ${summary.maintenance.toLocaleString()}</div>`;
  }

  // Other categories
  Object.entries(summary.otherByCategory).forEach(([category, amount]) => {
    if (amount > 0) {
      breakdownHTML += `<div class="breakdown-item">📌 ${category}: KSh ${amount.toLocaleString()}</div>`;
    }
  });

  breakdownHTML += '</div>';
  return breakdownHTML;
}

/**
 * Check if PDF library is loaded
 * Note: expo-print is always available in Expo environment
 */
export function isPDFLibraryLoaded() {
  return true; // expo-print is always available
}