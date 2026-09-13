/**
 * permissions — Role → Permission Set → authorization.
 *
 * Phase 95.1 (Unit 13).
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * Until this phase, authorization was twelve separate `session.role ===
 * "admin"` comparisons plus one array of page keys (ADMIN_ONLY_NAV_KEYS).
 * That worked, but it encoded the ANSWER ("admin") rather than the QUESTION
 * ("may this person cancel an order?"), so every new role meant revisiting
 * every call site, and a reader could not tell what a Cashier was allowed to
 * do without reading the whole admin tree.
 *
 * Now each role names a set of capabilities, and every check asks about a
 * capability. Adding a Manager later is a new entry in ROLE_PERMISSIONS and
 * nothing else — no call site changes, no schema redesign. (Manager is
 * deliberately NOT defined here; this phase does not ship it.)
 *
 * ── THE THREE LAYERS STAY THREE LAYERS ────────────────────────────────────
 * Hiding a nav button is a UX nicety, not access control. All three layers
 * now read THIS module, so they cannot drift apart the way a hand-maintained
 * nav list and a hand-maintained guard could:
 *
 *   1. navigation visibility  AdminLayout    → PAGE_PERMISSION
 *   2. page access            App.jsx guard  → PAGE_PERMISSION
 *   3. actions inside a page  each screen    → can(session, "...")
 *
 * Layer 2 is the one that actually decides what renders. Layers 1 and 3 exist
 * so a user is never shown a control that would be refused.
 *
 * ── KITCHEN IS NOT MODELLED HERE ──────────────────────────────────────────
 * Kitchen is a shared-device PIN session with its own route and its own
 * board; it never mounts the admin shell, so it has no entry in this module
 * and its architecture is untouched by this phase.
 */

/* ── The capability vocabulary ────────────────────────────────────────────
   Named <area>.<action>. Grouped by the surface they govern so the Cashier
   set below can be read as a job description rather than a diff. */
export const PERMISSIONS = {
  OVERVIEW_VIEW: "overview.view",

  ORDERS_VIEW: "orders.view",
  ORDERS_MARK_PAID: "orders.markPaid",
  ORDERS_DELIVER: "orders.deliver",
  ORDERS_CANCEL: "orders.cancel",

  STAFF_CALLS_VIEW: "staffCalls.view",
  STAFF_CALLS_RESOLVE: "staffCalls.resolve",

  BUSY_MODE_VIEW: "busyMode.view",
  BUSY_MODE_CHANGE: "busyMode.change",

  ACCEPTING_ORDERS_VIEW: "acceptingOrders.view",
  ACCEPTING_ORDERS_CHANGE: "acceptingOrders.change",

  MENU_VIEW: "menu.view",
  PRODUCTS_TOGGLE_AVAILABILITY: "products.toggleAvailability",
  PRODUCTS_CREATE: "products.create",
  PRODUCTS_EDIT: "products.edit",
  PRODUCTS_DELETE: "products.delete",

  CATEGORIES_VIEW: "categories.view",
  CATEGORIES_TOGGLE_AVAILABILITY: "categories.toggleAvailability",
  CATEGORIES_CREATE: "categories.create",
  CATEGORIES_EDIT: "categories.edit",
  CATEGORIES_DELETE: "categories.delete",
  CATEGORIES_REORDER: "categories.reorder",
  CATEGORIES_MANAGE_SCHEDULE: "categories.manageSchedule",

  FEEDBACK_VIEW: "feedback.view",
  TABLES_ACCESS_MANAGE: "tablesAccess.manage",
  SETTINGS_MANAGE: "settings.manage",
};

const P = PERMISSIONS;

/* ── The operational core ─────────────────────────────────────────────────
   Overview, Live Orders and Staff Calls, in full. Phase 95.1 makes Admin and
   Cashier EQUAL here — same information, same controls, same actions — so
   the set is declared once and spread into both roles. If these two lists
   ever diverge again it will be a deliberate edit to this constant, not an
   accident in a screen. */
const OPERATIONAL_PERMISSIONS = [
  P.OVERVIEW_VIEW,

  P.ORDERS_VIEW,
  P.ORDERS_MARK_PAID,
  P.ORDERS_DELIVER,
  P.ORDERS_CANCEL,

  P.STAFF_CALLS_VIEW,
  P.STAFF_CALLS_RESOLVE,

  /* Overview's operational controls. Previously Busy Mode let Admin edit the
     prep minutes while Cashier only got the toggle, and Accepting Orders was
     hidden from Cashier entirely. Both restrictions are removed: an Overview
     control is either shared or it does not belong on a shared Overview. */
  P.BUSY_MODE_VIEW,
  P.BUSY_MODE_CHANGE,
  P.ACCEPTING_ORDERS_VIEW,
  P.ACCEPTING_ORDERS_CHANGE,
];

/* Reading the menu and flipping what is being served today is service work,
   not configuration — a cashier 86's a dish without being handed the price
   and customization editors. */
const SERVICE_AVAILABILITY_PERMISSIONS = [
  P.MENU_VIEW,
  P.PRODUCTS_TOGGLE_AVAILABILITY,
  P.CATEGORIES_VIEW,
  P.CATEGORIES_TOGGLE_AVAILABILITY,
];

/* Everything that shapes the restaurant rather than running today's service. */
const MANAGEMENT_PERMISSIONS = [
  P.PRODUCTS_CREATE,
  P.PRODUCTS_EDIT,
  P.PRODUCTS_DELETE,

  P.CATEGORIES_CREATE,
  P.CATEGORIES_EDIT,
  P.CATEGORIES_DELETE,
  P.CATEGORIES_REORDER,
  P.CATEGORIES_MANAGE_SCHEDULE,

  P.FEEDBACK_VIEW,
  P.TABLES_ACCESS_MANAGE,
  P.SETTINGS_MANAGE,
];

/**
 * Role → the capabilities it holds.
 *
 * Admin = operational + availability + management (i.e. everything it had).
 * Cashier = operational + availability, and nothing from management.
 */
export const ROLE_PERMISSIONS = {
  admin: [
    ...OPERATIONAL_PERMISSIONS,
    ...SERVICE_AVAILABILITY_PERMISSIONS,
    ...MANAGEMENT_PERMISSIONS,
  ],
  cashier: [...OPERATIONAL_PERMISSIONS, ...SERVICE_AVAILABILITY_PERMISSIONS],
};

/* Sets, built once — `can` runs on every render of every nav item. */
const ROLE_PERMISSION_SETS = Object.fromEntries(
  Object.entries(ROLE_PERMISSIONS).map(([role, list]) => [role, new Set(list)])
);

/**
 * The permission a given admin page requires to be navigated to or rendered.
 * ONE map, consumed by the nav filter and the route guard alike — the single
 * source of truth that ADMIN_ONLY_NAV_KEYS used to be, expressed as
 * capabilities instead of as a deny-list of page keys.
 */
export const PAGE_PERMISSION = {
  overview: P.OVERVIEW_VIEW,
  liveOrders: P.ORDERS_VIEW,
  staffCalls: P.STAFF_CALLS_VIEW,
  menu: P.MENU_VIEW,
  categories: P.CATEGORIES_VIEW,
  feedback: P.FEEDBACK_VIEW,
  tables: P.TABLES_ACCESS_MANAGE,
  settings: P.SETTINGS_MANAGE,
};

/** The page every unauthorized or unknown destination falls back to. */
export const FALLBACK_PAGE = "overview";

/**
 * Does this session hold this capability?
 *
 * Unknown role, missing session or unknown permission all answer false —
 * authorization fails closed, never open.
 *
 * @param {{role?: string}|null|undefined} session
 * @param {string} permission — a value from PERMISSIONS
 * @returns {boolean}
 */
export function can(session, permission) {
  const set = ROLE_PERMISSION_SETS[session?.role];
  return set ? set.has(permission) : false;
}

/**
 * May this session open this admin page?
 * A page with no entry in PAGE_PERMISSION is treated as unreachable.
 *
 * @param {{role?: string}|null|undefined} session
 * @param {string} page — an adminPage key
 * @returns {boolean}
 */
export function canViewPage(session, page) {
  const required = PAGE_PERMISSION[page];
  return required ? can(session, required) : false;
}

/**
 * Every permission a role holds — for debugging and for tests that assert a
 * role's surface has not silently grown.
 *
 * @param {string} role
 * @returns {string[]}
 */
export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[role] || [])];
}
