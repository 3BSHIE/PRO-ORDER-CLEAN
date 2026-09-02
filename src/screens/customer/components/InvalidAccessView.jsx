import { QrCode, CircleAlert, ArrowLeft } from "lucide-react";
import Button from "../../../components/ui/Button.jsx";
import RestaurantIdentity from "./RestaurantIdentity.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * InvalidAccessView — Phase 24, reworked in Phase 74 (§39, §41–§43).
 *
 * Shown whenever resolveTableAccess() fails. Three reasons reach it, and
 * before this phase all three rendered the same red "Invalid table access"
 * screen — which meant an INACTIVE table (a perfectly valid QR for a table
 * the restaurant has closed) told the guest their code was invalid, the
 * opposite of what had actually happened. The real explanation sat in the
 * smallest, most muted line on the page.
 *
 * Two distinct states now, sharing one geometry (§39):
 *
 *   inactive              amber mark, "This table isn't available right now",
 *                         and the genuinely useful instruction — ask a staff
 *                         member — promoted to the helper line.
 *   token / restaurant    amber mark, "This QR code couldn't be opened", and
 *                         guidance to re-scan the printed code on the table.
 *
 * Severity is carried by COLOUR, not by changing the composition per state.
 * Neither is red: a mis-scan and a closed table are both ordinary, benign
 * situations, and red is reserved for a genuine application fault (the error
 * boundary). Neither exposes "token", "slug" or any other internal term.
 *
 * ACTION HIERARCHY (§43) — "Back to home" is deliberately NOT primary. A
 * guest sitting at a table wants to re-scan the code in front of them, not
 * visit a marketing home page, so the instruction is the message and home is
 * a demoted outline escape.
 *
 * @param {"restaurant"|"token"|"inactive"} reason
 * @param {() => void} onHome
 * @param {string} [restaurantName] — passed only when the caller already
 *   resolved it safely. Absent for an unknown restaurant, where there is
 *   genuinely no venue to name.
 */
export default function InvalidAccessView({ reason, onHome, restaurantName }) {
  const { t } = useLanguage();
  const isInactive = reason === "inactive";

  const title = isInactive
    ? t("common.tableUnavailableTitle", "This table isn't available right now")
    : t("common.qrNotOpenedTitle", "This QR code couldn't be opened");

  const help = isInactive
    ? t("common.askStaffForHelp", "Please ask a staff member for assistance.")
    : t("common.rescanTableQr", "Please scan the QR code on your table again.");

  return (
    <div className="access access--recovery anim-rise">
      {/* §42/§48 — the venue is named when the caller could resolve it. For an
          unrecognised restaurant there is nothing to show, and the component
          simply renders without identity rather than inventing one. */}
      {restaurantName && (
        <RestaurantIdentity name={restaurantName} variant="compact" />
      )}

      <span className="access__mark access__mark--warn">
        {isInactive ? (
          <CircleAlert size={30} strokeWidth={1.9} />
        ) : (
          <QrCode size={30} strokeWidth={1.9} />
        )}
      </span>

      <h1 className="access__title">{title}</h1>
      <p className="access__msg">{help}</p>

      <Button variant="outline" size="sm" icon={ArrowLeft} onClick={onHome}>
        {t("common.backHome", "Back to home")}
      </Button>
    </div>
  );
}
