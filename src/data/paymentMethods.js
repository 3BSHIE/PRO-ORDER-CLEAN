/**
 * paymentMethods.js — data-driven payment options for the customer checkout flow.
 *
 * Admin-readiness note: `enabled` is a plain data field so a future Admin /
 * Restaurant Settings screen can toggle payment methods on or off per
 * restaurant without touching PaymentMethodModal.jsx. The modal only renders
 * whatever is in this list — no method name, description, or enabled state
 * is hardcoded in the component itself.
 */

export const PAYMENT_METHODS = [
  {
    id: "cash_at_table",
    label: "Cash at the table",
    description: "Pay with cash when the staff brings your bill.",
    icon: "💵",
    enabled: true,
  },
  {
    id: "card_at_table",
    label: "Card / Visa at the table",
    description: "Pay using the restaurant POS terminal.",
    icon: "💳",
    enabled: true,
  },
  {
    id: "online_payment",
    label: "Online payment",
    description: "Apple Pay, PayPal, credit/debit cards — coming soon.",
    icon: "📱",
    enabled: false,
    badge: "Coming soon",
  },
];

/** Look up a single payment method by id (used to resolve label/type later). */
export function findPaymentMethod(id) {
  return PAYMENT_METHODS.find((m) => m.id === id) || null;
}
