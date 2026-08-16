// rider-app/src/services/dueAlerts.js
// Referenced by useUrgentAlerts.js and (via HomeScreen.js's now-corrected import) HomeScreen,
// but never given an implementation in any guide. A pure, offline-friendly calculation
// mirroring what MaintenanceHubScreen.js gets from the backend's `/fuel-maintenance/due-alerts`
// endpoint (see BR-SB12-007/009) -- this local version lets the notification bell (Home) and
// useUrgentAlerts hook work instantly, without waiting on a network round trip.
//
// Expected `bike` shape includes a `maintenanceSchedule` array, one entry per tracked
// service type, each carrying the odometer reading at which that service is next due:
//   bike.maintenanceSchedule = [
//     { serviceType: 'Engine Oil', icon: '🛢️', nextServiceOdometer: 13200 },
//     { serviceType: 'Chain & Sprocket', icon: '⚙️', nextServiceOdometer: 14000 },
//     ...
//   ]

export function allDueAlerts(bike, currentOdometer) {
  if (!bike || !Array.isArray(bike.maintenanceSchedule) || currentOdometer == null) return [];
  return bike.maintenanceSchedule.map((item) => ({
    serviceType: item.serviceType,
    icon: item.icon || '🔧',
    remainingKm: item.nextServiceOdometer - currentOdometer,
  }));
}

// Convenience helper for HomeScreen's notification-bell summary -- the single most urgent
// item, if any, matching the "top 3" pattern MaintenanceHubScreen.js uses server-side.
export function topDueMaintenanceAlert(bike, currentOdometer) {
  const all = allDueAlerts(bike, currentOdometer);
  if (!all.length) return null;
  return all.reduce((mostUrgent, item) =>
    item.remainingKm < mostUrgent.remainingKm ? item : mostUrgent
  );
}
