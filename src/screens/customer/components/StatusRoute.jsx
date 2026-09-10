import { useEffect, useRef, useState } from "react";
import { ReceiptText, CookingPot, HandPlatter } from "lucide-react";
import { useLanguage } from "../../../i18n/useLanguage.js";
import plateSrc from "../../../assets/brand/pro-order-plate-only.png";
import forkSrc  from "../../../assets/brand/pro-order-fork.png";
import knifeSrc from "../../../assets/brand/pro-order-knife.png";

/**
 * StatusRoute — Phase 88 (§4, §5, §19).
 *
 * Replaces the four dots and their straight connector with a route the guest
 * reads as a journey. Four stations, threaded by a single flowing line that
 * fills as the order advances.
 *
 * ══ WHY A SERPENTINE LINE AND NOT A CURVED ROW ═══════════════════════════
 *   §4 asks for "subtle curvature/flow instead of a boring straight dot
 *   line". The obvious reading — put the stations themselves on a curve —
 *   was tried and rejected: staggering the discs vertically drags their
 *   labels out of alignment, and on a 320px phone the tallest label then
 *   decides the height of the whole component.
 *
 *   So the STATIONS sit on one baseline and the LINE BETWEEN them curves,
 *   bowing up, then down, then up. The row stays a row, the labels stay
 *   aligned, and the connector reads as a current running through the
 *   stations rather than a ruler laid under them.
 *
 * ══ HOW PROGRESS IS DRAWN ════════════════════════════════════════════════
 *   Two copies of the same path: a muted base, and an accent copy revealed
 *   with stroke-dashoffset. pathLength="300" normalises the geometry to 100
 *   units per segment, so "filled up to station i" is exactly `i * 100` and
 *   stays correct if the curve is ever renudged. The fill is a transition,
 *   not an animation, so it sweeps once on a real advance and never loops.
 *
 * ══ STATION STATES (§4) ══════════════════════════════════════════════════
 *   current   — largest, semantic tone, tinted ring, its own motion running
 *   completed — smaller and quieter, KEEPS ITS OWN ICON. §4 is explicit that
 *               a completed station is not replaced by a generic checkmark,
 *               which is what the old timeline did; the journey should still
 *               be legible as ticket -> pot -> tray -> plate after the fact.
 *   upcoming  — smallest, muted, no motion, still legible
 *
 * ══ ACCESSIBILITY (§19) ══════════════════════════════════════════════════
 *   The route is an ordered list, and every station carries a visually
 *   hidden word — "Completed" / "Current step" / "Upcoming" — so its state
 *   survives without colour or size. aria-current marks the live one. The
 *   drawn line and every moving part are aria-hidden: they are the same
 *   information again, and repeating it would just make the list noisy.
 */

/* The route itself. `tone` names the semantic colour family each station
   takes when it is the current one; they stay independent of the restaurant
   theme by design (§0 of the brief's visual direction). */
const STATIONS = [
  { status: "received",  tone: "received",  labelKey: "status.received",  label: "Received"  },
  { status: "preparing", tone: "preparing", labelKey: "status.preparing", label: "Preparing" },
  { status: "ready",     tone: "ready",     labelKey: "status.ready",     label: "Ready"     },
  { status: "delivered", tone: "delivered", labelKey: "status.delivered", label: "Delivered" },
];

/* Geometry: 4 equal columns put station centres at 12.5/37.5/62.5/87.5% of
   the width, i.e. x = 37.5, 112.5, 187.5, 262.5 in a 300-unit box. Each
   segment is one cubic bowing 7 units off the 20-unit baseline, alternating
   direction so the whole line reads as a single current. */
const ROUTE_PATH =
  "M37.5 20 C56 6 94 6 112.5 20 C131 34 169 34 187.5 20 C206 6 244 6 262.5 20";

export default function StatusRoute({ currentStatus }) {
  const { t } = useLanguage();
  const currentIndex = STATIONS.findIndex((s) => s.status === currentStatus);

  /* An advance is a real transition, not every render. The first pass only
     RECORDS the status, so opening Tracking on an already-Ready order shows
     the finished route calmly instead of replaying a sweep the guest never
     witnessed — and a poll returning the same status animates nothing. Same
     seeding rule the old timeline and the Kitchen board both use, kept
     because it is the thing that stops §18's "repeated entrance animations
     on rerender". */
  const prevRef = useRef(null);
  const seededRef = useRef(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = currentStatus;
    if (!seededRef.current) { seededRef.current = true; return; }
    if (prev === currentStatus) return;

    setAdvanced(true);
    /* Long enough to cover the 520ms path sweep and the arriving station's
       settle; cleared so a later advance can play again and this can never
       become a loop. */
    const id = setTimeout(() => setAdvanced(false), 700);
    return () => clearTimeout(id);
  }, [currentStatus]);

  /* Filled length in the path's normalised units. An unknown status (which
     should not happen, but a hand-edited order could produce one) fills
     nothing rather than throwing. */
  const filled = currentIndex > 0 ? currentIndex * 100 : 0;

  return (
    <div
      className={`sroute sroute--${currentStatus} ${advanced ? "sroute--advanced" : ""}`}
    >
      {/* The drawn line sits behind the stations and is purely decorative —
          the list below states the same progress in words. */}
      <svg
        className="sroute__line"
        viewBox="0 0 300 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className="sroute__path" d={ROUTE_PATH} pathLength="300" />
        <path
          className="sroute__path sroute__path--fill"
          d={ROUTE_PATH}
          pathLength="300"
          /* Only the offset is inline — it is the value that changes with the
             status. The dash PATTERN lives in the stylesheet, where Phase 88.1
             gave it a gap longer than the whole route so it can never wrap and
             repaint a second dash over the tail (§2). */
          style={{ strokeDashoffset: 300 - filled }}
        />
      </svg>

      <ol className="sroute__stations">
        {STATIONS.map((station, i) => {
          const isDone = currentIndex >= 0 && i < currentIndex;
          const isCurrent = i === currentIndex;
          const state = isCurrent ? "current" : isDone ? "done" : "future";
          const stateWord = isCurrent
            ? t("track.stepCurrent", "Current step")
            : isDone
            ? t("track.stepCompleted", "Completed")
            : t("track.stepUpcoming", "Upcoming");

          return (
            <li
              key={station.status}
              className={`sroute__station sroute__station--${state} sroute__station--${station.tone}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span className="sroute__disc">
                <StationIcon status={station.status} active={isCurrent} />
              </span>
              <span className="sroute__label">{t(station.labelKey, station.label)}</span>
              {/* §19 — state without relying on size or colour. */}
              <span className="sr-only">{stateWord}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * One station's mark and its motion (§5).
 *
 * Each icon is wrapped in its own element so the motion belongs to the icon
 * rather than to the disc — a disc that moved would drag its tinted ring and
 * border with it, which is how status indicators end up looking bouncy.
 *
 * `active` gates every animation, so a completed or upcoming station is
 * genuinely still rather than animating at low opacity.
 */
function StationIcon({ status, active }) {
  if (status === "received") {
    /* Order ticket. The motion is an arrival: the ticket eases in and a short
       line sweeps across it once per cycle, like a docket being printed. No
       bounce — it settles rather than overshooting. */
    return (
      <span className={`sicon sicon--received ${active ? "is-live" : ""}`}>
        <ReceiptText size={17} strokeWidth={1.9} aria-hidden="true" />
        <span className="sicon__scan" aria-hidden="true" />
      </span>
    );
  }

  if (status === "preparing") {
    /* Cooking pot with steam. Three wisps on staggered delays, drifting up
       and fading. The POT itself never moves: §5 rules out pan-shaking
       cartoon cooking, and a still pot with moving steam is also simply the
       more expensive-looking of the two. */
    return (
      <span className={`sicon sicon--preparing ${active ? "is-live" : ""}`}>
        <span className="sicon__steam" aria-hidden="true">
          <i /><i /><i />
        </span>
        <CookingPot size={17} strokeWidth={1.9} aria-hidden="true" />
      </span>
    );
  }

  if (status === "ready") {
    /* Serving tray / cloche, carried. Deliberately a DIFFERENT object from
       Delivered's plate (§5): a covered dish on its way, versus a plate set
       down. The motion is a gentle lift-and-settle of the whole mark, a
       couple of pixels, once per cycle — the cloche being raised, not a bell
       bouncing. */
    return (
      <span className={`sicon sicon--ready ${active ? "is-live" : ""}`}>
        <HandPlatter size={17} strokeWidth={1.9} aria-hidden="true" />
        <span className="sicon__gleam" aria-hidden="true" />
      </span>
    );
  }

  /* Delivered — the one icon that is not a Lucide glyph. It references the
     plate/fork/knife language of the PRO·ORDER mark without using the whole
     logo and without redrawing it: the three shapes are separate connected
     components of the master PNG, so lifting them out needs no drawing at
     all, and leaving the surrounding ring behind is what stops it reading as
     the logo.

     Phase 88.1 splits what was one combined mask into three, cut to a single
     shared 269x202 box so they register with no positioning of any kind.
     Their alphas recombine to the Phase 88 mask with zero mismatching pixels.

     The motion is now §7's: the plate holds still and the utensils draw in
     toward it, then return — "the food has arrived". The plate deliberately
     carries no animation at all. */
  return (
    <span className={`sicon sicon--delivered ${active ? "is-live" : ""}`}>
      <span className="sicon__setting" aria-hidden="true">
        <span className="sicon__fork"  style={{ "--u": `url(${forkSrc})` }} />
        <span className="sicon__plate" style={{ "--u": `url(${plateSrc})` }} />
        <span className="sicon__knife" style={{ "--u": `url(${knifeSrc})` }} />
      </span>
    </span>
  );
}
