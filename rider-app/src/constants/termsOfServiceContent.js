// rider-app/src/constants/termsOfServiceContent.js
// Full Terms of Service copy — 23 sections, matching cleaned.html's TERMS_SECTIONS constant
// verbatim (Introduction & Acceptance, Definitions, Eligibility, Nature of the Service, Your
// Account & Security, Your Bike Profile, Subscription Plans/Trials/Fees, Making Payments, Account
// Locking/Suspension/Reactivation, Your Data/Records, Compliance Document Reminders, Offline
// Mode/USSD/Sync, Acceptable Use, Intellectual Property, Third-Party Services, Disclaimers,
// Limitation of Liability, Indemnification, Suspension & Termination, Changes to These Terms,
// Governing Law & Dispute Resolution, General Provisions, and Contact Us).
// Consumed by TermsOfServiceScreen.js below via LegalDocumentScreen's shared renderer.
// NOTE: this is professionally-styled template content for the prototype — before going live,
// have it reviewed by Kenyan-qualified legal counsel and fill in the bracketed [...] placeholders
// with real company details.

export const TERMS_SECTIONS = [
  { num:1, id:'tos-1', title:'Introduction & Acceptance', html:`
    <p>These Terms of Service ("Terms") govern your access to and use of the Smart Boda Digital app, USSD service, and related tools (together, the "App"), provided by <b>Smart Boda Digital Limited</b> ("Smart Boda Digital", "we", "us", "our"), a company registered in Kenya [Company Registration No. — insert].</p>
    <p>By tapping "Continue" on the consent step, dialling our USSD code, or otherwise creating and using an account, you confirm that you have read, understood, and agree to be bound by these Terms and by our <span class="legal-crosslink" onclick="go('dataPrivacy')">Data Privacy Notice</span>, which is incorporated into these Terms by reference. If you do not agree, please do not use the App.</p>
    <div class="legal-callout">These Terms are drafted specifically for the scope of this prototype and should be reviewed by qualified Kenyan legal counsel before publication in a production app.</div>
  `},
  { num:2, id:'tos-2', title:'Definitions', html:`
    <ul>
      <li><b>"Rider"</b> means the individual boda boda operator who registers and uses the App to log trips, expenses, and compliance information, and who owns and operates their own motorcycle.</li>
      <li><b>"Subscription"</b> means the paid plan required to keep your account active, billed daily, weekly, or monthly as you select.</li>
      <li><b>"Content"</b> means any information you enter into the App, including trip records, fuel/charging entries, maintenance logs, documents, goals, and messages to customer care.</li>
      <li><b>"USSD Mode"</b> means the feature-phone access path (dial code such as *384*7#) offered as a parity channel for riders without smartphones or data access.</li>
    </ul>
  `},
  { num:3, id:'tos-3', title:'Eligibility', html:`
    <p>To use the App, you must:</p>
    <ul>
      <li>Be at least 18 years old and legally capable of entering into a binding contract under Kenyan law;</li>
      <li>Hold a valid Kenyan mobile number capable of receiving SMS and/or USSD prompts;</li>
      <li>Hold, or be in the process of obtaining, a valid motorcycle riding licence appropriate to the class of motorcycle you operate; and</li>
      <li>Provide accurate, current, and complete information during registration and keep it up to date.</li>
    </ul>
    <p>We may ask you to verify your identity or eligibility at any time and may suspend accounts where we reasonably believe this section has not been met.</p>
  `},
  { num:4, id:'tos-4', title:'Nature of the Service — What Smart Boda Digital Is (and Isn\u2019t)', html:`
    <p>Smart Boda Digital is a <b>self-service business management tool</b> for boda boda riders who own and operate their own motorcycle. It helps you record trip earnings, fuel or battery-charging costs, maintenance history, compliance document expiry dates, budgets, savings, goals, and remittances you make to family, and to generate simple financial summaries from information you enter.</p>
    <div class="legal-callout blue">
      <b>The App is not:</b> a ride-hailing or dispatch platform (we do not match you with passengers or set fares); a bank, deposit-taking institution, payment service provider, or e-money issuer; an insurance provider or broker; or a source of legal, tax, or financial advice. Nothing in the App constitutes a guarantee of income, loan eligibility, or regulatory compliance.
    </div>
    <p>Where the App references third-party services (e.g., M-Pesa, insurers, National Transport and Safety Authority (NTSA) processes), those services are provided independently by their respective providers, and your relationship with them is governed by their own terms.</p>
  `},
  { num:5, id:'tos-5', title:'Your Account & Security', html:`
    <p>You may hold one Rider account per mobile number. Access is protected by a 4-digit PIN that only you should know.</p>
    <ul>
      <li>You are responsible for keeping your PIN and device secure, and for all activity that occurs under your account, whether or not you authorised it, unless caused by our proven negligence.</li>
      <li>Notify us immediately at our customer care lines if you suspect unauthorised access, lose your phone, or change your SIM/number.</li>
      <li>After repeated incorrect PIN attempts, we will temporarily lock your account for your protection.</li>
      <li>Do not share your PIN or account credentials with anyone, including App staff — we will never ask you for your PIN.</li>
    </ul>
  `},
  { num:6, id:'tos-6', title:'Your Bike Profile', html:`
    <p>Each Rider account is associated with a single motorcycle that the Rider personally owns and operates. Bike Profile fields (such as plate number and fuel type) are entered and maintained solely by you and can be edited on your account at any time.</p>
    <p>Financial records you personally enter (earnings, expenses, savings, goals) remain private to your account unless you choose to share a generated statement.</p>
  `},
  { num:7, id:'tos-7', title:'Subscription Plans, Trials & Fees', html:`
    <p>Continued use of core App features requires an active Subscription. New riders typically receive a free trial period; after the trial ends, a paid Subscription is required to keep recording trips and accessing your dashboard.</p>
    <ul>
      <li>Subscription fees are billed at the daily rate shown in the App at the frequency you choose (daily, weekly, or monthly), or as a multi-day prepayment.</li>
      <li>We may change Subscription pricing from time to time. Where required by law or fairness, we will give you reasonable advance notice of price changes before they apply to your next billing cycle; continued use after a price change takes effect constitutes acceptance.</li>
      <li>Subscription fees are generally <b>non-refundable</b> once a billing period has begun, except where required by law or where we determine, at our discretion, that a refund is appropriate (e.g., a proven billing error on our part).</li>
    </ul>
  `},
  { num:8, id:'tos-8', title:'Making Payments', html:`
    <p>Payments are currently made manually: you send the displayed amount via M-Pesa "Send Money" to the Safaricom number shown in the App, then enter the M-Pesa confirmation code you receive so we can verify and activate your Subscription.</p>
    <ul>
      <li>You are responsible for entering the correct confirmation code and sending the correct amount; submitting false, altered, or another person's confirmation code is a serious breach of these Terms and may constitute fraud under Kenyan law.</li>
      <li>We do not process card or M-Pesa transactions directly and never ask for or store your M-Pesa PIN.</li>
      <li>Activation normally occurs promptly after verification but may be delayed where connectivity, the mobile network operator, or manual review causes a delay; we are not liable for delays caused by third-party payment or telecom systems.</li>
      <li>If you believe a payment was incorrectly applied or not credited, contact customer care with your M-Pesa confirmation code and transaction date so we can investigate.</li>
    </ul>
  `},
  { num:9, id:'tos-9', title:'Account Locking, Suspension & Reactivation', html:`
    <p>If your Subscription lapses, we may lock access to trip logging and other paid features until payment resumes. A locked account does not lose its stored history.</p>
    <div class="legal-callout green"><b>Your data is always yours:</b> even while an account is locked for non-payment, you may always request a full export of your data — this is never gated behind payment.</div>
    <p>We may also suspend or restrict an account where we reasonably suspect fraud, abuse, breach of these Terms, duplicate or fraudulent plate registration, or a legal or regulatory requirement to do so, with notice where practicable.</p>
  `},
  { num:10, id:'tos-10', title:'Your Data, Records & Self-Reported Information', html:`
    <p>Trip earnings, fuel and charging costs, maintenance entries, expenses, savings, goals, and remittance records are <b>self-reported by you</b>. We do not independently verify, audit, or guarantee the accuracy of this information.</p>
    <ul>
      <li>Financial summaries, statements, and "net profit" figures generated by the App are calculated only from what you have entered and may not reflect your complete financial picture.</li>
      <li>These records may be useful for your own budgeting and recordkeeping, but they are <b>not a substitute</b> for official tax records, receipts, or statutory bookkeeping required by the Kenya Revenue Authority or any other authority.</li>
      <li>You are solely responsible for the accuracy of the information you enter and for any decisions you make based on it.</li>
    </ul>
  `},
  { num:11, id:'tos-11', title:'Compliance Document Reminders', html:`
    <p>The App lets you record the expiry dates of documents such as your riding licence, insurance, and logbook, and sends best-effort reminders as these dates approach.</p>
    <p>These reminders are a convenience feature only. We do not verify document authenticity, do not guarantee reminders will be delivered (e.g., due to network issues or notification settings), and are not responsible for fines, penalties, impoundment, or other consequences of expired or non-compliant documents. Actual renewal remains your responsibility with the relevant authority or insurer.</p>
  `},
  { num:12, id:'tos-12', title:'Offline Mode, USSD & Data Sync', html:`
    <p>The App is designed to keep working when you have no data connection: entries you make offline are stored on your device and automatically synced to our servers once you reconnect. USSD Mode offers a reduced-feature parity path for feature phones or low-connectivity situations.</p>
    <p>Timestamps for offline entries are corrected to the best available time once synced. We are not liable for data loss caused by uninstalling the App, clearing device storage, or device loss before a sync completes — we recommend syncing regularly when you have signal.</p>
  `},
  { num:13, id:'tos-13', title:'Acceptable Use', html:`
    <p>You agree not to:</p>
    <ul>
      <li>Provide false information, including false payment confirmation codes, false plate numbers, or impersonating another rider;</li>
      <li>Create or attempt to create more than one account per person to evade Subscription fees, lockouts, or trial limits;</li>
      <li>Attempt to reverse-engineer, tamper with, probe, or disrupt the App, its USSD gateway, or its underlying systems;</li>
      <li>Use the App for any unlawful purpose, or in a way that infringes the rights of other riders or third parties; or</li>
      <li>Share your account credentials or allow another person to use your account to log trips or make payments.</li>
    </ul>
    <p>We may investigate suspected violations and take action including warning, suspension, or termination, and may report unlawful conduct to the relevant authorities.</p>
  `},
  { num:14, id:'tos-14', title:'Intellectual Property', html:`
    <p>The App, including its design, text, graphics, logos, and underlying software, is owned by or licensed to Smart Boda Digital and is protected by Kenyan and international intellectual property law. We grant you a limited, non-exclusive, non-transferable licence to use the App for its intended personal, business-management purpose. You retain ownership of the Content you enter, and grant us a licence to store, process, and display it back to you as necessary to provide the service.</p>
  `},
  { num:15, id:'tos-15', title:'Third-Party Services', html:`
    <p>The App references or interacts with third-party services such as Safaricom M-Pesa for payment confirmation and SMS/USSD delivery. We are not responsible for the availability, security, or performance of third-party networks or services, and your use of them is subject to their own terms and privacy notices.</p>
  `},
  { num:16, id:'tos-16', title:'Disclaimers of Warranties', html:`
    <p>The App is provided "as is" and "as available." To the maximum extent permitted by Kenyan law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, and uninterrupted or error-free operation. We do not warrant that reminders, notifications, or syncs will always be delivered on time or at all.</p>
  `},
  { num:17, id:'tos-17', title:'Limitation of Liability', html:`
    <p>To the maximum extent permitted by law, Smart Boda Digital shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of income, profits, data, or goodwill, arising from your use of or inability to use the App — including missed compliance reminders, payment verification delays caused by third parties, or inaccuracies in self-reported financial data.</p>
    <p>Where liability cannot be excluded by law, our total aggregate liability to you for any claim arising from these Terms shall not exceed the total Subscription fees you paid to us in the three (3) months preceding the event giving rise to the claim.</p>
  `},
  { num:18, id:'tos-18', title:'Indemnification', html:`
    <p>You agree to indemnify and hold Smart Boda Digital, its officers, employees, and agents harmless from any claims, damages, losses, or expenses (including reasonable legal fees) arising from your breach of these Terms, your misuse of the App, or your violation of any law or third-party right.</p>
  `},
  { num:19, id:'tos-19', title:'Suspension & Termination', html:`
    <p>You may stop using the App and request account closure at any time via customer care. We may suspend or terminate your access, with notice where reasonably practicable, if you materially breach these Terms, engage in fraud or abuse, or where required by law.</p>
    <p>On termination, your right to use the App ends immediately, but your right to request a data export survives termination for a reasonable period consistent with our data retention obligations described in our <span class="legal-crosslink" onclick="go('dataPrivacy')">Data Privacy Notice</span>.</p>
  `},
  { num:20, id:'tos-20', title:'Changes to These Terms', html:`
    <p>We may update these Terms from time to time to reflect changes to the App, our practices, or the law. Where changes are material, we will notify you in-app or by SMS before they take effect. Continued use of the App after the effective date of updated Terms constitutes your acceptance of them.</p>
  `},
  { num:21, id:'tos-21', title:'Governing Law & Dispute Resolution', html:`
    <p>These Terms are governed by the laws of the Republic of Kenya. Any dispute arising out of or relating to these Terms or the App shall first be addressed through good-faith negotiation via our customer care channels. If unresolved within thirty (30) days, either party may refer the dispute to mediation or arbitration under the Arbitration Act (Kenya), or to the competent courts of Kenya, at the option of the complaining party.</p>
  `},
  { num:22, id:'tos-22', title:'General Provisions', html:`
    <ul>
      <li><b>Severability:</b> if any provision of these Terms is found unenforceable, the remaining provisions continue in full force.</li>
      <li><b>No waiver:</b> our failure to enforce any right or provision is not a waiver of that right.</li>
      <li><b>Assignment:</b> you may not assign your account or rights under these Terms; we may assign our rights in connection with a merger, acquisition, or sale of assets, subject to applicable data protection safeguards.</li>
      <li><b>Entire agreement:</b> these Terms, together with our Data Privacy Notice, constitute the entire agreement between you and Smart Boda Digital regarding the App.</li>
    </ul>
  `},
  { num:23, id:'tos-23', title:'Contact Us', html:`
    <p>For questions about these Terms, reach our customer care team:</p>
    <p>📞 <b>+254 757 334481</b> &nbsp;·&nbsp; 📞 <b>+254 101 605262</b> (call or WhatsApp)<br>
    ✉️ <b>legal@smartbodadigital.co.ke</b><br>
    📍 Smart Boda Digital Limited, Nairobi, Kenya [registered office address — insert]</p>
  `},
];
