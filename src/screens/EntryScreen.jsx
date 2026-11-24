import { QrCode, Compass } from "lucide-react";
import BrandMarkStatic from "../components/brand/BrandMarkStatic.jsx";
import LanguageSwitcher from "../components/i18n/LanguageSwitcher.jsx";
import { useLanguage } from "../i18n/useLanguage.js";

/**
 * EntryScreen — Phase 125.0. What is at the base of the application now.
 *
 * The old landing page answered a question nobody outside the project was
 * asking: "which of our three demo surfaces would you like to look at?". It
 * listed Customer, Kitchen and Admin to anyone who opened the address, which
 * is the opposite of how a restaurant system should present itself.
 *
 * What replaces it is the smallest honest answer to how someone actually
 * arrives here: they opened the bare address, or followed a stale link, and
 * the only thing that can help them is the code printed on their table.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * It names no restaurant and no table, because it has no way to know either
 * and inventing one is how a guest ends up ordering onto somebody else's
 * bill. It links to no operational route: a bare visitor is not a cashier,
 * and a door marked "Staff" on a public page is an invitation. It sells
 * nothing — there is no hero, no headline and no phase badge. And it does
 * not link to the Developer Hub, which is the whole point of the hub being
 * somewhere else.
 *
 * Two variants, one layout, because the two situations differ by one
 * sentence: `entry` is "you are at the front door with no key", `notFound`
 * is "that address is not one of ours" — and both end with the same advice,
 * which is the only advice there is.
 */
export default function EntryScreen({ variant = "entry" }) {
  const { t } = useLanguage();
  const isNotFound = variant === "notFound";
  const Icon = isNotFound ? Compass : QrCode;

  return (
    <main className="entry">
      {/* The product's own mark, not a restaurant's: at this point no venue
          has been resolved, so there is no identity to borrow. */}
      <div className="entry__bar">
        <BrandMarkStatic size={22} />
        <LanguageSwitcher variant="compact" />
      </div>

      <div className="entry__body">
        <span className="entry__mark" aria-hidden="true">
          <Icon size={28} strokeWidth={1.9} />
        </span>

        <h1 className="entry__title">
          {isNotFound
            ? t("entry.notFoundTitle", "This page isn't available")
            : t("entry.title", "Scan the code on your table")}
        </h1>

        <p className="entry__msg">
          {isNotFound
            ? t(
                "entry.notFoundMsg",
                "The address you opened doesn't match anything here. To order, scan the QR code on your table.",
              )
            : t(
                "entry.msg",
                "PRO·ORDER opens from the QR code at your table, which tells us where you're sitting. Please scan it to see the menu.",
              )}
        </p>

        <p className="entry__hint">
          {t("entry.help", "If the code won't scan, ask a member of staff for help.")}
        </p>
      </div>
    </main>
  );
}
