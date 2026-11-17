import { useState, useRef } from "react";
import { LifeBuoy } from "lucide-react";
import { useLanguage } from "../../../i18n/useLanguage.js";
import AssistanceSheet from "./AssistanceSheet.jsx";

/**
 * AssistanceButton — Phase 123.0. The one way a guest asks for anything.
 *
 * It replaces CallStaffButton, which rang a bell and said nothing about what
 * was wanted. The label is the same everywhere — "Need Help?" — because a
 * guest should not have to learn that "Call Staff" on the menu and a
 * different phrase on the tracking screen are the same door.
 *
 * ── WHY IT NO LONGER CONFIRMS BY ITSELF ───────────────────────────────────
 * The old control turned gold and read "Staff notified" while a call was
 * open, which also meant it refused to send a second, different request.
 * That is now wrong: a guest who asked for napkins may legitimately need the
 * table cleared two minutes later. The entry stays an entry, the sheet
 * handles the confirmation, and the independence of two requests is enforced
 * in the data layer rather than by disabling a button.
 *
 * ── THE VARIANTS ──────────────────────────────────────────────────────────
 *   "compact"    — in a sticky topbar beside table identity. Icon-led; the
 *                  label collapses on narrow phones and the accessible name
 *                  comes from aria-label.
 *   "subtle"     — a quiet inline pill.
 *   "prominent"  — used on screens where asking for a person is the most
 *                  likely thing the guest wants (tracking, a payment that
 *                  needs someone). It was a full-width outlined pill the
 *                  width of the screen; it is now the same compact utility
 *                  action, centered. A control is not made more helpful by
 *                  being made larger than the content it sits under.
 *
 * Props:
 *   restaurantSlug, tableId, tableNumber, customerName — who is asking, and
 *     from which table. Unchanged from the control this replaces.
 *   variant  — "subtle" (default) | "compact" | "prominent"
 *   onNotify — optional (message) => void for the parent's Toast.
 */
export default function AssistanceButton({
  restaurantSlug,
  tableId,
  tableNumber,
  customerName,
  variant = "subtle",
  onNotify,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  /* The sheet renders through a portal, so it needs to be told where the
     restaurant's theme lives — see AssistanceSheet for why portalling to
     <body> alone put it outside those variables. This button is always
     inside the customer theme, so it is the honest anchor. */
  const anchorRef = useRef(null);

  const label = t("assist.needHelp", "Need Help?");
  const isCompact = variant === "compact";
  const iconSize = variant === "prominent" ? 15 : 14;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`help-btn help-btn--${variant}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        /* The compact variant hides its text under 400px, so the accessible
           name has to come from here rather than from the visible label. */
        aria-label={isCompact ? label : undefined}
      >
        <LifeBuoy size={iconSize} strokeWidth={2.2} aria-hidden="true" />
        <span className="help-btn__label">{label}</span>
      </button>

      <AssistanceSheet
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        restaurantSlug={restaurantSlug}
        tableId={tableId}
        tableNumber={tableNumber}
        customerName={customerName}
        onNotify={onNotify}
      />
    </>
  );
}
