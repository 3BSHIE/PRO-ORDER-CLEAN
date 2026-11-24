import { QrCode, CircleAlert, Store } from "lucide-react";
import RestaurantIdentity from "./RestaurantIdentity.jsx";
import { useSettingsData } from "../../../lib/useSettingsData.js";
import { resolveRestaurantDisplayName } from "../../../lib/restaurantName.js";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * InvalidAccessView — Phase 24, reworked in Phase 74, split again in Phase 90.
 *
 * Shown whenever resolveTableAccess() fails. THREE distinct situations reach
 * it, and Phase 90 finally gives each its own words:
 *
 *   inactive    A valid QR for a table the restaurant has taken out of
 *               service. amber, "This table isn't available right now", and
 *               the genuinely useful instruction — ask a staff member.
 *   token       The restaurant is real, this table code is not. amber,
 *               "This QR code couldn't be opened", re-scan the printed code.
 *   restaurant  The venue itself could not be resolved at all. amber,
 *               "We couldn't find this restaurant".
 *
 * WHAT CHANGED IN PHASE 90 (§6, §12)
 *   `restaurant` used to share the token copy, so a link to a venue that does
 *   not exist told the guest their QR code could not be opened — pointing them
 *   at the code in front of them when the code was never the problem. §6 rules
 *   that out explicitly ("Do NOT use Invalid QR when: restaurant does not
 *   exist") and §12 gives the state its own title. They are separate now.
 *
 * Severity is carried by COLOUR, not by changing the composition per state.
 * None of the three is red: a mis-scan, a closed table and an unknown link are
 * all ordinary situations, and red stays reserved for a genuine application
 * fault (the error boundary). None exposes "token", "slug" or any other
 * internal term (§6, §12).
 *
 * RESTAURANT IDENTITY (§3)
 *   Shown whenever the caller could resolve the venue — which is both the
 *   inactive and token cases, since resolveTableAccess carries the restaurant
 *   on each. Deliberately NOT shown for `restaurant`: there is genuinely no
 *   venue to name, and inventing one is what §3 forbids. The logo goes through
 *   RestaurantIdentity's existing safe-image path, so a broken or missing URL
 *   degrades to the monogram rather than a broken-image glyph.
 *
 * ACTION HIERARCHY (§14, revised in Phase 125.0) — there is no action at
 * all now, and that is the correct number. The old "Back to home" was a
 * demoted escape to a landing page that no longer exists; the page it went
 * to listed Customer, Kitchen and Admin demos, which was never a useful
 * destination for a guest holding a phone at a table. What helps them is
 * written above it: re-scan the code. No "Scan QR" button exists anywhere
 * here either — the web app cannot open a camera, and §14 rules out
 * inventing one.
 *
 * @param {"restaurant"|"token"|"inactive"} reason
 * @param {string} [restaurantName] — the RESOLVED venue's name. Its presence
 *   is what authorises showing identity at all: callers pass it only from
 *   resolveTableAccess's own `restaurant`, so it is absent exactly when the
 *   venue is unknown.
 * @param {string} [restaurantSlug] — used to pick up the live settings
 *   override and the logo. Never used to invent identity on its own.
 */
export default function InvalidAccessView({ reason, restaurantName, restaurantSlug }) {
  const { t } = useLanguage();

  /* Identity is resolved HERE rather than by each caller because the live name
     and logo live in settings, not on the restaurant record, and three of the
     six callers reach this gate before they have settings in scope. One place,
     one rule, and it matches how every other customer surface resolves
     identity: settings override first, the record's name as the fallback.

     The hook runs unconditionally (it must), but its result is only ever USED
     when restaurantName is present — so an unresolved venue cannot pick up a
     default settings name and fabricate an identity §3 forbids. */
  const { settings } = useSettingsData(restaurantSlug);
  const displayName = restaurantName
    ? resolveRestaurantDisplayName(settings, { restaurantName }, null)
    : null;
  const logoUrl = restaurantName ? settings?.logoUrl : null;

  const isInactive = reason === "inactive";
  const isUnknownRestaurant = reason === "restaurant";

  const Icon = isInactive ? CircleAlert : isUnknownRestaurant ? Store : QrCode;

  const title = isInactive
    ? t("common.tableUnavailableTitle", "This table isn't available right now")
    : isUnknownRestaurant
      ? t("common.restaurantNotFoundTitle", "We couldn't find this restaurant")
      : t("common.qrNotOpenedTitle", "This QR code couldn't be opened");

  /* Both non-inactive cases end with the same instruction — re-scan the code
     on the table — because that is genuinely the only thing that helps in
     either. The TITLES differ, which is what tells the guest whether the venue
     or the code was the problem. */
  const help = isInactive
    ? t("common.askStaffForHelp", "Please ask a staff member for assistance.")
    : t("common.rescanTableQr", "Please scan the QR code on your table again.");

  return (
    <div className="access access--recovery anim-rise">
      {/* §3 — the venue is named, with its logo, when the caller could
          resolve it. For an unrecognised restaurant there is nothing to show
          and the component renders without identity rather than inventing
          one. */}
      {displayName && (
        <RestaurantIdentity name={displayName} logoUrl={logoUrl} variant="compact" />
      )}

      <span className="access__mark access__mark--warn" aria-hidden="true">
        <Icon size={30} strokeWidth={1.9} />
      </span>

      <h1 className="access__title">{title}</h1>
      <p className="access__msg">{help}</p>
    </div>
  );
}
