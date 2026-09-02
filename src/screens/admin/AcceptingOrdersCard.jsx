import { Store, CircleCheck, CircleSlash, CalendarClock, TriangleAlert } from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { useAcceptingOrders } from "../../lib/useAcceptingOrders.js";
import { setAcceptingOrdersMode } from "../../lib/acceptingOrdersData.js";
import { ACCEPTING_ORDERS_MODES } from "../../lib/acceptingOrders.js";

/**
 * AcceptingOrdersCard — Phase 79. The Operations control for whether the
 * restaurant is taking NEW orders.
 *
 * MODE IS NOT THE SAME THING AS THE RESULT (§9)
 *   The single most important thing this card does is stop a manager having
 *   to run the schedule in their head. "Auto" is a choice; "not accepting
 *   orders because it is 02:40" is the consequence. Both are printed: the
 *   selected mode sits in the segmented control, and the effective state gets
 *   its own line above it, in words, with the reason. A manager glancing at
 *   this card should never have to check the clock to know whether guests can
 *   order.
 *
 * PERMISSIONS (§30)
 *   Admin only, for now. The Operations section is shared with Cashier and
 *   its two existing cards deliberately stay that way — this one renders
 *   nothing for a Cashier rather than rendering a disabled control, matching
 *   how every other Admin-only capability in this app is handled (absent, not
 *   greyed). `acceptingOrders.update` has not been owner-approved for Cashier,
 *   and quietly handing it over inside an unrelated phase is exactly the kind
 *   of silent scope creep the RBAC work later has to unpick. Busy Mode and
 *   Category Availability keep their existing Cashier access untouched.
 *
 * NOT DESTRUCTIVE (§38)
 *   Closed is amber, not red. It stops revenue, so it is not neutral either —
 *   but it is an ordinary operational state a manager sets on purpose every
 *   night, and dressing it as an error would make the one genuinely alarming
 *   colour in the product meaningless.
 */

/* Icon per effective state, kept beside the mode list so the two never drift.
   Deliberately three distinct marks rather than one mark in three colours —
   colour is never the only carrier (§41). */
const MODE_ICON = { auto: CalendarClock, open: CircleCheck, closed: CircleSlash };

export default function AcceptingOrdersCard({ restaurant, session, onNotify }) {
  const { t } = useLanguage();
  const { mode, accepting, reason, workingHours, refresh } = useAcceptingOrders(restaurant.slug);

  /* Third layer of the same pattern the Admin-only SCREENS use. This card is
     mounted inside a section Cashier can reach, so the check lives here. */
  if (session.role !== "admin") return null;

  const MODE_LABEL = {
    auto: t("accepting.modeAuto", "Auto"),
    open: t("accepting.modeOpen", "Open"),
    closed: t("accepting.modeClosed", "Closed"),
  };
  const MODE_HINT = {
    auto: t("accepting.modeAutoHint", "Follow working hours"),
    open: t("accepting.modeOpenHint", "Accept orders now"),
    closed: t("accepting.modeClosedHint", "Stop new orders"),
  };

  function handleSelect(next) {
    if (next === mode) return;
    setAcceptingOrdersMode(restaurant.slug, next);
    /* The change event already reaches this hook, but refreshing directly
       keeps the card correct even if a listener were ever missed. */
    refresh();
    onNotify?.(
      next === "auto"
        ? t("accepting.toastAuto", "Following working hours")
        : next === "open"
          ? t("accepting.toastOpen", "Accepting new orders")
          : t("accepting.toastClosed", "New orders stopped")
    );
  }

  /* One sentence explaining the effective state. In auto mode this is the
     schedule context §10 asks for; under an override it says plainly that a
     manual choice is in force, so nobody mistakes it for the schedule. */
  /* "00:00–00:00" is how the module spells "around the clock", which is not
     a range a manager should have to decode. */
  const window = workingHours.alwaysOpen
    ? t("accepting.open24Hours", "Open 24 hours")
    : workingHours.openTime && workingHours.closeTime
      ? `${workingHours.openTime}–${workingHours.closeTime}`
      : "";

  let detail;
  if (reason === "forced_open") {
    detail = t("accepting.detailForcedOpen", "Manually open — working hours are being overridden.");
  } else if (reason === "forced_closed") {
    detail = t("accepting.detailForcedClosed", "Manually closed — working hours are being overridden.");
  } else if (reason === "closed_day") {
    detail = t("accepting.detailClosedDay", "Closed today.");
  } else if (reason === "invalid_schedule") {
    detail = t(
      "accepting.detailInvalidSchedule",
      "Working hours aren't set, so orders are being accepted. Add them in Settings."
    );
  } else if (window) {
    detail = `${t("accepting.detailFollowing", "Following working hours")} · ${window}`;
  } else {
    detail = t("accepting.detailFollowing", "Following working hours");
  }

  const StateIcon = accepting ? CircleCheck : CircleSlash;

  return (
    <Card className={`ao-card ${accepting ? "ao-card--on" : "ao-card--off"}`}>
      <div className="ao-card__head">
        <span className="ao-card__icon">
          <Store size={16} strokeWidth={2} />
        </span>
        <div className="ao-card__head-text">
          <h2 className="ao-card__title">{t("accepting.title", "Accepting Orders")}</h2>

          {/* §9 — the effective state, in words, never inferred from colour.
              role="status" so a change announces itself to assistive tech
              without stealing focus. */}
          <p className="ao-card__state" role="status">
            <StateIcon size={13} strokeWidth={2.4} aria-hidden="true" />
            <span className="ao-card__state-text">
              {accepting
                ? t("accepting.stateOn", "Accepting orders")
                : t("accepting.stateOff", "Not accepting orders")}
            </span>
          </p>
        </div>
      </div>

      {/* §8/§41 — native radios in a fieldset. The segmented look is CSS over
          real inputs, so selection is exposed to assistive tech and keyboard
          arrow-key navigation works for free; a div with aria-pressed would
          have had to reimplement both. */}
      <fieldset className="ao-modes">
        <legend className="sr-only">{t("accepting.legend", "Accepting orders mode")}</legend>
        {ACCEPTING_ORDERS_MODES.map((value) => {
          const Icon = MODE_ICON[value];
          return (
            <label
              key={value}
              className={`ao-mode ${mode === value ? "ao-mode--active" : ""} ao-mode--${value}`}
            >
              <input
                type="radio"
                name={`accepting-orders-${restaurant.slug}`}
                className="ao-mode__input"
                value={value}
                checked={mode === value}
                onChange={() => handleSelect(value)}
              />
              <span className="ao-mode__label">
                <Icon size={13} strokeWidth={2.3} aria-hidden="true" />
                {MODE_LABEL[value]}
              </span>
              <span className="ao-mode__hint">{MODE_HINT[value]}</span>
            </label>
          );
        })}
      </fieldset>

      <p className="ao-card__detail">
        {reason === "invalid_schedule" && (
          <TriangleAlert size={12} strokeWidth={2.3} aria-hidden="true" />
        )}
        {detail}
      </p>
    </Card>
  );
}
