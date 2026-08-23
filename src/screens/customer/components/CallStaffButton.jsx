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
 * Two visual variants, no behavioral difference between them:
 *   "subtle"     — a quiet inline pill (Menu, and Tracking for live orders)
 *   "prominent"  — a centered, full-width call to action, used only when an
 *                  order was canceled and the guest most likely needs a
 *                  person right now.
 *
 * Duplicate prevention is layered:
 *   1. This component reads the live call list and, when this table already
 *      has an open call, renders a calm "already called" state instead of a
 *      fresh-looking button.
 *   2. Pressing it in that state deliberately still works, but only re-shows
 *      the "already called" message — it never creates a second call.
 *   3. createStaffCall() in src/lib/staffCallData.js refuses the duplicate at
 *      the storage layer regardless, which is the guard that actually counts
 *      (two tabs on the same table, stale state, double-click, etc.).
 *
 * The customer can only ever CREATE a call — there is no path from this
 * component to resolveStaffCall(); resolving is Admin/Cashier only.
 *
 * Props:
 *   restaurantSlug — which restaurant's call list to read/write
 *   tableId, tableNumber — the table the guest is physically sitting at
 *   customerName   — shown to staff so they know who asked
 *   variant        — "subtle" (default) | "prominent"
 *   onNotify       — (message: string) => void; the parent owns the Toast,
 *                    matching how every other screen in the app does toasts
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

  const label = isProminent
    ? t("staff.callWaiterForHelp", "Call Waiter for Help")
    : t("staff.callStaff", "Call Staff");

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
      className={`call-staff ${isProminent ? "call-staff--prominent" : "call-staff--subtle"} ${
        hasOpenCall ? "call-staff--called" : ""
      }`}
      onClick={handleClick}
      aria-live="polite"
    >
      {hasOpenCall ? (
        <Check size={isProminent ? 17 : 14} strokeWidth={2.4} />
      ) : (
        <BellRing size={isProminent ? 17 : 14} strokeWidth={2.2} />
      )}
      <span>{hasOpenCall ? t("staff.staffCalledShort", "Staff called") : label}</span>
    </button>
  );
}
