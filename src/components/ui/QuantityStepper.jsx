/**
 * QuantityStepper — minus / number / plus control.
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
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className={`qty-stepper ${disabled ? "qty-stepper--disabled" : ""}`}>
      <button
        type="button"
        className="qty-stepper__btn"
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
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
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
