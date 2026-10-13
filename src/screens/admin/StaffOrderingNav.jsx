import { ShoppingBag } from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";
import { useTableData } from "../../lib/useTableData.js";
import { DIRECT_ORDER_CONTEXT, formatTableNumber } from "../../lib/staffOrdering.js";

/* ═══════════════════════════════════════════════════════════════════════════
   StaffOrderingNav — Phase 112.0

   The sidebar's ordering section: one Direct Order button, then every table
   as a square number.

   ── WHY THE TABLE BUTTONS SAY ONLY A NUMBER ──────────────────────────────
   Because there are dozens of them and they are a keypad, not a list. "Table
   05" repeated thirty times is the word "Table" thirty times and the number
   buried inside it; the number alone is what the cashier is looking for. The
   word is still there for anyone who cannot see the grid — every button
   carries aria-label="Table 05" — so nothing is lost, only the visual noise.

   Two digits minimum, so the column edges line up: 1 reads as 01, 12 stays
   12, 100 stays 100. This is a LABEL ONLY. The stored tableNumber is never
   rewritten, and nothing downstream has to know this formatting exists.

   ── INACTIVE TABLES ──────────────────────────────────────────────────────
   Shown, disabled, subdued. Hiding them would make a deactivated table look
   deleted; enabling them would let staff seat an order at a table the
   restaurant has closed. Reactivation stays where it already lives — Tables
   & Access — and this screen has no second switch for it.

   ── DEFERRED: LIVE CONNECTED DEVICES (roadmap item B) ────────────────────
   A future badge will show how many devices are genuinely connected at each
   table. It is NOT implemented and no count is shown, because a truthful
   count needs server-side presence — heartbeats, expiry, disconnect
   detection, de-duplicated device identities — and anything inferable in the
   browser today (old sessions, order history) would be a number that looks
   live and is not. The button is already the right shape for it: it is
   position:relative with a documented .so-tablebtn__badge corner in the
   stylesheet, so adding the badge later is markup inside this button, not a
   redesign of the sidebar. See docs/BACKEND-ROADMAP.md.
   ═══════════════════════════════════════════════════════════════════════ */

export default function StaffOrderingNav({ restaurantSlug, activeContext, onSelect }) {
  const { t } = useLanguage();
  const { tables } = useTableData(restaurantSlug);

  const ordered = [...tables].sort(
    (a, b) =>
      (a.sortOrder ?? a.tableNumber ?? 0) - (b.sortOrder ?? b.tableNumber ?? 0) ||
      (a.tableNumber ?? 0) - (b.tableNumber ?? 0)
  );

  const directActive = activeContext === DIRECT_ORDER_CONTEXT;

  return (
    <section className="so-nav" aria-label={t("staffOrder.title", "Staff Ordering")}>
      <h2 className="so-nav__title">{t("staffOrder.title", "Staff Ordering")}</h2>

      {/* Row one, on its own, full width: the order that belongs to no table
          is not one of the tables. */}
      <button
        type="button"
        className={`so-direct${directActive ? " so-direct--active" : ""}`}
        aria-pressed={directActive}
        onClick={() => onSelect(DIRECT_ORDER_CONTEXT)}
      >
        <ShoppingBag size={15} strokeWidth={2} aria-hidden="true" />
        <span>{t("staffOrder.directOrder", "Direct Order")}</span>
      </button>

      {ordered.length === 0 ? (
        <p className="so-nav__empty">
          {t("staffOrder.noTables", "No tables yet.")}
        </p>
      ) : (
        <div className="so-tables" role="group" aria-label={t("admin.tablesAndAccess", "Tables & Access")}>
          {ordered.map((table) => {
            const label = formatTableNumber(table.tableNumber);
            const active = activeContext === table.id;
            return (
              <button
                key={table.id}
                type="button"
                className={`so-tablebtn${active ? " so-tablebtn--active" : ""}`}
                aria-pressed={active}
                /* The word the button does not print, for anyone who is not
                   looking at the grid. */
                aria-label={`${t("customer.yourTable", "Table")} ${label}`}
                disabled={!table.isActive}
                title={
                  table.isActive
                    ? undefined
                    : t("staffOrder.tableInactive", "Inactive table")
                }
                onClick={() => onSelect(table.id)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
