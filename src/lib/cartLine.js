import { getLocalizedText } from "./localizedContent.js";

/**
 * cartLine — Phase 112.0
 *
 * One cart line, built one way.
 *
 * ── WHY THIS IS A MODULE NOW ────────────────────────────────────────────
 * Until this phase only the Customer Menu built cart lines, so the
 * arithmetic lived in its add handler. Staff Ordering now builds the same
 * lines from the same ItemDetailsModal, and a second copy of "unit price =
 * base + choices + add-ons" is exactly the kind of duplication that ends
 * with a staff order priced differently from a guest's. Both screens call
 * this; neither owns it.
 *
 * The shape is unchanged from what the customer flow has always written, so
 * every downstream reader — the cart, validation, Kitchen, Live Orders, the
 * revenue summaries — sees what it already saw.
 */

/**
 * @param {object} params
 * @param {object} params.item — the menu item (localized fields unresolved)
 * @param {number} params.quantity
 * @param {string} params.notes
 * @param {{selectedRemovals:Array, selectedChoices:Array, selectedPaidAddOns:Array}} params.selections
 * @param {string} params.language — the language whose TEXT is snapshotted
 * @returns {object} a cart line, ready for addCartItem/updateCartItem
 */
export function buildCartLine({ item, quantity, notes, selections, language }) {
  const { selectedRemovals, selectedChoices, selectedPaidAddOns } = selections;

  const choicesPrice = selectedChoices.reduce((sum, c) => sum + (c.price || 0), 0);
  const addOnsPrice = selectedPaidAddOns.reduce((sum, a) => sum + (a.price || 0), 0);
  const unitPrice = item.price + choicesPrice + addOnsPrice;
  const lineTotal = parseFloat((unitPrice * quantity).toFixed(3));

  return {
    itemId: item.id,
    categoryId: item.categoryId,
    /* Phase 97.7 §23 — the line snapshots RESOLVED TEXT. Every operational
       reader of a cart/order line (Kitchen, Admin Live Orders, Cashier,
       Tracking) treats these as plain strings, so the localized value is
       resolved here rather than travelling any further. */
    name: getLocalizedText(item.name, language),
    description: getLocalizedText(item.description, language),
    imageUrl: item.imageUrl,
    basePrice: item.price,
    unitPrice,
    quantity,
    lineTotal,
    selectedRemovals,
    selectedChoices,
    selectedPaidAddOns,
    notes: notes || "",
  };
}

/** Sum of a line list, rounded the way every other total in the product is. */
export function sumLines(lines) {
  return parseFloat(
    (lines || []).reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0).toFixed(3)
  );
}
