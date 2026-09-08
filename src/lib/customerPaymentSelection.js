/**
 * customerPaymentSelection — Phase 87 (Unit 5, §10).
 *
 * Remembers which payment method the guest picked, for exactly as long as
 * their ordering session lasts.
 *
 * ── WHY sessionStorage, AND WHY THAT IS THE WHOLE DESIGN ─────────────────
 *   §10 draws a hard line: preserve the choice when Checkout is closed and
 *   reopened, but never persist it "as a permanent customer preference across
 *   unrelated sessions". sessionStorage is precisely that lifetime — it dies
 *   with the tab, it is not shared with another table's tab, and it never
 *   reaches a second visit.
 *
 *   It is also the same store src/lib/customerCart.js already uses, so the
 *   selection and the cart it belongs to live and die together by
 *   construction rather than by two cleanup routines agreeing.
 *
 * ── WHAT IS DELIBERATELY NOT STORED ──────────────────────────────────────
 *   Only the id. No label, no price, no timestamp, nothing that could go
 *   stale or contradict the data file. Every consumer resolves the id against
 *   the live method list and the live restaurant settings, which is what
 *   makes §11 work: a remembered id whose method has since been switched off
 *   simply fails that resolution and is discarded.
 *
 *   Storage is wrapped because Safari private mode throws on write. A guest
 *   who cannot store a preference should still be able to order; the failure
 *   mode is "the selection is not remembered", never a broken checkout.
 */

const SELECTION_KEY = "pro_order_payment_selection";

/** The remembered method id, or null. Callers MUST still check that it is
 *  currently selectable — this function only reports what was stored. */
export function getRememberedPaymentMethodId() {
  try {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    return typeof raw === "string" && raw ? raw : null;
  } catch {
    return null;
  }
}

/** Remember a choice, or forget it when passed null/empty. */
export function setRememberedPaymentMethodId(id) {
  try {
    if (!id) sessionStorage.removeItem(SELECTION_KEY);
    else sessionStorage.setItem(SELECTION_KEY, id);
  } catch {
    /* non-fatal — see the note above */
  }
}

/** Forget the choice. Used when a remembered method is no longer selectable,
 *  so the invalid id cannot come back on the next open (§11). */
export function clearRememberedPaymentMethodId() {
  setRememberedPaymentMethodId(null);
}
