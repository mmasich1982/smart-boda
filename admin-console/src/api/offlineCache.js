import { openDB } from 'idb';

const DB_NAME = 'smart-boda-admin-cache';
const STORE_NAME = 'master-data';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function cacheMasterData(key, value) {
  const db = await getDB();
  await db.put(STORE_NAME, value, key);
}

export async function readCachedMasterData(key) {
  const db = await getDB();
  return db.get(STORE_NAME, key);
}
