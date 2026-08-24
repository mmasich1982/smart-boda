// rider-app/src/components/NotificationBell.js — mirrors cleaned.html's topBar() bell + panel exactly
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import colors from '../theme/colors';
import useUrgentAlerts from '../hooks/useUrgentAlerts';

export default function NotificationBell({ navigation }) {
  const [open, setOpen] = React.useState(false);  // mirrors state._notifPanelOpen / toggleNotifPanel()
  const alerts = useUrgentAlerts();  // aggregates every module's urgent alerts, sorted critical-first
  const hasCritical = alerts.some(a => a.urgency === 'critical');

  function handleAlertPress(alert) {
    setOpen(false);
    navigation.navigate(alert.screen);  // e.g. 'MaintenanceHub' or 'FuelHub' for this module's alerts
  }

  return (
    <View>
      <TouchableOpacity onPress={() => setOpen(!open)} style={[styles.bell, open && styles.bellActive]}>
        <Text style={{ fontSize: 15 }}>🔔</Text>
        {alerts.length > 0 && (
          <View style={[styles.badge, { backgroundColor: hasCritical ? colors.signalRed : colors.signalAmber }]}>
            <Text style={styles.badgeText}>{alerts.length > 9 ? '9+' : alerts.length}</Text>
          </View>
        )}
      </TouchableOpacity>

      {open && (
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelHeadText}>Needs Your Attention</Text>
            <TouchableOpacity onPress={() => setOpen(false)}><Text>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 320 }}>
            {alerts.length ? alerts.map((a, i) => (
              <TouchableOpacity key={i} style={styles.row} onPress={() => handleAlertPress(a)}>
                <Text style={{ fontSize: 15 }}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{a.title}</Text>
                  <Text style={styles.rowDetail}>{a.detail}</Text>
                </View>
                <View style={[styles.dot, { backgroundColor: a.urgency === 'critical' ? colors.signalRed : colors.signalAmber }]} />
              </TouchableOpacity>
            )) : (
              <Text style={styles.empty}>🎉 Nothing urgent — you're all caught up.</Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bell: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bellActive: { backgroundColor: '#fff2e6' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 999, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  panel: { position: 'absolute', top: 40, right: 0, width: 290, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, elevation: 8, shadowOpacity: 0.2, shadowRadius: 20, zIndex: 150 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderColor: colors.line },
  panelHeadText: { fontWeight: '700', fontSize: 13, color: colors.ink },
  row: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 12, borderBottomWidth: 1, borderColor: colors.line },
  rowTitle: { fontWeight: '700', fontSize: 12.5, color: colors.ink, marginBottom: 2 },
  rowDetail: { fontSize: 11.5, color: colors.inkSoft, lineHeight: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 4 },
  empty: { padding: 26, textAlign: 'center', fontSize: 12, color: colors.inkSoft },
});
