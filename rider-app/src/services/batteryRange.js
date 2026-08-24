// rider-app/src/services/batteryRange.js
/**
 * BATTERY RANGE CALCULATIONS SERVICE
 * ✅ FIXED: Added batteryRangeToChargerKm() function for charging alerts
 * Used by notification alerts and fuel/battery entry screens
 */

/**
 * Calculate remaining battery range in km
 * Used by battery low alerts (5km threshold)
 * 
 * Returns null if bike is not electric or data insufficient
 * Returns negative value if battery is exhausted
 */
export function batteryRangeRemainingKm(bike, currentOdometer) {
  if (!bike || bike.fuelType !== 'electric') return null;

  // BR-SB10-007: Calculate from battery range per charge
  const { lastChargeOdometer = 0, batteryRangePerCharge = 80 } = bike;
  const kmSinceCharge = currentOdometer - lastChargeOdometer;
  const remaining = batteryRangePerCharge - kmSinceCharge;

  return remaining;
}

/**
 * ✅ NEW FUNCTION: Calculate distance to nearest charging station
 * Used by battery charging alerts (10km & 5km thresholds)
 * 
 * This is DIFFERENT from batteryRangeRemainingKm():
 * - that: "how far before battery empty"
 * - this: "how far to nearest charging station"
 * 
 * @param {Object} bike - Bike profile with current battery state
 * @param {number} currentOdometer - Current odometer reading
 * @param {Array} chargers - Array of nearby charging stations with locations
 * @returns {number|null} Distance in km to nearest charger, or null if not electric/no chargers
 */
export function batteryRangeToChargerKm(bike, currentOdometer, chargers) {
  // Only applies to electric motorcycles
  if (!bike || bike.fuelType !== 'electric') return null;
  
  // No chargers nearby
  if (!chargers || chargers.length === 0) return null;

  // Get current location (from bike/rider GPS or last known position)
  const currentLat = bike.lastKnownLat;
  const currentLng = bike.lastKnownLng;
  
  if (!currentLat || !currentLng) return null;

  // Calculate distance to each charger using Haversine formula
  let minDistance = Infinity;

  chargers.forEach(charger => {
    const distance = haversineDistance(
      { lat: currentLat, lng: currentLng },
      { lat: charger.latitude, lng: charger.longitude }
    );
    minDistance = Math.min(minDistance, distance);
  });

  // Return null if no valid chargers found
  if (minDistance === Infinity) return null;

  return minDistance;
}

/**
 * HAVERSINE FORMULA: Calculate great-circle distance between two points
 * Returns distance in kilometers
 * 
 * Used internally by batteryRangeToChargerKm()
 */
function haversineDistance(pos1, pos2) {
  const R = 6371; // Earth's radius in km
  const dLat = (pos2.lat - pos1.lat) * (Math.PI / 180);
  const dLng = (pos2.lng - pos1.lng) * (Math.PI / 180);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(pos1.lat * (Math.PI / 180)) *
      Math.cos(pos2.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * GET NEAREST CHARGERS
 * Fetches nearby charging stations from API
 * Used to populate chargers array for useUrgentAlerts
 * 
 * This should be called from parent component and passed as prop to useUrgentAlerts
 */
export async function getNearbyChargers(latitude, longitude, radiusKm = 20) {
  try {
    const response = await fetch(
      `/api/chargers/nearby?lat=${latitude}&lng=${longitude}&radius=${radiusKm}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.chargers || [];
  } catch (err) {
    console.error('Failed to fetch nearby chargers:', err);
    return [];
  }
}

/**
 * BATTERY STATUS HELPER
 * Returns human-readable battery status for UI display
 */
export function getBatteryStatus(bike, currentOdometer) {
  if (!bike || bike.fuelType !== 'electric') return null;

  const remaining = batteryRangeRemainingKm(bike, currentOdometer);
  if (remaining === null) return null;

  if (remaining > 20) return { status: 'good', color: '#10b981', icon: '🔋✅' };
  if (remaining > 10) return { status: 'medium', color: '#f59e0b', icon: '🔋⚠️' };
  if (remaining > 5) return { status: 'low', color: '#ef4444', icon: '🔋❌' };
  return { status: 'critical', color: '#991b1b', icon: '🔋💥' };
}

/**
 * BATTERY ESTIMATION HELPER
 * Estimates when battery will be empty at current consumption rate
 * Used to show "will die in X minutes" warnings
 */
export function minutesUntilBatteryDead(bike, currentOdometer, avgSpeedKmh = 40) {
  const remaining = batteryRangeRemainingKm(bike, currentOdometer);
  if (remaining === null || remaining <= 0) return 0;

  const hours = remaining / avgSpeedKmh;
  return Math.round(hours * 60);
}

/**
 * BATTERY CAPACITY HELPER
 * Returns percentage of battery capacity remaining
 */
export function getBatteryPercentage(bike, currentOdometer) {
  const remaining = batteryRangeRemainingKm(bike, currentOdometer);
  if (remaining === null) return null;

  const capacity = bike.batteryRangePerCharge || 80;
  const percentage = Math.max(0, Math.min(100, (remaining / capacity) * 100));
  return Math.round(percentage);
}