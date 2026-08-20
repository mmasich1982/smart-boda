// rider-app/src/offline/LocalStore.js
// ✅ CORRECTED: Pure synchronous LocalStore using only sessionStorage
// For PWA with IndexedDB later, but safe fallback for now

class LocalStore {
  constructor() {
    this.prefix = 'smartboda_';
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      // Test if storage is available
      sessionStorage.setItem('__test__', '1');
      sessionStorage.removeItem('__test__');
      this.initialized = true;
      console.log('✅ LocalStore initialized with sessionStorage');
    } catch (err) {
      console.error('❌ LocalStore initialization failed:', err);
      this.initialized = false;
    }
  }

  // Set a value - SYNCHRONOUS
  set(key, value) {
    if (!key) {
      console.error('❌ LocalStore.set: Key is required');
      return false;
    }

    try {
      const prefixedKey = this.prefix + key;
      
      // Handle different value types
      let storedValue = value;
      if (typeof value === 'object') {
        storedValue = JSON.stringify(value);
      }

      sessionStorage.setItem(prefixedKey, String(storedValue));
      console.log(`✅ Stored: ${key} = ${String(storedValue).substring(0, 50)}...`);
      return true;
    } catch (err) {
      console.error(`❌ Failed to store ${key}:`, err);
      return false;
    }
  }

  // Get a value - SYNCHRONOUS (NOT a Promise)
  get(key) {
    if (!key) {
      console.error('❌ LocalStore.get: Key is required');
      return null;
    }

    try {
      const prefixedKey = this.prefix + key;
      const value = sessionStorage.getItem(prefixedKey);
      
      if (value) {
        console.log(`✅ Retrieved: ${key}`);
      } else {
        console.warn(`⚠️ Key not found: ${key}`);
      }
      
      return value;
    } catch (err) {
      console.error(`❌ Failed to retrieve ${key}:`, err);
      return null;
    }
  }

  // Remove a value
  remove(key) {
    if (!key) {
      console.error('❌ LocalStore.remove: Key is required');
      return false;
    }

    try {
      const prefixedKey = this.prefix + key;
      sessionStorage.removeItem(prefixedKey);
      console.log(`✅ Removed: ${key}`);
      return true;
    } catch (err) {
      console.error(`❌ Failed to remove ${key}:`, err);
      return false;
    }
  }

  // Clear all
  clear() {
    try {
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          sessionStorage.removeItem(key);
        }
      });
      console.log('✅ Cleared all stored data');
      return true;
    } catch (err) {
      console.error('❌ Failed to clear storage:', err);
      return false;
    }
  }

  // Get all keys
  getAllKeys() {
    try {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keys.push(key.substring(this.prefix.length));
        }
      }
      console.log(`✅ Found ${keys.length} stored keys`);
      return keys;
    } catch (err) {
      console.error('❌ Failed to get keys:', err);
      return [];
    }
  }

  // Test storage
  test() {
    try {
      const testKey = '__storage_test__';
      this.set(testKey, 'test_value');
      const value = this.get(testKey);
      this.remove(testKey);
      return value === 'test_value';
    } catch (err) {
      console.error('❌ Storage test failed:', err);
      return false;
    }
  }
}

// Create singleton instance
const store = new LocalStore();

export default LocalStore;