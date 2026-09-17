import { AlertTriangle, BellRing, HandPlatter, Wallet, ChevronRight } from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import { ATTENTION_KIND } from "../../lib/operationalAttention.js";

/* How many rows the section will ever show at once (§17). Five is enough to
   cover a genuinely busy moment without the Overview turning into a second
   Live Orders; past that the count line takes over and sends the operator to
   the screen built for working through a queue. No pagination, no inner
   scroll area — both were ruled out, and both would make a short list that
   exists to be read at a glance into something you have to operate. */
const MAX_ROWS = 5;

/* Per-condition presentation. The tone names map onto the semantic classes
   the dashboard already uses, so nothing here introduces a new alert palette
   (§26): delayed borrows the existing warning language, Ready keeps its own
   Ready semantics rather than being restyled as lateness (§12), a staff call
   takes the same operational emphasis the nav badge uses, and an unpaid bill
   stays neutral because it is a task, not an alarm. */
const KIND_META = {
  [ATTENTION_KIND.DELAYED]: {
    icon: AlertTriangle,
    tone: "delayed",
    labelKey: "kitchen.delayed",
    labelFallback: "Delayed",
  },
  [ATTENTION_KIND.STAFF_CALL]: {
    icon: BellRing,
    tone: "call",
    labelKey: "staff.staffCalls",
    labelFallback: "Staff Calls",
  },
  [ATTENTION_KIND.READY]: {
    icon: HandPlatter,
    tone: "ready",
    labelKey: "admin.readyToServe",
    labelFallback: "Ready to Serve",
  },
  [ATTENTION_KIND.PENDING_PAYMENT]: {
    icon: Wallet,
    tone: "payment",
    labelKey: "admin.pendingPayments",
    labelFallback: "Pending Payments",
  },
};

/**
 * NeedsAttentionSection — the short operational queue on the Overview.
 *
 * Phase 97.8 §6–§19.
 *
 * ── WHAT IT IS ────────────────────────────────────────────────────────────
 * "What needs a person right now?", and nothing else. It reports; the
 * dedicated screens act (§11). There is deliberately no Resolve button here:
 * Overview would then hold a second, partial copy of the Staff Calls
 * management surface, and the two would disagree the first time one of them
 * changed.
 *
 * ── WHY IT DISAPPEARS WHEN EMPTY ──────────────────────────────────────────
 * §18 allows either hiding or a calm "all caught up" line. It hides: an empty
 * operational queue is the normal state for most of a shift, and a permanent
 * card announcing that nothing is wrong is a card the operator learns to skip
 * — which is exactly the habit you do not want when it later has something in
 * it. Its absence IS the calm state.
 *
 * ── PARITY ────────────────────────────────────────────────────────────────
 * No role branch exists in this file, by construction. Admin and Cashier
 * render the same component from the same data with the same destinations
 * (§20).
 *
 * Props:
 *   items      — from buildAttentionItems(), already prioritised
 *   onNavigate — (adminPage) => void, the Overview's existing navigator
 */
export default function NeedsAttentionSection({ items = [], onNavigate }) {
  const { t } = useLanguage();

  if (!items.length) return null;

  const shown = items.slice(0, MAX_ROWS);
  const overflow = items.length - shown.length;

  return (
    <>
      <div className="ad-section-bar anim-rise">
        <h2 className="ad-section-title">{t("admin.needsAttention", "Needs Attention")}</h2>
        <span className="ad-section-count">{items.length}</span>
      </div>

      <ul className="ad-attention anim-rise">
        {shown.map((item) => {
          const meta = KIND_META[item.kind];
          const Icon = meta.icon;
          const label = t(meta.labelKey, meta.labelFallback);

          /* The whole row is the control — an operator reaching for this on a
             tablet mid-service should not have to find a small chevron. */
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`ad-attention__row ad-attention__row--${meta.tone}`}
                onClick={() => onNavigate(item.destination)}
              >
                <span className={`ad-attention__icon ad-attention__icon--${meta.tone}`}>
                  <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
                </span>

                <span className="ad-attention__body">
                  <span className="ad-attention__label">{label}</span>
                  <span className="ad-attention__where">
                    {t("customer.yourTable", "Table")} #{item.tableNumber}
                    {item.orderId && (
                      <>
                        <span className="ad-attention__sep" aria-hidden="true"> · </span>
                        <span className="ad-attention__order">{item.orderId}</span>
                      </>
                    )}
                    {item.amount ? (
                      <>
                        <span className="ad-attention__sep" aria-hidden="true"> · </span>
                        {fmtPrice(item.amount)}
                      </>
                    ) : null}
                  </span>
                </span>

                {/* Elapsed time is context, never a threshold that decided
                    whether this row exists (§9). */}
                {item.minutes !== null && (
                  <span className="ad-attention__age">
                    {t("admin.elapsedMinutes", "{n} min").replace("{n}", item.minutes)}
                  </span>
                )}

                <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </li>
          );
        })}

        {overflow > 0 && (
          <li>
            <button
              type="button"
              className="ad-attention__more"
              onClick={() => onNavigate("liveOrders")}
            >
              {t("admin.andNMore", "and {n} more").replace("{n}", overflow)}
              <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
    </>
  );
}
