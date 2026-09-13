import { useMemo, useState, useEffect, useRef } from "react";
import { MessageSquareHeart, Star } from "lucide-react";
import Card   from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import StarRating from "../../components/ui/StarRating.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { useFeedback } from "../../lib/useFeedback.js";
import { summarizeFeedback } from "../../lib/feedbackData.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { can, PERMISSIONS } from "../../lib/permissions.js";

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
  const { t, language } = useLanguage();
  const { feedback } = useFeedback(restaurant.slug);

  const summary = useMemo(() => summarizeFeedback(feedback), [feedback]);

  /* Layer 3 — redundant, defense-in-depth guard. Hooks above still run
     unconditionally (rules of hooks); only the returned UI differs. */
  if (!can(session, PERMISSIONS.FEEDBACK_VIEW)) {
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

  /* Phase 76 §31 — the headline figure, derived from the two averages this
     screen already had rather than from any new source. Every review carries
     both a food and a service rating, so the two averages cover the same set
     of reviews and their mean is the overall average. Null unless both
     exist, so an empty or partial set shows an em dash instead of a number
     that would not mean anything. */
  const overallAverage =
    summary.averageFood === null || summary.averageService === null
      ? null
      : Math.round(((summary.averageFood + summary.averageService) / 2) * 10) / 10;

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

      {/* ── Summary (Phase 76 §31/§32) ───────────────────────────────────
          Three equal cards became one lead figure plus a compact split. No
          new data: overall is the mean of the two averages this screen
          already computed, and it is shown only when both exist. Nothing is
          charted, trended or scored — §31 rules all of that out. */}
      <div className="fb-summary anim-rise">
        <div className="fb-summary__lead">
          <span className="fb-summary__value">
            {overallAverage === null ? "—" : overallAverage}
            {overallAverage !== null && <span className="fb-summary__of">/5</span>}
          </span>
          <span className="fb-summary__label">
            {t("feedback.averageRating", "Average rating")}
          </span>
          <span className="fb-summary__count">
            {t("feedback.basedOnReviews", "{n} reviews").replace("{n}", summary.count)}
          </span>
        </div>

        <div className="fb-summary__split">
          <div className="fb-summary__metric">
            <span className="fb-summary__metric-value">
              {summary.averageFood === null ? "—" : summary.averageFood}
            </span>
            <span className="fb-summary__metric-label">{t("feedback.avgFood", "Avg. Food")}</span>
          </div>
          <div className="fb-summary__metric">
            <span className="fb-summary__metric-value">
              {summary.averageService === null ? "—" : summary.averageService}
            </span>
            <span className="fb-summary__metric-label">{t("feedback.avgService", "Avg. Service")}</span>
          </div>
        </div>
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
          {groupFeedbackByDay(feedback).map((group) => (
            <section className="fb-group" key={group.key}>
              {/* §4 — the date is part of the page's structure, not a field
                  repeated on every card. Sticky so the day a manager is
                  reading stays named while they scroll through it. */}
              <h3 className="fb-group__heading">{dayHeading(group.date, t, language)}</h3>
              {group.entries.map((entry) => (
                <FeedbackRow key={entry.id} entry={entry} />
              ))}
            </section>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

/* ── One feedback record ─────────────────────────────────────────────────── */
function FeedbackRow({ entry }) {
  const { t } = useLanguage();

  /* Phase 76 §35 — the "Show more" control appears ONLY when the comment is
     genuinely clamped. Measuring after layout rather than guessing from a
     character count means a long-but-narrow comment and a short-but-wide one
     are each judged on what actually rendered. A review that fits shows no
     button at all. */
  const commentRef = useRef(null);
  const [clamped, setClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = commentRef.current;
    if (!el) return undefined;

    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();

    /* Whether a comment overflows depends entirely on how wide the card is,
       so measuring once on mount is not enough: the same review clamps at
       375px and fits at 1280px. A ResizeObserver re-checks on any reflow —
       window resize, rotation, or the sidebar/layout changing around it —
       which a one-shot effect silently missed. */
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [entry.comment]);

  return (
    <Card className="fb-row">
      {/* Phase 76 §33 — the rating leads now. The order id used to be the
          first and boldest thing on the card, so a screen of reviews read as
          a list of reference numbers; the actual verdict sat below it and the
          guest's words below that. Rating -> comment -> context. */}
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

      {entry.comment && (
        <div className="fb-row__comment-wrap">
          <p
            ref={commentRef}
            className={`fb-row__comment ${expanded ? "fb-row__comment--open" : ""}`}
          >
            “{entry.comment}”
          </p>
          {/* Phase 94 §8 — `clamped || expanded`, not `clamped` alone.
              The clamp is measured from the live element, so expanding it made
              scrollHeight equal clientHeight, the measurement reported "not
              clamped", and the button unmounted — leaving the review open with
              no way back. Reproduced before fixing: Show more appeared, worked
              once, and Show less never existed. Keeping it mounted while
              expanded is what makes the control a toggle rather than a
              one-way door. */}
          {(clamped || expanded) && (
            <button
              type="button"
              className="fb-row__more"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? t("common.showLess", "Show less")
                : t("common.showMore", "Show more")}
            </button>
          )}
        </div>
      )}

      {/* Context, deliberately last and quiet — still complete. */}
      <div className="fb-row__context">
        <span className="fb-row__order">{entry.orderId}</span>
        <span className="fb-row__ctx-dot">&middot;</span>
        <span>
          {t("customer.yourTable", "Table")} <span className="fb-row__table">#{entry.tableNumber}</span>
        </span>
        <span className="fb-row__ctx-dot">&middot;</span>
        <span>{entry.customerName}</span>
        <span className="fb-row__ctx-dot">&middot;</span>
        <span className="fb-row__time">{formatTimestamp(entry.createdAt)}</span>
      </div>
    </Card>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
/* Phase 94 §5 — TIME ONLY.
   This used to render "8:42 PM, Sep 12" on every card. Under a date heading
   that repeats the same date on every review beneath it, which is noise: the
   heading already answers "which day", so the card only has to answer "when
   that day". */
function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ── Phase 94 §4/§80 — date grouping ──────────────────────────────────────
   Groups by LOCAL calendar day, keyed on the local Y-M-D rather than on a
   slice of the ISO string: the stored timestamp is UTC, so slicing it would
   put a 1:00am local review under the previous day for anyone east of
   Greenwich. Amman is UTC+3, so that is not hypothetical here.

   The incoming list is already newest-first (getFeedback sorts on read), and
   both the group order and the order within each group simply inherit that —
   nothing is re-sorted, so there is one sort order in the system and no way
   for the two to disagree (§7). */
function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function groupFeedbackByDay(list) {
  const groups = [];
  const byKey = new Map();
  for (const entry of list) {
    const date = new Date(entry.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    let group = byKey.get(key);
    if (!group) {
      group = { key, date, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/* "Today" / "Yesterday" / an absolute date, in the active locale.
   Compared on the local calendar day, not on elapsed hours: a review from
   11:50pm is "Yesterday" at 00:10, not "23 minutes ago". */
function dayHeading(date, t, language) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(date) === dayKey(today)) return t("feedback.today", "Today");
  if (dayKey(date) === dayKey(yesterday)) return t("feedback.yesterday", "Yesterday");

  try {
    /* Phase 94 §80 — the APP language, not the browser locale. Passing
       undefined localised the heading to whatever the device was set to, so
       an Arabic interface still printed "Sep 8, 2026". */
    return date.toLocaleDateString(language === "ar" ? "ar" : "en", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
