// rider-app/__mocks__/expo-sqlite.js
// AUDIT FIX: expo-sqlite's native binding doesn't exist under plain Jest (no device/simulator
// is attached), so any test that touches LocalStore/db.js crashed with a native-module error --
// even tests that have nothing to do with persistence. This manual mock gives sqliteAdapter.js
// an in-memory implementation that satisfies the same async API shape, purely for tests.
const tables = {};

function ensureTable(name) {
  if (!tables[name]) tables[name] = new Map();
  return tables[name];
}

const fakeDb = {
  execAsync: async () => {},
  getFirstAsync: async (sql, params) => {
    const tableMatch = sql.match(/FROM (\w+)/i);
    const table = ensureTable(tableMatch ? tableMatch[1] : 'default');
    const key = params?.[0];
    if (!table.has(key)) return null;
    return sql.includes('SELECT value') ? { value: table.get(key) } : { data: table.get(key) };
  },
  getAllAsync: async (sql) => {
    const tableMatch = sql.match(/FROM (\w+)/i);
    const table = ensureTable(tableMatch ? tableMatch[1] : 'default');
    return Array.from(table.values()).map((data) => ({ data }));
  },
  runAsync: async (sql, params) => {
    const tableMatch = sql.match(/INTO (\w+)|FROM (\w+)/i);
    const table = ensureTable(tableMatch ? tableMatch[1] || tableMatch[2] : 'default');
    if (sql.startsWith('DELETE')) { table.delete(params[0]); return; }
    const [key, value] = params;
    table.set(key, value);
  },
};

module.exports = {
  openDatabaseAsync: async () => fakeDb,
};
