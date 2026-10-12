import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";
import {
  monthGridKeys, keyParts, makeKey, monthNames, weekdayNames,
  normalizeAnchor, getPeriodRange, addDays,
} from "../../lib/revenuePeriods.js";

/* ═══════════════════════════════════════════════════════════════════════════
   PeriodCalendar — Phase 111.1

   Jump straight to a date instead of pressing an arrow nine times.

   ── IT IS A GRID OF TRADING DATES, NOT OF CALENDAR DATES ────────────────
   Every cell is a business-day key, the same string revenuePeriods and
   businessDay already agree on, so "today" here is the restaurant's current
   trading date and not the device's. That matters most between midnight and
   04:00, when the browser's date has rolled over and the restaurant's has
   not: the cell this calendar marks as today is the service still running.

   ── THREE LENSES, ONE GRID ──────────────────────────────────────────────
   Day and Week share the day grid — picking a date under the Week lens
   resolves to the Sunday–Saturday week containing it, and the whole row
   highlights so the reader can see what they are about to select. Month
   swaps the grid for twelve months beside a year stepper, because paging a
   day grid to reach last March is exactly the problem this control exists
   to remove.

   ── FUTURE ──────────────────────────────────────────────────────────────
   Disabled, never hidden. A greyed-out date says "there is nothing there
   yet"; a missing one would read as a broken calendar.
   ═══════════════════════════════════════════════════════════════════════ */

const MONTH_GRID_COLUMNS = 3;

/**
 * @param {"day"|"week"|"month"} type
 * @param {string} anchor      — the currently selected period's anchor key
 * @param {string} todayKey    — the restaurant's current trading date
 * @param {(key:string)=>void} onPick — receives a day key; the caller normalises
 * @param {()=>void} onClose
 */
export default function PeriodCalendar({ type, anchor, todayKey, onPick, onClose }) {
  const { t, language } = useLanguage();
  const rootRef = useRef(null);

  /* Which month the grid is showing. Starts on the selected period and then
     belongs to the reader — paging the grid must not change the dashboard
     behind it, only pressing a date does. */
  const [cursor, setCursor] = useState(() => normalizeAnchor(anchor, "month"));
  const cursorParts = keyParts(cursor);
  const todayParts = keyParts(todayKey);

  const isMonthLens = type === "month";

  /* ── Dismissal ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [onClose]);

  /* Focus moves into the popover on open so the keyboard is already inside
     it, and the browser returns focus to the trigger when it unmounts. */
  useEffect(() => {
    const first = rootRef.current?.querySelector("button:not(:disabled)");
    first?.focus();
  }, []);

  /* ── Day / Week grid ────────────────────────────────────────────────── */
  const dayCells = useMemo(() => {
    if (isMonthLens) return [];
    const selectedRange = getPeriodRange(anchor, type);
    return monthGridKeys(cursor).map((key) => {
      const parts = keyParts(key);
      return {
        key,
        day: parts.day,
        outside: parts.month !== cursorParts.month || parts.year !== cursorParts.year,
        future: key > todayKey,
        today: key === todayKey,
        selected: key >= selectedRange.startKey && key <= selectedRange.endKey,
      };
    });
  }, [isMonthLens, cursor, cursorParts.month, cursorParts.year, anchor, type, todayKey]);

  /* ── Month grid ─────────────────────────────────────────────────────── */
  const months = useMemo(() => monthNames(language, "short"), [language]);
  const weekdays = useMemo(() => weekdayNames(language), [language]);
  const selectedMonthKey = isMonthLens ? normalizeAnchor(anchor, "month") : null;

  const stepCursor = (deltaMonths) => {
    const next = makeKey(cursorParts.year, cursorParts.month + deltaMonths, 1);
    if (next) setCursor(next);
  };
  const stepYear = (delta) => {
    const next = makeKey(cursorParts.year + delta, cursorParts.month, 1);
    if (next) setCursor(next);
  };

  /* Paging forward is pointless past the month that contains today. */
  const cursorIsCurrentMonth =
    cursorParts.year === todayParts.year && cursorParts.month === todayParts.month;
  const cursorYearIsCurrent = cursorParts.year === todayParts.year;

  const headLabel = isMonthLens
    ? String(cursorParts.year)
    : new Date(Date.UTC(cursorParts.year, cursorParts.month - 1, 1))
        .toLocaleDateString(language === "ar" ? "ar" : "en", {
          month: "long", year: "numeric", timeZone: "UTC",
        });

  return (
    <div
      className="ad-cal"
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("admin.selectPeriod", "Select period")}
    >
      <div className="ad-cal__head">
        <button
          type="button"
          className="ad-cal__nav"
          onClick={() => (isMonthLens ? stepYear(-1) : stepCursor(-1))}
          aria-label={
            isMonthLens
              ? t("admin.previousYear", "Previous year")
              : t("admin.previousMonth", "Previous month")
          }
        >
          <ChevronLeft size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <span className="ad-cal__title" aria-live="polite">{headLabel}</span>
        <button
          type="button"
          className="ad-cal__nav"
          onClick={() => (isMonthLens ? stepYear(1) : stepCursor(1))}
          disabled={isMonthLens ? cursorYearIsCurrent : cursorIsCurrentMonth}
          aria-label={
            isMonthLens
              ? t("admin.nextYear", "Next year")
              : t("admin.nextMonth", "Next month")
          }
        >
          <ChevronRight size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {isMonthLens ? (
        <div
          className="ad-cal__months"
          style={{ gridTemplateColumns: `repeat(${MONTH_GRID_COLUMNS}, minmax(0,1fr))` }}
        >
          {months.map((name, i) => {
            const key = makeKey(cursorParts.year, i + 1, 1);
            const future =
              cursorParts.year > todayParts.year ||
              (cursorParts.year === todayParts.year && i + 1 > todayParts.month);
            const selected = key === selectedMonthKey;
            return (
              <button
                type="button"
                key={name + i}
                className="ad-cal__month"
                data-selected={selected ? "true" : undefined}
                disabled={future}
                aria-pressed={selected}
                onClick={() => onPick(key)}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="ad-cal__weekdays" aria-hidden="true">
            {weekdays.map((name, i) => (
              <span key={name + i}>{name}</span>
            ))}
          </div>
          <div className="ad-cal__grid">
            {dayCells.map((cell) => (
              <button
                type="button"
                key={cell.key}
                className="ad-cal__day"
                data-outside={cell.outside ? "true" : undefined}
                data-selected={cell.selected ? "true" : undefined}
                data-today={cell.today ? "true" : undefined}
                disabled={cell.future}
                aria-pressed={cell.selected}
                onClick={() => onPick(cell.key)}
              >
                {cell.day}
              </button>
            ))}
          </div>
          {type === "week" && (
            <p className="ad-cal__hint">
              {t("admin.weekPickHint", "Pick any day to select its week.")}
            </p>
          )}
        </>
      )}

      {/* Always reachable, and the one thing a reader most often wants after
          browsing back through a quiet month. */}
      <button
        type="button"
        className="ad-cal__today"
        onClick={() => onPick(todayKey)}
      >
        {t("admin.jumpToCurrent", "Current period")}
      </button>
    </div>
  );
}

/* Exported for the navigator's keyboard handling: the grid is a roving set
   of buttons, so Home/End on the popover jump to the month's first and last
   selectable day without the caller needing to know the grid's shape. */
export function firstOfMonthKey(key) {
  const { year, month } = keyParts(key);
  return makeKey(year, month, 1);
}
export function nextDayKey(key, delta) {
  return addDays(key, delta);
}
