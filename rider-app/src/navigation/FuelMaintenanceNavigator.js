// rider-app/src/navigation/FuelMaintenanceNavigator.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FuelHubScreen from '../screens/fuelMaintenance/FuelHubScreen';
import FuelEntryScreen from '../screens/fuelMaintenance/FuelEntryScreen';
import BatteryEntryScreen from '../screens/fuelMaintenance/BatteryEntryScreen';
import MaintenanceHubScreen from '../screens/fuelMaintenance/MaintenanceHubScreen';
import MaintenanceEntryScreen from '../screens/fuelMaintenance/MaintenanceEntryScreen';
import FuelHistoryScreen from '../screens/fuelMaintenance/FuelHistoryScreen';
import MaintenanceHistoryScreen from '../screens/fuelMaintenance/MaintenanceHistoryScreen';

const Stack = createNativeStackNavigator();

// BR-SB09-005: FuelHubScreen itself branches Petrol → FuelEntry, Electric → BatteryEntry —
// both routes stay registered so navigation.navigate() works regardless of which fuel type loads.
// NOTE: no more OdometerEntry route — that screen was removed; odometer capture now lives
// inline inside FuelEntryScreen (periodic) and BatteryEntryScreen (every save).
export default function FuelMaintenanceNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FuelHub" component={FuelHubScreen} />
      <Stack.Screen name="FuelEntry" component={FuelEntryScreen} />
      <Stack.Screen name="BatteryEntry" component={BatteryEntryScreen} />
      <Stack.Screen name="MaintenanceHub" component={MaintenanceHubScreen} />
      <Stack.Screen name="MaintenanceEntry" component={MaintenanceEntryScreen} />
      <Stack.Screen name="FuelHistory" component={FuelHistoryScreen} />
      <Stack.Screen name="MaintenanceHistory" component={MaintenanceHistoryScreen} />
    </Stack.Navigator>
  );
}
