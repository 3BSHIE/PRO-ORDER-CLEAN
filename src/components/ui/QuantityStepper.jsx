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
 */
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  disabled = false,
}) {
  const { t } = useLanguage();
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className={`qty-stepper ${disabled ? "qty-stepper--disabled" : ""}`}>
      <button
        type="button"
        className="qty-stepper__btn"
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label={t("common.decreaseQuantity", "Decrease quantity")}
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
        aria-label={t("common.increaseQuantity", "Increase quantity")}
      >
        +
      </button>
    </div>
  );
}
