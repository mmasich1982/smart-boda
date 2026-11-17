// rider-app/src/screens/admin/AdminMenuScreen.js
// ADMIN APP MENU: the sub menus of one menu as tiles (the console's sidebar links under that heading), each with the number waiting.
import React from 'react';
import { View } from 'react-native';
import { AdminScreen, Hint } from './AdminUI';
import { MenuTile, tileGrid } from './AdminHomeScreen';
import { findMenu, badgeOf } from '../../admin/adminMenu';
import useAdmin, { useDashboardStats } from '../../admin/useAdmin';

export default function AdminMenuScreen({ navigation, route }) {
  const { admin, loaded } = useAdmin();
  const { stats } = useDashboardStats(navigation);
  const menu = loaded ? findMenu(route && route.params && route.params.menuKey, admin.role) : null;
  if (!loaded) return <AdminScreen navigation={navigation} title="Admin" back="← Home" onBack={() => navigation.navigate('AdminHome')}><Hint>Loading…</Hint></AdminScreen>;
  if (!menu) return <AdminScreen navigation={navigation} title="Admin" back="← Home" onBack={() => navigation.navigate('AdminHome')}><Hint>This menu is not available to you.</Hint></AdminScreen>;
  return (
    <AdminScreen navigation={navigation} title={`${menu.icon} ${menu.label}`} back="← Home" onBack={() => navigation.navigate('AdminHome')}>
      <View style={tileGrid}>
        {menu.items.map((i) => <MenuTile key={i.route} icon={i.icon} label={i.label} badge={badgeOf(i, stats)} onPress={() => navigation.navigate(i.route)} />)}
      </View>
    </AdminScreen>
  );
}
