import { useState, useEffect, useMemo } from "react";
import { BellRing, Check } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Button  from "../../components/ui/Button.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { useStaffCalls } from "../../lib/useStaffCalls.js";
import { resolveStaffCall } from "../../lib/staffCallData.js";
import { useLanguage } from "../../i18n/useLanguage.js";

const RESOLVED_LIMIT = 10;

/* ═══════════════════════════════════════════════════════════════════════════
   AdminStaffCallsScreen — Phase 25 (Digital Waiter Bell)

   Open staff calls raised by guests, plus a short recently-resolved trail so
   staff can confirm a call really was handled.

   Available to BOTH Admin and Cashier — a waiter bell is front-of-house work
   and Cashier is front-of-house staff, so unlike Menu/Categories/Tables/
   Settings this screen is deliberately NOT in ADMIN_ONLY_NAV_KEYS. Kitchen
   has no route to it at all (it lives entirely under /admin/:slug, which the
   kitchen session can never satisfy).

   Nothing here touches orders. Resolving a call only flips that call's own
   status — order.status and order.paymentStatus are untouched, and no order
   lifecycle code is imported.

   Live refresh comes from useStaffCalls(), which combines the
   "pro-order-staff-call-change" event (instant, same tab) with the same 4s
   localStorage re-read the kitchen board and live orders already use, so a
   call raised in the customer's tab appears here without a manual refresh.
   ═══════════════════════════════════════════════════════════════════════ */

export default function AdminStaffCallsScreen({ restaurant, session, onSignOut, onNavigate }) {
  const { calls, openCalls: openCallsRaw } = useStaffCalls(restaurant.slug);

  /* Phase 91 §17 — OLDEST first.
     getStaffCalls sorts the whole list newest-first, which is right for the
     resolved trail below (the most recently handled call at the top) but
     exactly backwards for a queue: it put the table that had been waiting
     longest at the BOTTOM, under every call that arrived after it. The
     person who has waited longest is the most urgent, so the open list is
     re-sorted ascending here.

     Done at the display site rather than in useStaffCalls on purpose: the
     shared hook also feeds the layout's new-call alert, which tracks calls by
     id, and the resolved trail below still wants newest-first. Only this one
     list needed reversing. */
  const openCalls = useMemo(
    () => [...openCallsRaw].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [openCallsRaw]
  );
  const { t } = useLanguage();

  const [resolvingId, setResolvingId] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  /* Re-render trigger so the "time since request" labels stay accurate
     between data refreshes, without re-reading localStorage every second —
     same split the kitchen board uses for its elapsed labels. */
  const [, forceTick] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => clearInterval(tick);
  }, []);

  const resolvedCalls = useMemo(
    () => calls.filter((c) => c.status === "resolved").slice(0, RESOLVED_LIMIT),
    [calls]
  );

  /* Guarded the same way every other action in the app is: a per-row
     updating flag stops a double-click, and resolveStaffCall() is itself
     idempotent so a repeat is a safe no-op either way. */
  function handleResolve(call) {
    if (resolvingId === call.id) return;
    setResolvingId(call.id);
    const result = resolveStaffCall(restaurant.slug, call.id);
    if (result.ok) {
      setToastMessage(t("staff.callResolvedToast", "Staff call resolved"));
      setToastVisible(true);
    }
    setResolvingId(null);
  }

  return (
    <AdminLayout
      restaurant={restaurant}
      session={session}
      onSignOut={onSignOut}
      activeKey="staffCalls"
      onNavigate={onNavigate}
    >
      <header className="ad-header anim-rise" style={{ animationDelay: "40ms" }}>
        <h1 className="ad-header__title">{t("staff.staffCalls", "Staff Calls")}</h1>
        <p className="ad-header__subtitle">
          {t("staff.staffCallsSubtitle", "Guests asking for assistance at their table.")}
        </p>
      </header>

      {/* ── Open calls ──────────────────────────────────────────────────── */}
      {/* §3 — the count rides WITH the title instead of being flung to the
          opposite edge of the content column, where on a wide screen it read
          as an unrelated number. It is inside the <h2> so the shared
          .ad-section-bar rule — which every other Admin page uses and this
          phase must not touch — keeps its space-between untouched. */}
      <div className="ad-section-bar anim-rise" style={{ animationDelay: "80ms" }}>
        <h2 className="ad-section-title sc-heading">
          {t("staff.openCalls", "Open calls")}
          {openCalls.length > 0 && (
            <span className="sc-count">{openCalls.length}</span>
          )}
        </h2>
      </div>

      {openCalls.length === 0 ? (
        /* §16 — the all-clear state. Same copy and same icon as before, in a
           compact variant: an operational page should say "nobody is waiting"
           without spending a third of the screen doing it. */
        <div className="ad-empty ad-empty--compact anim-rise">
          <span className="ad-empty__icon">
            <BellRing size={22} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("staff.noOpenCalls", "No open staff calls.")}</h3>
          <p className="ad-empty__sub">
            {t("staff.noOpenCallsSub", "When a guest asks for help, their request appears here.")}
          </p>
        </div>
      ) : (
        <div className="sc-list anim-rise" style={{ animationDelay: "120ms" }}>
          {openCalls.map((call) => (
            <StaffCallCard
              key={call.id}
              call={call}
              isResolving={resolvingId === call.id}
              onResolve={() => handleResolve(call)}
            />
          ))}
        </div>
      )}

      {/* ── Recently resolved (read-only trail) ─────────────────────────── */}
      {resolvedCalls.length > 0 && (
        <>
          <div className="ad-section-bar sc-section-bar--resolved anim-rise">
            <h2 className="ad-section-title sc-heading sc-heading--resolved">
              {t("staff.recentlyResolved", "Recently resolved")}
              <span className="sc-count sc-count--resolved">{resolvedCalls.length}</span>
            </h2>
          </div>
          <div className="sc-list anim-rise">
            {resolvedCalls.map((call) => (
              <StaffCallCard key={call.id} call={call} />
            ))}
          </div>
        </>
      )}

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </AdminLayout>
  );
}

/* ── One staff call row ──────────────────────────────────────────────────── */
function StaffCallCard({ call, isResolving, onResolve }) {
  const { t } = useLanguage();
  const isOpen = call.status === "open";
  /* createStaffCall already trims, but a legacy record could still hold
     whitespace. Trimming here means a blank name renders NOTHING rather than
     an empty line that pushes the row taller for no content (§6). */
  const customerName = call.customerName?.trim();
  const elapsed = formatElapsed(isOpen ? call.createdAt : call.updatedAt, t);

  return (
    <Card className={`sc-card ${isOpen ? "sc-card--open" : "sc-card--resolved"}`}>
      <div className="sc-card__main">
        <div className="sc-card__id">
          {/* §5 — the same identifier philosophy as Live Orders 101.1: one
              phrase, display face, word in primary text and the number in
              --gold-ink, because the number is the half that differs between
              rows. The "#" is dropped — "Table 1" is how staff say it. */}
          <p className="sc-card__table">
            <span className="sc-card__table-word">
              {t("customer.yourTable", "Table")}
            </span>
            <span className="sc-card__table-num">{call.tableNumber}</span>
          </p>
          {customerName && (
            <p className="sc-card__customer">{customerName}</p>
          )}
        </div>

        <div className="sc-card__meta">
          <Badge tone={isOpen ? "preparing" : "ready"} dot>
            {isOpen ? t("staff.statusOpen", "Open") : t("staff.statusResolved", "Resolved")}
          </Badge>
          {/* §8/§13 — an open call shows the bare wait, which is what staff
              triage on. A resolved one names what the time refers to, so the
              trail reads as "handled N ago" rather than as another queue.
              Both strings already exist; nothing new was added. */}
          <span className="sc-card__elapsed">
            {isOpen
              ? elapsed
              : `${t("staff.statusResolved", "Resolved")} ${elapsed}`}
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="sc-card__action">
          <Button size="sm" disabled={isResolving} onClick={onResolve} icon={Check}>
            {t("staff.resolve", "Resolve")}
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
/* Translated elapsed label. The {n} placeholder keeps the number outside the
   translated string so Arabic can put it wherever reads naturally ("منذ 5
   دقيقة") instead of being forced into English word order. */
function formatElapsed(iso, t) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffMin = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (diffMin < 1) return t("staff.elapsedJustNow", "just now");
  if (diffMin < 60) return t("staff.elapsedMinutes", "{n} min ago").replace("{n}", diffMin);

  return t("staff.elapsedHours", "{n} h ago").replace("{n}", Math.floor(diffMin / 60));
}
