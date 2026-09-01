import { BellRing, Check } from "lucide-react";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { useStaffCalls } from "../../../lib/useStaffCalls.js";
import { createStaffCall } from "../../../lib/staffCallData.js";

/**
 * CallStaffButton — Phase 25 "Digital Waiter Bell", customer side.
 *
 * The single place the guest can ask for human help. Shared by the Menu
 * screen and the Order Tracking screen so both behave identically and there
 * is only one implementation of the duplicate-call rule on the UI side.
 *
 * Three visual variants, no behavioral difference between them:
 *   "subtle"     — a quiet inline pill (Tracking, for live orders)
 *   "compact"    — Phase 73 §32. Sits in the Menu's sticky topbar so it stays
 *                  reachable at any scroll depth on a long menu. Icon-led,
 *                  because it shares that bar with table identity and My
 *                  Orders; the label hides below 400px and the accessible
 *                  name comes from aria-label instead.
 *   "prominent"  — a centered, full-width call to action, used only when an
 *                  order was canceled and the guest most likely needs a
 *                  person right now. Phase 73 §35 explicitly keeps this:
 *                  contextual recovery screens are NOT moved into a header.
 *
 * Phase 73 §33 — the confirmed state is now visible rather than implied. It
 * previously changed only its text while keeping the same muted grey, so a
 * guest could not tell at a glance that the call had registered. Bell and
 * Check are both rendered and crossfaded (see .call-staff__icon), and the
 * pill moves to the gold confirmed treatment over the same ~240ms. Gold
 * rather than a new success colour: it is already the app's "this is active"
 * accent, so no new semantic is introduced.
 *
 * Duplicate prevention is layered:
 *   1. This component reads the live call list and, when this table already
 *      has an open call, renders a calm confirmed state instead of a
 *      fresh-looking button.
 *   2. Pressing it in that state deliberately still works, but only re-shows
 *      the "already called" message — it never creates a second call.
 *   3. createStaffCall() in src/lib/staffCallData.js refuses the duplicate at
 *      the storage layer regardless, which is the guard that actually counts
 *      (two tabs on the same table, stale state, double-click, etc.).
 *
 * Because hasOpenCall is derived from the same live list Admin/Cashier reads,
 * staff resolving the call returns this control to its normal state on its
 * own — unchanged by Phase 73 (§34).
 *
 * The customer can only ever CREATE a call — there is no path from this
 * component to resolveStaffCall(); resolving is Admin/Cashier only.
 *
 * Props:
 *   restaurantSlug — which restaurant's call list to read/write
 *   tableId, tableNumber — the table the guest is physically sitting at
 *   customerName   — shown to staff so they know who asked
 *   variant        — "subtle" (default) | "compact" | "prominent"
 *   onNotify       — optional (message: string) => void; the parent owns the
 *                    Toast where one still exists. The Menu deliberately
 *                    passes nothing (Phase 73 §33: no toast) and relies on
 *                    the control's own confirmed state instead.
 */
export default function CallStaffButton({
  restaurantSlug,
  tableId,
  tableNumber,
  customerName,
  variant = "subtle",
  onNotify,
}) {
  const { t } = useLanguage();
  const { calls } = useStaffCalls(restaurantSlug);

  /* Derived from the same live list Admin/Cashier reads, so when staff
     resolve this table's call the button returns to its normal state on its
     own and the guest can ring again. */
  const hasOpenCall = calls.some((c) => c.status === "open" && c.tableId === tableId);

  const isProminent = variant === "prominent";
  const isCompact   = variant === "compact";

  const idleLabel = isProminent
    ? t("staff.callWaiterForHelp", "Call Waiter for Help")
    : t("staff.callStaff", "Call Staff");
  const calledLabel = t("staff.staffNotified", "Staff notified");
  const label = hasOpenCall ? calledLabel : idleLabel;

  const iconSize = isProminent ? 17 : 14;

  function handleClick() {
    const result = createStaffCall(restaurantSlug, { tableId, tableNumber, customerName });

    onNotify?.(
      result.ok
        ? t("staff.staffCalledMsg", "Staff has been called. Someone will assist you shortly.")
        : t("staff.staffAlreadyCalledMsg", "Staff has already been called.")
    );
  }

  return (
    <button
      type="button"
      className={`call-staff call-staff--${variant} ${hasOpenCall ? "call-staff--called" : ""}`}
      onClick={handleClick}
      /* The compact variant hides its text under 400px, so the accessible
         name has to come from here rather than from the visible label. */
      aria-label={isCompact ? label : undefined}
      aria-live="polite"
    >
      {/* Both marks are always mounted and crossfaded, so the transition is a
          genuine dissolve rather than one icon popping out and another in.
          The wrapper reserves the icon's box so nothing reflows mid-fade. */}
      <span
        className="call-staff__icons"
        style={{ width: iconSize, height: iconSize }}
        aria-hidden="true"
      >
        <BellRing className="call-staff__icon call-staff__icon--bell" size={iconSize} strokeWidth={2.2} />
        <Check className="call-staff__icon call-staff__icon--check" size={iconSize} strokeWidth={2.4} />
      </span>
      <span className="call-staff__label">{label}</span>
    </button>
  );
}
