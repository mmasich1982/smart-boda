// rider-app/src/constants/legal.js
// Shared version/effective-date constants for both legal documents, plus the "which Terms
// version did this rider consent to" marker written to /onboarding/profile-confirm (see
// ProfileConfirmationScreen.js above). Bump both CURRENT_*_VERSION constants — and update
// LEGAL_EFFECTIVE_DATE — whenever termsOfServiceContent.js or dataPrivacyContent.js copy changes,
// so historical consent records stay meaningful even after the wording is updated.

export const LEGAL_DOC_VERSION = '1.0';
export const LEGAL_EFFECTIVE_DATE = 'July 14, 2026';

// Recorded against the rider's account at consent time (SB-03-B) so we always know exactly
// which wording a given rider agreed to, even if the documents are revised later.
export const CURRENT_TERMS_VERSION = LEGAL_DOC_VERSION;
export const CURRENT_PRIVACY_VERSION = LEGAL_DOC_VERSION;

// Support contacts shown in the footer of both legal document screens.
export const LEGAL_SUPPORT_PHONES = ['+254 757 334481', '+254 101 605262'];
export const LEGAL_SUPPORT_EMAIL_TERMS = 'legal@smartbodadigital.co.ke';
export const LEGAL_SUPPORT_EMAIL_PRIVACY = 'privacy@smartbodadigital.co.ke';
export const ODPC_URL = 'www.odpc.go.ke'; // Office of the Data Protection Commissioner, Kenya
