import * as SQLite from 'expo-sqlite';

export async function openLocalDb() {
  const db = await SQLite.openDatabaseAsync('smart_boda_rider.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fare_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    );
  `);

  return db;
}

export async function addTrip(db, fareAmount, paymentMethod) {
  await db.runAsync(
    'INSERT INTO trips (fare_amount, payment_method, created_at, synced) VALUES (?, ?, ?, 0);',
    [fareAmount, paymentMethod, new Date().toISOString()]
  );
}

export async function getUnsyncedTrips(db) {
  return db.getAllAsync('SELECT * FROM trips WHERE synced = 0;');
}