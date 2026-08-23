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
  const { calls, openCalls } = useStaffCalls(restaurant.slug);
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
      <div className="ad-section-bar anim-rise" style={{ animationDelay: "80ms" }}>
        <h2 className="ad-section-title">{t("staff.openCalls", "Open calls")}</h2>
        {openCalls.length > 0 && (
          <span className="ad-section-count">{openCalls.length}</span>
        )}
      </div>

      {openCalls.length === 0 ? (
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <BellRing size={28} strokeWidth={1.7} />
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
          <div className="ad-section-bar anim-rise">
            <h2 className="ad-section-title">{t("staff.recentlyResolved", "Recently resolved")}</h2>
            <span className="ad-section-count">{resolvedCalls.length}</span>
          </div>
          <div className="sc-list sc-list--resolved anim-rise">
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

  return (
    <Card className={`sc-card ${isOpen ? "sc-card--open" : "sc-card--resolved"}`}>
      <div className="sc-card__main">
        <div className="sc-card__id">
          <span className="sc-card__table">
            {t("customer.yourTable", "Table")} <span className="sc-card__table-num">#{call.tableNumber}</span>
          </span>
          <p className="sc-card__customer">{call.customerName}</p>
        </div>

        <div className="sc-card__meta">
          <Badge tone={isOpen ? "preparing" : "ready"} dot>
            {isOpen ? t("staff.statusOpen", "Open") : t("staff.statusResolved", "Resolved")}
          </Badge>
          <span className="sc-card__elapsed">{formatElapsed(isOpen ? call.createdAt : call.updatedAt, t)}</span>
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
