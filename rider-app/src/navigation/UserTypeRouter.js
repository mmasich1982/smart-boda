// rider-app/src/navigation/UserTypeRouter.js
// SMART BIZNA: after the PIN, the app opens the home that matches the saved user type. A rider gets the existing Smart Boda MainNavigator untouched;
// a business user (Owner or Sales/Service Person) gets the Smart Bizna BusinessNavigator. The type is read from the phone, so this is right offline.
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getLocalRiderStatus } from '../offline/db';
import { homeKindFor } from '../utils/userTypeRouting';
import MainNavigator from './MainNavigator';
import BusinessNavigator from './BusinessNavigator';
import AdminNavigator from './AdminNavigator';       // ADMIN APP

export default function UserTypeRouter() {
  const [kind, setKind] = useState(null);
  useEffect(() => {
    let live = true;
    getLocalRiderStatus().then((st) => live && setKind(homeKindFor(st))).catch(() => live && setKind('rider'));
    return () => { live = false; };
  }, []);
  if (!kind) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (kind === 'admin') return <AdminNavigator />;      // ADMIN APP: the Administrator's tile home (never the rider MainNavigator)
  return kind === 'business' ? <BusinessNavigator /> : <MainNavigator />;
}
