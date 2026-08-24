// rider-app/src/navigation/FinancialPerformanceNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import NetProfitDashboardScreen from '../screens/financialPerformance/NetProfitDashboardScreen';
import AddOtherExpenseScreen from '../screens/financialPerformance/AddOtherExpenseScreen';
import RevenueTargetsScreen from '../screens/financialPerformance/RevenueTargetsScreen';
import SetTargetScreen from '../screens/financialPerformance/SetTargetScreen';
import SavingsHubScreen from '../screens/financialPerformance/SavingsHubScreen';
import SavingsAccountScreen from '../screens/financialPerformance/SavingsAccountScreen';
import SavingsReportScreen from '../screens/financialPerformance/SavingsReportScreen';
import { MyGoalsScreen, NewGoalScreen, GoalSummaryScreen } from '../screens/financialPerformance/GoalsScreen';
import SendMoneyHomeScreen from '../screens/financialPerformance/SendMoneyHomeScreen';
import SendMoneyHistoryScreen from '../screens/financialPerformance/SendMoneyHistoryScreen';

const Stack = createNativeStackNavigator();

export default function FinancialPerformanceNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NetProfitDashboard" component={NetProfitDashboardScreen} />
      <Stack.Screen name="AddOtherExpense" component={AddOtherExpenseScreen} />
      <Stack.Screen name="RevenueTargets" component={RevenueTargetsScreen} />
      <Stack.Screen name="SetTarget" component={SetTargetScreen} />
      <Stack.Screen name="SavingsHub" component={SavingsHubScreen} />
      <Stack.Screen name="SavingsAccount" component={SavingsAccountScreen} />  // same screen for both type: 'sacco' and type: 'chama'
      <Stack.Screen name="SavingsReport" component={SavingsReportScreen} />
      <Stack.Screen name="MyGoals" component={MyGoalsScreen} />
      <Stack.Screen name="NewGoal" component={NewGoalScreen} />
      <Stack.Screen name="GoalSummary" component={GoalSummaryScreen} />
      <Stack.Screen name="SendMoneyHome" component={SendMoneyHomeScreen} />
      <Stack.Screen name="SendMoneyHistory" component={SendMoneyHistoryScreen} />
    </Stack.Navigator>
  );
}
