// rider-app/src/navigation/chamaScreens.js
// SMART CABZ: the group (Chama) screens, as a list a navigator can include. A business user who belongs to a group (or is a group's Treasurer) opens
// the same screens a rider does, from the Smart Bizna Home. The rider navigator is untouched (it keeps its own copy of this list).
// Usage inside a navigator:   {chamaScreens(Stack)}
import React from 'react';
import ManageChamaScreen from '../screens/chama/ManageChamaScreen';
import AddChamaMemberScreen from '../screens/chama/AddChamaMemberScreen';
import RequestChamaSlotsScreen from '../screens/chama/RequestChamaSlotsScreen';
import ManageChamaHubScreen from '../screens/chama/ManageChamaHubScreen';
import ChamaLoansScreen from '../screens/chama/ChamaLoansScreen';
import ChamaQueueScreen from '../screens/chama/ChamaQueueScreen';
import MySavingsScreen from '../screens/chama/MySavingsScreen';
import MyLoansScreen from '../screens/chama/MyLoansScreen';
import LoanApplyScreen from '../screens/chama/LoanApplyScreen';
import ChamaPayScreen from '../screens/chama/ChamaPayScreen';
import GroupFinanceHistoryScreen from '../screens/chama/GroupFinanceHistoryScreen';
import MgrCircleScreen from '../screens/chama/MgrCircleScreen';
import MgrActivityScreen from '../screens/chama/MgrActivityScreen';
import GuaranteeRequestsScreen from '../screens/chama/GuaranteeRequestsScreen';
import GroupLoansScreen from '../screens/chama/GroupLoansScreen';
import TbSecurityRulesScreen from '../screens/chama/TbSecurityRulesScreen';
import SecurityHeldScreen from '../screens/chama/SecurityHeldScreen';
import SwapRequestScreen from '../screens/chama/SwapRequestScreen';
import MgrSwapsScreen from '../screens/chama/MgrSwapsScreen';
import MgrRulesScreen from '../screens/chama/MgrRulesScreen';
import MgrHistoryScreen from '../screens/chama/MgrHistoryScreen';
import TbHistoryScreen from '../screens/chama/TbHistoryScreen';
import MgrPaySubmittedScreen from '../screens/chama/MgrPaySubmittedScreen';
import MgrContributionsScreen from '../screens/chama/MgrContributionsScreen';
import MgrContributionDetailScreen from '../screens/chama/MgrContributionDetailScreen';
import MgrPayoutScreen from '../screens/chama/MgrPayoutScreen';
import MgrRosterScreen from '../screens/chama/MgrRosterScreen';
import MgrExceptionScreen from '../screens/chama/MgrExceptionScreen';
import MgrConfirmPayoutScreen from '../screens/chama/MgrConfirmPayoutScreen';
import MgrSetupScreen from '../screens/chama/MgrSetupScreen';
import MgrScheduleScreen from '../screens/chama/MgrScheduleScreen';

export default function chamaScreens(Stack) {
  return (
    <>
  <Stack.Screen name="ManageChama" component={ManageChamaHubScreen} />
  <Stack.Screen name="ChamaSetup" component={ManageChamaScreen} />
  <Stack.Screen name="AddChamaMember" component={AddChamaMemberScreen} />
  <Stack.Screen name="RequestChamaSlots" component={RequestChamaSlotsScreen} />
  <Stack.Screen name="ChamaLoans" component={ChamaLoansScreen} />
  <Stack.Screen name="ChamaQueue" component={ChamaQueueScreen} />
  <Stack.Screen name="MySavings" component={MySavingsScreen} />
  <Stack.Screen name="MyLoans" component={MyLoansScreen} />
  <Stack.Screen name="LoanApply" component={LoanApplyScreen} />
  <Stack.Screen name="ChamaPay" component={ChamaPayScreen} />
  <Stack.Screen name="GroupFinanceHistory" component={GroupFinanceHistoryScreen} />
  <Stack.Screen name="MgrHub" component={MgrCircleScreen} />
  <Stack.Screen name="MgrActivity" component={MgrActivityScreen} />
  <Stack.Screen name="GuaranteeRequests" component={GuaranteeRequestsScreen} />
  <Stack.Screen name="GroupLoans" component={GroupLoansScreen} />
  <Stack.Screen name="TbSecurityRules" component={TbSecurityRulesScreen} />
  <Stack.Screen name="SecurityHeld" component={SecurityHeldScreen} />
  <Stack.Screen name="SwapRequest" component={SwapRequestScreen} />
  <Stack.Screen name="MgrSwaps" component={MgrSwapsScreen} />
  <Stack.Screen name="MgrRules" component={MgrRulesScreen} />
  <Stack.Screen name="MgrHistory" component={MgrHistoryScreen} />
  <Stack.Screen name="TbHistory" component={TbHistoryScreen} />
  <Stack.Screen name="MgrPaySubmitted" component={MgrPaySubmittedScreen} />
  <Stack.Screen name="MgrContributions" component={MgrContributionsScreen} />
  <Stack.Screen name="MgrContributionDetail" component={MgrContributionDetailScreen} />
  <Stack.Screen name="MgrPayout" component={MgrPayoutScreen} />
  <Stack.Screen name="MgrRoster" component={MgrRosterScreen} />
  <Stack.Screen name="MgrException" component={MgrExceptionScreen} />
  <Stack.Screen name="MgrConfirmPayout" component={MgrConfirmPayoutScreen} />
  <Stack.Screen name="MgrSetup" component={MgrSetupScreen} />
  <Stack.Screen name="MgrSchedule" component={MgrScheduleScreen} />
    </>
  );
}
