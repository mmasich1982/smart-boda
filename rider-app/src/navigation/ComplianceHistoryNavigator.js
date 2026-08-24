// rider-app/src/navigation/ComplianceHistoryNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ComplianceDashboardScreen from '../screens/complianceHistory/ComplianceDashboardScreen';
import AddDocumentScreen from '../screens/complianceHistory/AddDocumentScreen';
import RenewDocumentScreen from '../screens/complianceHistory/RenewDocumentScreen';
import FinancialHistoryScreen from '../screens/complianceHistory/FinancialHistoryScreen';
import TransactionListScreen from '../screens/complianceHistory/TransactionListScreen';
import GenerateStatementScreen from '../screens/complianceHistory/GenerateStatementScreen';
import StatementPreviewScreen from '../screens/complianceHistory/StatementPreviewScreen';
import StatementHistoryScreen from '../screens/complianceHistory/StatementHistoryScreen';
import DataExportRequestScreen from '../screens/complianceHistory/DataExportRequestScreen';

const Stack = createNativeStackNavigator();

export default function ComplianceHistoryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ComplianceDashboard" component={ComplianceDashboardScreen} />
      <Stack.Screen name="AddDocument" component={AddDocumentScreen} />
      <Stack.Screen name="RenewDocument" component={RenewDocumentScreen} />
      <Stack.Screen name="FinancialHistory" component={FinancialHistoryScreen} />
      <Stack.Screen name="TransactionList" component={TransactionListScreen} />
      <Stack.Screen name="GenerateStatement" component={GenerateStatementScreen} />
      <Stack.Screen name="StatementPreview" component={StatementPreviewScreen} />
      <Stack.Screen name="StatementHistory" component={StatementHistoryScreen} />
      <Stack.Screen name="DataExportRequest" component={DataExportRequestScreen} />
    </Stack.Navigator>
  );
}
