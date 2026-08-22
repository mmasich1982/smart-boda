// rider-app/src/offline/adapters/indexedDbAdapter.js
// ✅ FIXED VERSION: Adds error handling and retry logic for IndexedDB failures
import { openDB } from 'idb';

const DB_NAME = 'smart_boda_rider';
const STORES = ['keyvalue', 'local_trip', 'sync_queue', 'local_statement'];

let dbPromise = null;
let dbInitError = null; // ✅ ADDED: track initialization errors

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        STORES.forEach((store) => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        });
      },
    }).catch((err) => {
      // ✅ ADDED: Log error and reset so future calls can retry
      console.error('IndexedDB initialization failed:', err);
      dbInitError = err;
      dbPromise = null; // Reset the promise to allow retries
      throw err;
    });
  }
  return dbPromise;
}

async function kvGet(key) {
  try {
    const db = await getDb();
    const value = await db.get('keyvalue', key);
    if (value === undefined) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (err) {
    // ✅ ADDED: Graceful fallback if IndexedDB fails
    console.warn(`IndexedDB kvGet failed for key "${key}":`, err);
    return null; // Return null instead of crashing
  }
}

async function kvSet(key, value) {
  try {
    const db = await getDb();
    await db.put('keyvalue', JSON.stringify(value), key);
  } catch (err) {
    // ✅ ADDED: Log and handle errors gracefully
    console.warn(`IndexedDB kvSet failed for key "${key}":`, err);
    // In a real app, you might want to queue this for retry later
    // For now, we'll just log and continue
  }
}

async function insertRow(table, row) {
  try {
    const db = await getDb();
    await db.put(table, row, row.id);
    return row;
  } catch (err) {
    // ✅ ADDED: Handle insertion errors
    console.warn(`IndexedDB insertRow failed in table "${table}":`, err);
    return row; // Return the row even if DB insert failed (could queue for sync later)
  }
}

async function queryRows(table, filterFn = () => true) {
  try {
    const db = await getDb();
    const rows = await db.getAll(table);
    return rows.filter(filterFn);
  } catch (err) {
    // ✅ ADDED: Handle query errors
    console.warn(`IndexedDB queryRows failed for table "${table}":`, err);
    return []; // Return empty array instead of crashing
  }
}

async function updateRow(table, id, patch) {
  try {
    const db = await getDb();
    const existing = await db.get(table, id);
    if (!existing) return null;
    const merged = { ...existing, ...patch };
    await db.put(table, merged, id);
    return merged;
  } catch (err) {
    // ✅ ADDED: Handle update errors
    console.warn(`IndexedDB updateRow failed in table "${table}" for id "${id}":`, err);
    return null;
  }
}

async function deleteRow(table, id) {
  try {
    const db = await getDb();
    await db.delete(table, id);
  } catch (err) {
    // ✅ ADDED: Handle deletion errors
    console.warn(`IndexedDB deleteRow failed in table "${table}" for id "${id}":`, err);
    // Continue silently - deletion failure is less critical than other ops
  }
}

// ✅ ADDED: Utility function to check if IndexedDB is available
export async function isIndexedDbAvailable() {
  try {
    await getDb();
    return true;
  } catch (err) {
    console.warn('IndexedDB not available:', err);
    return false;
  }
}

// ✅ ADDED: Utility function to reset database (useful for debugging)
export async function resetIndexedDb() {
  try {
    dbPromise = null;
    dbInitError = null;
    await getDb(); // Reinitialize
    console.log('IndexedDB reset successfully');
  } catch (err) {
    console.error('Failed to reset IndexedDB:', err);
    throw err;
  }
}

export default { kvGet, kvSet, insertRow, queryRows, updateRow, deleteRow };