// rider-app/src/offline/LocalStore.js
// ✅ COMPLETE FIX: All async methods + sync fallback for compatibility
// Now includes: kvGet, kvSet, queryRows, insertRow, updateRow, deleteRow
// Uses localStorage with JSON serialization for PWA compatibility

const LocalStore = {
  // ========== ASYNC KEY-VALUE METHODS (for db.js) ==========
  
  /**
   * Get a key-value pair (async)
   * @param {string} key
   * @returns {Promise<any>} - Parsed value or null
   */
  kvGet: async (key) => {
    return new Promise((resolve) => {
      try {
        if (typeof localStorage === 'undefined') {
          console.warn(`LocalStore.kvGet: localStorage not available for key "${key}"`);
          resolve(null);
          return;
        }

        const value = localStorage.getItem(key);
        if (!value) {
          resolve(null);
          return;
        }

        try {
          const parsed = JSON.parse(value);
          console.log(`✅ LocalStore.kvGet: Retrieved "${key}"`);
          resolve(parsed);
        } catch {
          // If not JSON, return as-is
          console.log(`✅ LocalStore.kvGet: Retrieved "${key}" (raw string)`);
          resolve(value);
        }
      } catch (err) {
        console.error(`LocalStore.kvGet error for "${key}":`, err.message);
        resolve(null);
      }
    });
  },

  /**
   * Set a key-value pair (async)
   * @param {string} key
   * @param {any} value - Will be JSON stringified
   * @returns {Promise<void>}
   */
  kvSet: async (key, value) => {
    return new Promise((resolve) => {
      try {
        if (typeof localStorage === 'undefined') {
          console.warn(`LocalStore.kvSet: localStorage not available for key "${key}"`);
          resolve();
          return;
        }

        if (!key || typeof key !== 'string') {
          console.error('LocalStore.kvSet: Invalid key', key);
          resolve();
          return;
        }

        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, stringValue);
        console.log(`✅ LocalStore.kvSet: Stored "${key}" (${stringValue.length} bytes)`);
        resolve();
      } catch (err) {
        if (err.name === 'QuotaExceededError') {
          console.error('LocalStore.kvSet: Storage quota exceeded');
        } else {
          console.error(`LocalStore.kvSet error for "${key}":`, err.message);
        }
        resolve();
      }
    });
  },

  // ========== TABLE-BASED STORAGE METHODS ==========

  /**
   * Insert a row into a table (async)
   * Tables: 'local_trip', 'sync_queue', 'local_statement', etc.
   * @param {string} table - Table name
   * @param {object} row - Row object with 'id' property
   * @returns {Promise<object>} - The inserted row
   */
  insertRow: async (table, row) => {
    return new Promise((resolve) => {
      try {
        if (typeof localStorage === 'undefined') {
          console.warn(`LocalStore.insertRow: localStorage not available for table "${table}"`);
          resolve(row);
          return;
        }

        if (!table || !row || !row.id) {
          console.error('LocalStore.insertRow: Missing table, row, or row.id');
          resolve(row);
          return;
        }

        const tableKey = `table_${table}`;
        let rows = [];

        // Get existing rows
        try {
          const existing = localStorage.getItem(tableKey);
          if (existing) {
            rows = JSON.parse(existing);
            if (!Array.isArray(rows)) rows = [];
          }
        } catch (e) {
          console.warn(`Failed to parse existing rows for table "${table}"`);
          rows = [];
        }

        // Add or update row
        const existingIndex = rows.findIndex(r => r.id === row.id);
        if (existingIndex !== -1) {
          rows[existingIndex] = row;
        } else {
          rows.push(row);
        }

        // Save back
        localStorage.setItem(tableKey, JSON.stringify(rows));
        console.log(`✅ LocalStore.insertRow: Inserted ${row.id} into "${table}" (${rows.length} total rows)`);
        resolve(row);
      } catch (err) {
        console.error(`LocalStore.insertRow error for table "${table}":`, err.message);
        resolve(row);
      }
    });
  },

  /**
   * Query rows from a table (async)
   * @param {string} table - Table name
   * @param {function} filterFn - Filter function (optional)
   * @returns {Promise<array>} - Filtered rows
   */
  queryRows: async (table, filterFn = () => true) => {
    return new Promise((resolve) => {
      try {
        if (typeof localStorage === 'undefined') {
          console.warn(`LocalStore.queryRows: localStorage not available for table "${table}"`);
          resolve([]);
          return;
        }

        const tableKey = `table_${table}`;
        const data = localStorage.getItem(tableKey);

        if (!data) {
          console.log(`LocalStore.queryRows: No data found for table "${table}"`);
          resolve([]);
          return;
        }

        try {
          const rows = JSON.parse(data);
          if (!Array.isArray(rows)) {
            console.warn(`LocalStore.queryRows: Data for table "${table}" is not an array`);
            resolve([]);
            return;
          }

          const filtered = rows.filter(filterFn);
          console.log(`✅ LocalStore.queryRows: Found ${filtered.length} rows in "${table}"`);
          resolve(filtered);
        } catch (parseErr) {
          console.error(`Failed to parse table "${table}":`, parseErr.message);
          resolve([]);
        }
      } catch (err) {
        console.error(`LocalStore.queryRows error for table "${table}":`, err.message);
        resolve([]);
      }
    });
  },

  /**
   * Update a row in a table (async)
   * @param {string} table - Table name
   * @param {string} id - Row ID
   * @param {object} patch - Updates to apply
   * @returns {Promise<object|null>} - Updated row or null
   */
  updateRow: async (table, id, patch) => {
    return new Promise((resolve) => {
      try {
        if (typeof localStorage === 'undefined') {
          console.warn(`LocalStore.updateRow: localStorage not available`);
          resolve(null);
          return;
        }

        const tableKey = `table_${table}`;
        const data = localStorage.getItem(tableKey);

        if (!data) {
          console.warn(`LocalStore.updateRow: No data found for table "${table}"`);
          resolve(null);
          return;
        }

        try {
          let rows = JSON.parse(data);
          if (!Array.isArray(rows)) {
            resolve(null);
            return;
          }

          const index = rows.findIndex(r => r.id === id);
          if (index === -1) {
            console.warn(`LocalStore.updateRow: Row ${id} not found in "${table}"`);
            resolve(null);
            return;
          }

          rows[index] = { ...rows[index], ...patch };
          localStorage.setItem(tableKey, JSON.stringify(rows));
          console.log(`✅ LocalStore.updateRow: Updated ${id} in "${table}"`);
          resolve(rows[index]);
        } catch (parseErr) {
          console.error(`Failed to parse table "${table}":`, parseErr.message);
          resolve(null);
        }
      } catch (err) {
        console.error(`LocalStore.updateRow error:`, err.message);
        resolve(null);
      }
    });
  },

  /**
   * Delete a row from a table (async)
   * @param {string} table - Table name
   * @param {string} id - Row ID
   * @returns {Promise<void>}
   */
  deleteRow: async (table, id) => {
    return new Promise((resolve) => {
      try {
        if (typeof localStorage === 'undefined') {
          console.warn(`LocalStore.deleteRow: localStorage not available`);
          resolve();
          return;
        }

        const tableKey = `table_${table}`;
        const data = localStorage.getItem(tableKey);

        if (!data) {
          resolve();
          return;
        }

        try {
          let rows = JSON.parse(data);
          if (!Array.isArray(rows)) {
            resolve();
            return;
          }

          const filtered = rows.filter(r => r.id !== id);
          localStorage.setItem(tableKey, JSON.stringify(filtered));
          console.log(`✅ LocalStore.deleteRow: Deleted ${id} from "${table}"`);
          resolve();
        } catch (parseErr) {
          console.error(`Failed to parse table "${table}":`, parseErr.message);
          resolve();
        }
      } catch (err) {
        console.error(`LocalStore.deleteRow error:`, err.message);
        resolve();
      }
    });
  },

  // ========== SYNC/LEGACY METHODS ==========

  /**
   * Store a value in localStorage (sync version)
   * @param {string} key - Storage key
   * @param {string} value - JSON stringified value
   * @returns {boolean} - True if successful
   */
  set: (key, value) => {
    try {
      if (typeof localStorage === 'undefined') {
        console.warn('LocalStore.set: localStorage not available');
        return false;
      }

      if (!key || typeof key !== 'string') {
        console.error('LocalStore.set: Invalid key', key);
        return false;
      }

      if (typeof value !== 'string') {
        console.error('LocalStore.set: Value must be string, got', typeof value);
        return false;
      }

      localStorage.setItem(key, value);
      console.log(`✅ LocalStore.set: Stored "${key}" (${value.length} bytes)`);
      return true;
    } catch (err) {
      console.error('LocalStore.set error:', err.message);
      if (err.name === 'QuotaExceededError') {
        console.warn('LocalStore quota exceeded');
      }
      return false;
    }
  },

  /**
   * Retrieve a value from localStorage (sync version)
   * @param {string} key - Storage key
   * @returns {string|null} - Stored value or null
   */
  get: (key) => {
    try {
      if (typeof localStorage === 'undefined') {
        console.warn('LocalStore.get: localStorage not available');
        return null;
      }

      if (!key || typeof key !== 'string') {
        console.error('LocalStore.get: Invalid key', key);
        return null;
      }

      const value = localStorage.getItem(key);
      if (value) {
        console.log(`✅ LocalStore.get: Retrieved "${key}" (${value.length} bytes)`);
      }
      return value;
    } catch (err) {
      console.error('LocalStore.get error:', err.message);
      return null;
    }
  },

  /**
   * Delete a value from localStorage (supports both remove and delete names)
   * @param {string} key - Storage key
   * @returns {boolean} - True if successful
   */
  delete: (key) => {
    try {
      if (typeof localStorage === 'undefined') {
        console.warn('LocalStore.delete: localStorage not available');
        return false;
      }

      if (!key || typeof key !== 'string') {
        console.error('LocalStore.delete: Invalid key', key);
        return false;
      }

      localStorage.removeItem(key);
      console.log(`✅ LocalStore.delete: Removed "${key}"`);
      return true;
    } catch (err) {
      console.error('LocalStore.delete error:', err.message);
      return false;
    }
  },

  /**
   * Alias for delete() for backward compatibility
   */
  remove: (key) => {
    return LocalStore.delete(key);
  },

  /**
   * List all keys matching a prefix
   * @param {string} prefix - Key prefix to search
   * @returns {string[]} - Array of matching keys
   */
  listKeys: (prefix = '') => {
    try {
      if (typeof localStorage === 'undefined') {
        return [];
      }

      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!prefix || key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    } catch (err) {
      console.error('LocalStore.listKeys error:', err.message);
      return [];
    }
  },

  /**
   * Clear all storage
   * @returns {boolean} - True if successful
   */
  clear: () => {
    try {
      if (typeof localStorage === 'undefined') {
        return false;
      }
      localStorage.clear();
      console.log('✅ LocalStore.clear: Cleared all storage');
      return true;
    } catch (err) {
      console.error('LocalStore.clear error:', err.message);
      return false;
    }
  },

  /**
   * Get storage size information
   * @returns {object} - { used: number, available: number }
   */
  getSize: () => {
    try {
      if (typeof localStorage === 'undefined') {
        return { used: 0, available: 0 };
      }

      let used = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }
      return { used, available: 5242880 - used }; // 5MB limit typically
    } catch (err) {
      console.error('LocalStore.getSize error:', err.message);
      return { used: 0, available: 0 };
    }
  },
};

/**
 * ✅ GET LOCAL STORE: Returns LocalStore instance for backward compatibility
 * Used by tripsRepository.js and other modules
 * @returns {Promise<object>} - Returns LocalStore object
 */
export async function getLocalStore() {
  return LocalStore;
}

export default LocalStore;