// rider-app/src/offline/LocalStore.js
// FIXED: Added proper getLocalStore export for platform-agnostic storage adapter
// FIXED: Exports both adapter and individual functions for flexible usage

import { Platform } from 'react-native';

const adapter = Platform.OS === 'web'
  ? require('./adapters/indexedDbAdapter').default
  : require('./adapters/sqliteAdapter').default;

export default adapter;

// FIXED: Export getLocalStore() function that returns the adapter
// This is what tripsRepository.js and other files expect
export async function getLocalStore() {
  return adapter;
}

// Re-exported for convenience so call sites can do either
//   import LocalStore from '../offline/LocalStore'; LocalStore.kvGet(...)
// or
//   import { kvGet } from '../offline/LocalStore';
// or
//   import { getLocalStore } from '../offline/LocalStore'; const store = await getLocalStore();
export const {
  kvGet, kvSet,
  insertRow, queryRows, updateRow, deleteRow,
} = adapter;