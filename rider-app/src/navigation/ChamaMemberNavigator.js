// rider-app/src/navigation/ChamaMemberNavigator.js
// SMART CHAMA navigator: only the small Chama Home, the member's own financial history, and the existing group screens. A Chama member can never
// reach a rider or business screen. The group screens already go "back" to a route named 'Home', so the Chama Home is called 'Home'.
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChamaHomeScreen from '../screens/chamaHome/ChamaHomeScreen';
import MemberFinancialHistoryScreen from '../screens/chamaHome/MemberFinancialHistoryScreen';
import chamaScreens from './chamaScreens';

const Stack = createNativeStackNavigator();

export default function ChamaMemberNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="Home" component={ChamaHomeScreen} />
      <Stack.Screen name="MemberFinancialHistory" component={MemberFinancialHistoryScreen} />
      {chamaScreens(Stack)}
    </Stack.Navigator>
  );
}
