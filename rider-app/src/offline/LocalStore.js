// rider-app/src/offline/LocalStore.js
// ✅ Offline-First: Persistent local storage using IndexedDB (web) with sessionStorage fallback

const DB_NAME = 'SmartBodaDB';
const STORE_NAME = 'offline_store';
let db = null;
let useIndexedDB = false;

// Initialize IndexedDB for PWA
async function initializeIndexedDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB not available, falling back to sessionStorage');
      useIndexedDB = false;
      resolve();
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, 1);

      request.onerror = () => {
        console.warn('IndexedDB failed to open, using sessionStorage');
        useIndexedDB = false;
        resolve();
      };

      request.onsuccess = () => {
        db = request.result;
        useIndexedDB = true;
        console.log('✅ IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
    } catch (err) {
      console.warn('Failed to initialize IndexedDB:', err);
      useIndexedDB = false;
      resolve();
    }
  });
}

// Initialize on import
initializeIndexedDB();

const LocalStore = {
  set: (key, value) => {
    if (!key) {
      console.error('LocalStore.set: Key is required');
      return false;
    }

    try {
      if (useIndexedDB && db) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(value, key);

        return new Promise((resolve) => {
          transaction.oncomplete = () => {
            console.log(`✅ Stored offline: ${key}`);
            resolve(true);
          };
          transaction.onerror = () => {
            console.warn(`Failed to store in IndexedDB: ${key}, trying sessionStorage`);
            try {
              sessionStorage.setItem(key, value);
              resolve(true);
            } catch {
              resolve(false);
            }
          };
        });
      } else {
        // Fallback to sessionStorage
        try {
          sessionStorage.setItem(key, value);
          console.log(`✅ Stored in sessionStorage: ${key}`);
          return true;
        } catch (err) {
          console.error(`Failed to store key: ${key}`, err);
          return false;
        }
      }
    } catch (err) {
      console.error('LocalStore.set error:', err);
      return false;
    }
  },

  get: (key) => {
    if (!key) {
      console.error('LocalStore.get: Key is required');
      return null;
    }

    try {
      if (useIndexedDB && db) {
        return new Promise((resolve) => {
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(key);

          request.onsuccess = () => {
            if (request.result !== undefined) {
              console.log(`✅ Retrieved offline: ${key}`);
              resolve(request.result);
            } else {
              // Try sessionStorage as fallback
              const sessionValue = sessionStorage.getItem(key);
              if (sessionValue) {
                console.log(`✅ Retrieved from sessionStorage: ${key}`);
              }
              resolve(sessionValue);
            }
          };

          request.onerror = () => {
            console.warn(`IndexedDB get failed: ${key}, trying sessionStorage`);
            const sessionValue = sessionStorage.getItem(key);
            resolve(sessionValue);
          };
        });
      } else {
        // Fallback to sessionStorage
        const value = sessionStorage.getItem(key);
        if (value) {
          console.log(`✅ Retrieved from sessionStorage: ${key}`);
        }
        return value;
      }
    } catch (err) {
      console.error('LocalStore.get error:', err);
      return null;
    }
  },

  remove: (key) => {
    if (!key) {
      console.error('LocalStore.remove: Key is required');
      return false;
    }

    try {
      if (useIndexedDB && db) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(key);

        return new Promise((resolve) => {
          transaction.oncomplete = () => {
            sessionStorage.removeItem(key);
            resolve(true);
          };
          transaction.onerror = () => {
            sessionStorage.removeItem(key);
            resolve(false);
          };
        });
      } else {
        sessionStorage.removeItem(key);
        return true;
      }
    } catch (err) {
      console.error('LocalStore.remove error:', err);
      return false;
    }
  },

  clear: () => {
    try {
      if (useIndexedDB && db) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();

        return new Promise((resolve) => {
          transaction.oncomplete = () => {
            sessionStorage.clear();
            resolve(true);
          };
        });
      } else {
        sessionStorage.clear();
        return true;
      }
    } catch (err) {
      console.error('LocalStore.clear error:', err);
      return false;
    }
  },

  getAllKeys: () => {
    try {
      if (useIndexedDB && db) {
        return new Promise((resolve) => {
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.getAllKeys();

          request.onsuccess = () => {
            resolve(Array.from(request.result || []));
          };

          request.onerror = () => {
            resolve([]);
          };
        });
      } else {
        return Object.keys(sessionStorage);
      }
    } catch (err) {
      console.error('LocalStore.getAllKeys error:', err);
      return [];
    }
  },
};

export default LocalStore;