/**
 * tableData — localStorage-backed table (and QR access) storage for the
 * demo, replacing the static TABLES array in src/data/mockRestaurant.js
 * with a real Admin Tables & QR Management interface (Phase 22).
 *
 * Restaurant isolation:
 *   Every function takes a `restaurantSlug` as its first argument and
 *   reads/writes a key scoped to that restaurant alone
 *   (`pro_order_tables:<slug>`) — the exact same pattern already used for
 *   the menu data layer (src/lib/menuData.js). Editing Lumière's tables can
 *   never touch another restaurant's tables.
 *
 * Why the seed data lives here (not mockRestaurant.js):
 *   mockRestaurant.js keeps only the truly static RESTAURANT record. Tables
 *   are now admin-editable data, so — like menu categories/items — they get
 *   seeded into localStorage once and read/written through here from then
 *   on. Every write dispatches a "pro-order-table-change" event (same
 *   architecture as "pro-order-menu-change"), so src/lib/useTableData.js
 *   can re-render any screen watching this restaurant's tables.
 *
 * Historical order safety:
 *   Orders already placed store their own tableId/tableNumber/qrToken
 *   snapshot at the moment the order was created (see
 *   src/lib/customerOrders.js) — renaming, deactivating, deleting, or
 *   regenerating a table's QR token here never rewrites historical order
 *   data, exactly like editing a menu item never rewrites past receipts.
 */

import { findRestaurantBySlug } from "../data/mockRestaurant.js";

const TABLES_KEY_PREFIX = "pro_order_tables";

export const TABLE_CHANGE_EVENT = "pro-order-table-change";

function tablesKey(restaurantSlug) {
  return `${TABLES_KEY_PREFIX}:${restaurantSlug}`;
}

/* The exact tables the app has shipped with since the QR-access foundation
   phase — same ids/qrTokens/isActive flags as the old static TABLES array
   in mockRestaurant.js, so every existing demo link (DemoSwitcher included)
   keeps working unchanged after this phase. restaurantSlug is attached at
   seed time (see seedIfEmpty), not baked in here, since this template is
   restaurant-agnostic. */
const SEED_TABLES_TEMPLATE = [
  { id: "tbl_1", tableNumber: 1, displayName: "Table 1", qrToken: "table-1-token", isActive: true,  sortOrder: 1 },
  { id: "tbl_2", tableNumber: 2, displayName: "Table 2", qrToken: "table-2-token", isActive: true,  sortOrder: 2 },
  { id: "tbl_3", tableNumber: 3, displayName: "Table 3", qrToken: "table-3-token", isActive: true,  sortOrder: 3 },
  { id: "tbl_4", tableNumber: 4, displayName: "Table 4", qrToken: "table-4-token", isActive: false, sortOrder: 4 },
];

function genId() {
  return `tbl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* qrToken needs to look plausible as a QR-encoded value and be trivially
   unique — a short random string is enough for this demo (no backend to
   coordinate uniqueness with, everything lives in one browser). */
function genQrTokenCandidate() {
  return `tbl-${Math.random().toString(36).slice(2, 10)}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(new CustomEvent(TABLE_CHANGE_EVENT, { detail: { restaurantSlug } }));
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

function seedIfEmpty(restaurantSlug) {
  try {
    if (localStorage.getItem(tablesKey(restaurantSlug)) === null) {
      const now = new Date().toISOString();
      const seeded = SEED_TABLES_TEMPLATE.map((t) => ({
        ...t,
        restaurantSlug,
        createdAt: now,
        updatedAt: now,
      }));
      localStorage.setItem(tablesKey(restaurantSlug), JSON.stringify(seeded));
    }
  } catch {
    // localStorage unavailable — getTables falls back to seed data directly
  }
}

/** This restaurant's tables, sorted by sortOrder (never null — falls back
    to the seed list, with restaurantSlug attached, if storage is unavailable). */
export function getTables(restaurantSlug) {
  seedIfEmpty(restaurantSlug);
  try {
    const raw = localStorage.getItem(tablesKey(restaurantSlug));
    const list = raw
      ? JSON.parse(raw)
      : SEED_TABLES_TEMPLATE.map((t) => ({ ...t, restaurantSlug }));
    return [...list].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  } catch {
    return SEED_TABLES_TEMPLATE.map((t) => ({ ...t, restaurantSlug }));
  }
}

export function getTableById(restaurantSlug, tableId) {
  return getTables(restaurantSlug).find((t) => t.id === tableId) || null;
}

export function getTableByToken(restaurantSlug, qrToken) {
  return getTables(restaurantSlug).find((t) => t.qrToken === qrToken) || null;
}

function saveTables(restaurantSlug, tables) {
  try {
    localStorage.setItem(tablesKey(restaurantSlug), JSON.stringify(tables));
  } catch {
    // localStorage unavailable — fail silently, matches menuData.js's pattern
  }
  notifyChange(restaurantSlug);
}

/* Generates a qrToken guaranteed unique within this restaurant's table list
   (retries on the astronomically unlikely collision). */
function genUniqueQrToken(restaurantSlug) {
  const existing = new Set(getTables(restaurantSlug).map((t) => t.qrToken));
  let candidate = genQrTokenCandidate();
  while (existing.has(candidate)) candidate = genQrTokenCandidate();
  return candidate;
}

function isTableNumberValid(tableNumber) {
  const n = Number(tableNumber);
  return Number.isInteger(n) && n > 0;
}

function isTableNumberTaken(restaurantSlug, tableNumber, excludeTableId) {
  return getTables(restaurantSlug).some(
    (t) => t.id !== excludeTableId && Number(t.tableNumber) === Number(tableNumber)
  );
}

/**
 * @param {string} restaurantSlug
 * @param {object} data — { tableNumber, displayName, isActive, sortOrder }
 * @returns {{ok:true, table:object} | {ok:false, reason:"invalid_number"|"duplicate_number"}}
 */
export function createTable(restaurantSlug, { tableNumber, displayName, isActive = true, sortOrder }) {
  if (!isTableNumberValid(tableNumber)) {
    return { ok: false, reason: "invalid_number" };
  }
  if (isTableNumberTaken(restaurantSlug, tableNumber, null)) {
    return { ok: false, reason: "duplicate_number" };
  }

  const tables = getTables(restaurantSlug);
  const maxSort = tables.reduce((max, t) => Math.max(max, t.sortOrder || 0), 0);
  const now = new Date().toISOString();

  const table = {
    id: genId(),
    restaurantSlug,
    tableNumber: Number(tableNumber),
    displayName: (displayName || "").trim() || `Table ${tableNumber}`,
    qrToken: genUniqueQrToken(restaurantSlug),
    isActive: !!isActive,
    sortOrder: sortOrder != null ? Number(sortOrder) : maxSort + 1,
    createdAt: now,
    updatedAt: now,
  };
  saveTables(restaurantSlug, [...tables, table]);
  return { ok: true, table };
}

/**
 * Edits table number/display name/active/sortOrder. Never changes qrToken —
 * that's a separate, explicit action (see regenerateQrToken) since changing
 * it silently during a routine edit would invalidate a QR code someone may
 * have already printed, without the clear warning that action deserves.
 *
 * @param {string} restaurantSlug
 * @param {string} tableId
 * @param {object} patch — any subset of { tableNumber, displayName, isActive, sortOrder }
 * @returns {{ok:true, table:object} | {ok:false, reason:"not_found"|"invalid_number"|"duplicate_number"}}
 */
export function updateTable(restaurantSlug, tableId, patch) {
  const tables = getTables(restaurantSlug);
  const idx = tables.findIndex((t) => t.id === tableId);
  if (idx === -1) return { ok: false, reason: "not_found" };

  if (patch.tableNumber !== undefined) {
    if (!isTableNumberValid(patch.tableNumber)) return { ok: false, reason: "invalid_number" };
    if (isTableNumberTaken(restaurantSlug, patch.tableNumber, tableId)) {
      return { ok: false, reason: "duplicate_number" };
    }
  }

  const updated = {
    ...tables[idx],
    ...patch,
    tableNumber: patch.tableNumber !== undefined ? Number(patch.tableNumber) : tables[idx].tableNumber,
    sortOrder: patch.sortOrder !== undefined ? Number(patch.sortOrder) : tables[idx].sortOrder,
    updatedAt: new Date().toISOString(),
  };
  // qrToken is never touched here regardless of what patch contains
  updated.qrToken = tables[idx].qrToken;

  const next = tables.map((t, i) => (i === idx ? updated : t));
  saveTables(restaurantSlug, next);
  return { ok: true, table: updated };
}

/**
 * The one explicit, separate action that changes a table's qrToken — the
 * Admin UI requires an in-app confirmation modal before calling this,
 * because it immediately invalidates the table's previous customer link.
 *
 * @param {string} restaurantSlug
 * @param {string} tableId
 * @returns {{ok:true, table:object} | {ok:false, reason:"not_found"}}
 */
export function regenerateQrToken(restaurantSlug, tableId) {
  const tables = getTables(restaurantSlug);
  const idx = tables.findIndex((t) => t.id === tableId);
  if (idx === -1) return { ok: false, reason: "not_found" };

  const updated = {
    ...tables[idx],
    qrToken: genUniqueQrToken(restaurantSlug),
    updatedAt: new Date().toISOString(),
  };
  const next = tables.map((t, i) => (i === idx ? updated : t));
  saveTables(restaurantSlug, next);
  return { ok: true, table: updated };
}

/**
 * Deletes a table. Never touches historical orders — they store their own
 * tableId/tableNumber/qrToken snapshot at the moment of purchase, completely
 * independent of the live table list (identical principle to deleting a
 * menu item never rewriting past orders).
 *
 * @param {string} restaurantSlug
 * @param {string} tableId
 * @returns {{ok:true} | {ok:false, reason:"not_found"}}
 */
export function deleteTable(restaurantSlug, tableId) {
  const tables = getTables(restaurantSlug);
  if (!tables.some((t) => t.id === tableId)) return { ok: false, reason: "not_found" };
  saveTables(restaurantSlug, tables.filter((t) => t.id !== tableId));
  return { ok: true };
}

/* ═══════════════════════════════ Customer QR access validation ═══════════ */

/**
 * Resolve a scanned QR into a table session — reads the current
 * restaurant-scoped table data (Phase 22) instead of a static array.
 * Returns { ok:true, restaurant, table } or { ok:false, reason }.
 * reason ∈ "restaurant" | "token" | "inactive".
 *
 * @param {string} restaurantSlug
 * @param {string} qrToken
 */
export function resolveTableAccess(restaurantSlug, qrToken) {
  const restaurant = findRestaurantBySlug(restaurantSlug);
  if (!restaurant) return { ok: false, reason: "restaurant" };

  const table = getTableByToken(restaurantSlug, qrToken);
  if (!table) return { ok: false, reason: "token" };
  if (!table.isActive) return { ok: false, reason: "inactive" };

  return { ok: true, restaurant, table };
}

/* Translation keys (+ English fallback) for each access-failure reason,
   used by every customer screen's InvalidView. "inactive" gets Phase 22's
   new polished message; the other two reuse the foundation-phase wording. */
export const ACCESS_REASON_KEY = {
  restaurant: "common.reasonRestaurant",
  token: "common.reasonToken",
  inactive: "common.tableUnavailable",
};
export const ACCESS_REASON_FALLBACK = {
  restaurant: "This restaurant link was not recognized.",
  token: "This table code was not recognized.",
  inactive: "This table is currently unavailable. Please ask a staff member for assistance.",
};

/**
 * Demo-only helper: wipe one restaurant's tables and re-seed. Not wired
 * into any customer-facing UI. Only clears the given restaurant's key.
 * @param {string} restaurantSlug
 */
export function resetTableData(restaurantSlug) {
  try {
    localStorage.removeItem(tablesKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
