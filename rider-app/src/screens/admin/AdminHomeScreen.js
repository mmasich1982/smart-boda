// rider-app/src/screens/admin/AdminHomeScreen.js
// ADMIN APP HOME. The console's sidebar as tiles, in the same style as Smart Bizna: one tile per MENU, two to a row; a small red number on a tile
// says how many things are waiting (slot requests, statement requests, businesses still to set up). A menu with one sub menu opens its screen at once.
import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Screen, Title, Sub, Card, Banner, Hint, s, C } from './AdminUI';
import { menusFor, singleRouteOf, menuBadge, roleLabel } from '../../admin/adminMenu';
import useAdmin, { useDashboardStats } from '../../admin/useAdmin';
import { adminLogout } from '../../admin/adminSession';
import { confirmAction } from '../../utils/confirmDialog';

export function BadgeDot({ n }) {
  if (!n) return null;
  return (
    <View style={{ position: 'absolute', top: 8, right: 8, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
      <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '800' }}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

export function MenuTile({ icon, label, badge, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} waiting` : label}
      style={{ width: '48.5%', backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 18, paddingHorizontal: 10, alignItems: 'center', marginBottom: 10 }}>
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.ink, textAlign: 'center', marginTop: 6 }}>{label}</Text>
      <BadgeDot n={badge} />
    </TouchableOpacity>
  );
}
export const tileGrid = { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 4 };

export default function AdminHomeScreen({ navigation }) {
  const { admin, loaded } = useAdmin();
  const { stats, error, refresh } = useDashboardStats(navigation);
  const menus = menusFor(admin.role);
  const open = useCallback((menu) => {
    const only = singleRouteOf(menu);
    if (only) navigation.navigate(only); else navigation.navigate('AdminMenu', { menuKey: menu.key });
  }, [navigation]);
  const logout = useCallback(async () => {
    const yes = await confirmAction({ title: 'Logout', message: 'Are you sure you want to logout?', confirmText: 'Logout' });
    if (yes) { try { await adminLogout(); } catch (e) { /* still leave */ } }
  }, []);

  if (!loaded) return <Screen><Title>Smart Boda Admin</Title><Hint>Loading…</Hint></Screen>;

  const waiting = stats ? (Number(stats.pending_slot_requests) || 0) + (Number(stats.pending_statement_requests) || 0) : 0;
  return (
    <Screen>
      <Text style={s.hint}>Smart Boda · Smart Bizna</Text>
      <Title>Admin</Title>
      <Sub>{admin.name}{admin.role ? ` · ${roleLabel(admin.role)}` : ''}</Sub>

      <TouchableOpacity onPress={() => navigation.navigate('AdminDashboard')} accessibilityRole="button" accessibilityLabel="Open the Main Stats Dashboard">
        <View style={[s.hero, { backgroundColor: C.asphalt }]}>
          <Text style={s.heroLabel}>Active riders · Groups · Businesses</Text>
          <Text style={s.heroAmt}>{stats ? `${stats.active_riders} · ${stats.total_groups} · ${(stats.businesses_pending || 0) + (stats.businesses_activated || 0) + (stats.businesses_inactive || 0)}` : '— · — · —'}</Text>
          <Text style={s.heroSmall}>{waiting ? `${waiting} waiting for you · tap for the dashboard` : 'Nothing waiting · tap for the dashboard'}</Text>
        </View>
      </TouchableOpacity>
      {error ? <Banner tone="amber" text={`${error}  Tap to retry.`} onPress={refresh} /> : null}

      <View style={tileGrid}>
        {menus.map((m) => <MenuTile key={m.key} icon={m.icon} label={m.label} badge={menuBadge(m, stats)} onPress={() => open(m)} />)}
      </View>

      <Card>
        <Hint>Everything you save here is saved in the same records as the Administrator console, and what you save in the console shows here.</Hint>
      </Card>
      <TouchableOpacity onPress={logout} style={{ paddingVertical: 14 }} accessibilityRole="button"><Text style={{ color: C.red, fontWeight: '700', textAlign: 'center' }}>🚪 Logout</Text></TouchableOpacity>
    </Screen>
  );
}
