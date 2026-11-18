// rider-app/src/utils/userTypeRouting.js
// SMART BIZNA routing and guard rules, kept out of the screens so they can be tested without a phone.
//   * which Home a signed-in person lands on (rider -> Smart Boda Home, business -> Smart Bizna Home, ADMIN -> Admin Home)
//   * which tiles and list items the Business Home shows to the Owner and to a Sales/Service Person
//   * the route guard: an Owner-only, Purchases or Expenses screen can never be opened by tile, link or saved route without permission
// The server enforces the same rules with 403 (backend/app/routers/business_ops.py); this is the phone's half.
// ADMIN APP: 'admin' is chosen only when the saved status says user_type === 'admin' (set by Setup My Profile / the admin sign-in). Nothing else changes.
export const homeKindFor = (status) => (status && status.user_type === 'admin' ? 'admin' : status && status.user_type === 'business' ? 'business' : 'rider');

export const OWNER_ROUTES = ['DailyTradeSummary', 'YesterdayNetProfit', 'BusinessFinancialPerformance', 'BusinessFinancialHistory', 'BusinessTransactions', 'StatementSetup', 'StatementPreview',
  'StatementList'];
export const PURCHASE_ROUTES = ['BusinessPurchases', 'RecordPurchase', 'PurchaseHistory', 'SupplierLipaDetails', 'SupplierLipaReport', 'RecordSupplierPayment', 'SupplierLipaAgeing'];
export const EXPENSE_ROUTES = ['BusinessExpenses', 'RecordExpense', 'ExpenseHistory'];
export const MULTI_BUSINESS_ROUTES = ['BusinessSwitcher', 'AllBusinesses'];       // MULTIPLE BUSINESSES: Owners only (staff belong to one business)

const isOwner = (p) => !!p && p.role === 'OWNER';

/** What the Business Home shows. `profile` is the saved /business/me answer (also correct offline). */
export function businessHomeTiles(profile) {
  const owner = isOwner(profile);
  const on = !!profile && profile.active !== false;
  return {
    newSale: on, lipaLater: on, salesToday: on,
    purchases: on && (owner || !!profile.can_see_purchases),
    supplierLipa: on && (owner || !!profile.can_see_purchases),                // the Lipa Later Suppliers Report tile follows the Purchases permission
    expenses: on && (owner || !!profile.can_see_expenses),
    performance: on && owner, dailySummary: on && owner, financialHistory: on && owner, yesterdayCard: on && owner,
    locked: !!profile && profile.active === false,
  };
}

/** Where a route should really go: the same route when allowed, 'BusinessHome' when not. */
export function guardBusinessRoute(routeName, profile) {
  if (!profile) return 'BusinessHome';
  if (profile.active === false) return 'BusinessHome';
  const t = businessHomeTiles(profile);
  if ((OWNER_ROUTES.includes(routeName) || MULTI_BUSINESS_ROUTES.includes(routeName)) && !t.performance) return 'BusinessHome';
  if (PURCHASE_ROUTES.includes(routeName) && !t.purchases) return 'BusinessHome';
  if (EXPENSE_ROUTES.includes(routeName) && !t.expenses) return 'BusinessHome';
  return routeName;
}
