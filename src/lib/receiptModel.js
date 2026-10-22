import { groupOrders, groupTables, BILL_STATUS } from "./billingGroups.js";
import { restaurantDisplayName } from "./restaurantName.js";

/**
 * receiptModel — Phase 118.0. What a printed document SAYS, decided once.
 *
 * ── WHY A MODEL AND NOT JUST A COMPONENT ─────────────────────────────────
 * Printing has three separable jobs: decide what the document contains,
 * draw it, and hand it to a printer. Keeping the first here means the
 * renderer has no decisions left to make, and means a future direct-print
 * transport (deferred — §25) can reuse every one of those decisions without
 * touching a pixel of layout.
 *
 * ── THE ONE RULE THAT MATTERS ────────────────────────────────────────────
 * Nothing here calculates money. Every figure is lifted from what the order
 * or the settlement already recorded:
 *
 *   a bill        reads the order's own subtotal / serviceCharge / total
 *   a combined bill reads each member's stored total, summed
 *   a paid receipt  reads the settlement's frozen settledAmount where the
 *                   group recorded one, and the order's own total otherwise
 *
 * A receipt that recomputed from today's menu would quietly reprice history
 * the first time a product changed, which is exactly what §9 forbids. The
 * item snapshots on the order are the authority for what was ordered, and
 * the stored totals are the authority for what it cost.
 *
 * ── AND THE ONE THAT CATCHES PEOPLE OUT ──────────────────────────────────
 * A cart line's lineTotal ALREADY includes its choices and paid add-ons —
 * buildCartLine computes unitPrice = base + choices + add-ons. So modifiers
 * are listed for the customer's benefit, and the line total stays the single
 * figure in the money column. Adding modifier prices to it would double
 * count every extra on the receipt (§10).
 *
 * ── TRUTHFUL REPRINTS NEEDED NO NEW STORAGE ──────────────────────────────
 * Checked before writing any of this: settleOrdersAsPaid already stamps
 * paymentMethod and a paymentHistory entry on each order, settleGroup
 * already freezes settledAmount, settledAt, paymentMethod and a
 * tableSnapshot, reconcileGroups explicitly leaves settled groups alone, and
 * cancellation only ever touches status/statusHistory. The settlement record
 * therefore survives everything the app can do to an order afterwards, so
 * §19's fallback — inventing a new snapshot mechanism — was not needed and
 * is not here.
 */

export const RECEIPT_KIND = { BILL: "bill", RECEIPT: "receipt" };

/** Receipt language options. The stored value lives in settings.receiptLanguage. */
export const RECEIPT_LANGUAGES = ["ar", "en", "bilingual"];
/** Legacy records have no setting; English is the documented fallback. */
export const DEFAULT_RECEIPT_LANGUAGE = "en";

export function resolveReceiptLanguage(value) {
  return RECEIPT_LANGUAGES.includes(value) ? value : DEFAULT_RECEIPT_LANGUAGE;
}

function round3(value) {
  return parseFloat((Number(value) || 0).toFixed(3));
}

/**
 * The restaurant's identity, exactly as configured and never invented.
 *
 * Phase 112.2c made name and logo independently optional, and all four
 * combinations are real states. A blank name stays blank here: filling it
 * with the slug or the seeded demo name would put a restaurant's internal id
 * on a customer's receipt (§34).
 */
function buildVenue(settings, restaurant) {
  const name = restaurantDisplayName(settings, restaurant?.name) || "";
  return {
    name: name.trim(),
    logoUrl: (settings?.logoUrl || "").trim(),
    phone: (settings?.contactPhone || "").trim(),
    address: (settings?.contactAddress || "").trim(),
  };
}

/**
 * One order's printable lines.
 *
 * Modifiers are flattened into one short list per line, in the order a
 * customer would read them: what was chosen, what was added, what was left
 * out. Only PAID modifiers carry a price, because a free choice with
 * "+0.000" beside it is noise on 58mm paper.
 */
function buildLines(order) {
  return (order.items || []).map((line, index) => {
    const mods = [];

    for (const choice of line.selectedChoices || []) {
      mods.push({
        label: choice.optionName,
        price: Number(choice.price) > 0 ? round3(choice.price) : null,
      });
    }
    for (const addOn of line.selectedPaidAddOns || []) {
      mods.push({
        label: addOn.name,
        price: Number(addOn.price) > 0 ? round3(addOn.price) : null,
      });
    }
    for (const removal of line.selectedRemovals || []) {
      mods.push({ label: removal, price: null, removed: true });
    }

    return {
      key: line.cartItemId || `${order.orderId}-${index}`,
      name: line.name,
      quantity: Number(line.quantity) || 1,
      /* The authority for this row's money. Already includes every modifier
         above it — see the double-counting note at the top. */
      lineTotal: round3(line.lineTotal),
      notes: (line.notes || "").trim(),
      mods,
    };
  });
}

/** One original order as a section of the document. */
function buildSection(order) {
  const isDirect = order.tableNumber === null || order.tableNumber === undefined;
  return {
    ref: order.orderId,
    isDirect,
    tableNumber: isDirect ? null : order.tableNumber,
    canceled: order.status === "canceled",
    lines: buildLines(order),
    total: round3(order.total),
  };
}

/**
 * The original payment, as recorded — never as re-derived.
 *
 * paidAt comes from the paymentHistory entry settlement wrote, not from
 * updatedAt: a later cancellation moves updatedAt, and printing the time an
 * order was CANCELED as the time it was PAID is exactly the sort of quiet
 * lie §5 is about. Null when the record cannot support an honest answer.
 */
function buildPayment(order) {
  if (order.paymentStatus !== "paid") return null;
  const entry = [...(order.paymentHistory || [])]
    .reverse()
    .find((e) => e.paymentStatus === "paid");
  return {
    methodId: order.paymentMethod?.id || entry?.method || null,
    methodLabel: order.paymentMethod?.label || null,
    paidAt: entry?.at || null,
  };
}

/**
 * Build the document for ONE independent order.
 *
 * @param {object} params
 * @param {object} params.order
 * @param {object} params.settings — restaurant settings record
 * @param {object} params.restaurant
 * @param {string} params.kind — RECEIPT_KIND value
 */
export function buildOrderReceipt({ order, settings, restaurant, kind }) {
  const section = buildSection(order);
  const payment = buildPayment(order);

  return {
    kind,
    venue: buildVenue(settings, restaurant),
    /* The human-readable order id the whole product already uses. Not a new
       invoice serial — this phase mints no document numbers (§8). */
    docRef: order.orderId,
    combined: false,
    isDirect: section.isDirect,
    tableNumber: section.tableNumber,
    orderedAt: order.createdAt || null,
    sections: [section],
    money: {
      subtotal: round3(order.subtotal),
      serviceCharge: round3(order.serviceCharge),
      serviceChargePercent: Number(order.serviceChargePercent) || 0,
      total: round3(order.total),
    },
    payment,
    /* §18 — stated, never acted on. The settled amount above is untouched;
       this only lets the document be honest about what happened after. */
    canceledAfterPayment: !!payment && section.canceled,
    printedAt: new Date().toISOString(),
  };
}

/**
 * Build the document for a Combined Bill.
 *
 * Members keep their own headings, references and tables (§14/§17): a group
 * may legitimately span tables, and collapsing that into one fabricated
 * table number would misrepresent where the food went.
 *
 * @param {object} params
 * @param {object} params.group
 * @param {Array<object>} params.orders — all orders, for member resolution
 */
export function buildGroupReceipt({ group, orders, settings, restaurant, kind }) {
  const members = groupOrders(group, orders);
  const settled = group.status === BILL_STATUS.SETTLED;

  const sections = members.map(buildSection);

  /* A settled group froze its amount at settlement; an open one is worth the
     sum of what its members currently owe. Never the other way around: a
     settled group recomputed from today's members would change the moment
     one of them was canceled (§18). */
  const total = settled
    ? round3(group.settledAmount)
    : round3(sections.reduce((sum, s) => sum + s.total, 0));

  /* Frozen at settlement where available, derived live while open.
     groupTables answers with {id, number} records — the shape the Live
     Orders card needs — so the numbers are lifted out here rather than in
     the renderer, which should receive something it can print directly.
     Entries with no number (a table removed since) are dropped instead of
     printing a blank or a zero. */
  const tables = (settled && Array.isArray(group.tableSnapshot)
    ? group.tableSnapshot
    : groupTables(group, orders)
  )
    .map((entry) => (entry && typeof entry === "object" ? entry.number : entry))
    .filter((n) => n !== null && n !== undefined);

  const payment = settled
    ? {
        methodId: group.paymentMethod?.id || null,
        methodLabel: group.paymentMethod?.label || null,
        paidAt: group.settledAt || null,
      }
    : null;

  return {
    kind,
    venue: buildVenue(settings, restaurant),
    /* The group's own reference when settlement recorded one; otherwise the
       document is headed as a combined bill and identified by the member
       references printed inside it. No CB-001 is invented (§8). */
    docRef: group.settlementReference || null,
    combined: true,
    isDirect: false,
    tables,
    sections,
    money: {
      /* A combined bill has no single subtotal/service split to show — each
         member carried its own — so the document shows member totals and one
         combined total, which is what the group actually settles. */
      subtotal: null,
      serviceCharge: null,
      serviceChargePercent: 0,
      total,
    },
    payment,
    canceledAfterPayment: settled && sections.some((s) => s.canceled),
    printedAt: new Date().toISOString(),
  };
}
