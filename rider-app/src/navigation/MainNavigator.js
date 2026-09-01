// rider-app/src/navigation/MainNavigator.js
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
// 5-21. Feature Tiles (Fuel, Service, Financial, Revenue Targets, License, Savings, etc.)
//
// ✓ FIXED: 
// - Updated Goals import: GoalSummaryScreen → GoalDetailScreen
// - Updated Goals screen names to match new implementation
// - All missing component imports added

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// ============================================================================
// HOME SCREEN & HERO SECTION
// ============================================================================
import HomeScreen from '../screens/HomeScreen';

// ============================================================================
// TILE 1: FUEL MOTORCYCLE / CHARGE BATTERY
// ============================================================================
import FuelHubScreen from '../screens/energyHub/FuelHubScreen';
import FuelEntryScreen from '../screens/energyHub/FuelEntryScreen';
import BatteryEntryScreen from '../screens/energyHub/BatteryEntryScreen';
import FuelHistoryScreen from '../screens/energyHub/FuelHistoryScreen';
import BatteryHistoryScreen from '../screens/energyHub/BatteryHistoryScreen';
import ChargeBatteryHubScreen from '../screens/energyHub/ChargeBatteryHubScreen';

// ============================================================================
// TILE 2: SERVICE MOTORCYCLE
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
// TILE 10: MY SUBSCRIPTION
// ============================================================================
import SubscriptionScreen from '../screens/subscription/SubscriptionScreen';
import FrequencySelectScreen from '../screens/subscription/FrequencySelectScreen';
import PrepayScreen from '../screens/subscription/PrepayScreen';
import PaymentHistoryScreen from '../screens/subscription/PaymentHistoryScreen';
import SubscriptionBanners from '../screens/subscription/SubscriptionBanners';
import ConfirmSubscriptionScreen from '../screens/subscription/ConfirmSubscriptionScreen';



// ============================================================================
// TILE 14: MY DAILY TRADE SUMMARY
// ============================================================================
import DailyTradeSummaryScreen from '../screens/trips/DailyTradeSummaryScreen';
import NewTripScreen from '../screens/trips/NewTripScreen';
import TripDetailScreen from '../screens/trips/TripDetailScreen';

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
import DataExportRequestScreen from '../screens/financialHistory/DataExportRequestScreen';

// ============================================================================
// AUTHENTICATIIN SCREENS
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
 * │ 5. Fuel Motorcycle / Charge Battery        │
 * │ 6. Service Motorcycle                      │
 * │ 7. My Financial Performance                │
 * │ 8. My Revenue Targets                      │
 * │ 9. My License and Insurance                │
 * │10. My Savings                              │
 * │11. Lipa Later Customer Report              │
 * │12. Send Money Home                         │
 * │13. My Goals                                │
 * │14. My Subscription                         │
 * │15. Suggestions and Feedback                │
 * │16. Sync Status                             │
 * │17. Account                                 │
 * │18. My Daily Trade Summary                  │
 * │19. My Financial History & Statements       │
 * │20. My Settings & Bike Profile              │
 * │21. Logout                                  │
 * └────────────────────────────────────────────┘
 */
export const MainNavigator = () => {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {/* ===== HOME SCREEN (Entry Point) ===== */}
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          animationEnabled: false,
        }}
      />

      {/* ===== TILE 1: FUEL MOTORCYCLE / CHARGE BATTERY (FuelHub entry point) ===== */}
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

      {/* ===== TILE 2: SERVICE MOTORCYCLE ===== */}
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

      {/* ===== TILE 4: MY REVENUE TARGETS ===== */}
      <Stack.Screen
        name="RevenueTargets"
        component={RevenueTargetsScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="SetTarget"
        component={SetTargetScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 5: MY LICENSE AND INSURANCE ===== */}
      <Stack.Screen
        name="ComplianceDashboard"
        component={ComplianceDashboardScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="AddDocument"
        component={AddDocumentScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="RenewDocument"
        component={RenewDocumentScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 6: MY SAVINGS ===== */}
      <Stack.Screen
        name="SavingsHub"
        component={SavingsHubScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="SavingsEntry"
        component={SavingsEntryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="SavingsTypeList"
        component={SavingsTypeListScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="AddSavingsContribution"
        component={AddSavingsContributionScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="SavingsReport"
        component={SavingsReportScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="SavingsAccount"
        component={SavingsAccountScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 7: LIPA LATER CUSTOMER REPORT ===== */}
      <Stack.Screen
        name="LipaLaterEntry"
        component={LipaLaterDetailsScreen}
        options={{ 
          headerShown: false,
          animationEnabled: true, 
        }}
      />

      <Stack.Screen
        name="PaymentSummary"
        component={PaymentSummaryScreen}
        options={{ 
          headerShown: false,
          animationEnabled: true, 
        }}
      />

      <Stack.Screen
        name="RecordPayment"
        component={RecordPaymentScreen}
        options={{ 
          headerShown: false,
          animationEnabled: true, 
        }}
      />

      <Stack.Screen
        name="LipaLaterCustomers"
        component={LipaLaterCustomersScreen}
        options={{ 
          headerShown: false,
          animationEnabled: true, 
        }}
      />

      <Stack.Screen
        name="LipaLaterAgeing"
        component={LipaLaterAgeingScreen}
        options={{ 
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 8: SEND MONEY HOME ===== */}
      <Stack.Screen
        name="SendMoneyHome"
        component={SendMoneyHomeScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="SendMoneyHistory"
        component={SendMoneyHistoryScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 9: MY GOALS ===== */}
      <Stack.Screen
        name="MyGoals"
        component={MyGoalsScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="NewGoal"
        component={NewGoalScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ✓ FIXED: Changed from GoalSummary to GoalDetail to match new implementation */}
      <Stack.Screen
        name="GoalDetail"
        component={GoalDetailScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="LogContribution"
        component={LogContributionScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="GoalAchieved"
        component={GoalAchievedScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 10: MY SUBSCRIPTION ===== */}

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
		  name="PrepayScreen"
		  component={PrepayScreen}
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
	  

      {/* ===== TILE 11: SUGGESTIONS AND FEEDBACK ===== */}
      <Stack.Screen
        name="SuggestionsFeedback"
        component={SuggestionsFeedbackScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 12: SYNC STATUS ===== */}
      <Stack.Screen
        name="SyncStatus"
        component={SyncQueueScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 14: MY DAILY TRADE SUMMARY ===== */}
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

      <Stack.Screen
        name="DataExportRequest"
        component={DataExportRequestScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== TILE 16: MY SETTINGS & BIKE PROFILE ===== */}
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      {/* ===== SUPPORTING SCREENS ===== */}
      <Stack.Screen
        name="ProfileConfirmation"
        component={ProfileConfirmationScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="TermsOfService"
        component={TermsOfServiceScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="DataPrivacy"
        component={DataPrivacyScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />

      <Stack.Screen
        name="LegalDocument"
        component={LegalDocumentScreen}
        options={{
          headerShown: false,
          animationEnabled: true,
        }}
      />
    </Stack.Navigator>
  );
};

export default MainNavigator;