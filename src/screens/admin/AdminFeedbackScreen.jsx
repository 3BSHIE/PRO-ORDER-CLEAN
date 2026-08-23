import { useMemo } from "react";
import { MessageSquareHeart, Star } from "lucide-react";
import Card   from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import StarRating from "../../components/ui/StarRating.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { useFeedback } from "../../lib/useFeedback.js";
import { summarizeFeedback } from "../../lib/feedbackData.js";
import { useLanguage } from "../../i18n/useLanguage.js";

/* ═══════════════════════════════════════════════════════════════════════════
   AdminFeedbackScreen — Phase 29

   Read-only review of customer feedback. There is no edit, reply, delete, or
   moderation path here by design — this phase only surfaces what guests
   submitted.

   Admin-only, using the project's established three-layer pattern (same as
   Menu / Categories / Tables & QR / Settings):
     1. AdminLayout filters the nav item out for a Cashier session
     2. App.jsx's route guard refuses to render this screen for a Cashier,
        whatever adminPage happens to be set to
     3. the redundant role check below, in case a future code path reaches
        this component another way
   Kitchen has no route into /admin at all, so it can never see this.

   Navigation follows the existing in-page pattern (adminPage state, URL stays
   /admin/:restaurantSlug) rather than introducing a separate /admin/feedback
   route — every admin page since Phase 18 works this way, and adding a second
   navigation mechanism for one screen would be inconsistent.
   ═══════════════════════════════════════════════════════════════════════ */

export default function AdminFeedbackScreen({ restaurant, session, onSignOut, onNavigate }) {
  const { t } = useLanguage();
  const { feedback } = useFeedback(restaurant.slug);

  const summary = useMemo(() => summarizeFeedback(feedback), [feedback]);

  /* Layer 3 — redundant, defense-in-depth guard. Hooks above still run
     unconditionally (rules of hooks); only the returned UI differs. */
  if (session.role !== "admin") {
    return (
      <AdminLayout
        restaurant={restaurant}
        session={session}
        onSignOut={onSignOut}
        activeKey="feedback"
        onNavigate={onNavigate}
      >
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <MessageSquareHeart size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("admin.accessRestricted", "Access restricted")}</h3>
          <p className="ad-empty__sub">
            {t("admin.accessRestrictedMsg", "This section is only available to Admin accounts.")}
          </p>
          <Button onClick={() => onNavigate("overview")} style={{ marginTop: 16 }}>
            {t("admin.backToOverview", "Back to Overview")}
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      restaurant={restaurant}
      session={session}
      onSignOut={onSignOut}
      activeKey="feedback"
      onNavigate={onNavigate}
    >
      <header className="ad-header anim-rise" style={{ animationDelay: "40ms" }}>
        <h1 className="ad-header__title">{t("feedback.feedback", "Feedback")}</h1>
        <p className="ad-header__subtitle">
          {t("feedback.adminSubtitle", "What guests said about their delivered orders.")}
        </p>
      </header>

      {/* ── Lightweight summary (count + two averages, nothing more) ────── */}
      <div className="ad-stats anim-rise" style={{ animationDelay: "80ms" }}>
        <Card className="ad-stat">
          <span className="ad-stat__dot ad-stat__dot--gold" />
          <span className="ad-stat__value">{summary.count}</span>
          <span className="ad-stat__label">{t("feedback.totalFeedback", "Total Feedback")}</span>
        </Card>
        <Card className="ad-stat">
          <span className="ad-stat__dot ad-stat__dot--gold" />
          <span className="ad-stat__value">
            {summary.averageFood === null ? "—" : summary.averageFood}
          </span>
          <span className="ad-stat__label">{t("feedback.avgFood", "Avg. Food")}</span>
        </Card>
        <Card className="ad-stat">
          <span className="ad-stat__dot ad-stat__dot--ready" />
          <span className="ad-stat__value">
            {summary.averageService === null ? "—" : summary.averageService}
          </span>
          <span className="ad-stat__label">{t("feedback.avgService", "Avg. Service")}</span>
        </Card>
      </div>

      {feedback.length === 0 ? (
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <Star size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("feedback.noFeedbackYet", "No feedback yet")}</h3>
          <p className="ad-empty__sub">
            {t("feedback.noFeedbackSub", "Ratings appear here once guests review a delivered order.")}
          </p>
        </div>
      ) : (
        <div className="fb-list anim-rise" style={{ animationDelay: "120ms" }}>
          {feedback.map((entry) => (
            <FeedbackRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

/* ── One feedback record ─────────────────────────────────────────────────── */
function FeedbackRow({ entry }) {
  const { t } = useLanguage();

  return (
    <Card className="fb-row">
      <div className="fb-row__top">
        <div className="fb-row__id">
          <p className="fb-row__order">{entry.orderId}</p>
          <p className="fb-row__meta">
            {t("customer.yourTable", "Table")} <span className="fb-row__table">#{entry.tableNumber}</span>
            {" · "}
            {entry.customerName}
          </p>
        </div>
        <span className="fb-row__time">{formatTimestamp(entry.createdAt)}</span>
      </div>

      <div className="fb-row__ratings">
        <div className="fb-row__rating">
          <span className="fb-row__rating-label">{t("feedback.foodQuality", "Food Quality")}</span>
          <StarRating
            readOnly
            size={15}
            name={`admin-food-${entry.id}`}
            label={t("feedback.foodQuality", "Food Quality")}
            value={entry.foodRating}
          />
        </div>
        <div className="fb-row__rating">
          <span className="fb-row__rating-label">{t("feedback.service", "Service")}</span>
          <StarRating
            readOnly
            size={15}
            name={`admin-service-${entry.id}`}
            label={t("feedback.service", "Service")}
            value={entry.serviceRating}
          />
        </div>
      </div>

      {entry.comment && <p className="fb-row__comment">“{entry.comment}”</p>}
    </Card>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
