// rider-app/src/navigation/AdminNavigator.js
// ADMIN APP navigator: Admin Home -> menu tiles -> sub menu screens. Each screen is wrapped by a GUARD (rules in admin/adminMenu.js) so a screen the
// signed-in role may not open can never be reached by tile, link or saved route: the person is sent back to the Admin Home. (The server answers 403 too.)
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useAdmin from '../admin/useAdmin';
import { guardAdminRoute, HOME_ROUTE } from '../admin/adminMenu';
import ROUTE_NAMES from './AdminNavigator.routes';

import AdminHomeScreen from '../screens/admin/AdminHomeScreen';
import AdminMenuScreen from '../screens/admin/AdminMenuScreen';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import { ActiveRidersScreen, IndividualRidersScreen } from '../screens/admin/AdminRiderScreens';
import { RegisterBusinessScreen, BusinessesListScreen, TilePermissionsScreen, BusinessTypesScreen, StatementRequestsScreen } from '../screens/admin/AdminBusinessScreens';
import { ManageGroupsScreen, IncomingAdditionsScreen } from '../screens/admin/AdminGroupScreens';

const Stack = createNativeStackNavigator();

function guarded(Component, routeName) {
  function Guarded(props) {
    const { admin, loaded } = useAdmin();
    const target = loaded ? guardAdminRoute(routeName, admin.role) : routeName;
    const denied = loaded && target !== routeName;
    useEffect(() => { if (denied) props.navigation.navigate(HOME_ROUTE); }, [denied]);   // eslint-disable-line react-hooks/exhaustive-deps
    if (!loaded || denied) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
    return <Component {...props} />;
  }
  Guarded.displayName = `Guarded(${routeName})`;
  return Guarded;
}

// name -> component. The names are the ones in admin/adminMenu.js.
export const ADMIN_ROUTES = {
  AdminHome: AdminHomeScreen, AdminMenu: AdminMenuScreen, AdminDashboard: AdminDashboardScreen,
  ActiveRiders: ActiveRidersScreen, IndividualRiders: IndividualRidersScreen,
  RegisterBusiness: RegisterBusinessScreen, BusinessesList: BusinessesListScreen, TilePermissions: TilePermissionsScreen, BusinessTypes: BusinessTypesScreen, StatementRequests: StatementRequestsScreen,
  ManageGroups: ManageGroupsScreen, IncomingAdditions: IncomingAdditionsScreen,
};
// the names the tests rely on (AdminNavigator.routes.js) and the screens registered here must be the same list
if (Object.keys(ROUTE_NAMES).sort().join() !== Object.keys(ADMIN_ROUTES).sort().join()) console.warn('[AdminNavigator] AdminNavigator.routes.js and ADMIN_ROUTES differ');
const GUARDED = Object.fromEntries(Object.entries(ADMIN_ROUTES).map(([name, Component]) => [name, guarded(Component, name)]));   // built once: a new type per render would remount screens

export default function AdminNavigator() {
  return (
    <Stack.Navigator initialRouteName={HOME_ROUTE} screenOptions={{ headerShown: false, animation: 'fade' }}>
      {Object.keys(ADMIN_ROUTES).map((name) => <Stack.Screen key={name} name={name} component={GUARDED[name]} />)}
    </Stack.Navigator>
  );
}
