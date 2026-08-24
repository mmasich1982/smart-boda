// rider-app/src/screens/legal/DataPrivacyScreen.js
import React from 'react';
import LegalDocumentScreen from './LegalDocumentScreen';
import { PRIVACY_SECTIONS } from '../../constants/dataPrivacyContent';

// Content lives in constants/dataPrivacyContent.js (see above) as an 18-section array — same
// structure and wording as cleaned.html's PRIVACY_SECTIONS constant.
export default function DataPrivacyScreen({ navigation }) {
  return (
    <LegalDocumentScreen
      navigation={navigation}
      icon="🔒"
      title="Data Privacy Notice"
      subtitle="How we collect, use, and protect your information — in plain language."
      sections={PRIVACY_SECTIONS}
      otherDocLabel="Terms of Service"
      otherDocRoute="TermsOfService"
    />
  );
}
