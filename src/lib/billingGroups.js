/**
 * billingGroups — Phase 112.0
 *
 * Combined bills: a way to SETTLE several orders together, and nothing else.
 *
 * ── THE INVARIANT THIS MODULE EXISTS TO PROTECT ─────────────────────────
 * A combined bill is not an order. It creates no order, replaces no order,
 * and contributes nothing of its own to any count or total. It holds the IDS
 * of real orders, and every figure it shows while it is open is read back
 * from those orders. That is why nothing here stores a copy of an order, a
 * line item or a price: there is no second number that could drift from the
 * first.
 *
 * The one deliberate exception is settlement. Once a bill is paid it freezes
 * what was collected — the amount, the method, the moment, the member ids —
 * because a receipt must not change when a menu price does, and a
 * constituent order canceled tomorrow must not make yesterday's money
 * disappear.
 *
 * ── STORAGE ─────────────────────────────────────────────────────────────
 *   pro_order_billing_groups:<restaurantSlug>
 *
 * Per restaurant, in localStorage, beside the orders it references. This is
 * the same frontend-only persistence the rest of the product runs on: shared
 * between tabs of one browser, NOT between devices. Two cashiers on two
 * phones do not see each other's bills. See docs/BACKEND-ROADMAP.md — shared,
 * concurrency-safe billing is a backend requirement and is not implemented
 * here.
 */

import { getCustomerOrders } from "./customerOrders.js";

const GROUPS_KEY_PREFIX = "pro_order_billing_groups";
const GROUP_SEQ_KEY = "pro_order_billing_group_seq";

export const BILL_STATUS = { OPEN: "open", SETTLED: "settled" };

function storageKey(restaurantSlug) {
  return `${GROUPS_KEY_PREFIX}:${restaurantSlug}`;
}

/** Every billing group for one restaurant (never null). */
export function getBillingGroups(restaurantSlug) {
  try {
    const raw = localStorage.getItem(storageKey(restaurantSlug));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBillingGroups(restaurantSlug, groups) {
  try {
    localStorage.setItem(storageKey(restaurantSlug), JSON.stringify(groups));
  } catch {
    /* Storage unavailable — the write is lost rather than half-applied, and
       the screen re-reads the stored state on its next poll. */
  }
}

function nextGroupId() {
  let seq = 1;
  try {
    const raw = localStorage.getItem(GROUP_SEQ_KEY);
    seq = raw ? parseInt(raw, 10) + 1 : 1;
    localStorage.setItem(GROUP_SEQ_KEY, String(seq));
  } catch {
    seq = Date.now() % 100000;
  }
  return `BILL-${String(seq).padStart(4, "0")}`;
}

/* ── Reading ──────────────────────────────────────────────────────────── */

/** The open (unsettled) groups for a restaurant. */
export function getOpenGroups(restaurantSlug) {
  return getBillingGroups(restaurantSlug).filter((g) => g.status === BILL_STATUS.OPEN);
}

/**
 * The OPEN group an order currently belongs to, if any.
 *
 * An order may sit in at most one open group — this is the lookup every
 * eligibility check runs through, so that rule has one implementation.
 */
export function openGroupForOrder(restaurantSlug, orderId) {
  return getOpenGroups(restaurantSlug).find((g) => g.orderIds.includes(orderId)) || null;
}

/** Any group, open or settled, that lists this order. */
export function groupForOrder(restaurantSlug, orderId) {
  return getBillingGroups(restaurantSlug).find((g) => g.orderIds.includes(orderId)) || null;
}

/**
 * Can this order join an open combined bill?
 *
 * The rules, in one place: a real table (direct orders have none), unpaid,
 * not canceled, not already in another open group. Kitchen stage is
 * deliberately absent — a bill is about money, and a delivered order is as
 * payable as one still being prepared.
 */
export function isEligibleForBilling(order, restaurantSlug, options) {
  const ignoreGroupId = options ? options.ignoreGroupId : undefined;
  if (!order) return false;
  if (order.restaurantSlug !== restaurantSlug) return false;
  if (!order.tableId) return false;
  if (order.status === "canceled") return false;
  if (order.paymentStatus === "paid") return false;
  const group = openGroupForOrder(restaurantSlug, order.orderId);
  if (group && group.id !== ignoreGroupId) return false;
  return true;
}

/**
 * The live total of an OPEN group: read from its members, every time.
 *
 * Canceled members contribute nothing, which is the rule the revenue
 * summaries apply, so a bill and the dashboard can never quote different
 * money for the same orders. A settled group returns its frozen amount.
 */
export function groupTotal(group, orders) {
  if (!group) return 0;
  if (group.status === BILL_STATUS.SETTLED) return Number(group.settledAmount) || 0;
  const byId = new Map((orders || []).map((o) => [o.orderId, o]));
  const sum = group.orderIds.reduce((acc, id) => {
    const order = byId.get(id);
    if (!order || order.status === "canceled") return acc;
    return acc + (Number(order.total) || 0);
  }, 0);
  return parseFloat(sum.toFixed(3));
}

/** The member orders of a group, in the order they were added. */
export function groupOrders(group, orders) {
  if (!group) return [];
  const byId = new Map((orders || []).map((o) => [o.orderId, o]));
  return group.orderIds.map((id) => byId.get(id)).filter(Boolean);
}

/* ── Writing ──────────────────────────────────────────────────────────── */

function actorFrom(session) {
  if (!session) return null;
  return {
    staffId: session.username || session.role || null,
    name: session.name || null,
    role: session.role || null,
  };
}

/**
 * Group two or more eligible orders from ONE table.
 *
 * @returns {{ok:boolean, group?:object, reason?:string}}
 */
export function createBillingGroup(restaurantSlug, orderIds, session) {
  const orders = getCustomerOrders();
  const members = (orderIds || [])
    .map((id) => orders.find((o) => o.orderId === id))
    .filter(Boolean);

  if (members.length < 2) return { ok: false, reason: "needsTwo" };
  if (!members.every((o) => isEligibleForBilling(o, restaurantSlug))) {
    return { ok: false, reason: "ineligible" };
  }
  const tableId = members[0].tableId;
  if (!members.every((o) => o.tableId === tableId)) return { ok: false, reason: "mixedTables" };

  const now = new Date().toISOString();
  const group = {
    id: nextGroupId(),
    restaurantSlug,
    tableId,
    tableNumber: members[0].tableNumber === undefined ? null : members[0].tableNumber,
    orderIds: members.map((o) => o.orderId),
    status: BILL_STATUS.OPEN,
    createdAt: now,
    createdBy: actorFrom(session),
    updatedAt: now,
    settledAt: null,
    settledBy: null,
    paymentMethod: null,
    settledAmount: null,
    settlementReference: null,
  };

  saveBillingGroups(restaurantSlug, [...getBillingGroups(restaurantSlug), group]);
  return { ok: true, group };
}

/** Add eligible orders from the same table to an open group. */
export function addOrdersToGroup(restaurantSlug, groupId, orderIds) {
  const groups = getBillingGroups(restaurantSlug);
  const group = groups.find((g) => g.id === groupId);
  if (!group || group.status !== BILL_STATUS.OPEN) return { ok: false, reason: "notOpen" };

  const orders = getCustomerOrders();
  const additions = (orderIds || [])
    .map((id) => orders.find((o) => o.orderId === id))
    .filter(Boolean)
    .filter((o) => !group.orderIds.includes(o.orderId));

  if (additions.length === 0) return { ok: false, reason: "nothingToAdd" };
  if (!additions.every((o) => isEligibleForBilling(o, restaurantSlug))) {
    return { ok: false, reason: "ineligible" };
  }
  if (!additions.every((o) => o.tableId === group.tableId)) {
    return { ok: false, reason: "mixedTables" };
  }

  const updated = {
    ...group,
    orderIds: [...group.orderIds, ...additions.map((o) => o.orderId)],
    updatedAt: new Date().toISOString(),
  };
  saveBillingGroups(restaurantSlug, groups.map((g) => (g.id === groupId ? updated : g)));
  return { ok: true, group: updated };
}

/**
 * Take orders back out of an open group.
 *
 * The removed orders are untouched: same id, same items, same kitchen stage,
 * same payment state. They simply stop being part of this settlement. A group
 * left with fewer than two members dissolves, because a "combined" bill of
 * one is an order with extra furniture.
 */
export function removeOrdersFromGroup(restaurantSlug, groupId, orderIds) {
  const groups = getBillingGroups(restaurantSlug);
  const group = groups.find((g) => g.id === groupId);
  if (!group || group.status !== BILL_STATUS.OPEN) return { ok: false, reason: "notOpen" };

  const remaining = group.orderIds.filter((id) => !(orderIds || []).includes(id));
  if (remaining.length === group.orderIds.length) return { ok: false, reason: "nothingToRemove" };

  if (remaining.length < 2) {
    saveBillingGroups(restaurantSlug, groups.filter((g) => g.id !== groupId));
    return { ok: true, group: null, dissolved: true };
  }

  const updated = { ...group, orderIds: remaining, updatedAt: new Date().toISOString() };
  saveBillingGroups(restaurantSlug, groups.map((g) => (g.id === groupId ? updated : g)));
  return { ok: true, group: updated, dissolved: false };
}

/** Dissolve an open group entirely; every member becomes independent again. */
export function separateGroup(restaurantSlug, groupId) {
  const groups = getBillingGroups(restaurantSlug);
  const group = groups.find((g) => g.id === groupId);
  if (!group || group.status !== BILL_STATUS.OPEN) return { ok: false, reason: "notOpen" };
  saveBillingGroups(restaurantSlug, groups.filter((g) => g.id !== groupId));
  return { ok: true };
}

/**
 * Fold one open group into another at the same table.
 *
 * The target keeps its identity and its creation record; the source is
 * removed. Membership is de-duplicated on the way in, so an id cannot end up
 * listed twice and be counted twice.
 */
export function mergeGroups(restaurantSlug, targetId, sourceId) {
  if (targetId === sourceId) return { ok: false, reason: "sameGroup" };
  const groups = getBillingGroups(restaurantSlug);
  const target = groups.find((g) => g.id === targetId);
  const source = groups.find((g) => g.id === sourceId);
  if (!target || !source) return { ok: false, reason: "missing" };
  if (target.status !== BILL_STATUS.OPEN || source.status !== BILL_STATUS.OPEN) {
    return { ok: false, reason: "notOpen" };
  }
  if (target.tableId !== source.tableId) return { ok: false, reason: "mixedTables" };

  const merged = {
    ...target,
    orderIds: [...new Set([...target.orderIds, ...source.orderIds])],
    updatedAt: new Date().toISOString(),
  };
  saveBillingGroups(
    restaurantSlug,
    groups.filter((g) => g.id !== sourceId).map((g) => (g.id === targetId ? merged : g))
  );
  return { ok: true, group: merged };
}

/**
 * Record the settlement.
 *
 * Full payment only: there is no partial tender here and no way to pay one
 * member of a group. A guest who wants to settle a single order has it
 * removed from the bill first and pays it as the independent order it then
 * is — which is why this takes no amount to apportion and cannot be handed
 * one.
 *
 * The caller writes the orders first (settleOrdersAsPaid) and only calls this
 * when that succeeded, so a refused payment leaves the bill exactly as it was.
 */
export function settleGroup(restaurantSlug, groupId, { method, amount, session, reference }) {
  const groups = getBillingGroups(restaurantSlug);
  const group = groups.find((g) => g.id === groupId);
  if (!group) return { ok: false, reason: "missing" };
  if (group.status !== BILL_STATUS.OPEN) return { ok: false, reason: "alreadySettled" };

  const now = new Date().toISOString();
  const settled = {
    ...group,
    status: BILL_STATUS.SETTLED,
    settledAt: now,
    settledBy: actorFrom(session),
    paymentMethod: method ? { id: method.id, label: method.label } : null,
    /* Frozen. Never recomputed from the orders again — that is the whole
       point of a settlement record. */
    settledAmount: parseFloat((Number(amount) || 0).toFixed(3)),
    settlementReference: reference || null,
    updatedAt: now,
  };
  saveBillingGroups(restaurantSlug, groups.map((g) => (g.id === groupId ? settled : g)));
  return { ok: true, group: settled };
}

/**
 * Housekeeping for OPEN groups only.
 *
 * Runs whenever the screen reads orders, and fixes the three states the world
 * can put a group into without touching the group itself:
 *
 *   a member was canceled   → drop it, the money is no longer owed
 *   a member was paid alone → drop it, it has already been settled
 *   a member vanished       → drop it, there is nothing to bill
 *
 * A group reduced below two members dissolves; an empty one is discarded. A
 * settled group is never touched: its membership is history, and history does
 * not get tidied.
 *
 * @returns {boolean} true when anything was written
 */
export function reconcileGroups(restaurantSlug, orders) {
  const groups = getBillingGroups(restaurantSlug);
  if (groups.length === 0) return false;

  const byId = new Map((orders || []).map((o) => [o.orderId, o]));
  let changed = false;

  const next = [];
  for (const group of groups) {
    if (group.status !== BILL_STATUS.OPEN) {
      next.push(group);
      continue;
    }

    const keep = group.orderIds.filter((id) => {
      const order = byId.get(id);
      if (!order) return false;
      if (order.status === "canceled") return false;
      if (order.paymentStatus === "paid") return false;
      return true;
    });

    if (keep.length === group.orderIds.length) {
      next.push(group);
      continue;
    }

    changed = true;
    if (keep.length < 2) continue; // dissolved, or discarded when empty
    next.push({ ...group, orderIds: keep, updatedAt: new Date().toISOString() });
  }

  if (changed) saveBillingGroups(restaurantSlug, next);
  return changed;
}
