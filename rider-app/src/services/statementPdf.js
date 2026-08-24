// rider-app/src/services/statementPdf.js
// Referenced by StatementPreviewScreen.js (Module E) but never implemented in any guide.
// Uses Expo's print module (renders HTML to a PDF file on-device) and the sharing module
// (opens the OS share/save sheet) -- both work fully offline once the statement data has
// already been fetched, matching the app's offline-first design.
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// StatementPreviewScreen.js checks this before offering the "Share/Save PDF" button, since
// expo-print/expo-sharing are native modules unavailable on some platforms (e.g. plain web).
export function isPdfLibReady() {
  return typeof Print?.printToFileAsync === 'function';
}

function renderStatementHtml(stmt) {
  const rows = (stmt.transactions || [])
    .map(
      (t) => `<tr>
        <td>${t.date}</td>
        <td>${t.description}</td>
        <td style="text-align:right">KSh ${Number(t.amount).toLocaleString()}</td>
      </tr>`
    )
    .join('');

  return `
    <html>
      <body style="font-family: -apple-system, sans-serif; padding: 24px;">
        <h1 style="color:#0f5c46;">Smart Boda -- Financial Statement</h1>
        <p><strong>Rider:</strong> ${stmt.rider_name || ''}</p>
        <p><strong>Period:</strong> ${stmt.period_start} to ${stmt.period_end}</p>
        <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
          <thead>
            <tr style="background:#f6f4ef;">
              <th style="text-align:left; padding:8px;">Date</th>
              <th style="text-align:left; padding:8px;">Description</th>
              <th style="text-align:right; padding:8px;">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top: 24px; font-weight: bold;">
          Total: KSh ${Number(stmt.total_amount || 0).toLocaleString()}
        </p>
      </body>
    </html>
  `;
}

export async function generateAndSharePdf(stmt) {
  const html = renderStatementHtml(stmt);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Save or share your Smart Boda statement',
    });
  }
  return uri;
}
