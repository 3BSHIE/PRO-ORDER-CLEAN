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

/* Phase 97.8.1 — the destinations an attention item can point at, in the order
   their overflow actions appear. A fixed list rather than the order the hidden
   items happen to arrive in, so the footer does not reshuffle itself as the
   queue changes underneath it. These are the existing admin pages; no route is
   added and no combined destination is invented. */
const DESTINATION_ORDER = ["liveOrders", "staffCalls"];

/* Each action names the page it opens, so an operator reads where they are
   about to go before they press it. The count is part of the label rather than
   a badge — the footer is two small buttons and a separate pill on each one
   would out-decorate the rows above it. */
const MORE_LABEL = {
  liveOrders: {
    key: "admin.viewMoreInLiveOrders",
    fallback: "View more in Live Orders ({n})",
  },
  staffCalls: {
    key: "admin.viewMoreStaffCalls",
    fallback: "View more Staff Calls ({n})",
  },
};

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

  /* Phase 97.8.1 — the overflow affordance is derived from where the hidden
     items ACTUALLY live, not assumed.

     It previously always said "and N more" and always went to Live Orders,
     which is wrong the moment a hidden item is a staff call: the operator
     lands on a screen that does not contain the thing they were told about,
     and nothing on it explains why. Counting the hidden items per destination
     and labelling each action with its own page is the whole fix — one action
     when the hidden items share a destination, two when they do not, and the
     misleading generic case disappears because it can no longer be produced.

     Iterating DESTINATION_ORDER rather than the hidden items keeps the
     actions in a stable order regardless of which condition happens to spill
     over first. */
  const hidden = items.slice(MAX_ROWS);
  const hiddenDestinations = DESTINATION_ORDER.map((destination) => ({
    destination,
    count: hidden.filter((item) => item.destination === destination).length,
  })).filter((entry) => entry.count > 0);

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

        {hiddenDestinations.length > 0 && (
          <li className="ad-attention__more-row">
            {hiddenDestinations.map(({ destination, count }) => (
              <button
                key={destination}
                type="button"
                className="ad-attention__more"
                onClick={() => onNavigate(destination)}
              >
                {t(
                  MORE_LABEL[destination].key,
                  MORE_LABEL[destination].fallback
                ).replace("{n}", count)}
                <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ))}
          </li>
        )}
      </ul>
    </>
  );
}
