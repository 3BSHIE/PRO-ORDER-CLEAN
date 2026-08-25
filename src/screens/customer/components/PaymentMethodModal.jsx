import { useState, useEffect, useRef } from "react";
import { X, Check } from "lucide-react";
import { PAYMENT_METHODS } from "../../../data/paymentMethods.js";
import { useSettingsData } from "../../../lib/useSettingsData.js";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { fmtPrice } from "../../../lib/format.js";

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

/**
 * PaymentMethodModal — Phase 9, extended in Phase 23.
 *
 * Fully data-driven from src/data/paymentMethods.js — no method label,
 * description, or functional enabled/disabled state is hardcoded here.
 * Phase 23's Restaurant Settings additionally controls plain *visibility*:
 * a method Admin has turned off there is simply left out of this list
 * entirely (paymentMethods.js's own `enabled` flag is untouched by this —
 * it still separately controls the "coming soon"/disabled-selection
 * behavior, so Online Payment stays functionally unselectable regardless
 * of its visibility toggle).
 *
 * Does NOT create an order or touch the cart. Selecting a method only sets
 * local state; the primary button hands a structured payload up to the
 * parent (paymentMethodId, paymentMethodLabel, paymentMethodType,
 * selectedAt) for a future phase to use — nothing is sent anywhere yet.
 *
 * Props:
 *   open           — boolean, controls visibility
 *   total          — order total (JOD) to display
 *   restaurantSlug — which restaurant's Settings to read visibility from
 *   onClose        — () => void
 *   onContinue     — (paymentPayload) => void — primary button, only when a
 *                     method is selected
 */
export default function PaymentMethodModal({ open, total, restaurantSlug, onClose, onContinue }) {
  const [selectedId, setSelectedId] = useState(null);
  const [hint, setHint] = useState(null);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLanguage();
  const { settings } = useSettingsData(restaurantSlug);

  /* Phase 34 — SYNCHRONOUS submit lock.
     `isSubmitting` alone cannot stop a double-tap: setState is asynchronous,
     so two clicks dispatched in the same event-loop tick both read the old
     value and both proceed. A ref flips immediately within the first click's
     own execution, so the second click sees it already set and returns. The
     state exists purely to drive the visible processing feedback. */
  const submitLock = useRef(false);

  /* Only the methods Admin has left visible in Settings — defaults to
     visible if the toggle was never touched, so an existing restaurant
     that's never opened Settings sees every method exactly as before. */
  const visibleMethods = PAYMENT_METHODS.filter(
    (method) => settings.paymentMethodsEnabled?.[method.id] !== false
  );

  /* Reset selection each time the modal opens fresh */
  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setHint(null);
      setError(null);
      setIsSubmitting(false);
      submitLock.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    /* Ignore Escape while an order is being placed — see the Cancel button. */
    const onKey = (e) => e.key === "Escape" && !submitLock.current && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Every dismissal path funnels through here so none of them can bypass the
     in-flight check — closing during the mutation is the one way a guest
     could end up with an order created but a cart still full. */
  function handleDismiss() {
    if (submitLock.current) return;
    onClose?.();
  }

  if (!open) return null;

  function handleSelect(method) {
    if (!method.enabled) {
      setHint(method.id);
      return;
    }
    setHint(null);
    setSelectedId(method.id);
  }

  function handleContinue() {
    /* Synchronous gate FIRST — before any await, state update, or work. */
    if (submitLock.current) return;
    if (!selectedId) return;
    const method = PAYMENT_METHODS.find((m) => m.id === selectedId);
    if (!method) return;

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
      setError(t("payment.orderFailed", "Something went wrong. Please try again."));
    }
    /* On success the parent closes this sheet and navigates; the lock stays
       set for the remainder of this instance's life so taps during the
       navigation frame cannot re-enter. */
  }

  return (
    <div
      className="pm-modal__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && handleDismiss()}
    >
      <div className="pm-modal" role="dialog" aria-modal="true" aria-label={t("payment.choosePaymentMethod", "Choose payment method")}>
        <div className="pm-modal__handle" />

        <button type="button" className="pm-modal__x" onClick={handleDismiss} disabled={isSubmitting} aria-label="Close">
          <X size={16} strokeWidth={2.4} />
        </button>

        <div className="pm-modal__body">
          <h2 className="pm-modal__title">{t("payment.choosePaymentMethod", "Choose payment method")}</h2>
          <p className="pm-modal__sub">{t("payment.selectHowToPay", "Select how you'd like to pay for this order.")}</p>

          <div className="pm-modal__total">
            <span className="pm-modal__total-label">{t("payment.orderTotal", "Order total")}</span>
            <span className="pm-modal__total-value">{fmtPrice(total)}</span>
          </div>

          <div className="pm-methods">
            {visibleMethods.map((method) => {
              const isSelected = selectedId === method.id;
              const isDisabled = !method.enabled;
              return (
                <button
                  key={method.id}
                  type="button"
                  className={`pm-method ${isSelected ? "pm-method--active" : ""} ${
                    isDisabled ? "pm-method--disabled" : ""
                  }`}
                  onClick={() => handleSelect(method)}
                  aria-disabled={isDisabled}
                >
                  <span className="pm-method__icon">{method.icon}</span>
                  <span className="pm-method__text">
                    <span className="pm-method__label-row">
                      <span className="pm-method__label">
                        {t(METHOD_LABEL_KEY[method.id], method.label)}
                      </span>
                      {method.badge && (
                        <span className="pm-method__badge">
                          {t("common.comingSoon", method.badge)}
                        </span>
                      )}
                    </span>
                    <span className="pm-method__desc">
                      {t(METHOD_DESC_KEY[method.id], method.description)}
                    </span>
                    {hint === method.id && (
                      <span className="pm-method__hint">
                        {t("payment.onlinePaymentSoonHint", "Online payment will be available soon.")}
                      </span>
                    )}
                  </span>
                  <span className="pm-method__mark" aria-hidden="true">
                    {isSelected && <Check size={13} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <p className="pm-modal__error" role="alert">{error}</p>
          )}

          <div className="pm-modal__actions">
            <button
              type="button"
              className="btn btn--primary btn--lg btn--full"
              disabled={!selectedId || isSubmitting}
              aria-busy={isSubmitting}
              onClick={handleContinue}
            >
              {isSubmitting
                ? t("payment.placingOrder", "Placing order…")
                : t("payment.placeOrder", "Place order")}
            </button>
            {/* Cancel is disabled while submitting so the sheet cannot be
                closed mid-mutation, which would strand the guest between a
                created order and a cleared cart. */}
            <button
              type="button"
              className="btn btn--ghost btn--md btn--full"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t("common.cancel", "Cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
