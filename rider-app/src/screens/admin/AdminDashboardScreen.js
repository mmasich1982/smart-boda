// rider-app/src/screens/admin/AdminDashboardScreen.js
// Dashboard > Main Stats Dashboard. The console shows Total Riders, Active Riders, Individual Riders and Groups; on a phone the Smart Bizna and
// "waiting for you" numbers sit beneath them, and every card opens the screen behind it. One call: GET /admin/app/dashboard.
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AdminScreen, StatTile, StatRow, Banner, Btn, Section, C } from './AdminUI';
import { useDashboardStats } from '../../admin/useAdmin';

export default function AdminDashboardScreen({ navigation }) {
  const { stats: d, error, loading, refresh } = useDashboardStats(navigation);
  const go = (route) => () => navigation.navigate(route);
  return (
    <AdminScreen navigation={navigation} title="Main Stats Dashboard" back="← Home" onBack={() => navigation.navigate('AdminHome')}>
      {error ? <Banner tone="red" text={`${error}`} onPress={refresh} /> : null}
      {loading && !d ? <View style={{ paddingVertical: 24 }}><ActivityIndicator color={C.orange} /></View> : null}
      {d ? (
        <>
          <Section>Riders and groups</Section>
          <StatRow>
            <StatTile label="Total Riders" value={d.total_riders} onPress={go('ActiveRiders')} />
            <StatTile label="Active Riders" value={d.active_riders} tone={C.orange} onPress={go('ActiveRiders')} />
            <StatTile label="Individual Riders" value={d.individual_riders} tone={C.green} onPress={go('IndividualRiders')} />
            <StatTile label="Groups" value={d.total_groups} tone="#1976d2" onPress={go('ManageGroups')} />
          </StatRow>
          <Section>Businesses</Section>
          <StatRow>
            <StatTile label="Pending setup" value={d.businesses_pending} tone={C.amber} onPress={go('BusinessesList')} />
            <StatTile label="Activated" value={d.businesses_activated} tone={C.green} onPress={go('BusinessesList')} />
            <StatTile label="Switched off" value={d.businesses_inactive} onPress={go('BusinessesList')} />
          </StatRow>
          <Section>Waiting for you</Section>
          <StatRow>
            <StatTile label="Group member slot requests" value={d.pending_slot_requests} tone={d.pending_slot_requests ? C.red : undefined} onPress={go('IncomingAdditions')} />
            <StatTile label="Business statement requests" value={d.pending_statement_requests} tone={d.pending_statement_requests ? C.red : undefined} onPress={go('StatementRequests')} />
          </StatRow>
        </>
      ) : null}
      <Btn label={loading ? 'Refreshing…' : '↻ Refresh'} kind="ghost" disabled={loading} onPress={refresh} />
    </AdminScreen>
  );
}
