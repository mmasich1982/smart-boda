// rider-app/src/navigation/SettingsNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ChangePinVerifyScreen from '../screens/settings/ChangePinVerifyScreen';
import TermsOfServiceScreen from '../screens/settings/TermsOfServiceScreen';
import DataPrivacyScreen from '../screens/settings/DataPrivacyScreen';
import SuggestionsFeedbackScreen from '../screens/settings/SuggestionsFeedbackScreen';
import SubscriptionScreen from '../screens/settings/SubscriptionScreen';
import ChooseFrequencyScreen from '../screens/settings/ChooseFrequencyScreen';
import ConfirmSubscriptionScreen from '../screens/settings/ConfirmSubscriptionScreen';
import PrepayScreen from '../screens/settings/PrepayScreen';
import ConfirmPrepayScreen from '../screens/settings/ConfirmPrepayScreen';
import PaymentHistoryScreen from '../screens/settings/PaymentHistoryScreen';
import AccountLockedScreen from '../screens/settings/AccountLockedScreen';
import NumberEntryScreen from '../screens/onboarding/NumberEntryScreen';  // reused from Module A, editMode prop
import CreatePinScreen from '../screens/onboarding/CreatePinScreen';      // reused from Module A, changeMode prop

const Stack = createNativeStackNavigator();

// BR-SB24-011: AccountLocked has no header/back — it's reached by replace(), never push(), so there's nothing to pop to.
export default function SettingsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ChangePinVerify" component={ChangePinVerifyScreen} />
      <Stack.Screen name="NumberEntry" component={NumberEntryScreen} />
      <Stack.Screen name="CreatePin" component={CreatePinScreen} />
      <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
      <Stack.Screen name="DataPrivacy" component={DataPrivacyScreen} />
      <Stack.Screen name="SuggestionsFeedback" component={SuggestionsFeedbackScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="ChooseFrequency" component={ChooseFrequencyScreen} />
      <Stack.Screen name="ConfirmSubscription" component={ConfirmSubscriptionScreen} />
      <Stack.Screen name="Prepay" component={PrepayScreen} />
      <Stack.Screen name="ConfirmPrepay" component={ConfirmPrepayScreen} />
      <Stack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
      <Stack.Screen name="AccountLocked" component={AccountLockedScreen} />
    </Stack.Navigator>
  );
}
