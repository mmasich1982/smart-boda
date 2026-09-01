// rider-app/src/navigation/MainNavigator.js
// ✅ UPDATED: Added Lipa Later screen stack
// MAIN NAVIGATOR - Smart Boda MVP1
// 
// Manages all post-onboarding screens organized by Home Screen tiles/sections.
// The Home Screen displays 21 tiles/sections in a specific order with conditional rendering
// based on subscription status. This navigator handles navigation to detail screens for each tile.
//
// Home Screen Structure (as per requirements):
// 1. Hero Fare Card (top)
// 2. Subscription Banner (1-2 days free)
// 3. Yesterday's Total Trade Summary
// 4. Subscription Renewal Banner
// 5-21. Feature Tiles (Fuel, Service, Financial, Revenue Targets, License, Savings, Lipa Later, etc.)
//
// ✅ UPDATED: 
// - Added Lipa Later screen imports
// - Registered all Lipa Later screens in navigator
// - Lipa Later navigation routes properly integrated

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// ============================================================================
// HOME SCREEN & HERO SECTION
// ============================================================================
import HomeScreen from '../screens/HomeScreen';

// ============================================================================
// TILE 1: FUEL / CHARGE BATTERY
// ============================================================================
import FuelHubScreen from '../screens/energyHub/FuelHubScreen';
import FuelEntryScreen from '../screens/energyHub/FuelEntryScreen';
import BatteryEntryScreen from '../screens/energyHub/BatteryEntryScreen';
import FuelHistoryScreen from '../screens/energyHub/FuelHistoryScreen';
import BatteryHistoryScreen from '../screens/energyHub/BatteryHistoryScreen';
import ChargeBatteryHubScreen from '../screens/energyHub/ChargeBatteryHubScreen';

// ============================================================================
// TILE 2: SERVICE CABZ
// ============================================================================
import MaintenanceHubScreen from '../screens/serviceHub/MaintenanceHubScreen';
import MaintenanceEntryScreen from '../screens/serviceHub/MaintenanceEntryScreen';
import MaintenanceHistoryScreen from '../screens/serviceHub/MaintenanceHistoryScreen';

// ============================================================================
// TILE 3: MY FINANCIAL PERFORMANCE
// ============================================================================
import MoneyMasteryScreen from '../screens/financialPerformance/MoneyMasteryScreen';
import NetProfitDashboardScreen from '../screens/financialPerformance/NetProfitDashboardScreen';
import AddOtherExpenseScreen from '../screens/financialPerformance/AddOtherExpenseScreen';
import YesterdayNetProfitScreen from '../screens/financialPerformance/YesterdayNetProfitScreen';

// ============================================================================
// TILE 4: MY SUBSCRIPTION
// ============================================================================
import SubscriptionScreen from '../screens/subscription/SubscriptionScreen';
import FrequencySelectScreen from '../screens/subscription/FrequencySelectScreen';
import PrepayScreen from '../screens/subscription/PrepayScreen';
import PaymentHistoryScreen from '../screens/subscription/PaymentHistoryScreen';
import SubscriptionBanners from '../screens/subscription/SubscriptionBanners';
import ConfirmSubscriptionScreen from '../screens/subscription/ConfirmSubscriptionScreen';

// ============================================================================
// TILE 5: MY DAILY TRADE SUMMARY
// ============================================================================
import DailyTradeSummaryScreen from '../screens/trips/DailyTradeSummaryScreen';
import NewTripScreen from '../screens/trips/NewTripScreen';
import TripDetailScreen from '../screens/trips/TripDetailScreen';

// ============================================================================
// ✅ TILE 11: LIPA LATER CUSTOMER REPORT
// ============================================================================
import LipaLaterCustomersScreen from '../screens/lipaLater/LipaLaterCustomersScreen';
import LipaLaterAgeingScreen from '../screens/lipaLater/LipaLaterAgeingScreen';
import LipaLaterDetailsScreen from '../screens/lipaLater/LipaLaterDetailsScreen';
import RecordPaymentScreen from '../screens/lipaLater/RecordPaymentScreen';
import PaymentSummaryScreen from '../screens/lipaLater/PaymentSummaryScreen';

// ============================================================================
// TILE 15: MY FINANCIAL HISTORY AND STATEMENTS
// ============================================================================
import ConfirmPinDetailedStatementScreen from '../screens/financialHistory/ConfirmPinDetailedStatementScreen';
import DetailedStatementConfirmationScreen from '../screens/financialHistory/DetailedStatementConfirmationScreen';
import DetailedStatementEmailScreen from '../screens/financialHistory/DetailedStatementEmailScreen';
import FinancialHistoryScreen from '../screens/financialHistory/FinancialHistoryScreen';
import GenerateStatementScreen from '../screens/financialHistory/GenerateStatementScreen';
import StatementPreviewScreen from '../screens/financialHistory/StatementPreviewScreen';
import TransactionListScreen from '../screens/financialHistory/TransactionListScreen';
import StatementHistoryScreen from '../screens/financialHistory/StatementHistoryScreen';

// ============================================================================
// AUTHENTICATION SCREENS
// ============================================================================
import PinLoginScreen from '../screens/auth/PinLoginScreen';
import ChangePinVerifyScreen from '../screens/auth/ChangePinVerifyScreen';


const Stack = createNativeStackNavigator();

const screenOptions = {
  headerShown: false,
  cardStyle: { backgroundColor: '#f6f4ef' },
  animationEnabled: true,
  gestureEnabled: true,
};

/**
 * MAIN NAVIGATOR
 * 
 * Manages all post-onboarding screens organized by Home Screen tiles.
 * 
 * Home Screen Structure (21 Tiles):
 * ┌─ BANNERS & CARDS ──────────────────────────┐
 * │ 1. Hero Fare Card (Top)                    │
 * │ 2. Subscription Banner (1-2 days free)     │
 * │ 3. Yesterday's Total Trade Summary         │
 * │ 4. Subscription Renewal Banner             │
 * └────────────────────────────────────────────┘
 * ┌─ FEATURE TILES (2-Column Grid) ────────────┐
 * │ 5. Fuel / Charge Battery                   │
 * │ 6. Service Cabz                            │
 * │ 7. My Financial Performance                │
 * │ 8. My Revenue Targets                      │
 * │ 9. My License and Insurance                │
 * │10. My Savings                              │
 * │11. Lipa Later Customer Report ✅ UPDATED   │
 * │12. Send Money Home                         │
 * │13. My Goals                                │
 * │14. My Subscription                         │
 * │15. Suggestions and Feedback                │
 * │16. Sync Status                             │
 * │17. Account                                 │
 * │18. My Daily Trade Summary                  │
 * │19. My Financial History & Statements       │
 * │20. My Settings & Cabz Profile              │
 * │21. Logout                                  │
 * └────────────────────────────────────────────┘
 */
export const MainNavigator = () => {
  return (
    <Stack.Navigator screenOptions={screenOptions} initialRouteName="Dashboard">
      {/* ===== HOME SCREEN (Entry Point) - RENAMED to Dashboard to avoid circular routing ===== */}
      {/* FIXED: Was "Home" but MainNavigator itself is the "Home" screen in OnboardingNavigator */}
      {/* This prevents: OnboardingNavigator.Home -> MainNavigator -> MainNavigator.Home circular reference */}
      <Stack.Screen
        name="Dashboard"
        component={HomeScreen}
        options={{
          headerShown: false,
          animationEnabled: false,
        }}
      />

      {/* ===== TILE 1: FUEL / CHARGE BATTERY (FuelHub entry point) ===== */}
      <Stack.Screen
        name="FuelHub"
        component={FuelHubScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />
      <Stack.Screen
        name="ChargeBatteryHub"
        component={ChargeBatteryHubScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="FuelEntry"
        component={FuelEntryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="BatteryEntry"
        component={BatteryEntryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="FuelHistory"
        component={FuelHistoryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="BatteryHistory"
        component={BatteryHistoryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 2: SERVICE CABZ ===== */}
      <Stack.Screen
        name="MaintenanceHub"
        component={MaintenanceHubScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="MaintenanceEntry"
        component={MaintenanceEntryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="MaintenanceHistory"
        component={MaintenanceHistoryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 3: MY FINANCIAL PERFORMANCE ===== */}
      <Stack.Screen
        name="MoneyMastery"
        component={MoneyMasteryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="NetProfitDashboard"
        component={NetProfitDashboardScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="AddOtherExpense"
        component={AddOtherExpenseScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />
	  
	  <Stack.Screen
        name="YesterdayNetProfit"
        component={YesterdayNetProfitScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 4: MY SUBSCRIPTION ===== */}
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />
	  
      <Stack.Screen
        name="SelectFrequency"
        component={FrequencySelectScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="Prepay"
        component={PrepayScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="PaymentHistory"
        component={PaymentHistoryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />
	  
	  <Stack.Screen
        name="SubscriptionBanners"
        component={SubscriptionBanners}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />
	  
	  <Stack.Screen
        name="ConfirmSubscriptionScreen"
        component={ConfirmSubscriptionScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 5: MY DAILY TRADE SUMMARY ===== */}
      <Stack.Screen
        name="DailyTradeSummary"
        component={DailyTradeSummaryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="NewTrip"
        component={NewTripScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ✅ ===== TILE 11: LIPA LATER CUSTOMER REPORT (UPDATED) ===== */}
      <Stack.Screen
        name="LipaLaterCustomersScreen"
        component={LipaLaterCustomersScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="LipaLaterAgeingScreen"
        component={LipaLaterAgeingScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="LipaLaterDetailsScreen"
        component={LipaLaterDetailsScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="RecordPaymentScreen"
        component={RecordPaymentScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="aymentSummaryScreen"
        component={PaymentSummaryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 15: MY FINANCIAL HISTORY & STATEMENTS ===== */}
      <Stack.Screen
        name="FinancialHistory"
        component={FinancialHistoryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="GenerateStatement"
        component={GenerateStatementScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="StatementHistory"
        component={StatementHistoryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="StatementPreview"
        component={StatementPreviewScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="TransactionList"
        component={TransactionListScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== SUPPORTING SCREENS ===== */}
    </Stack.Navigator>
  );
};

export default MainNavigator;