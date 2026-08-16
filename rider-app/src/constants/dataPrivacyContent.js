// rider-app/src/constants/dataPrivacyContent.js
// Full Data Privacy Notice copy — 18 sections, matching cleaned.html's PRIVACY_SECTIONS constant
// verbatim (Introduction & Who We Are, Scope of This Notice, Information We Collect, How We
// Collect Information, Legal Bases for Processing, How We Use Your Information, Automated
// Decisions, How We Share Your Information, International Data Transfers, Data Storage/Security/
// Retention, Data Export & Portability, Your Rights Under the Data Protection Act 2019, Location
// & Tracking, Children\u2019s Privacy, Cookies & Local Storage, Data Breach Notification, Changes
// to This Notice, and Contact Us / Data Protection Queries).
// Consumed by DataPrivacyScreen.js below via LegalDocumentScreen's shared renderer.
// NOTE: this is professionally-styled template content for the prototype — before going live,
// have it reviewed by Kenyan-qualified legal counsel and fill in the bracketed [...] placeholders
// with real company details.

export const PRIVACY_SECTIONS = [
  { num:1, id:'priv-1', title:'Introduction & Who We Are', html:`
    <p>This Data Privacy Notice explains how <b>Smart Boda Digital Limited</b> ("we", "us", "our") collects, uses, shares, and protects your personal data when you use the Smart Boda Digital app, USSD service, and related tools (the "App"). We are the <b>data controller</b> for the personal data described in this Notice, as defined under the Kenya Data Protection Act, 2019 ("DPA").</p>
    <p>This Notice should be read together with our <span class="legal-crosslink" onclick="go('termsOfService')">Terms of Service</span>. By using the App, you acknowledge that you have read this Notice.</p>
  `},
  { num:2, id:'priv-2', title:'Scope of This Notice', html:`
    <p>This Notice applies to personal data we collect through the App from riders. It does not cover third-party services you access independently, such as Safaricom's own M-Pesa app or your device manufacturer's operating system, which have their own privacy notices.</p>
  `},
  { num:3, id:'priv-3', title:'Information We Collect', html:`
    <p class="subhead">Identity & verification data</p>
    <ul><li>Full name, mobile number, chosen language, and rider ID assigned to your account.</li></ul>
    <p class="subhead">Account & security data</p>
    <ul><li>Your 4-digit login PIN (stored in hashed/encrypted form — not visible as plain text, even to our staff).</li></ul>
    <p class="subhead">Motorcycle data</p>
    <ul><li>Plate number, fuel type, and odometer readings you record for the single motorcycle you own and operate.</li></ul>
    <p class="subhead">Trip & earnings data</p>
    <ul><li>Trip counts and fares you manually enter. <b>We do not collect continuous or background GPS location data</b> — trips are self-logged, not tracked in real time.</li></ul>
    <p class="subhead">Fuel, charging & maintenance data</p>
    <ul><li>Fuel or battery-charging costs, service/maintenance entries, and associated odometer values.</li></ul>
    <p class="subhead">Financial & savings data</p>
    <ul><li>Budgets, revenue targets, savings contributions, goals, and other-expense entries you record.</li></ul>
    <p class="subhead">Compliance document data</p>
    <ul><li>Document type (e.g., licence, insurance, logbook) and the expiry date you enter, so we can send renewal reminders. We do not currently require photo uploads of these documents.</li></ul>
    <p class="subhead">Remittance ("Send Home") data</p>
    <ul><li>Recipient name, relationship, amount, and payment channel for money you record sending to family — recorded for your own budgeting; we do not move this money ourselves.</li></ul>
    <p class="subhead">Payment confirmation data</p>
    <ul><li>M-Pesa confirmation codes, amounts, and timestamps you submit to verify Subscription payments. <b>We never collect your M-Pesa PIN or full M-Pesa account access.</b></li></ul>
    <p class="subhead">Device, usage & offline-sync data</p>
    <ul><li>Device/app details, connectivity status (online/offline, USSD mode), sync timestamps, and general app usage needed to keep the service working, including data temporarily stored on your device while offline.</li></ul>
    <p class="subhead">Communications</p>
    <ul><li>Records of your interactions with our customer care team by phone or WhatsApp, where you contact us.</li></ul>
  `},
  { num:4, id:'priv-4', title:'How We Collect Information', html:`
    <ul>
      <li><b>Directly from you</b> — when you register, log trips/expenses, add documents, set goals, or contact customer care.</li>
      <li><b>Automatically</b> — limited technical and usage data generated as you use the App (e.g., sync status, connectivity mode).</li>
      <li><b>Offline, then synced</b> — entries made without a connection are stored on your device and transmitted to us once you reconnect.</li>
      <li><b>From payment/telecom channels</b> — confirmation of M-Pesa transaction details you submit, and SMS/USSD delivery confirmations from mobile network operators.</li>
    </ul>
  `},
  { num:5, id:'priv-5', title:'Legal Bases for Processing', html:`
    <p>Under the Data Protection Act, 2019, we process your personal data on the following legal bases:</p>
    <ul>
      <li><b>Performance of a contract</b> — to create your account, run your Subscription, and deliver the App's core features.</li>
      <li><b>Consent</b> — for optional features and communications where consent is the appropriate basis, which you may withdraw at any time (see Section 12).</li>
      <li><b>Legitimate interests</b> — to keep the App secure, prevent fraud and duplicate accounts, and improve our service, balanced against your rights and interests.</li>
      <li><b>Legal obligation</b> — where we must retain or disclose information to comply with Kenyan law or a lawful request from a competent authority.</li>
    </ul>
  `},
  { num:6, id:'priv-6', title:'How We Use Your Information', html:`
    <ul>
      <li>To create and maintain your account and authenticate you (PIN);</li>
      <li>To record and display your trips, expenses, savings, goals, and generate financial summaries/statements from data you provide;</li>
      <li>To verify Subscription payments and manage account activation, prepayment, and lockouts;</li>
      <li>To send compliance-document expiry reminders and urgent alerts;</li>
      <li>To provide customer support and respond to your enquiries;</li>
      <li>To detect, investigate, and prevent fraud, duplicate accounts, and misuse;</li>
      <li>To comply with legal and regulatory obligations; and</li>
      <li>To understand aggregated, de-identified usage trends so we can improve the App — we do not use your individual financial records for advertising.</li>
    </ul>
  `},
  { num:7, id:'priv-7', title:'Automated Decisions', html:`
    <p>Some account actions happen automatically based on simple, transparent rules rather than profiling: for example, your account is temporarily locked after several incorrect PIN attempts, and paid features are locked if your Subscription lapses. These are rule-based safeguards, not behavioural profiling, and you can always reach a human at customer care to resolve a lockout or dispute an automated action.</p>
  `},
  { num:8, id:'priv-8', title:'How We Share Your Information', html:`
    <p>We do <b>not</b> sell your personal data, and we do not share your individual financial records with advertisers. We share limited data only as follows:</p>
    <ul>
      <li><b>Service providers ("processors")</b> — cloud hosting, SMS/USSD gateway providers, and similar vendors who process data on our instructions under confidentiality and data-protection obligations.</li>
      <li><b>Payment verification</b> — limited transaction details (amount, confirmation code) as needed to verify a Subscription payment.</li>
      <li><b>Legal & regulatory authorities</b> — where required by law, court order, or a lawful request from a competent Kenyan authority.</li>
      <li><b>Business transfers</b> — in connection with a merger, acquisition, or sale of assets, subject to equivalent data protection safeguards.</li>
    </ul>
  `},
  { num:9, id:'priv-9', title:'International Data Transfers', html:`
    <p>Where our service providers process data outside Kenya (for example, cloud infrastructure hosted internationally), we take steps required under the Data Protection Act, 2019 to ensure an adequate level of protection, such as contractual safeguards, before any cross-border transfer takes place.</p>
  `},
  { num:10, id:'priv-10', title:'Data Storage, Security & Retention', html:`
    <p>We apply reasonable technical and organisational measures to protect your data, including encrypted storage of sensitive credentials (your PIN is hashed, not stored as plain text) and secure transmission where the App is online. Data captured offline is stored locally on your device until it can be synced securely.</p>
    <p>We retain your personal data for as long as your account is active, and for a reasonable period after closure to meet legal, accounting, or dispute-resolution obligations, after which it is securely deleted or anonymised, unless a longer retention period is required by law.</p>
  `},
  { num:11, id:'priv-11', title:'Data Export & Portability', html:`
    <div class="legal-callout green"><b>Always available:</b> you may request a full export of your data from Settings at any time — including while your account is locked for non-payment. This request is never conditional on payment.</div>
    <p>Exported data is provided in a structured, commonly-used format so you can keep your own copy or move it elsewhere.</p>
  `},
  { num:12, id:'priv-12', title:'Your Rights Under the Data Protection Act, 2019', html:`
    <p>As a data subject under Kenyan law, you have the right to:</p>
    <ul>
      <li><b>Access</b> the personal data we hold about you;</li>
      <li><b>Correct</b> inaccurate or incomplete data (many fields are editable directly in Settings);</li>
      <li><b>Request deletion</b> of your data, subject to legal retention requirements;</li>
      <li><b>Object to or restrict</b> certain processing;</li>
      <li><b>Data portability</b> — receive your data in a portable format (see Section 11);</li>
      <li><b>Withdraw consent</b> at any time for processing based on consent, without affecting processing carried out before withdrawal; and</li>
      <li><b>Lodge a complaint</b> with the Office of the Data Protection Commissioner (ODPC), Kenya — <b>www.odpc.go.ke</b> — if you believe we have mishandled your data.</li>
    </ul>
    <p>To exercise any of these rights, use the in-app request options in Settings or contact us using the details in Section 18.</p>
  `},
  { num:13, id:'priv-13', title:'Location & Tracking', html:`
    <p>To be clear: the App does <b>not</b> continuously track your GPS location or monitor your movements in the background. Trips, distances, and odometer readings are entered by you. We may use coarse, non-precise signals (such as connectivity/online status) purely to support offline sync — this is not location tracking.</p>
  `},
  { num:14, id:'priv-14', title:'Children\u2019s Privacy', html:`
    <p>The App is intended for riders aged 18 and above, consistent with the eligibility requirements in our Terms of Service. We do not knowingly collect personal data from anyone under 18. If we become aware that we have inadvertently done so, we will take steps to delete that data.</p>
  `},
  { num:15, id:'priv-15', title:'Cookies & Local Storage', html:`
    <p>The App uses local on-device storage to keep you logged in, remember your preferences, and support offline mode — not third-party advertising cookies or cross-site trackers. If we introduce web-based cookies for analytics in future, we will update this Notice and, where required, request your consent.</p>
  `},
  { num:16, id:'priv-16', title:'Data Breach Notification', html:`
    <p>In the unlikely event of a data breach likely to result in a risk to your rights and freedoms, we will notify the Office of the Data Protection Commissioner and affected users without undue delay, as required under the Data Protection Act, 2019, along with guidance on steps you can take to protect yourself.</p>
  `},
  { num:17, id:'priv-17', title:'Changes to This Notice', html:`
    <p>We may update this Notice from time to time to reflect changes in our practices or the law. Material changes will be communicated in-app or by SMS before they take effect. The "Effective" date at the top of this page shows when the current version applies from.</p>
  `},
  { num:18, id:'priv-18', title:'Contact Us / Data Protection Queries', html:`
    <p>For any question about this Notice or to exercise your data protection rights, contact:</p>
    <p>📞 <b>+254 757 334481</b> &nbsp;·&nbsp; 📞 <b>+254 101 605262</b> (call or WhatsApp)<br>
    ✉️ <b>privacy@smartbodadigital.co.ke</b><br>
    📍 Smart Boda Digital Limited, Nairobi, Kenya [registered office address — insert]</p>
    <p>You may also contact the Office of the Data Protection Commissioner, Kenya, at <b>www.odpc.go.ke</b>.</p>
  `},
];
