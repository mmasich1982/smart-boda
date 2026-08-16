// rider-app/src/screens/legal/TermsOfServiceScreen.js
import React from 'react';
import LegalDocumentScreen from './LegalDocumentScreen';
import { TERMS_SECTIONS } from '../../constants/termsOfServiceContent';

// Content lives in constants/termsOfServiceContent.js (see above) as a 23-section array — same
// structure and wording as cleaned.html's TERMS_SECTIONS constant.
export default function TermsOfServiceScreen({ navigation }) {
  return (
    <LegalDocumentScreen
      navigation={navigation}
      icon="📄"
      title="Terms of Service"
      subtitle="The rules for using the Smart Boda Digital app, in plain language where we can manage it."
      sections={TERMS_SECTIONS}
      otherDocLabel="Data Privacy Notice"
      otherDocRoute="DataPrivacy"
    />
  );
}
