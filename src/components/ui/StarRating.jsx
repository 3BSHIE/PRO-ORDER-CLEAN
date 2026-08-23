import { Star } from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";

const STARS = [1, 2, 3, 4, 5];

/**
 * StarRating — 1..5 star control, interactive or read-only.
 *
 * Built on native radio inputs rather than a custom widget or an external
 * rating library. That choice is what gives it, for free and correctly:
 *   • arrow-key navigation within the group
 *   • roving focus and a real focus ring
 *   • correct screen-reader semantics ("Food Quality: 4 out of 5, radio")
 *   • form-grade selected state, not a div pretending to be a control
 * The visible stars are just styling on top of that; the real control is a
 * radio group, so assistive tech and keyboards behave exactly as expected.
 *
 * Selection is never communicated by colour alone: a filled vs outlined star
 * shape differs, and a numeric "4/5" readout sits beside the stars.
 *
 * Props:
 *   name      — unique radio-group name (food vs service must differ)
 *   label     — accessible group label, e.g. "Food Quality"
 *   value     — current rating (0/null when unset)
 *   onChange  — (rating:number) => void; omit for read-only
 *   readOnly  — render as a static display
 *   size      — star px size (default 26 interactive, callers pass less for lists)
 */
export default function StarRating({
  name,
  label,
  value = 0,
  onChange,
  readOnly = false,
  size = 26,
}) {
  const { t } = useLanguage();
  const rating = Number(value) || 0;

  /* The accessible label is the ONLY thing a screen reader announces for
     these controls, so it has to be translated too — an Arabic page reading
     out "4 out of 5" in English defeats the point. {n} is interpolated so
     each language can order the number naturally. */
  const outOf = (n) => t("feedback.ratingOutOf", "{n} out of 5").replace("{n}", n);

  /* Read-only: a plain, non-focusable display. Deliberately not disabled
     radios — a disabled control reads as "you can't use this yet" rather
     than "this is the answer you already gave". */
  if (readOnly) {
    return (
      <div className="star-rating star-rating--readonly">
        <span className="star-rating__stars" aria-hidden="true">
          {STARS.map((star) => (
            <Star
              key={star}
              size={size}
              strokeWidth={1.8}
              className={`star-rating__star ${star <= rating ? "star-rating__star--on" : ""}`}
              fill={star <= rating ? "currentColor" : "none"}
            />
          ))}
        </span>
        <span className="star-rating__value">
          {rating}/5
        </span>
        <span className="sr-only">{`${label}: ${outOf(rating)}`}</span>
      </div>
    );
  }

  return (
    <div className="star-rating" role="radiogroup" aria-label={label}>
      <span className="star-rating__stars">
        {STARS.map((star) => {
          const isOn = star <= rating;
          return (
            <label
              key={star}
              className={`star-rating__option ${isOn ? "star-rating__option--on" : ""}`}
            >
              <input
                className="star-rating__input"
                type="radio"
                name={name}
                value={star}
                checked={rating === star}
                onChange={() => onChange?.(star)}
              />
              <Star
                size={size}
                strokeWidth={1.8}
                className={`star-rating__star ${isOn ? "star-rating__star--on" : ""}`}
                fill={isOn ? "currentColor" : "none"}
                aria-hidden="true"
              />
              {/* The only text a screen reader announces for this option. */}
              <span className="sr-only">{`${label}: ${outOf(star)}`}</span>
            </label>
          );
        })}
      </span>

      {/* Non-colour, non-shape confirmation of the current value. */}
      <span className="star-rating__value" aria-hidden="true">
        {rating > 0 ? `${rating}/5` : "—"}
      </span>
    </div>
  );
}
