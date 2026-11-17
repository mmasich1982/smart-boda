// rider-app/src/navigation/BusinessNavigator.js
// SMART BIZNA navigator: every Smart Bizna screen. Each screen is wrapped by a GUARD so that an Owner-only, Purchases or Expenses screen can never be
// opened by tile, link or a saved route without permission: the person is sent back to Home (rules in utils/userTypeRouting.js; the server also
// answers 403). The guard reads the saved profile, so it also works offline and closes a screen when a permission is switched off at the next sync.
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useBusinessProfile, useBusinessSession } from '../hooks/useBusiness';
import { guardBusinessRoute } from '../utils/userTypeRouting';

import BusinessHomeScreen from '../screens/business/BusinessHomeScreen';
import NewSaleScreen from '../screens/business/NewSaleScreen';
import RecordHistoryScreen from '../screens/business/RecordHistoryScreen';
import { LipaLaterCustomersScreen, RecordLipaPaymentScreen, LipaLaterAgeingScreen } from '../screens/business/LipaLaterScreens';
import { BusinessPurchasesScreen, BusinessExpensesScreen, RecordPurchaseScreen, RecordExpenseScreen } from '../screens/business/PurchaseExpenseScreens';
import { SupplierLipaDetailsScreen, SupplierLipaReportScreen, RecordSupplierPaymentScreen, SupplierLipaAgeingScreen } from '../screens/business/SupplierLipaScreens';
import { CorrectRecordScreen, VoidRecordScreen } from '../screens/business/CorrectVoidScreens';
import { DailyTradeSummaryScreen, BusinessFinancialPerformanceScreen, BusinessFinancialHistoryScreen, BusinessTransactionsScreen } from '../screens/business/OwnerReportsScreens';
import { StatementSetupScreen, StatementPreviewScreen, StatementListScreen } from '../screens/business/StatementScreens';
import { BusinessSwitcherScreen, AllBusinessesScreen } from '../screens/business/BusinessSwitcherScreens';
import chamaScreens from './chamaScreens';      // SMART CABZ: group screens for a business user who is in a group

const Stack = createNativeStackNavigator();

function guarded(Component, routeName) {
  function Guarded(props) {
    const { profile, loaded } = useBusinessProfile();
    const target = loaded ? guardBusinessRoute(routeName, profile) : routeName;
    const denied = loaded && target !== routeName;
    useEffect(() => { if (denied) props.navigation.navigate(target); }, [denied, target]);   // eslint-disable-line
    if (!loaded || denied) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
    return <Component {...props} />;
  }
  Guarded.displayName = `Guarded(${routeName})`;
  return Guarded;
}

// name -> component. Names are the ones used in utils/userTypeRouting.js (OWNER_ROUTES / PURCHASE_ROUTES / EXPENSE_ROUTES).
export const BUSINESS_ROUTES = {
  BusinessHome: BusinessHomeScreen, NewSale: NewSaleScreen, SalesHistory: RecordHistoryScreen,
  LipaLaterCustomers: LipaLaterCustomersScreen, RecordLipaPayment: RecordLipaPaymentScreen, LipaLaterAgeing: LipaLaterAgeingScreen,
  BusinessPurchases: BusinessPurchasesScreen, RecordPurchase: RecordPurchaseScreen, PurchaseHistory: RecordHistoryScreen,
  SupplierLipaDetails: SupplierLipaDetailsScreen, SupplierLipaReport: SupplierLipaReportScreen, RecordSupplierPayment: RecordSupplierPaymentScreen, SupplierLipaAgeing: SupplierLipaAgeingScreen,
  BusinessExpenses: BusinessExpensesScreen, RecordExpense: RecordExpenseScreen, ExpenseHistory: RecordHistoryScreen,
  CorrectRecord: CorrectRecordScreen, VoidRecord: VoidRecordScreen,
  DailyTradeSummary: DailyTradeSummaryScreen, BusinessFinancialPerformance: BusinessFinancialPerformanceScreen, BusinessFinancialHistory: BusinessFinancialHistoryScreen,
  BusinessTransactions: BusinessTransactionsScreen,
  StatementSetup: StatementSetupScreen, StatementPreview: StatementPreviewScreen, StatementList: StatementListScreen,
  BusinessSwitcher: BusinessSwitcherScreen, AllBusinesses: AllBusinessesScreen,          // MULTIPLE BUSINESSES (Owner only, guarded)
};

// built once (a new component type on every render would remount the screens)
const GUARDED = Object.fromEntries(Object.entries(BUSINESS_ROUTES).map(([name, Component]) => [name, guarded(Component, name)]));

export default function BusinessNavigator() {
  // MULTIPLE BUSINESSES + DATA ISOLATION: the whole navigator is rebuilt whenever the open business changes, so no screen, list, search box or total
  // from one business can still be on screen (or loading into it) after a switch. The key changes on every switch, even back to the same business.
  const session = useBusinessSession();
  return (
    <Stack.Navigator key={`${session.id || 'none'}:${session.epoch}`} initialRouteName="BusinessHome" screenOptions={{ headerShown: false, animation: 'fade' }}>
      {Object.keys(BUSINESS_ROUTES).map((name) => <Stack.Screen key={name} name={name} component={GUARDED[name]} />)}
      {chamaScreens(Stack)}
    </Stack.Navigator>
  );
}
