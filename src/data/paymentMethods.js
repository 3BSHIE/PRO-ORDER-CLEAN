/**
 * paymentMethods.js — data-driven payment options for the customer checkout flow.
 *
 * Admin-readiness note: `enabled` is a plain data field so a future Admin /
 * Restaurant Settings screen can toggle payment methods on or off per
 * restaurant without touching PaymentMethodModal.jsx. The modal only renders
 * whatever is in this list — no method name, description, or enabled state
 * is hardcoded in the component itself.
 *
 * Phase 73 §15 — `icon` is a stable semantic KEY, not a glyph. These are
 * fixed system payment methods rendered in the product UI, so they use the
 * same Lucide set as every other control; PaymentMethodModal maps the key to
 * a component. (Category emojis are the opposite case — restaurant-authored
 * content — and deliberately stay emoji.)
 */

export const PAYMENT_METHODS = [
  {
    id: "cash_at_table",
    label: "Cash at the table",
    description: "Pay with cash when the staff brings your bill.",
    icon: "banknote",
    enabled: true,
  },
  {
    id: "card_at_table",
    label: "Card / Visa at the table",
    description: "Pay using the restaurant POS terminal.",
    icon: "card",
    enabled: true,
  },
  {
    id: "online_payment",
    label: "Online payment",
    description: "Apple Pay, PayPal, credit/debit cards — coming soon.",
    icon: "mobile",
    enabled: false,
    badge: "Coming soon",
  },
];

/** Look up a single payment method by id (used to resolve label/type later). */
export function findPaymentMethod(id) {
  return PAYMENT_METHODS.find((m) => m.id === id) || null;
}

/* ══ Phase 87 (Unit 5) — the one place "can the guest pick this?" is decided ══
 *
 * TWO flags, not one, and they mean genuinely different things:
 *
 *   method.enabled                      — does the PRODUCT support it yet?
 *                                         online_payment is false because no
 *                                         processing exists (§30).
 *   settings.paymentMethodsEnabled[id]  — has THIS RESTAURANT turned it on?
 *                                         The Admin toggle, and the source of
 *                                         truth §4 names.
 *
 * A method is selectable only when both are true, and §4 says render only
 * those. That deletes the old permanently-disabled "Coming soon" row from the
 * checkout: a row that can never be tapped is not a payment method, it is an
 * advertisement sitting in the middle of the shortest, most decisive step in
 * the whole flow. It also makes §27 answerable — with the dead row gone, "no
 * methods" is a state the guest can actually be told about instead of a sheet
 * holding one untappable card above a disabled button.
 *
 * Nothing about the data file changes: online_payment is still declared, still
 * carries its copy, and still returns from findPaymentMethod() so historical
 * orders that recorded it keep resolving their label (§49).
 */

/** Every method this restaurant's guests can actually choose right now. */
export function getSelectablePaymentMethods(settings) {
  const flags = settings?.paymentMethodsEnabled || {};
  /* `!== false` rather than `=== true`: a restaurant that has never opened
     Settings has no stored flags at all, and must not lose its checkout. */
  return PAYMENT_METHODS.filter((m) => m.enabled && flags[m.id] !== false);
}

/** Is this specific id still selectable? Used at submit time against FRESH
 *  settings, so a method switched off mid-checkout cannot be submitted (§11). */
export function isPaymentMethodSelectable(id, settings) {
  if (!id) return false;
  return getSelectablePaymentMethods(settings).some((m) => m.id === id);
}
