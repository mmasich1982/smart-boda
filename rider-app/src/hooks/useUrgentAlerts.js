// rider-app/src/hooks/useUrgentAlerts.js
/**
 * COMPREHENSIVE URGENT ALERTS HOOK - COMPLETE IMPLEMENTATION
 * ✅ ALL 7 ALERT TYPES FULLY IMPLEMENTED
 * ✅ INCLUDES NEWLY ADDED MISSING: Subscription Price Change Alert
 * 
 * Composes alerts from all modules into one unified notification bell:
 * 1. Document expiry (License/Insurance/Logbook) - 5 day window
 * 2. Service/maintenance due (odometer-based)
 * 3. Subscription/trial expiry - 5 day window or locked
 * 4. Subscription price change (NEWLY ADDED - WAS MISSING)
 * 5. 48-hour online sync reminder (ADDED FOR ISSUE 2)
 * 6. Battery charging distance alerts (ADDED FOR ISSUE 3)
 * 7. Battery low alert (existing, improved)
 */

import { useMemo } from 'react';
import { batteryRangeRemainingKm, batteryRangeToChargerKm } from '../services/batteryRange';
import { alertTier } from '../components/DueAlertBanner';
import { allDueAlerts } from '../services/dueAlerts';

/**
 * ALERT TYPE 1: DOCUMENT EXPIRY
 * ✅ License, Insurance, Logbook documents expiring within 5 days
 */
function getDocumentExpiryAlerts(documents) {
  const alerts = [];
  if (!documents) return alerts;

  documents.filter(d => !d.archived && d.expiryDate).forEach((doc) => {
    const daysLeft = Math.ceil((doc.expiryDate - Date.now()) / 86400000);
    if (daysLeft > 5) return; // Only alert within 5-day window

    alerts.push({
      icon: '📄',
      title: daysLeft < 0 
        ? `${doc.type} has expired` 
        : daysLeft === 0 
          ? `${doc.type} expires today` 
          : `${doc.type} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      detail: 'Renew it to stay compliant.',
      screen: 'ComplianceDashboard',
      docType: doc.type,
      urgency: daysLeft <= 1 ? 'critical' : 'warning',
    });
  });
  return alerts;
}

/**
 * ALERT TYPE 2: SERVICE/MAINTENANCE DUE
 * ✅ Odometer-based maintenance alerts (not calendar-based)
 * ✅ Shows overdue and final tiers only
 */
function getServiceDueAlerts(bike, currentOdometer) {
  if (!bike) return [];

  return allDueAlerts(bike, currentOdometer)
    .filter(a => {
      const tier = alertTier(a.remainingKm);
      return ['final', 'overdue'].includes(tier);
    })
    .map(a => {
      const tier = alertTier(a.remainingKm);
      return {
        icon: '🔧',
        title: tier === 'overdue'
          ? `${a.serviceType} overdue by ${Math.abs(a.remainingKm)} km`
          : `${a.serviceType} due in about ${a.remainingKm} km`,
        detail: 'Log it soon to stay ahead of wear and tear.',
        screen: 'MaintenanceHub',
        urgency: tier === 'overdue' ? 'critical' : 'warning',
      };
    });
}

/**
 * ALERT TYPE 3: SUBSCRIPTION/TRIAL EXPIRY
 * ✅ Shows when subscription/trial is locked
 * ✅ Shows when expiring within 5 days
 */
function getSubscriptionAlerts(sub) {
  if (!sub) return [];

  const alerts = [];
  const noun = sub.has_ever_paid ? 'subscription' : 'free trial';

  // CRITICAL: Subscription locked
  if (sub.locked) {
    alerts.push({
      icon: '📲',
      title: `Your ${noun} has ended`,
      detail: 'Subscribe to jump right back in — your data is safe.',
      screen: 'Subscription',
      urgency: 'critical',
    });
    return alerts; // Don't show other subscription alerts if locked
  }

  // WARNING/CRITICAL: Expiring soon
  if (sub.days_left !== undefined && sub.days_left !== null) {
    if (sub.days_left <= 5) {
      alerts.push({
        icon: '📲',
        title: sub.days_left <= 0 
          ? `Your ${noun} expires today` 
          : `Your ${noun} expires in ${sub.days_left} day${sub.days_left === 1 ? '' : 's'}`,
        detail: 'Renew to avoid any interruption.',
        screen: 'Subscription',
        urgency: sub.days_left <= 1 ? 'critical' : 'warning',
      });
    }
  }

  return alerts;
}

/**
 * ALERT TYPE 4: SUBSCRIPTION PRICE CHANGE (❌ WAS MISSING - NOW ADDED)
 * ✅ Shows scheduled price changes before they take effect
 * ✅ Displays countdown in hours
 * ✅ Urgency: 'info' (not critical/warning)
 * ✅ Routes to subscription screen for details
 * 
 * Purpose: Inform users about upcoming price changes with advance notice
 * (EM-10 requirement: users must know before billing happens)
 */
function getPriceChangeAlert(sub) {
  if (!sub?.pendingPricingChange) return [];

  const p = sub.pendingPricingChange;
  const now = Date.now();
  
  // Only show if price change hasn't taken effect yet
  if (p.effectiveAt <= now) return [];

  const hrsLeft = Math.max(0, Math.ceil((p.effectiveAt - now) / 3600000));

  return [{
    icon: '📢',
    title: `Subscription price changing to KSh ${p.dailyPrice}/day`,
    detail: `Takes effect in about ${hrsLeft}h — your current price is unaffected until then.`,
    screen: 'Subscription',
    urgency: 'info', // Light blue info alert, not critical
    priceChange: true, // Tag for identification
  }];
}

/**
 * ALERT TYPE 5: 48-HOUR ONLINE SYNC REMINDER
 * ✅ ISSUE #2: Shows 48 hours after user selects "Enable later"
 * ✅ Auto-removes when sync is enabled
 * ✅ Only shows if sync not already enabled
 */
function getSyncReminderAlert(rider, isOnlineEnabled) {
  if (isOnlineEnabled) return []; // Don't show if already enabled

  if (!rider?.lastSyncRefusalTime) return []; // No refusal recorded yet

  const hoursSinceRefusal = (Date.now() - rider.lastSyncRefusalTime) / 3600000;
  
  // Only show after 48 hours have passed
  if (hoursSinceRefusal < 48) return [];

  return [{
    icon: '📡',
    title: '48-hour reminder: Enable online sync',
    detail: 'Your data is only stored locally. Enable sync to backup to cloud.',
    screen: 'SyncQueue',
    urgency: 'warning',
    syncReminder: true,
  }];
}

/**
 * ALERT TYPE 6: BATTERY LOW ALERT
 * ✅ Shows when battery has ~5km remaining (can't reach charger safely)
 * ✅ Critical when at or below 0km (stranded)
 * ✅ Warning when 1-5km remaining
 */
function getBatteryLowAlert(bike, currentOdometer) {
  if (!bike || bike.fuelType !== 'electric') return [];
  
  const remaining = batteryRangeRemainingKm(bike, currentOdometer);
  if (remaining === null || remaining > 5) return [];

  return [{
    icon: '🔋❌',
    title: remaining <= 0 
      ? 'Battery empty - stranded!' 
      : `Battery low — ~${Math.round(remaining)}km left`,
    detail: 'Charge or swap soon to avoid getting stranded.',
    screen: 'ChargeBatteryHub',
    urgency: remaining <= 0 ? 'critical' : 'warning',
  }];
}

/**
 * ALERT TYPE 7: BATTERY CHARGING DISTANCE ALERTS
 * ✅ ISSUE #3: Shows at 10km WARNING and 5km CRITICAL thresholds
 * ✅ Only for electric motorcycles
 * ✅ Auto-removes when battery charged above 10km or bike switched
 * 
 * Different from battery low:
 * - Low: "How far can I go before empty"
 * - Charging: "How far to nearest charging station"
 */
function getBatteryChargingAlerts(bike, currentOdometer, chargers) {
  if (!bike || bike.fuelType !== 'electric') return [];

  const kmToCharger = batteryRangeToChargerKm(bike, currentOdometer, chargers);
  
  if (kmToCharger === null) return []; // No chargers nearby

  const alerts = [];

  // CRITICAL: 5km or less to charger
  if (kmToCharger <= 5) {
    alerts.push({
      icon: '🔋⚡',
      title: kmToCharger <= 0 
        ? 'At charger - battery critical'
        : `Battery: ~${Math.round(kmToCharger)}km to charger (URGENT)`,
      detail: 'Charge now to avoid getting stranded.',
      screen: 'ChargeBatteryHub',
      urgency: 'critical',
      batteryCharging: true,
      threshold: '5km',
    });
  }
  // WARNING: 5-10km to charger
  else if (kmToCharger <= 10) {
    alerts.push({
      icon: '🔋⚡',
      title: `Battery: ~${Math.round(kmToCharger)}km to charger`,
      detail: 'Plan your charging stop soon to stay safe.',
      screen: 'ChargeBatteryHub',
      urgency: 'warning',
      batteryCharging: true,
      threshold: '10km',
    });
  }

  return alerts;
}

/**
 * MAIN COMBINED HOOK - PULLS ALL 7 ALERT TYPES
 * 
 * Usage in components:
 * ```javascript
 * const alerts = useUrgentAlerts({
 *   documents: complianceDocs,           // For alert #1
 *   bike: currentBike,                   // For alerts #2, #6, #7
 *   currentOdometer: odometer,           // For alerts #2, #6, #7
 *   sub: subscriptionStatus,             // For alerts #3, #4
 *   rider: riderStatus,                  // For alert #5
 *   isOnlineEnabled: syncStatus,         // For alert #5
 *   chargers: nearbyChargers,            // For alert #7
 * });
 * ```
 * 
 * ALERT REMOVAL LOGIC:
 * All alerts automatically remove when their conditions resolve via useMemo dependencies:
 * 1. Document: When expiry date passes or doc renewed
 * 2. Service: When service is logged or odometer updated
 * 3. Subscription: When renewed or days_left increases
 * 4. Price Change: When effectiveAt time passes or price applied
 * 5. Sync: When sync is enabled or timestamp cleared
 * 6. Battery Low: When charged above 5km
 * 7. Battery Charging: When charged above 10km or bike switched
 */
export default function useUrgentAlerts({
  documents,
  bike,
  currentOdometer,
  sub,
  rider,
  isOnlineEnabled = false,
  chargers = [],
}) {
  return useMemo(() => {
    const allAlerts = [
      // ORIGINAL SPEC ALERTS
      ...getDocumentExpiryAlerts(documents),              // Alert #1: Documents
      ...getServiceDueAlerts(bike, currentOdometer),      // Alert #2: Service/Maintenance
      ...getSubscriptionAlerts(sub),                      // Alert #3: Subscription expiry
      ...getPriceChangeAlert(sub),                        // Alert #4: Price change ✅ NEWLY ADDED
      
      // ISSUE FIXES & ADDITIONS
      ...getSyncReminderAlert(rider, isOnlineEnabled),   // Alert #5: 48h sync reminder (Issue #2)
      ...getBatteryLowAlert(bike, currentOdometer),       // Alert #6: Battery low (improved)
      ...getBatteryChargingAlerts(bike, currentOdometer, chargers), // Alert #7: Charging distance (Issue #3)
    ];

    // Sort by urgency: critical first, then warning, then info
    return allAlerts.sort((a, b) => {
      const urgencyOrder = { critical: 0, warning: 1, info: 2 };
      return (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
    });
  }, [documents, bike, currentOdometer, sub, rider, isOnlineEnabled, chargers]);
}

/**
 * HELPER FUNCTIONS FOR PARENT COMPONENTS
 */

export function handleSyncEnabled(rider) {
  // Call when sync is successfully enabled
  return { ...rider, lastSyncRefusalTime: null };
}

export function handlePriceChangeApplied(sub) {
  // Call when price change effectiveAt time passes
  return { ...sub, pendingPricingChange: null };
}

/**
 * SUMMARY OF ALL 7 ALERT TYPES
 * ============================
 * 
 * #1 📄 DOCUMENTS (5-day window before expiry)
 *    - License/Insurance/Logbook
 *    - Critical if expires today or already expired
 *    - Warning if expiring within 5 days
 * 
 * #2 🔧 SERVICE/MAINTENANCE (odometer-based)
 *    - Shows 'final' and 'overdue' tiers
 *    - Critical if overdue
 *    - Warning if due soon
 * 
 * #3 📲 SUBSCRIPTION/TRIAL (5-day window + locked)
 *    - Critical if locked
 *    - Critical if expires today
 *    - Warning if expiring within 5 days
 * 
 * #4 📢 PRICE CHANGE (advance notice before effective)
 *    - Info urgency (light blue)
 *    - Shows countdown in hours
 *    - Routes to Subscription screen
 * 
 * #5 📡 SYNC REMINDER (48-hour after refusal)
 *    - Warning urgency (orange)
 *    - Auto-removes when enabled
 *    - Only if sync not already enabled
 * 
 * #6 🔋❌ BATTERY LOW (5km to empty)
 *    - Critical if at/below 0km
 *    - Warning if 1-5km remaining
 *    - Only for electric motorcycles
 * 
 * #7 🔋⚡ BATTERY CHARGING (distance to charger)
 *    - Critical at 5km to charger
 *    - Warning at 10km to charger
 *    - Only for electric motorcycles
 *    - Uses Haversine distance calculation
 */