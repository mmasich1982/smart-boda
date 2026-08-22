/**
 * IndexedDB Adapter - Complete Implementation
 * Provides non-blocking, efficient offline storage with structured queries
 * 
 * BENEFITS OVER LOCALSTORAGE:
 * ✅ Larger storage capacity (50MB+)
 * ✅ Non-blocking async operations
 * ✅ Structured queries and indexes
 * ✅ Better performance for large datasets
 * ✅ Reliable persistence across sessions
 * 
 * Features:
 * - Key-value operations (get, set, delete)
 * - Table-based CRUD operations
 * - Query builders with indexes
 * - Transaction support
 * - Async/await everywhere
 */

const DB_NAME = 'SmartBodaOfflineDB';
const DB_VERSION = 1;

// Store definitions with indexes
const STORES = {
  trips: {
    keyPath: 'id',
    indexes: [
      { name: 'ts', keyPath: 'ts' },
      { name: 'method', keyPath: 'method' },
      { name: 'status', keyPath: 'status' },
      { name: 'date', keyPath: 'date' }
    ]
  },
  statements: {
    keyPath: 'id',
    indexes: [
      { name: 'ts', keyPath: 'ts' },
      { name: 'period', keyPath: 'period' },
      { name: 'status', keyPath: 'status' }
    ]
  },
  financialHistory: {
    keyPath: 'id',
    indexes: [
      { name: 'ts', keyPath: 'ts' },
      { name: 'type', keyPath: 'type' },
      { name: 'date', keyPath: 'date' }
    ]
  },
  syncQueue: {
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status' },
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'type', keyPath: 'type' }
    ]
  },
  keyValue: {
    keyPath: 'key'
  },
  lipaLater: {
    keyPath: 'id',
    indexes: [
      { name: 'ts', keyPath: 'ts' },
      { name: 'status', keyPath: 'status' }
    ]
  }
};

let dbInstance = null;

/**
 * Initialize IndexedDB and create object stores
 */
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('❌ IndexedDB initialization failed:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('✅ IndexedDB initialized successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('📦 Upgrading IndexedDB schema...');

      Object.entries(STORES).forEach(([storeName, config]) => {
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: config.keyPath });
          
          // Add indexes
          if (config.indexes) {
            config.indexes.forEach(index => {
              store.createIndex(index.name, index.keyPath, { unique: false });
            });
          }
          
          console.log(`✅ Created store: ${storeName}`);
        }
      });
    };
  });
}

/**
 * Get database instance
 */
export async function getDB() {
  if (!dbInstance) {
    await initializeDatabase();
  }
  return dbInstance;
}

/**
 * KEY-VALUE OPERATIONS
 */

export async function kvSet(key, value) {
  try {
    const db = await getDB();
    const tx = db.transaction(['keyValue'], 'readwrite');
    const store = tx.objectStore('keyValue');
    
    await new Promise((resolve, reject) => {
      const req = store.put({ key, value, updatedAt: Date.now() });
      req.onsuccess = () => {
        console.log(`✅ kvSet: Stored "${key}"`);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ kvSet error for "${key}":`, err);
    throw err;
  }
}

export async function kvGet(key) {
  try {
    const db = await getDB();
    const tx = db.transaction(['keyValue'], 'readonly');
    const store = tx.objectStore('keyValue');
    
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result ? req.result.value : null;
        console.log(`✅ kvGet: Retrieved "${key}"`);
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ kvGet error for "${key}":`, err);
    throw err;
  }
}

export async function kvDelete(key) {
  try {
    const db = await getDB();
    const tx = db.transaction(['keyValue'], 'readwrite');
    const store = tx.objectStore('keyValue');
    
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => {
        console.log(`✅ kvDelete: Deleted "${key}"`);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ kvDelete error for "${key}":`, err);
    throw err;
  }
}

/**
 * TABLE OPERATIONS
 */

export async function insertRow(tableName, row) {
  try {
    if (!row.id) {
      throw new Error('Row must have an id property');
    }

    const db = await getDB();
    const tx = db.transaction([tableName], 'readwrite');
    const store = tx.objectStore(tableName);
    
    return new Promise((resolve, reject) => {
      const req = store.put({ ...row, createdAt: Date.now(), updatedAt: Date.now() });
      req.onsuccess = () => {
        console.log(`✅ insertRow: Added ${row.id} to ${tableName}`);
        resolve(row);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ insertRow error for ${tableName}:`, err);
    throw err;
  }
}

export async function getRow(tableName, id) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readonly');
    const store = tx.objectStore(tableName);
    
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const result = req.result || null;
        console.log(`✅ getRow: Retrieved ${id} from ${tableName}`);
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ getRow error for ${tableName}/${id}:`, err);
    throw err;
  }
}

export async function updateRow(tableName, id, updates) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readwrite');
    const store = tx.objectStore(tableName);
    
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      
      getReq.onsuccess = () => {
        const row = getReq.result;
        if (!row) {
          reject(new Error(`Row ${id} not found in ${tableName}`));
          return;
        }
        
        const updated = { ...row, ...updates, updatedAt: Date.now() };
        const putReq = store.put(updated);
        
        putReq.onsuccess = () => {
          console.log(`✅ updateRow: Updated ${id} in ${tableName}`);
          resolve(updated);
        };
        putReq.onerror = () => reject(putReq.error);
      };
      
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.error(`❌ updateRow error for ${tableName}/${id}:`, err);
    throw err;
  }
}

export async function deleteRow(tableName, id) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readwrite');
    const store = tx.objectStore(tableName);
    
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => {
        console.log(`✅ deleteRow: Deleted ${id} from ${tableName}`);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ deleteRow error for ${tableName}/${id}:`, err);
    throw err;
  }
}

/**
 * QUERY OPERATIONS
 */

export async function queryRows(tableName, filterFn) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readonly');
    const store = tx.objectStore(tableName);
    
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      
      req.onsuccess = () => {
        const allRows = req.result || [];
        const filtered = filterFn ? allRows.filter(filterFn) : allRows;
        console.log(`✅ queryRows: Found ${filtered.length} rows in ${tableName}`);
        resolve(filtered);
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ queryRows error for ${tableName}:`, err);
    throw err;
  }
}

export async function queryByIndex(tableName, indexName, value) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readonly');
    const store = tx.objectStore(tableName);
    const index = store.index(indexName);
    
    return new Promise((resolve, reject) => {
      const req = index.getAll(value);
      
      req.onsuccess = () => {
        const results = req.result || [];
        console.log(`✅ queryByIndex: Found ${results.length} rows matching ${indexName}=${value}`);
        resolve(results);
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ queryByIndex error for ${tableName}/${indexName}:`, err);
    throw err;
  }
}

export async function queryByRange(tableName, indexName, lowerBound, upperBound) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readonly');
    const store = tx.objectStore(tableName);
    const index = store.index(indexName);
    
    return new Promise((resolve, reject) => {
      const range = IDBKeyRange.bound(lowerBound, upperBound, false, false);
      const req = index.getAll(range);
      
      req.onsuccess = () => {
        const results = req.result || [];
        console.log(`✅ queryByRange: Found ${results.length} rows in range [${lowerBound}, ${upperBound}]`);
        resolve(results);
      };
      
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ queryByRange error:`, err);
    throw err;
  }
}

/**
 * BATCH OPERATIONS
 */

export async function batchInsert(tableName, rows) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readwrite');
    const store = tx.objectStore(tableName);
    
    return new Promise((resolve, reject) => {
      let count = 0;
      
      rows.forEach(row => {
        const req = store.put({ ...row, createdAt: Date.now(), updatedAt: Date.now() });
        req.onsuccess = () => {
          count++;
          if (count === rows.length) {
            console.log(`✅ batchInsert: Added ${count} rows to ${tableName}`);
            resolve(count);
          }
        };
        req.onerror = () => reject(req.error);
      });
      
      if (rows.length === 0) {
        resolve(0);
      }
    });
  } catch (err) {
    console.error(`❌ batchInsert error for ${tableName}:`, err);
    throw err;
  }
}

/**
 * CLEAR ALL DATA
 */

export async function clearStore(tableName) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readwrite');
    const store = tx.objectStore(tableName);
    
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => {
        console.log(`✅ clearStore: Cleared ${tableName}`);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`❌ clearStore error for ${tableName}:`, err);
    throw err;
  }
}

/**
 * DATABASE STATISTICS
 */

export async function getStoreStats(tableName) {
  try {
    const db = await getDB();
    const tx = db.transaction([tableName], 'readonly');
    const store = tx.objectStore(tableName);
    
    return new Promise((resolve, reject) => {
      const countReq = store.count();
      
      countReq.onsuccess = () => {
        resolve({
          tableName,
          recordCount: countReq.result,
          timestamp: Date.now()
        });
      };
      
      countReq.onerror = () => reject(countReq.error);
    });
  } catch (err) {
    console.error(`❌ getStoreStats error for ${tableName}:`, err);
    throw err;
  }
}

export async function getAllStats() {
  try {
    const stats = {};
    
    for (const storeName of Object.keys(STORES)) {
      stats[storeName] = await getStoreStats(storeName);
    }
    
    console.log('✅ getAllStats:', stats);
    return stats;
  } catch (err) {
    console.error('❌ getAllStats error:', err);
    throw err;
  }
}

export default {
  kvSet,
  kvGet,
  kvDelete,
  insertRow,
  getRow,
  updateRow,
  deleteRow,
  queryRows,
  queryByIndex,
  queryByRange,
  batchInsert,
  clearStore,
  getStoreStats,
  getAllStats,
  getDB,
  DB_NAME,
  DB_VERSION,
  STORES
};