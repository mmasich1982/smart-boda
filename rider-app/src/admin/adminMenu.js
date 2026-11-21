// rider-app/src/admin/adminMenu.js
// ADMIN APP: the Administrator console's sidebar, turned into TILES for a phone. One list drives the Admin Home, every menu screen and the route guard.
//   Home      -> one tile per MENU (Dashboard, Manage Riders, Manage Businesses, Manage Groups)
//   Menu      -> one tile per SUB MENU of that menu (the console's sidebar links)
//   Sub menu  -> the screen (same data, same server routes as the console)
// A menu with only ONE sub menu opens its screen at once (no screen with a single tile on it): see singleRouteOf().
// Every console sidebar entry is here; nothing is added and nothing dropped (admin-console/src/components/Sidebar.jsx).
const ALL = ['super_admin', 'support_admin'];     // today every console page needs "any admin" (require_admin); a menu or item may list fewer roles later

export const ADMIN_MENUS = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard', roles: ALL, items: [
    { route: 'AdminDashboard', icon: '📊', label: 'Main Stats Dashboard', roles: ALL },
  ] },
  { key: 'riders', icon: '🏍️', label: 'Manage Riders', roles: ALL, items: [
    { route: 'ActiveRiders', icon: '✅', label: 'Active Riders List', roles: ALL },
    { route: 'IndividualRiders', icon: '🧍', label: 'Individual Riders', roles: ALL },
  ] },
  { key: 'businesses', icon: '🏪', label: 'Manage Businesses', roles: ALL, items: [
    { route: 'RegisterBusiness', icon: '➕', label: 'Register a Business', roles: ALL },
    { route: 'BusinessesList', icon: '📋', label: 'Businesses and Users', roles: ALL, badge: 'businesses_pending' },
    { route: 'BusinessesMap', icon: '🗺️', label: 'Businesses Map', roles: ALL },
    { route: 'TilePermissions', icon: '🔐', label: 'Tile Permissions', roles: ALL },
    { route: 'BusinessTypes', icon: '🏷️', label: 'Business Types', roles: ALL },
    { route: 'StatementRequests', icon: '🧾', label: 'Statement Requests', roles: ALL, badge: 'pending_statement_requests' },
  ] },
  { key: 'groups', icon: '👥', label: 'Manage Groups', roles: ALL, items: [
    { route: 'ManageGroups', icon: '👥', label: 'Manage Groups and Members', roles: ALL },
    { route: 'IncomingAdditions', icon: '📥', label: 'Incoming Group Member Additions', roles: ALL, badge: 'pending_slot_requests' },
  ] },
];

export const HOME_ROUTE = 'AdminHome';
export const MENU_ROUTE = 'AdminMenu';

const allowed = (entry, role) => !!entry && (!entry.roles || entry.roles.includes(role));

/** The menus (with only the sub menus this role may open) for the signed-in Administrator. A menu left with no sub menu disappears. */
export function menusFor(role) {
  return ADMIN_MENUS
    .filter((m) => allowed(m, role))
    .map((m) => ({ ...m, items: m.items.filter((i) => allowed(i, role)) }))
    .filter((m) => m.items.length > 0);
}

export const findMenu = (key, role) => menusFor(role).find((m) => m.key === key) || null;

/** The route to open at once for a menu that has a single sub menu; null when the menu needs its own tile screen. */
export const singleRouteOf = (menu) => (menu && menu.items.length === 1 ? menu.items[0].route : null);

/** Every screen route the Administrator may open (home and menu screens included). */
export function allowedRoutes(role) {
  const routes = [HOME_ROUTE, MENU_ROUTE];
  menusFor(role).forEach((m) => m.items.forEach((i) => routes.push(i.route)));
  return routes;
}

/** Where a route really goes: the same route when this role may open it, the Admin Home when not (tile, link or saved route alike). */
export const guardAdminRoute = (route, role) => (allowedRoutes(role).includes(route) ? route : HOME_ROUTE);

/** The small number on a tile (what is waiting for the Administrator). `stats` is GET /admin/app/dashboard. */
export const badgeOf = (item, stats) => (item && item.badge && stats ? Number(stats[item.badge]) || 0 : 0);
export const menuBadge = (menu, stats) => (menu ? menu.items.reduce((n, i) => n + badgeOf(i, stats), 0) : 0);

export const ROLE_LABEL = { super_admin: 'Super Admin', support_admin: 'Support Admin' };
export const roleLabel = (role) => ROLE_LABEL[role] || 'Administrator';
