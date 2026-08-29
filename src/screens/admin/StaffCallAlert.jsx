import { BellRing, X } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";

/**
 * StaffCallAlert — Phase 59. The transient banner shown to Admin/Cashier
 * when a guest rings for help.
 *
 * Bounded on purpose (§10): however many calls arrive, there is exactly ONE
 * banner. It names the newest call and, when more than one guest is waiting,
 * carries the total as a second line. A stack that grows with the queue is
 * the thing that ends up covering the very buttons staff need, and the Staff
 * Calls screen already exists as the authoritative full list.
 *
 * Non-blocking (§8): a fixed-position banner, not a modal. Nothing behind it
 * is inert, no focus is moved, and the rest of the Admin UI keeps working
 * with the alert on screen — a waiter bell must never stop someone
 * mid-refund.
 *
 * Deaf-safe (§24/§25): every piece of information the sound conveys is also
 * written here — that a call arrived, which table, and how many are waiting.
 * The sound is the redundant channel, never the only one.
 *
 * Props:
 *   call       — the staff call to name; null hides the banner entirely
 *   openCount  — total currently-open calls, for the "N waiting" line
 *   onView     — navigate to Staff Calls
 *   onDismiss  — hide this banner (does NOT resolve anything)
 */
export default function StaffCallAlert({ call, openCount, onView, onDismiss }) {
  const { t } = useLanguage();
  if (!call) return null;

  /* role="alert" so a screen reader announces the arrival without anyone
     having to be looking at this corner of the screen. It is assertive by
     definition, which is right for an operational interruption — but it
     moves no focus, so a manager mid-sentence in a text field keeps typing.
     The banner is keyed by call id upstream, so a given call mounts this
     node once and is therefore announced once, never re-announced by a
     poll or a re-render. */
  return (
    <div className="sc-alert anim-rise" role="alert">
      <span className="sc-alert__icon" aria-hidden="true">
        <BellRing size={17} strokeWidth={2.2} />
      </span>

      <div className="sc-alert__body">
        <p className="sc-alert__title">{t("staff.staffRequested", "Staff requested")}</p>
        {/* The table number is a bare numeric token, so it is LTR-isolated in
            Arabic the same way prices and order ids are. The table's own name
            is restaurant-entered text and is left to follow the document
            direction. */}
        <p className="sc-alert__msg">
          {t("staff.tableRequestingAssistance", "Table {n} is requesting assistance.").replace(
            "{n}",
            call.tableNumber
          )}
        </p>
        {openCount > 1 && (
          <p className="sc-alert__count">
            {t("staff.openCallsCount", "{n} open staff calls").replace("{n}", openCount)}
          </p>
        )}
      </div>

      <div className="sc-alert__actions">
        <Button size="sm" onClick={onView}>
          {openCount > 1
            ? t("staff.viewCalls", "View Calls")
            : t("staff.viewCall", "View Call")}
        </Button>
      </div>

      {/* Dismiss is visually a bare icon, so the accessible name has to come
          from aria-label. It hides this banner and nothing else — the call
          stays open and the nav badge keeps counting it (§12). */}
      <button
        type="button"
        className="sc-alert__close"
        onClick={onDismiss}
        aria-label={t("staff.dismissAlert", "Dismiss alert")}
      >
        <X size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}
