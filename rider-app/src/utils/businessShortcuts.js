// rider-app/src/utils/businessShortcuts.js
// SMART BIZNA shortcut icons: from New Sale/Service, Record Purchase and Record Expense the person can jump straight to the other two without going
// back Home first. A shortcut opens the RECORD screen (not the hub), because that is where the person is going to key an amount.
//   Sales screen     -> Purchases, Expenses
//   Purchases screen -> Sale/Service, Expenses
//   Expenses screen  -> Sale/Service, Purchases
// A shortcut only shows when the person may open that screen: the same permissions as the Home tiles (businessHomeTiles), so a Sales/Service Person
// the Administrator has not allowed Purchases never sees the Purchases icon (the route guard and the server still enforce it).
export const SHORTCUTS = {
  sale: { key: 'sale', icon: '💰', label: 'Sale/Service', route: 'NewSale' },
  purchase: { key: 'purchase', icon: '🛒', label: 'Purchases', route: 'RecordPurchase' },
  expense: { key: 'expense', icon: '🧾', label: 'Expenses', route: 'RecordExpense' },
};
const ORDER = ['sale', 'purchase', 'expense'];
const ALLOWED = { sale: (t) => !!t.newSale, purchase: (t) => !!t.purchases, expense: (t) => !!t.expenses };

/** The shortcuts to draw on screen `current` ('sale' | 'purchase' | 'expense'), given businessHomeTiles(profile). Never includes the screen itself. */
export function shortcutsFor(current, tiles) {
  if (!tiles || tiles.locked) return [];
  return ORDER.filter((k) => k !== current && ALLOWED[k](tiles)).map((k) => SHORTCUTS[k]);
}
