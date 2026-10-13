import { getBusinessDayKey } from "../lib/businessDay.js";
import { addDays, normalizeAnchor, keyParts } from "../lib/revenuePeriods.js";

/* ═══════════════════════════════════════════════════════════════════════════
   qaRevenueFixture — Phase 111.3  ·  DEVELOPMENT ONLY

   A deterministic set of synthetic orders so Revenue Analytics, the Revenue
   Breakdown and the bilingual Revenue Report can be looked at with real
   shape in them, without anyone having to place two hundred orders by hand
   and without a single byte being written to the restaurant's own data.

   ── WHAT THIS IS NOT ────────────────────────────────────────────────────
   It is not a demo mode, not a seeding script and not a second orders
   provider. Nothing here is saved. The list is built in memory, handed to
   the analytics read path only, and thrown away when the toggle goes off.
   Customer, Kitchen, Live Orders, Staff Calls, the KPI cards, Needs
   Attention and Recent Orders never see it — they stay on the real list.

   ── WHY IT IS DETERMINISTIC ─────────────────────────────────────────────
   Same day in, same numbers out. A fixture that reshuffled itself every
   render would make "is this figure right?" unanswerable, and the four
   second poll would animate values that had not really changed. The PRNG is
   seeded from a constant and the dates are derived from the restaurant's
   CURRENT business-day key, so this stays useful next month without anyone
   editing dates.

   ── WHY IT READS THE MENU WITHOUT getMenuItems() ────────────────────────
   getMenuItems seeds the catalogue when storage is empty, which is a write.
   A QA harness that promises to touch nothing should not be the thing that
   creates a restaurant's menu, so the key is read directly and a small
   self-contained catalogue stands in when it is missing.
   ═══════════════════════════════════════════════════════════════════════ */

/** Marks every record this module produces, in the data and in the ids. */
export const QA_FIXTURE_TAG = "__qaFixture";

/* Deterministic PRNG. Any seeded generator would do; this one is four lines
   and has no dependency. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FALLBACK_CATALOGUE = [
  { id: "qa_item_burger", name: "Wagyu Smash Burger", price: 13, categoryId: "qa_cat_mains" },
  { id: "qa_item_ribeye", name: "Dry-Aged Ribeye", price: 28, categoryId: "qa_cat_mains" },
  { id: "qa_item_salmon", name: "Pan-Seared Salmon", price: 18, categoryId: "qa_cat_mains" },
  { id: "qa_item_truffle", name: "Black Truffle Tagliatelle", price: 16, categoryId: "qa_cat_pasta" },
  { id: "qa_item_calamari", name: "Crispy Calamari", price: 7, categoryId: "qa_cat_starters" },
  { id: "qa_item_burrata", name: "Burrata & Heirloom Tomato", price: 8.5, categoryId: "qa_cat_starters" },
  { id: "qa_item_creme", name: "Crème Brûlée", price: 5.5, categoryId: "qa_cat_desserts" },
  { id: "qa_item_lemonade", name: "House Lemonade", price: 4, categoryId: "qa_cat_drinks" },
];

/** The restaurant's real catalogue if it is already there, else a stand-in. */
function readCatalogue(restaurantSlug) {
  try {
    const raw = localStorage.getItem(`pro_order_menu_items:${restaurantSlug}`);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((item) => item && item.id && typeof item.price === "number")
        .map((item) => ({
          id: item.id,
          name: typeof item.name === "string" ? item.name : item.id,
          price: item.price,
          categoryId: item.categoryId,
        }));
    }
  } catch {
    /* unreadable storage is not a reason to fail — fall through */
  }
  return FALLBACK_CATALOGUE;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * The shape of a trading day, hour by hour.
 *
 * Non-uniform on purpose (§1): a flat distribution draws a flat chart and
 * tells a reader nothing. Lunch and dinner carry the weight, with a quiet
 * afternoon between them and a thin late tail, so Peak Times has something
 * true to rank and the bars have a silhouette.
 */
const HOUR_WEIGHTS = [
  /* 00 */ 0, 0, 0, 0, 0, 0, 0, 0,
  /* 08 */ 1, 1, 2, 3,
  /* 12 */ 6, 7, 4, 2,
  /* 16 */ 2, 3, 5, 8,
  /* 20 */ 9, 6, 3, 1,
];

function pickHour(rnd) {
  const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = rnd() * total;
  for (let hour = 0; hour < HOUR_WEIGHTS.length; hour += 1) {
    roll -= HOUR_WEIGHTS[hour];
    if (roll <= 0) return hour;
  }
  return 13;
}

/**
 * An ISO instant for a business-day key at a given restaurant-local hour.
 *
 * The key is a trading date, so an hour before 04:00 belongs to the NEXT
 * calendar date — which is exactly what makes the near-rollover records
 * below land where businessDay.js says they should.
 */
function instantFor(dayKey, hour, minute, utcOffsetHours) {
  const { year, month, day } = keyParts(dayKey);
  const calendarShift = hour < 4 ? 1 : 0;
  return new Date(
    Date.UTC(year, month - 1, day + calendarShift, hour - utcOffsetHours, minute, 0)
  ).toISOString();
}

/**
 * The restaurant's UTC offset in whole hours, measured rather than assumed.
 *
 * Asia/Amman is +03:00 and has been since 2022, but reading it from the
 * configured zone means a venue in another zone still gets fixture orders at
 * ITS lunchtime rather than at Amman's.
 */
function offsetHoursFor(timeZone) {
  const probe = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "Asia/Amman",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(probe);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    if (!Number.isFinite(hour)) return 3;
    let diff = hour - 12;
    if (diff > 12) diff -= 24;
    if (diff < -12) diff += 24;
    return diff;
  } catch {
    return 3;
  }
}

/* How many orders each day gets, relative to today's trading date. The shape
   is the point: a busy today, a moderate yesterday, a light day, a day with
   nothing at all for the empty state, and enough history that Day, Week and
   Month can never show the same total. */
function dayPlan(todayKey) {
  const prevMonthAnchor = (() => {
    const monthStart = normalizeAnchor(todayKey, "month");
    const { year, month } = keyParts(monthStart);
    const d = new Date(Date.UTC(year, month - 2, 1));
    return d.toISOString().slice(0, 10);
  })();
  const prevMonthEnd = (() => {
    const { year, month } = keyParts(prevMonthAnchor);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  })();

  return [
    { key: todayKey, count: 12, label: "today — busy" },
    { key: addDays(todayKey, -1), count: 7, label: "yesterday — moderate" },
    { key: addDays(todayKey, -2), count: 3, label: "light day" },
    { key: addDays(todayKey, -3), count: 0, label: "empty day (empty-state check)" },
    { key: addDays(todayKey, -4), count: 5, label: "this week" },
    { key: addDays(todayKey, -5), count: 4, label: "this week" },
    /* The previous Sunday–Saturday week, so stepping back one week lands on a
       different nonzero total. */
    { key: addDays(todayKey, -8), count: 6, label: "prior week" },
    { key: addDays(todayKey, -9), count: 5, label: "prior week" },
    { key: addDays(todayKey, -11), count: 4, label: "prior week", edge: "rollover" },
    { key: addDays(todayKey, -13), count: 3, label: "prior week" },
    /* Earlier in the current month. */
    { key: addDays(todayKey, -18), count: 5, label: "earlier this month" },
    { key: addDays(todayKey, -22), count: 4, label: "earlier this month" },
    /* The previous month, including both of its boundary days. */
    { key: prevMonthAnchor, count: 5, label: "previous month — first day" },
    { key: addDays(prevMonthAnchor, 9), count: 6, label: "previous month" },
    { key: addDays(prevMonthAnchor, 17), count: 5, label: "previous month" },
    { key: prevMonthEnd, count: 4, label: "previous month — last day" },
  ];
}

/* Statuses for today's live-looking day; history is settled. */
const TODAY_STATUSES = [
  "delivered", "delivered", "delivered", "delivered", "delivered",
  "delivered", "delivered", "ready", "preparing", "preparing",
  "received", "canceled",
];

/**
 * Build the fixture.
 *
 * @param {object} options
 * @param {string} options.restaurantSlug
 * @param {string} options.restaurantName
 * @param {string} options.timeZone — the restaurant's configured IANA zone
 * @param {number} [options.serviceChargePercent]
 * @param {Date}   [options.now]
 * @returns {{orders:Array<object>, meta:object}}
 */
export function buildQaRevenueOrders({
  restaurantSlug,
  restaurantName,
  timeZone,
  serviceChargePercent = 10,
  now = new Date(),
}) {
  const todayKey = getBusinessDayKey(timeZone, now);
  if (!todayKey) return { orders: [], meta: { todayKey: null, days: [] } };

  const catalogue = readCatalogue(restaurantSlug);
  const offset = offsetHoursFor(timeZone);
  const rnd = mulberry32(0x9e3779b9);
  const plan = dayPlan(todayKey);

  const orders = [];
  let seq = 0;

  for (const day of plan) {
    for (let i = 0; i < day.count; i += 1) {
      seq += 1;

      /* Two records on one prior-week day sit either side of 04:00 so the
         business-day rollover is exercised by real fixture data rather than
         only by unit tests — and they are in the PAST, so they never clutter
         the current dashboard (§1). */
      let hour;
      let minute = Math.floor(rnd() * 60);
      if (day.edge === "rollover" && i === 0) { hour = 3; minute = 30; }
      else if (day.edge === "rollover" && i === 1) { hour = 4; minute = 30; }
      else hour = pickHour(rnd);

      /* One to three distinct lines, quantities 1–3. */
      const lineCount = 1 + Math.floor(rnd() * 3);
      const used = new Set();
      const items = [];
      for (let L = 0; L < lineCount; L += 1) {
        const pick = catalogue[Math.floor(rnd() * catalogue.length)];
        if (!pick || used.has(pick.id)) continue;
        used.add(pick.id);
        const quantity = 1 + Math.floor(rnd() * 3);
        const unitPrice = round3(pick.price);
        items.push({
          cartItemId: `qa_${seq}_${pick.id}`,
          itemId: pick.id,
          categoryId: pick.categoryId,
          name: pick.name,
          basePrice: unitPrice,
          unitPrice,
          quantity,
          lineTotal: round3(unitPrice * quantity),
          selectedRemovals: [],
          selectedChoices: [],
          selectedPaidAddOns: [],
          notes: "",
        });
      }
      if (items.length === 0) continue;

      const subtotal = round3(items.reduce((sum, line) => sum + line.lineTotal, 0));
      const serviceCharge = round3(subtotal * (serviceChargePercent / 100));
      const total = round3(subtotal + serviceCharge);

      const isToday = day.key === todayKey;
      const status = isToday
        ? TODAY_STATUSES[i % TODAY_STATUSES.length]
        : (rnd() < 0.08 ? "canceled" : "delivered");

      /* Settled history is mostly paid; today still has money on tables.
         The model has exactly two payment states — "paid" and
         "pending_at_table" — so nothing here invents a partial payment. */
      const paid = status === "canceled"
        ? false
        : isToday ? rnd() < 0.55 : rnd() < 0.86;
      const methodId = rnd() < 0.62 ? "cash_at_table" : "card_at_table";

      const createdAt = instantFor(day.key, hour, minute, offset);

      orders.push({
        [QA_FIXTURE_TAG]: true,
        orderId: `QA-${String(seq).padStart(4, "0")}`,
        restaurantId: `qa_${restaurantSlug}`,
        restaurantSlug,
        restaurantName,
        tableId: `qa_tbl_${(seq % 8) + 1}`,
        tableNumber: (seq % 8) + 1,
        qrToken: "qa-fixture-token",
        customerName: `QA Guest ${seq}`,
        customerIdentityKey: `qaguest${seq}`,
        status,
        statusHistory: [{ status: "received", at: createdAt, label: "Order received" }],
        items,
        subtotal,
        serviceChargePercent,
        serviceCharge,
        total,
        paymentStatus: paid ? "paid" : "pending_at_table",
        paymentMethod: {
          id: methodId,
          label: methodId,
          type: methodId,
          selectedAt: createdAt,
        },
        createdAt,
        updatedAt: createdAt,
        estimatedPrepMinutes: 20,
      });
    }
  }

  return {
    orders,
    meta: {
      todayKey,
      offsetHours: offset,
      catalogue: catalogue.length,
      days: plan.map((d) => ({ key: d.key, count: d.count, label: d.label })),
    },
  };
}
