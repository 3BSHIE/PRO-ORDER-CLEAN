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
  { id: "tbl_1", tableNumber: 1, displayName: "Table 1", qrToken: "table-1-token", nfcToken: "table-1-nfc", isActive: true,  sortOrder: 1 },
  { id: "tbl_2", tableNumber: 2, displayName: "Table 2", qrToken: "table-2-token", nfcToken: "table-2-nfc", isActive: true,  sortOrder: 2 },
  { id: "tbl_3", tableNumber: 3, displayName: "Table 3", qrToken: "table-3-token", nfcToken: "table-3-nfc", isActive: true,  sortOrder: 3 },
  { id: "tbl_4", tableNumber: 4, displayName: "Table 4", qrToken: "table-4-token", nfcToken: "table-4-nfc", isActive: false, sortOrder: 4 },
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

/* Phase 93.2 — the NFC credential.
   A DIFFERENT prefix from qrToken on purpose: the two credentials live in
   the same URL slot, so a distinct shape makes them impossible to confuse in
   storage, in a log, or in the Admin UI — and it means a resolver can report
   which method a guest arrived by without a second lookup. */
function genNfcTokenCandidate() {
  return `nfc-${Math.random().toString(36).slice(2, 10)}`;
}

/* Phase 93.2 §6 — backfill NFC credentials onto tables that predate them.
   Operates on an already-parsed list rather than calling getTables(), which
   would recurse straight back into the seed/migrate path.

   Idempotent by construction: a table that already has an nfcToken is
   returned untouched, so this cannot mint a new credential on every read and
   cannot invalidate a tag that is already programmed. Uniqueness is checked
   against BOTH token namespaces, so a backfilled NFC credential can never
   collide with an existing QR one. */
function ensureNfcTokens(list) {
  const used = new Set();
  list.forEach((t) => {
    if (t && t.qrToken) used.add(t.qrToken);
    if (t && t.nfcToken) used.add(t.nfcToken);
  });
  let changed = false;
  const next = list.map((t) => {
    if (!t || t.nfcToken) return t;
    let candidate = genNfcTokenCandidate();
    while (used.has(candidate)) candidate = genNfcTokenCandidate();
    used.add(candidate);
    changed = true;
    return { ...t, nfcToken: candidate };
  });
  return { list: next, changed };
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
    const raw = localStorage.getItem(tablesKey(restaurantSlug));
    if (raw === null) {
      const now = new Date().toISOString();
      const seeded = SEED_TABLES_TEMPLATE.map((t) => ({
        ...t,
        restaurantSlug,
        createdAt: now,
        updatedAt: now,
      }));
      localStorage.setItem(tablesKey(restaurantSlug), JSON.stringify(seeded));
      return;
    }

    /* Phase 93.2 §6 — tables stored before NFC existed gain a credential
       here, once, in place. Everything else about the record is preserved:
       id, qrToken, isActive, names, timestamps, sortOrder. Deliberately a
       silent write with no change event — this runs inside a read, and
       notifying here would re-enter rendering components mid-read. It only
       ever fires on the first read after upgrading. */
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const { list, changed } = ensureNfcTokens(parsed);
    if (changed) localStorage.setItem(tablesKey(restaurantSlug), JSON.stringify(list));
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

/**
 * Phase 93.2 — resolve ANY table credential to its table, and say which
 * method it was.
 *
 * QR and NFC are two entry credentials for ONE table record (§5): there is
 * no "NFC table". A token matches at most one table and at most one method,
 * because the two namespaces are generated with different prefixes and
 * uniqueness is enforced across both.
 *
 * @returns {{table:object, method:"qr"|"nfc"}|null}
 */
export function getTableByAnyToken(restaurantSlug, token) {
  if (!token) return null;
  const tables = getTables(restaurantSlug);
  const qr = tables.find((t) => t.qrToken === token);
  if (qr) return { table: qr, method: "qr" };
  const nfc = tables.find((t) => t.nfcToken === token);
  if (nfc) return { table: nfc, method: "nfc" };
  return null;
}

/** QR-credential lookup. Kept for callers that specifically mean the QR
    credential; access resolution goes through getTableByAnyToken. */
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
/* Uniqueness is checked across BOTH credential namespaces, not just the one
   being minted: the two share a single URL slot, so a QR token that happened
   to equal an NFC token would make one table's credential resolve as the
   other's method. */
function usedTokens(restaurantSlug) {
  const set = new Set();
  getTables(restaurantSlug).forEach((t) => {
    if (t.qrToken) set.add(t.qrToken);
    if (t.nfcToken) set.add(t.nfcToken);
  });
  return set;
}

function genUniqueQrToken(restaurantSlug) {
  const existing = usedTokens(restaurantSlug);
  let candidate = genQrTokenCandidate();
  while (existing.has(candidate)) candidate = genQrTokenCandidate();
  return candidate;
}

function genUniqueNfcToken(restaurantSlug) {
  const existing = usedTokens(restaurantSlug);
  let candidate = genNfcTokenCandidate();
  while (existing.has(candidate)) candidate = genNfcTokenCandidate();
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
    /* §7 — a new table is NFC-ready at the data level the moment it exists,
       so a manager can program its tag without a second setup step. */
    nfcToken: genUniqueNfcToken(restaurantSlug),
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
  /* Neither credential is ever touched here, regardless of what the patch
     contains. Rotating one during a rename would invalidate a printed QR or
     a programmed NFC tag with none of the warning those actions deserve
     (§8) — each has its own explicit, confirmed action. */
  updated.qrToken = tables[idx].qrToken;
  updated.nfcToken = tables[idx].nfcToken;

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
    /* §14 — explicit, not merely inherited from the spread: regenerating the
       QR must never disturb a physical NFC tag that is already programmed
       and stuck to the table. The two credentials rotate independently. */
    nfcToken: tables[idx].nfcToken,
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

/**
 * Phase 93.2 §15 — rotate the NFC credential, and only that.
 *
 * The mirror of regenerateQrToken, deliberately a separate function rather
 * than a flag on one shared "regenerate": the two credentials exist to be
 * independently rotatable (§4), and a single entry point would make it far
 * too easy for a future caller to rotate both by accident.
 *
 * The printed QR is untouched, so a restaurant re-programming a tag does not
 * also have to reprint every stand. The table's id, name, active state and
 * order history are untouched for the same reasons regenerateQrToken leaves
 * them alone.
 *
 * @returns {{ok:true, table:object} | {ok:false, reason:"not_found"}}
 */
export function regenerateNfcToken(restaurantSlug, tableId) {
  const tables = getTables(restaurantSlug);
  const idx = tables.findIndex((t) => t.id === tableId);
  if (idx === -1) return { ok: false, reason: "not_found" };

  const updated = {
    ...tables[idx],
    nfcToken: genUniqueNfcToken(restaurantSlug),
    qrToken: tables[idx].qrToken,
    updatedAt: new Date().toISOString(),
  };
  const next = tables.map((t, i) => (i === idx ? updated : t));
  saveTables(restaurantSlug, next);
  return { ok: true, table: updated };
}

/* ═══════════════════════════════ Customer table access validation ════════ */

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

  /* Phase 74 §42 — the restaurant is carried on these two failures as well.
     Both mean "we know exactly which venue this is, the table is the
     problem", so the recovery screen can name the restaurant instead of
     showing an anonymous error. It is already resolved above; returning it
     costs nothing and adds no lookup. The "restaurant" failure above
     deliberately does not, because there genuinely is no venue to name.
     Existing callers read only .ok and .reason and are unaffected. */
  /* Phase 93.2 §10 — either credential opens the door, and both land on the
     same table record. accessMethod is reported for diagnostics and for the
     Admin side; no Customer screen branches on it, because after entry the
     journey is identical whichever way the guest arrived (§34). */
  const match = getTableByAnyToken(restaurantSlug, qrToken);
  if (!match) return { ok: false, reason: "token", restaurant };
  if (!match.table.isActive) {
    /* §39 — NFC does not get to bypass table status any more than QR does. */
    return { ok: false, reason: "inactive", restaurant, accessMethod: match.method };
  }

  return { ok: true, restaurant, table: match.table, accessMethod: match.method };
}

/**
 * Phase 93.1 — resolve a customer's access to a table, honouring an ALREADY
 * ESTABLISHED session.
 *
 * ── The bug this exists to fix ────────────────────────────────────────────
 * The QR token is an entry credential, not the owner of the journey. Every
 * customer screen resolved access from the token in the URL on every render,
 * so the moment an Admin regenerated a table's QR, a guest already seated and
 * ordering — whose browser still held the old URL — was thrown onto the
 * Invalid QR screen mid-meal. Phase 93 measured exactly that.
 *
 * ── What this rescues, and nothing more ──────────────────────────────────
 * ONLY the "token no longer recognised" failure, and only for a guest who
 * can prove the URL in their hands is the one they legitimately entered
 * with. Every one of these must hold:
 *
 *   · the direct resolution failed specifically on the TOKEN — a missing
 *     restaurant is never rescued (§4), and neither is an inactive table,
 *     which is re-checked below and still refused (§7/§18);
 *   · the session belongs to THIS restaurant (§4/§17);
 *   · the session names a guest, i.e. entry actually completed;
 *   · the session's own stored token equals the token in the URL. This is
 *     the load-bearing condition: it means the URL is the credential this
 *     guest entered with and which has since been rotated out from under
 *     them. A guest holding a session cannot walk up to an arbitrary or
 *     guessed URL and have it honoured (§23);
 *   · the session carries a tableId, and that table still exists here.
 *     Without it identity cannot be proven, so access is refused rather
 *     than guessed (§13).
 *
 * A session for Table 4 therefore never authorises Table 8: a valid Table 8
 * token resolves directly to Table 8, and the screens then compare the
 * session's tableId against the resolved table (§16).
 *
 * @param {string} restaurantSlug
 * @param {string} qrToken — the token from the URL
 * @param {object|null} session — getCustomerSession(), passed in rather than
 *   imported so this module keeps no dependency on customer storage.
 * @returns same shape as resolveTableAccess, plus `viaSession:true` when the
 *   established-session path was used.
 */
export function resolveCustomerAccess(restaurantSlug, qrToken, session) {
  const direct = resolveTableAccess(restaurantSlug, qrToken);
  if (direct.ok) return direct;
  if (direct.reason !== "token") return direct;

  if (!session) return direct;
  if (session.restaurantSlug !== restaurantSlug) return direct;
  if (!session.customerName) return direct;
  if (session.qrToken !== qrToken) return direct;
  if (!session.tableId) return direct;

  const table = getTableById(restaurantSlug, session.tableId);
  if (!table) return direct;

  /* An established session is continued access, never a bypass: a table the
     restaurant has deliberately closed still refuses, and still reports
     "inactive" so the guest gets the Inactive Table state rather than
     Invalid QR (§7). */
  if (!table.isActive) {
    return { ok: false, reason: "inactive", restaurant: direct.restaurant };
  }

  /* accessMethod is reported as "session", not "qr"/"nfc".

     This path is only reached when the URL token no longer matches EITHER
     current credential — it is the one that was rotated away. Comparing it
     against the live tokens therefore cannot say which method it originally
     was, and an earlier draft of this line quietly reported "qr" for a guest
     who had tapped an NFC tag. Measured and corrected: naming the path
     honestly is better than guessing a method for a diagnostic field. */
  return { ok: true, restaurant: direct.restaurant, table, viaSession: true, accessMethod: "session" };
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
