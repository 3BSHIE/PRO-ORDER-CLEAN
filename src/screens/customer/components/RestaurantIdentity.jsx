import RestaurantLogo from "../../../components/brand/RestaurantLogo.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * RestaurantIdentity — Phase 45.
 *
 * The restaurant's own mark, used everywhere the guest needs to know whose
 * ordering experience they are in. One component with two densities so the
 * hierarchy stays consistent instead of each screen inventing its own:
 *
 *   variant="hero"     the brand moment — Welcome and the Menu header.
 *                      Logo at 44px beside the name in the restaurant's own
 *                      heading font, and the name is the largest text on the
 *                      screen.
 *   variant="compact"  deeper screens (Cart, Tracking, My Orders,
 *                      Confirmation), where the restaurant must stay
 *                      identifiable without a second full header competing
 *                      with the page's own title.
 *
 * Phase 112.2c — the NAME is optional too, and independently. A restaurant
 * whose logo already contains its name should not have that name printed
 * again beside it, so all four states are first-class here:
 *
 *   name + logo   the approved lockup, unchanged
 *   name only     unchanged — nothing has ever reserved space for a missing
 *                 image
 *   logo only     the logo takes the space the pair would have shared
 *                 (.rest-identity--logo-only, sized per surface in CSS) and
 *                 carries the accessible name the text used to provide
 *   neither       an empty flex box: no fabricated text, no placeholder
 *                 artwork, and no height, because a flex container with no
 *                 children has none
 *
 * Both the name and the surrounding type inherit the Phase 31 customer theme,
 * so a restaurant's chosen heading font and accent flow through untouched.
 *
 * Props:
 *   name     — the restaurant's display name (already resolved by the caller,
 *              Settings override included). Never translated.
 *   logoUrl  — optional; omitted or empty renders name-only.
 *   variant  — "hero" | "compact"
 */
export default function RestaurantIdentity({ name, logoUrl, variant = "hero" }) {
  const { t } = useLanguage();
  /* Trimmed here rather than trusted from the caller: "   " is not a name,
     and it must not produce a name-shaped empty element. */
  const label = typeof name === "string" ? name.trim() : "";
  /* ── Phase 84.1 — no broken-image icons ────────────────────────────────
     This used to render the <img> whenever logoUrl was any non-empty string,
     with no validation and no error handling. A restaurant whose logo URL was
     mistyped, unreachable, or simply not an image got the browser's broken-
     image glyph next to its own name — on the Menu header, the Cart, Tracking,
     My Orders, Confirmation and inside the Restaurant Info sheet.

     The Welcome screen and the Loading screen already did this correctly
     (Unit 1): validate the URL, listen for onError, and fall back. This brings
     the shared component in line with them, using the SAME helper rather than
     a second validation system (§3).

     The fallback needs no new markup. A restaurant with no logo has always
     rendered name-only here — that is what the component was designed for —
     so a logo that fails produces exactly the DOM an absent logo produces.
     Nothing about layout, spacing, typography or size changes (§4/§15).

     Why the failure is tracked as a URL rather than a boolean: a boolean
     would latch. Once a broken logo failed, switching the restaurant to a
     working one would keep showing the fallback until the component
     unmounted. Storing WHICH url failed makes the state self-clearing — a new
     logoUrl no longer matches, so the image is attempted again (test case E). */
  /* Phase 112.2 — the validation, the asset resolution and the broken-image
     fallback all moved into RestaurantLogo, which every other surface now
     uses too. It renders nothing when there is no usable logo, which is
     exactly the name-only DOM this component has always produced in that
     case: no layout, spacing or typography changed.

     Phase 112.2c removed the `if (!name) return null` that used to open this
     function. It predated optional names and meant a logo-only restaurant
     rendered NOTHING — logo included — on every surface that uses this
     component. */
  return (
    <div
      className={[
        "rest-identity",
        `rest-identity--${variant}`,
        label ? "" : "rest-identity--logo-only",
      ].filter(Boolean).join(" ")}
    >
      <RestaurantLogo
        src={logoUrl}
        className="rest-identity__logo"
        /* Decorative while the name is beside it — a screen reader would
           otherwise announce the restaurant twice. With no name there is
           nothing else to announce, so the image takes over: a generic,
           translated description, never an invented restaurant name. */
        alt={label ? "" : t("common.restaurantLogo", "Restaurant logo")}
      />
      {label && <span className="rest-identity__name">{label}</span>}
    </div>
  );
}
