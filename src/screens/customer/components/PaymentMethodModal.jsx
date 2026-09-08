import { useState, useEffect, useRef } from "react";
import { X, Check, Banknote, CreditCard, Smartphone, Wallet, AlertTriangle } from "lucide-react";
import {
  PAYMENT_METHODS,
  getSelectablePaymentMethods,
  isPaymentMethodSelectable,
} from "../../../data/paymentMethods.js";
import { useSettingsData } from "../../../lib/useSettingsData.js";
import { getSettings } from "../../../lib/settingsData.js";
import {
  getRememberedPaymentMethodId,
  setRememberedPaymentMethodId,
  clearRememberedPaymentMethodId,
} from "../../../lib/customerPaymentSelection.js";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { useBodyScrollLock } from "../../../lib/useBodyScrollLock.js";
import { fmtPrice } from "../../../lib/format.js";
import CallStaffButton from "./CallStaffButton.jsx";

/**
 * Phase 73 §15 — the method's semantic icon key resolved to a Lucide mark.
 *
 * These are fixed system payment methods, so they belong to the same icon set
 * as the rest of the product UI rather than to the emoji font, which rendered
 * at a different weight and colour on every platform. An unknown key falls
 * back to Wallet rather than rendering nothing, so adding a method to the data
 * file can never leave a blank square in the list.
 */
const METHOD_ICON = {
  banknote: Banknote,
  card: CreditCard,
  mobile: Smartphone,
};


/* Maps each payment method's stable id to a translation key — this lets the
   label/description shown to the customer be translated without touching
   src/data/paymentMethods.js at all. The English fallback passed to t() is
   always the method's own data-driven label/description, so if a key is
   ever missing the UI just shows the original English copy, never blank. */
const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};
const METHOD_DESC_KEY = {
  cash_at_table: "payment.cashAtTableDesc",
  card_at_table: "payment.cardAtTableDesc",
  online_payment: "payment.onlinePaymentDesc",
};

/* Phase 87 §23 — the distinct failures are kept apart as VALUES, not as
   several messages that merely happen to be written differently. The render
   reads this to decide how the message is presented, so a future caller
   cannot quietly collapse a submission failure into a payment problem by
   passing the wrong string.

   Cart validation and accepting-orders are absent on purpose: those two are
   answered by the Cart screen, which closes this sheet and speaks there,
   because the fix for both is on that screen and not in here (§20). */
const ERROR_KIND = {
  PAYMENT_METHOD: "payment_method", // the chosen method is no longer offered
  SUBMISSION: "submission",         // order creation genuinely failed
};

/**
 * PaymentMethodModal — Phase 9, extended in Phases 23 / 34 / 37 / 73, and
 * reviewed as Unit 5 in Phase 87.
 *
 * ── WHAT THIS SCREEN IS ──────────────────────────────────────────────────
 *   A short final step, not a second Cart. §3 fixes the content at four
 *   things — title, the methods, one Total, Place Order — and Phase 87
 *   removed the subtitle that used to sit under the title, because "Select
 *   how you would like to pay for this order" only restated the heading while
 *   pushing the methods further down the sheet.
 *
 *   Subtotal and Service Charge deliberately do not appear. Cart owns the
 *   breakdown; repeating it here would make this a review page and give the
 *   guest a second place to reconcile numbers they already accepted (§3/§12).
 *
 * ── WHICH METHODS EXIST ──────────────────────────────────────────────────
 *   Only the selectable ones — see getSelectablePaymentMethods() for why the
 *   permanently-disabled "Coming soon" row no longer renders (§4). This
 *   component still hardcodes no label, no description and no enabled state.
 *
 * ── THE THREE STATES THIS SHEET CAN BE IN ────────────────────────────────
 *   1. methods available          the normal flow
 *   2. zero methods available     a dedicated explained state with real
 *                                 recovery, never a dead disabled button
 *                                 (§27/§28)
 *   3. submitting                 locked, with every exit disabled (§18)
 *
 * Does NOT create the order itself. onContinue performs the real mutation and
 * reports back; everything about cart clearing and navigation belongs to the
 * Cart screen, which is the only place that knows whether an order was
 * genuinely persisted (§25).
 *
 * Props:
 *   open           — boolean, controls visibility
 *   total          — order total (JOD) to display
 *   restaurantSlug — which restaurant's Settings to read visibility from
 *   table          — { id, number } for the Call Staff recovery path (§28/§29)
 *   customerName   — shown to staff on that call
 *   onClose        — () => void
 *   onContinue     — (paymentPayload) => { ok, handled?, reason? }
 */
export default function PaymentMethodModal({
  open,
  total,
  restaurantSlug,
  table,
  customerName,
  onClose,
  onContinue,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);          // { kind, message }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLanguage();
  const { settings } = useSettingsData(restaurantSlug);
  const dialogRef = useRef(null);

  /* Phase 34 — SYNCHRONOUS submit lock.
     `isSubmitting` alone cannot stop a double-tap: setState is asynchronous,
     so two clicks dispatched in the same event-loop tick both read the old
     value and both proceed. A ref flips immediately within the first click's
     own execution, so the second click sees it already set and returns. The
     state exists purely to drive the visible processing feedback. */
  const submitLock = useRef(false);

  /* The methods this restaurant currently offers AND the product supports.
     Recomputed every render from live settings, so an Admin toggle flipped
     while the sheet is open is reflected here rather than at next mount. */
  const methods = getSelectablePaymentMethods(settings);
  const hasMethods = methods.length > 0;

  /* §10 — restore the guest's last choice each time the sheet opens, and §11
     — only if that method is still on offer. Both halves are one effect on
     purpose: the remembered id is never trusted, it is re-resolved against
     the live list, and an id that no longer resolves is forgotten outright so
     it cannot resurface on the next open. */
  useEffect(() => {
    if (!open) return;
    setError(null);
    setIsSubmitting(false);
    submitLock.current = false;

    const remembered = getRememberedPaymentMethodId();
    if (remembered && isPaymentMethodSelectable(remembered, getSettings(restaurantSlug))) {
      setSelectedId(remembered);
    } else {
      if (remembered) clearRememberedPaymentMethodId();
      setSelectedId(null);
    }
  }, [open, restaurantSlug]);

  /* §11 — the method can also be withdrawn while the sheet is already open.
     Silently keeping it selected would let the guest press Place Order on an
     option the restaurant no longer takes, so the selection is dropped and
     the reason is stated locally. Not an error in the failure sense — it is
     guidance, and it never touches the cart (§21). */
  useEffect(() => {
    if (!open || !selectedId) return;
    if (methods.some((m) => m.id === selectedId)) return;
    setSelectedId(null);
    clearRememberedPaymentMethodId();
    setError({
      kind: ERROR_KIND.PAYMENT_METHOD,
      message: t(
        "payment.methodNoLongerAvailable",
        "That payment method is no longer available. Please choose another one."
      ),
    });
  }, [open, selectedId, methods, t]);

  useEffect(() => {
    if (!open) return;
    /* Ignore Escape while an order is being placed: closing mid-mutation
       would strand the guest between a created order and a cleared cart. */
    const onKey = (e) => e.key === "Escape" && !submitLock.current && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* §39 — move focus into the dialog when it opens, so a keyboard or screen
     reader user is inside it rather than still on the Cart's checkout button
     with an invisible sheet over the page. Focus RETURN is deliberately not
     re-implemented here: the Cart owns the trigger, that button stays mounted
     and focusable behind this sheet, and the existing modal system already
     leaves the guest on the Cart when this unmounts. */
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open]);

  /* Phase 41 — freeze the cart behind this sheet, and restore its position
     when the guest backs out. On a successful order the parent navigates
     away, so the restore lands on a screen that is about to be replaced —
     harmless, and it keeps the lock symmetric rather than special-casing
     the success path. Must sit above the early return below. */
  useBodyScrollLock(open);

  /* Every dismissal path funnels through here so none of them can bypass the
     in-flight check — closing during the mutation is the one way a guest
     could end up with an order created but a cart still full (§18/§26). */
  function handleDismiss() {
    if (submitLock.current) return;
    onClose?.();
  }

  if (!open) return null;

  function handleSelect(method) {
    /* Every rendered row is selectable now, so there is no disabled branch
       left to guard: an unavailable method is not on screen at all (§4). */
    setSelectedId(method.id);
    setRememberedPaymentMethodId(method.id);
    /* Choosing a method answers the "choose another one" guidance, so it
       clears — but a real submission failure stays visible until the retry
       actually happens (§22). */
    if (error?.kind === ERROR_KIND.PAYMENT_METHOD) setError(null);
  }

  function handlePlaceOrder() {
    /* Synchronous gate FIRST — before any await, state update, or work. */
    if (submitLock.current) return;
    if (!selectedId) return;
    const method = PAYMENT_METHODS.find((m) => m.id === selectedId);
    if (!method) return;

    /* §19 — payment-method validity joins the authoritative pre-order checks,
       and like Phase 79's accepting-orders gate it re-reads storage instead of
       trusting the subscribed copy. This is exactly the window that matters:
       the guest chose Cash, a manager switched Cash off, the guest presses
       Place Order. A verdict computed a render ago is not good enough to
       create an order on.

       Nothing is submitted, and nothing outside the payment step is touched
       (§21). */
    if (!isPaymentMethodSelectable(method.id, getSettings(restaurantSlug))) {
      setSelectedId(null);
      clearRememberedPaymentMethodId();
      setError({
        kind: ERROR_KIND.PAYMENT_METHOD,
        message: t(
          "payment.methodNoLongerAvailable",
          "That payment method is no longer available. Please choose another one."
        ),
      });
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);

    /* onContinue performs the real mutation and reports back whether an order
       was actually created. Anything other than a clear success releases the
       lock so the guest can retry — never leave them stuck on "Placing
       order…" with a cart they cannot submit. */
    let result;
    try {
      result = onContinue?.({
        paymentMethodId: method.id,
        paymentMethodLabel: method.label,
        paymentMethodType: method.id, // stable machine-readable type for future order payload
        selectedAt: new Date().toISOString(),
      });
    } catch {
      result = { ok: false };
    }

    if (!result || result.ok !== true) {
      submitLock.current = false;
      setIsSubmitting(false);

      /* Phase 37 — `handled` means the parent already closed this sheet and
         explained the problem (a stale cart, or a restaurant that stopped
         accepting orders). Showing a generic "something went wrong" on top of
         that would be both wrong and confusing. */
      if (result?.handled) return;

      /* §23 — the Cart's own last-line payment guard reports back as a
         payment problem, not as a mystery failure, so the guest is told to
         pick again instead of being invited to retry something that would
         fail identically. */
      if (result?.reason === "payment") {
        setSelectedId(null);
        clearRememberedPaymentMethodId();
        setError({
          kind: ERROR_KIND.PAYMENT_METHOD,
          message: t(
            "payment.methodNoLongerAvailable",
            "That payment method is no longer available. Please choose another one."
          ),
        });
        return;
      }

      /* Everything else is a genuine order-creation failure. The cart, the
         selection, the session and every customization survive it untouched,
         and the CTA below returns to its normal state — which IS the retry
         (§22/§24). */
      setError({
        kind: ERROR_KIND.SUBMISSION,
        message: t("payment.orderFailed", "Something went wrong. Please try again."),
      });
    }
    /* On success the parent closes this sheet and navigates; the lock stays
       set for the remainder of this instance's life so taps during the
       navigation frame cannot re-enter. */
  }

  const title = t("payment.choosePaymentMethod", "Choose payment method");

  return (
    <div
      className="pm-modal__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && handleDismiss()}
    >
      <div
        className="pm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="pm-modal__handle" />

        {/* 44x44 hit box around a 34px face — §39's touch minimum without
            enlarging a control that sits in the sheet's corner. */}
        <button
          type="button"
          className="pm-modal__x"
          onClick={handleDismiss}
          disabled={isSubmitting}
          aria-label={t("common.close", "Close")}
        >
          <span className="pm-modal__x-face" aria-hidden="true">
            <X size={16} strokeWidth={2.4} />
          </span>
        </button>

        <div className="pm-modal__body">
          <h2 className="pm-modal__title">{title}</h2>

          {!hasMethods ? (
            /* ── §27/§28 — zero selectable methods ──────────────────────
               Not a sheet with an empty list and a dead button. The guest is
               told what is wrong and given the two things that can actually
               help: a person, and the way back to their cart. No order can be
               placed from this state — Place Order is not rendered at all,
               rather than rendered and disabled. */
            <div className="pm-empty">
              <span className="pm-empty__icon" aria-hidden="true">
                <AlertTriangle size={20} strokeWidth={2.1} />
              </span>
              <p className="pm-empty__title" role="status">
                {t("payment.noMethodsTitle", "No payment methods are currently available.")}
              </p>
              <p className="pm-empty__text">
                {t(
                  "payment.noMethodsText",
                  "Please contact the staff to complete your order. Your cart is saved."
                )}
              </p>
              <div className="pm-empty__actions">
                {/* §29 — the existing Digital Waiter Bell, not a second
                    staff-call implementation. It carries its own duplicate
                    rule and its own confirmed state, so a guest who already
                    rang from the Menu sees "Staff notified" here too. Only
                    surfaced when the table is actually known. */}
                {table?.id && (
                  <CallStaffButton
                    restaurantSlug={restaurantSlug}
                    tableId={table.id}
                    tableNumber={table.number}
                    customerName={customerName}
                    variant="prominent"
                  />
                )}
                <button
                  type="button"
                  className="btn btn--outline btn--md btn--full"
                  onClick={handleDismiss}
                >
                  {t("payment.backToCart", "Back to cart")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* §39 — a real radio group, so assistive tech announces the
                  set and its position rather than reading unrelated buttons,
                  and aria-checked carries the selection independently of
                  colour. */}
              <div
                className="pm-methods"
                role="radiogroup"
                aria-label={t("payment.paymentMethod", "Payment method")}
              >
                {methods.map((method) => {
                  const isSelected = selectedId === method.id;
                  const MethodIcon = METHOD_ICON[method.icon] || Wallet;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`pm-method ${isSelected ? "pm-method--active" : ""}`}
                      onClick={() => handleSelect(method)}
                      disabled={isSubmitting}
                    >
                      <span className="pm-method__icon" aria-hidden="true">
                        <MethodIcon size={18} strokeWidth={2} />
                      </span>
                      <span className="pm-method__text">
                        <span className="pm-method__label">
                          {t(METHOD_LABEL_KEY[method.id], method.label)}
                        </span>
                        <span className="pm-method__desc">
                          {t(METHOD_DESC_KEY[method.id], method.description)}
                        </span>
                      </span>
                      <span className="pm-method__mark" aria-hidden="true">
                        {isSelected && <Check size={13} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* §12/§13 — one Total, reading as a figure to verify rather
                  than as a surface to press. Cart already carries the
                  breakdown that produced it. */}
              <div className="pm-modal__total">
                <span className="pm-modal__total-label">{t("common.total", "Total")}</span>
                <span className="pm-modal__total-value">{fmtPrice(total)}</span>
              </div>

              {error && (
                <p
                  className={`pm-modal__error ${
                    error.kind === ERROR_KIND.PAYMENT_METHOD ? "pm-modal__error--guidance" : ""
                  }`}
                  role="alert"
                >
                  {error.message}
                </p>
              )}

              <div className="pm-modal__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--lg btn--full pm-place"
                  disabled={!selectedId || isSubmitting}
                  aria-busy={isSubmitting}
                  onClick={handlePlaceOrder}
                >
                  {/* §17/§40 — a small spinner NEXT TO the label, never
                      instead of it, and never the animated PRO·ORDER mark
                      (§41). The label stays readable throughout, so the
                      button never becomes an unlabelled spinning circle. */}
                  {isSubmitting && <span className="pm-spinner" aria-hidden="true" />}
                  {isSubmitting
                    ? t("payment.placingOrder", "Placing order…")
                    : t("payment.placeOrder", "Place order")}
                </button>
                {/* Phase 73 §31 — the orphaned "Cancel" was removed. The header X
                    already closes the sheet and remains disabled while submitting,
                    so the mid-mutation guard that Cancel used to carry is intact;
                    this only removes the duplicate exit sitting under the primary
                    action. */}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
