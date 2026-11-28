// rider-app/src/offline/printHtml.js
// PRINT / SAVE A DOCUMENT AS PDF. The document is a complete HTML page (a statement); only that page is ever printed.
//   * On a phone (Android / iOS): expo-print makes a PDF file and the share sheet opens it.
//   * In the web app (the installed PWA): the page is loaded into a hidden frame and ONLY the frame is printed, so the browser's "Save as PDF" holds the statement and nothing of the
//     app around it (no buttons, menus or headings). expo-print's web version prints the whole current screen, which is why it must not be used for statements there.
import { Platform } from 'react-native';
import { PROVIDER_NAME } from './statementBrand';

/** Web: print `html` from a hidden iframe. Resolves when the print dialog has been opened. */
export function printHtmlInFrame(html, { doc = typeof document !== 'undefined' ? document : null, timeoutMs = 15000, cleanupMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!doc) { reject(new Error('Printing is not available here.')); return; }
    const frame = doc.createElement('iframe');
    frame.setAttribute('title', 'statement');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
    let done = false;
    const finish = (err) => { if (done) return; done = true; if (err) { try { frame.remove(); } catch (e) { /* gone */ } reject(err); } else { setTimeout(() => { try { frame.remove(); } catch (e) { /* gone */ } }, cleanupMs); resolve({ printed: true }); } };
    frame.onload = () => {
      try { const w = frame.contentWindow; w.focus(); w.print(); finish(); } catch (e) { finish(e); }
    };
    setTimeout(() => finish(new Error('The statement could not be prepared for printing.')), timeoutMs);
    frame.srcdoc = html;
    doc.body.appendChild(frame);
  });
}

/** Make the statement a PDF the person can keep or share, whatever the platform. */
export async function printHtmlDocument(html, { title = 'Statement' } = {}) {
  if (Platform.OS === 'web') return printHtmlInFrame(html);
  const Print = require('expo-print'), Sharing = require('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${PROVIDER_NAME} · ${title}` });
  return { uri };
}
