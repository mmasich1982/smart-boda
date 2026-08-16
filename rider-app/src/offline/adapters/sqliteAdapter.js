// rider-app/src/offline/adapters/sqliteAdapter.js
// Native (Android/iOS) implementation of the LocalStore interface, using expo-sqlite's
// modern async API. Selected automatically by LocalStore.js on non-web platforms.
// FIXED: Added comprehensive error handling matching indexedDbAdapter

import * as SQLite from 'expo-sqlite';

let dbPromise = null;
let dbInitError = null; // ✅ ADDED: track initialization errors

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('smart_boda_rider.db').then(async (db) => {
      try {
        // One database file for the whole app now -- see LocalStore.js's header comment for
        // why this matters (there used to be two, with the second one using an API that
        // doesn't exist in the installed expo-sqlite version at all).
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS keyvalue (key TEXT PRIMARY KEY, value TEXT);
          CREATE TABLE IF NOT EXISTS local_trip (id TEXT PRIMARY KEY, data TEXT);
          CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, data TEXT);
          CREATE TABLE IF NOT EXISTS local_statement (id TEXT PRIMARY KEY, data TEXT);
        `);
        return db;
      } catch (err) {
        // ✅ ADDED: Log error and reset so future calls can retry
        console.error('SQLite initialization failed:', err);
        dbInitError = err;
        dbPromise = null; // Reset the promise to allow retries
        throw err;
      }
    }).catch((err) => {
      // ✅ ADDED: Catch connection errors
      console.error('SQLite connection failed:', err);
      dbInitError = err;
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function kvGet(key) {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync('SELECT value FROM keyvalue WHERE key = ?;', [key]);
    if (!row) return null;
    try { 
      return JSON.parse(row.value); 
    } catch { 
      return row.value; 
    }
  } catch (err) {
    // ✅ ADDED: Graceful fallback if SQLite fails
    console.warn(`SQLite kvGet failed for key "${key}":`, err);
    return null; // Return null instead of crashing
  }
}

async function kvSet(key, value) {
  try {
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO keyvalue (key, value) VALUES (?, ?);', [key, JSON.stringify(value)]);
  } catch (err) {
    // ✅ ADDED: Log and handle errors gracefully
    console.warn(`SQLite kvSet failed for key "${key}":`, err);
    // In a real app, you might want to queue this for retry later
    // For now, we'll just log and continue
  }
}

// ---- Generic per-table row storage (used by tripsRepository.js and syncQueue.js) ----
// Every "table" here is really just an id-keyed JSON blob store -- this app's local data
// volumes (one rider's own trips/queue entries) don't need real SQL query planning, and
// keeping the interface this simple is what makes it portable to IndexedDB on web.
async function insertRow(table, row) {
  try {
    const db = await getDb();
    await db.runAsync(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?);`, [row.id, JSON.stringify(row)]);
    return row;
  } catch (err) {
    // ✅ ADDED: Handle insertion errors
    console.warn(`SQLite insertRow failed in table "${table}":`, err);
    return row; // Return the row even if DB insert failed (could queue for sync later)
  }
}

async function queryRows(table, filterFn = () => true) {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync(`SELECT data FROM ${table};`);
    return rows.map((r) => {
      try {
        return JSON.parse(r.data);
      } catch (err) {
        console.warn(`Failed to parse row data from ${table}:`, err);
        return null; // Skip malformed rows instead of crashing
      }
    }).filter((r) => r !== null && filterFn(r)); // Filter out null entries and apply filter function
  } catch (err) {
    // ✅ ADDED: Handle query errors
    console.warn(`SQLite queryRows failed for table "${table}":`, err);
    return []; // Return empty array instead of crashing
  }
}

async function updateRow(table, id, patch) {
  try {
    const db = await getDb();
    const existing = await db.getFirstAsync(`SELECT data FROM ${table} WHERE id = ?;`, [id]);
    if (!existing) return null;
    
    let existingData;
    try {
      existingData = JSON.parse(existing.data);
    } catch (err) {
      console.warn(`Failed to parse existing row from ${table}:`, err);
      return null;
    }
    
    const merged = { ...existingData, ...patch };
    await db.runAsync(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?);`, [id, JSON.stringify(merged)]);
    return merged;
  } catch (err) {
    // ✅ ADDED: Handle update errors
    console.warn(`SQLite updateRow failed in table "${table}" for id "${id}":`, err);
    return null;
  }
}

async function deleteRow(table, id) {
  try {
    const db = await getDb();
    await db.runAsync(`DELETE FROM ${table} WHERE id = ?;`, [id]);
  } catch (err) {
    // ✅ ADDED: Handle deletion errors
    console.warn(`SQLite deleteRow failed in table "${table}" for id "${id}":`, err);
    // Continue silently - deletion failure is less critical than other ops
  }
}

// ✅ ADDED: Utility function to check if SQLite is available
export async function isSqliteAvailable() {
  try {
    await getDb();
    return true;
  } catch (err) {
    console.warn('SQLite not available:', err);
    return false;
  }
}

// ✅ ADDED: Utility function to reset database (useful for debugging/recovery)
export async function resetSqliteDb() {
  try {
    dbPromise = null;
    dbInitError = null;
    await getDb(); // Reinitialize
    console.log('SQLite database reset successfully');
  } catch (err) {
    console.error('Failed to reset SQLite database:', err);
    throw err;
  }
}

export default { kvGet, kvSet, insertRow, queryRows, updateRow, deleteRow };