import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";
import { PERIOD_TYPES } from "../../lib/revenuePeriods.js";

/* ═══════════════════════════════════════════════════════════════════════════
   RevenuePeriodControls — Phase 111.0

   Two steppers, deliberately separate, because they answer two different
   questions and one control cannot answer both without becoming a menu:

     ‹ DAY ›            which LENS — how wide a window is being looked at
     ‹ Oct 11, 2026 ›   which WINDOW — where that lens is pointed

   ── WHY A STEPPER AND NOT TABS ──────────────────────────────────────────
   Tabs would print Day, Week and Month at all times, which reads as three
   destinations and makes the card look like it navigates somewhere. The
   point of §4 is the opposite: the section stays exactly where it is and
   only its lens changes, so only the current lens is on screen.

   ── WHY THE TYPE STEPPER CLAMPS ─────────────────────────────────────────
   Day → Week → Month is an ordered scale from narrow to wide, not a ring.
   Wrapping from Month back to Day would make the same button mean "wider"
   twice and then "much narrower" once, with nothing on screen to predict
   it. The ends simply disable, which is the same restrained treatment the
   future arrow already needs.
   ═══════════════════════════════════════════════════════════════════════ */

const TYPE_LABEL_KEY = {
  day: ["admin.periodDay", "Day"],
  week: ["admin.periodWeek", "Week"],
  month: ["admin.periodMonth", "Month"],
};

/**
 * ‹ DAY › — the lens.
 *
 * @param {"day"|"week"|"month"} type
 * @param {(next:string)=>void} onChange
 */
export function PeriodTypeStepper({ type, onChange }) {
  const { t } = useLanguage();
  const index = PERIOD_TYPES.indexOf(type);
  const [key, fallback] = TYPE_LABEL_KEY[type] || TYPE_LABEL_KEY.day;

  const canNarrow = index > 0;
  const canWiden = index >= 0 && index < PERIOD_TYPES.length - 1;

  return (
    <div className="ad-period ad-period--type">
      <button
        type="button"
        className="ad-period__arrow"
        onClick={() => canNarrow && onChange(PERIOD_TYPES[index - 1])}
        disabled={!canNarrow}
        aria-label={t("admin.periodTypePrev", "Narrower period")}
      >
        <ChevronLeft size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {/* aria-live so the change is announced without the label itself being
          a control — the arrows are the controls, this is their readout. */}
      <span className="ad-period__label ad-period__label--type" aria-live="polite">
        {t(key, fallback)}
      </span>

      <button
        type="button"
        className="ad-period__arrow"
        onClick={() => canWiden && onChange(PERIOD_TYPES[index + 1])}
        disabled={!canWiden}
        aria-label={t("admin.periodTypeNext", "Wider period")}
      >
        <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * ‹ Oct 11, 2026 › — the window, within whatever lens is selected.
 *
 * The forward arrow is disabled on the current period (§7). There is nothing
 * to see past it, and letting a manager step into an empty future period
 * invites them to read a blank chart as a bad day.
 *
 * @param {string} label — already formatted by revenuePeriods.formatPeriodLabel
 * @param {boolean} atCurrent — is the selected period the current one?
 * @param {(delta:number)=>void} onStep
 */
export function PeriodNavigator({ label, atCurrent, onStep }) {
  const { t } = useLanguage();

  return (
    <div className="ad-period ad-period--range">
      <button
        type="button"
        className="ad-period__arrow"
        onClick={() => onStep(-1)}
        aria-label={t("admin.periodPrev", "Previous period")}
      >
        <ChevronLeft size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>

      <span className="ad-period__label" aria-live="polite">{label}</span>

      <button
        type="button"
        className="ad-period__arrow"
        onClick={() => !atCurrent && onStep(1)}
        disabled={atCurrent}
        aria-label={t("admin.periodNext", "Next period")}
      >
        <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
