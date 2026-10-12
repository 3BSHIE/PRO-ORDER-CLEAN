import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";
import { PERIOD_TYPES } from "../../lib/revenuePeriods.js";
import PeriodCalendar from "./PeriodCalendar.jsx";

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

   ── THE TYPE STEPPER WRAPS; THE WINDOW STEPPER DOES NOT ─────────────────
   Phase 111.0 clamped the lens at Day and Month, reasoning that narrow-to-
   wide is an ordered scale. In use that costs a press every time: a manager
   on Month who wants today has to go back through Week. There are only
   three lenses, the current one is always on screen, and both neighbours
   are one press away either direction — so the ring is predictable rather
   than surprising, and it never leaves a dead control under the finger.

   The two steppers are deliberately NOT symmetrical. The window stepper
   still refuses to walk into the future: a lens is a choice between three
   things that all exist, while a future week is a range with nothing in it,
   and offering it invites a blank chart to be read as a bad week.
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
  const count = PERIOD_TYPES.length;
  /* An unrecognised type resolves to 0 rather than -1, so a hand-edited or
     future value can never make the arrows step backwards from nowhere. */
  const index = Math.max(0, PERIOD_TYPES.indexOf(type));
  const [key, fallback] = TYPE_LABEL_KEY[type] || TYPE_LABEL_KEY.day;

  /* Modulo both ways: Day ← Month and Month → Day close the ring. */
  const step = (delta) => onChange(PERIOD_TYPES[(index + delta + count) % count]);

  return (
    <div className="ad-period ad-period--type">
      <button
        type="button"
        className="ad-period__arrow"
        onClick={() => step(-1)}
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
        onClick={() => step(1)}
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
export function PeriodNavigator({ label, atCurrent, onStep, type, anchor, todayKey, onPickDate }) {
  const { t } = useLanguage();
  const [calendarOpen, setCalendarOpen] = useState(false);

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

      {/* Phase 111.1 — the readout became the shortcut. Reaching last March
          with the arrow alone is nine presses under the Month lens and
          ninety under Day, and the label is exactly where a reader already
          looks to find out which period they are on. It stays a readout
          too: aria-live still announces each step. */}
      <button
        type="button"
        className="ad-period__label ad-period__label--pick"
        onClick={() => setCalendarOpen((open) => !open)}
        aria-haspopup="dialog"
        aria-expanded={calendarOpen}
        aria-label={`${label} — ${t("admin.selectPeriod", "Select period")}`}
      >
        <span aria-live="polite">{label}</span>
        <CalendarDays size={13} strokeWidth={2} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="ad-period__arrow"
        onClick={() => !atCurrent && onStep(1)}
        disabled={atCurrent}
        aria-label={t("admin.periodNext", "Next period")}
      >
        <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {calendarOpen && (
        <PeriodCalendar
          type={type}
          anchor={anchor}
          todayKey={todayKey}
          onPick={(key) => { setCalendarOpen(false); onPickDate(key); }}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
  );
}
