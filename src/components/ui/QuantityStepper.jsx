import { useLanguage } from "../../i18n/useLanguage.js";

/**
 * QuantityStepper — minus / number / plus control.
 *
 * Phase 43 — the two accessible labels were the only English left in this
 * component. It is used solely by the customer item modal and cart, so
 * translating it reaches no operational screen.
 *
 * Props:
 *   value     — current quantity
 *   onChange  — (nextValue: number) => void
 *   min       — minimum quantity (default 1)
 *   max       — maximum quantity (default 20)
 *   disabled  — disables both buttons
 *
 *   minAction      — Phase 86 §17. Optional. When supplied, pressing minus AT
 *                    the minimum calls this instead of being a dead button.
 *                    The cart uses it to remove the line, which is how a guest
 *                    deletes an item now that there is no separate Remove
 *                    control (§6/§16).
 *   minActionLabel — the accessible name for that state. It must describe the
 *                    RESULT, not the control: at quantity 1 the button no
 *                    longer decreases anything, it removes the item, and a
 *                    screen-reader user has no other way to know that (§52).
 *
 *   Both are opt-in, so Item Details — where minus at 1 must stay disabled —
 *   keeps exactly the behaviour it has today (Unit 3 untouched).
 *
 *   decreaseLabel / increaseLabel let the caller add product context:
 *   "Decrease quantity" alone is ambiguous on a cart holding four different
 *   products (§51).
 */
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  disabled = false,
  minAction = null,
  minActionLabel,
  decreaseLabel,
  increaseLabel,
}) {
  const { t } = useLanguage();
  const atMin = value <= min;
  /* Only the minimum press is redirected; every other press still steps. */
  const dec = () => (atMin && minAction ? minAction() : onChange(Math.max(min, value - 1)));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className={`qty-stepper ${disabled ? "qty-stepper--disabled" : ""}`}>
      <button
        type="button"
        className="qty-stepper__btn"
        onClick={dec}
        disabled={disabled || (atMin && !minAction)}
        aria-label={
          atMin && minAction
            ? minActionLabel || t("common.removeItem", "Remove item")
            : decreaseLabel || t("common.decreaseQuantity", "Decrease quantity")
        }
      >
        −
      </button>
      <span className="qty-stepper__value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="qty-stepper__btn"
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label={increaseLabel || t("common.increaseQuantity", "Increase quantity")}
      >
        +
      </button>
    </div>
  );
}
