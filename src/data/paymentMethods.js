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
