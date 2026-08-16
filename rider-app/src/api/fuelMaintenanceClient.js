// rider-app/src/api/fuelMaintenanceClient.js
// FIXED: Helper functions to ensure rider_id is always passed as Query parameter
import api from './client';

/**
 * Save fuel entry with proper rider_id handling
 * @param {string} riderId - The rider ID from context/store
 * @param {object} payload - The fuel entry data {mode, cost, ...}
 */
export async function saveFuelEntry(riderId, payload) {
  if (!riderId) throw new Error('rider_id is required');
  
  try {
    const response = await api.post('/fuel-maintenance/fuel-entry', payload, {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Fuel entry save failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get fuel history with pagination and filtering
 */
export async function getFuelHistory(riderId, { page = 1, type = null, limit = 10 } = {}) {
  if (!riderId) throw new Error('rider_id is required');
  
  const params = { rider_id: riderId, page, limit };
  if (type) params.type = type;
  
  try {
    const response = await api.get('/fuel-maintenance/fuel-entry/history', { params });
    return response.data;
  } catch (error) {
    console.error('Fuel history fetch failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get current odometer reading
 */
export async function getOdometer(riderId) {
  if (!riderId) throw new Error('rider_id is required');
  
  try {
    const response = await api.get('/fuel-maintenance/odometer', {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Odometer fetch failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Save battery entry
 */
export async function saveBatteryEntry(riderId, payload) {
  if (!riderId) throw new Error('rider_id is required');
  
  try {
    const response = await api.post('/fuel-maintenance/battery-entry', payload, {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Battery entry save failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get battery range
 */
export async function getBatteryRange(riderId) {
  if (!riderId) throw new Error('rider_id is required');
  
  try {
    const response = await api.get('/fuel-maintenance/battery-range', {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Battery range fetch failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get service types
 */
export async function getServiceTypes() {
  try {
    const response = await api.get('/fuel-maintenance/service-types');
    return response.data;
  } catch (error) {
    console.error('Service types fetch failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get oil types
 */
export async function getOilTypes() {
  try {
    const response = await api.get('/fuel-maintenance/oil-types');
    return response.data;
  } catch (error) {
    console.error('Oil types fetch failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get due alerts (service reminders)
 */
export async function getDueAlerts(riderId) {
  if (!riderId) throw new Error('rider_id is required');
  
  try {
    const response = await api.get('/fuel-maintenance/due-alerts', {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Due alerts fetch failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Save maintenance entry
 */
export async function saveMaintenanceEntry(riderId, payload) {
  if (!riderId) throw new Error('rider_id is required');
  
  try {
    const response = await api.post('/fuel-maintenance/maintenance-entry', payload, {
      params: { rider_id: riderId }
    });
    return response.data;
  } catch (error) {
    console.error('Maintenance entry save failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get maintenance history
 */
export async function getMaintenanceHistory(riderId, { page = 1, service_type = null, limit = 10 } = {}) {
  if (!riderId) throw new Error('rider_id is required');
  
  const params = { rider_id: riderId, page, limit };
  if (service_type) params.service_type = service_type;
  
  try {
    const response = await api.get('/fuel-maintenance/maintenance-entry/history', { params });
    return response.data;
  } catch (error) {
    console.error('Maintenance history fetch failed:', error.response?.data || error.message);
    throw error;
  }
}