/**
 * staffCallData — localStorage-backed "Digital Waiter Bell" storage (Phase 25).
 *
 * A staff call is a guest at a table asking for human assistance. It is
 * deliberately NOT an order and shares nothing with the order lifecycle:
 * creating, resolving, or ignoring a call never touches order.status,
 * order.paymentStatus, or anything in src/lib/customerOrders.js.
 *
 * Restaurant isolation:
 *   Exactly the same pattern as menuData.js / tableData.js / settingsData.js
 *   — every function takes a `restaurantSlug` as its first argument and
 *   reads/writes a key scoped to that restaurant alone
 *   (`pro_order_staff_calls:<slug>`). A call raised in one restaurant can
 *   never appear in another's list.
 *
 * Why localStorage (not sessionStorage like cart/customer session)?
 *   Same reasoning as customerOrders.js: the customer raises the call in
 *   their tab, and Admin/Cashier must see it from a *different* tab in the
 *   same browser. localStorage is shared across tabs on one origin, so it's
 *   the right frontend-only stand-in until a real backend exists.
 *
 * Live updates:
 *   Every write dispatches a "pro-order-staff-call-change" CustomEvent
 *   carrying { restaurantSlug } (same architecture as
 *   "pro-order-menu-change" / "pro-order-table-change"). src/lib/useStaffCalls.js
 *   subscribes to it for instant same-tab updates and additionally polls, so
 *   a call raised in another tab is noticed without a manual refresh.
 *
 * No seed data:
 *   Unlike menu/tables, this list legitimately starts empty — a restaurant
 *   with no pending calls is the normal state, not an unseeded one.
 *
 * Call shape:
 *   {
 *     id,                  // "call_..." — unique, never shown to the guest
 *     restaurantSlug,
 *     tableId, tableNumber,
 *     customerName,
 *     status,              // "open" | "resolved"
 *     createdAt, updatedAt,
 *
 *     // ── Phase 123.0 additions, all optional ────────────────────────────
 *     services,            // [{ serviceId, name, type, details? }] — a
 *                          //   SNAPSHOT, see below. Absent on legacy calls.
 *     resolvedBy,          // { id, name, role } — who pressed Resolve.
 *     resolvedAt,
 *   }
 *
 * Why `services` is a snapshot and not a list of ids:
 *   A staff call is a record of what a guest asked for at a moment in time.
 *   If it stored only `serviceId`, then renaming "Extra Napkins" to
 *   "Serviettes" would silently rewrite history, and DELETING the service
 *   would leave yesterday's call describing nothing at all. So the name and
 *   the response type are copied in at submission and never read back from
 *   the configuration again. The id is kept alongside purely for grouping
 *   and analytics later — never for display.
 *
 * Backward compatibility:
 *   Calls written before this phase have no `services` array. Every reader
 *   must treat that as "the guest asked for a member of staff, reason
 *   unspecified" and keep working — which is exactly what the old button
 *   meant. `callServices()` below is the one place that decision lives.
 */

const STAFF_CALLS_KEY_PREFIX = "pro_order_staff_calls";

export const STAFF_CALL_CHANGE_EVENT = "pro-order-staff-call-change";

export const STAFF_CALL_STATUS = { OPEN: "open", RESOLVED: "resolved" };

function staffCallsKey(restaurantSlug) {
  return `${STAFF_CALLS_KEY_PREFIX}:${restaurantSlug}`;
}

function genId() {
  return `call_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(new CustomEvent(STAFF_CALL_CHANGE_EVENT, { detail: { restaurantSlug } }));
  } catch {
    // no-op if window/CustomEvent unavailable (e.g. non-browser test runner)
  }
}

/** This restaurant's staff calls, newest first (never null). */
export function getStaffCalls(restaurantSlug) {
  try {
    const raw = localStorage.getItem(staffCallsKey(restaurantSlug));
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return [];
  }
}

/** Only the calls still waiting for staff, newest first. */
export function getOpenStaffCalls(restaurantSlug) {
  return getStaffCalls(restaurantSlug).filter((c) => c.status === STAFF_CALL_STATUS.OPEN);
}

/**
 * The oldest open call for one table, if any.
 *
 * It used to be the enforcement point for "one active call per table". That
 * rule is gone (see createAssistanceRequest for why two requests from one
 * table must be able to coexist), so this is now purely a query: "is anybody
 * at this table still waiting?".
 * @returns {object|null}
 */
export function getOpenCallForTable(restaurantSlug, tableId) {
  return (
    getStaffCalls(restaurantSlug).find(
      (c) => c.status === STAFF_CALL_STATUS.OPEN && c.tableId === tableId
    ) || null
  );
}

function saveStaffCalls(restaurantSlug, calls) {
  try {
    localStorage.setItem(staffCallsKey(restaurantSlug), JSON.stringify(calls));
  } catch {
    // localStorage unavailable — fail silently, matches customerOrders.js's pattern
  }
  notifyChange(restaurantSlug);
}

/**
 * How long two IDENTICAL submissions are treated as one.
 *
 * This is the replacement for the old one-open-call-per-table rule, and the
 * change is deliberate. Under the old rule a guest who asked for napkins and
 * then, two minutes later, needed the table cleared, got nothing: the second
 * request was swallowed because the first was still open. That is wrong — the
 * two asks are independent and staff need to see both.
 *
 * What genuinely needs guarding is the accident: a double-tap, a slow render,
 * the same submit arriving twice. That is identifiable without suppressing
 * real requests — same table, same services, a few seconds apart — so the
 * guard is narrowed to exactly that.
 */
const DUPLICATE_WINDOW_MS = 8000;

/** A comparable fingerprint of what was asked for, order-insensitive. */
function serviceSignature(services) {
  if (!Array.isArray(services) || !services.length) return "__bell__";
  return services
    .map((s) => `${s.serviceId}|${(s.details || "").trim()}`)
    .sort()
    .join("~");
}

/**
 * The service's name, frozen.
 *
 * It keeps BOTH languages rather than the one the guest happened to be
 * reading. A snapshot of only the guest's language would hand an Arabic row
 * to an English-speaking cashier, or the reverse — history has to be
 * immutable, not monolingual. A plain string is accepted too, because that
 * is what a legacy record holds and what getLocalizedText already resolves.
 */
function snapshotName(raw) {
  if (typeof raw === "string") return raw.trim().slice(0, 80);
  if (raw && typeof raw === "object") {
    const out = {};
    for (const code of ["en", "ar"]) {
      const text = typeof raw[code] === "string" ? raw[code].trim().slice(0, 80) : "";
      if (text) out[code] = text;
    }
    return out;
  }
  return "";
}

/**
 * Build one immutable snapshot row. `details` only survives on services that
 * actually collect it, so a stray field cannot smuggle text into a request
 * that was never meant to carry any.
 */
function snapshotService(raw) {
  const row = {
    serviceId: String(raw?.serviceId || ""),
    name: snapshotName(raw?.name),
    type: raw?.type === "instant" ? "instant" : "request",
  };
  const details = String(raw?.details || "").trim().slice(0, 300);
  if (details) row.details = details;
  return row;
}

/**
 * Raise ONE staff call covering everything a guest selected.
 *
 * Several selected services produce a single call on purpose: a guest who
 * wants napkins and the table cleared has one need for one visit, and
 * splitting it into three rows would have staff walking to the same table
 * three times. The `services` snapshot is what lets one record carry them.
 *
 * Instant Answers are rejected here rather than filtered silently — if one
 * reaches this function the caller has a bug worth seeing, and an answer the
 * guest already read must never summon anybody.
 *
 * @param {string} restaurantSlug
 * @param {object} data — { tableId, tableNumber, customerName, services }
 * @returns {{ok:true, call:object}
 *          | {ok:false, reason:"empty"}
 *          | {ok:false, reason:"instant_not_allowed"}
 *          | {ok:false, reason:"duplicate", call:object}}
 */
export function createAssistanceRequest(
  restaurantSlug,
  { tableId, tableNumber, customerName, services }
) {
  if (!Array.isArray(services) || services.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (services.some((s) => s?.type === "instant")) {
    return { ok: false, reason: "instant_not_allowed" };
  }

  const snapshot = services.map(snapshotService);
  const signature = serviceSignature(snapshot);
  const now = Date.now();

  /* The accidental-resubmit guard: identical ask, same table, still open,
     seconds old. Anything else is a real second request and goes through. */
  const twin = getStaffCalls(restaurantSlug).find(
    (c) =>
      c.status === STAFF_CALL_STATUS.OPEN &&
      c.tableId === tableId &&
      serviceSignature(c.services) === signature &&
      now - new Date(c.createdAt).getTime() < DUPLICATE_WINDOW_MS
  );
  if (twin) return { ok: false, reason: "duplicate", call: twin };

  const iso = new Date(now).toISOString();
  const call = {
    id: genId(),
    restaurantSlug,
    tableId,
    tableNumber,
    customerName: (customerName || "").trim(),
    status: STAFF_CALL_STATUS.OPEN,
    services: snapshot,
    createdAt: iso,
    updatedAt: iso,
  };

  saveStaffCalls(restaurantSlug, [...getStaffCalls(restaurantSlug), call]);
  return { ok: true, call };
}

/**
 * What one call asked for, for display.
 *
 * The single place that decides what a call with no `services` array means.
 * A legacy call — or one written by the plain bell above — is reported as an
 * unspecified request for staff, which is precisely what it was, instead of
 * rendering as an empty list or crashing a `.map`.
 *
 * @returns {Array<{serviceId:string, name:string, type:string, details?:string}>}
 */
export function callServices(call) {
  const list = call?.services;
  return Array.isArray(list) && list.length ? list : [];
}

/** True when this call predates the assistance system (or is a plain bell). */
export function isLegacyCall(call) {
  return callServices(call).length === 0;
}

/**
 * Mark a call handled. Admin/Cashier only — the customer UI never calls this.
 * Idempotent, same guard pattern as updateCustomerOrderStatus: resolving an
 * already-resolved call is a safe no-op rather than an error, so a
 * double-click can't corrupt anything.
 *
 * One call resolves as a whole, never service by service. A member of staff
 * walks to the table once and deals with what was asked; a partial state
 * would describe a trip that does not happen.
 *
 * `actor` is recorded when the caller knows who is signed in. It is stored
 * as a snapshot for the same reason the services are: renaming or removing a
 * staff account later must not rewrite who answered a call last Tuesday. It
 * is optional, and resolving without it stays valid — the record then simply
 * does not claim to know, rather than inventing a name.
 *
 * @param {string} restaurantSlug
 * @param {string} callId
 * @param {{id?:string, name?:string, role?:string}} [actor]
 * @returns {{ok:true, call:object} | {ok:false, reason:"not_found"}}
 */
export function resolveStaffCall(restaurantSlug, callId, actor) {
  const calls = getStaffCalls(restaurantSlug);
  const idx = calls.findIndex((c) => c.id === callId);
  if (idx === -1) return { ok: false, reason: "not_found" };

  if (calls[idx].status === STAFF_CALL_STATUS.RESOLVED) {
    /* Idempotent: the first resolver keeps the attribution. A second click
       must not overwrite who actually handled it. */
    return { ok: true, call: calls[idx] };
  }

  const nowIso = new Date().toISOString();
  const attribution =
    actor && (actor.id || actor.name)
      ? {
          resolvedBy: {
            id: actor.id ? String(actor.id) : undefined,
            name: String(actor.name || "").slice(0, 80),
            role: actor.role ? String(actor.role) : undefined,
          },
        }
      : {};

  const updated = {
    ...calls[idx],
    ...attribution,
    status: STAFF_CALL_STATUS.RESOLVED,
    resolvedAt: nowIso,
    updatedAt: nowIso,
  };
  saveStaffCalls(restaurantSlug, calls.map((c, i) => (i === idx ? updated : c)));
  return { ok: true, call: updated };
}

/**
 * Demo-only helper: wipe one restaurant's staff calls. Not wired into any
 * customer-facing UI. Only clears the given restaurant's key.
 * @param {string} restaurantSlug
 */
export function clearStaffCalls(restaurantSlug) {
  try {
    localStorage.removeItem(staffCallsKey(restaurantSlug));
  } catch {
    // ignore
  }
  notifyChange(restaurantSlug);
}
