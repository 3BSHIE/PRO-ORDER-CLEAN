import { useState, useEffect } from "react";
import { MessageSquareHeart, CheckCircle2 } from "lucide-react";
import Card from "../../../components/ui/Card.jsx";
import Button from "../../../components/ui/Button.jsx";
import StarRating from "../../../components/ui/StarRating.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { useOrderFeedback } from "../../../lib/useFeedback.js";
import { createFeedback, MAX_COMMENT_LENGTH } from "../../../lib/feedbackData.js";
import { orderBelongsToSession } from "../../../lib/customerIdentity.js";

/**
 * OrderFeedback — Phase 29, customer side.
 *
 * Renders nothing at all unless the order is genuinely eligible:
 *
 *   1. status === "delivered". received / preparing / ready / canceled all
 *      render null — there is no hidden or disabled form to discover.
 *   2. The order belongs to THIS session. The tracking screen already gates
 *      on restaurant + table token + customer name; this repeats the
 *      ownership check against the order's own snapshot so the form can only
 *      appear for the guest whose order it is. There is no global order
 *      lookup and no public feedback surface anywhere in this phase.
 *
 * Once submitted the component flips to a permanent read-only summary.
 * Editing is deliberately out of scope for this phase, so there is no code
 * path from here to an update — createFeedback is the only writer, and it
 * refuses a second record for the same order.
 *
 * Props:
 *   order   — the order object (must be delivered to render anything)
 *   session — current customer session, for the ownership check
 */
export default function OrderFeedback({ order, session }) {
  const { t } = useLanguage();
  const restaurantSlug = order?.restaurantSlug;
  const { feedback, refresh } = useOrderFeedback(restaurantSlug, order?.orderId);

  const [foodRating, setFoodRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  /* Reset the draft whenever this component is pointed at a different order.
     Without this, navigating between two orders inside the SPA reuses the
     same component instance and React keeps the previous order's state — the
     guest would find their last comment pre-filled on a different order's
     form, and could submit order A's untouched ratings against order B.
     Handled here rather than with a key at the call site so the component is
     safe wherever it gets mounted. */
  useEffect(() => {
    setFoodRating(0);
    setServiceRating(0);
    setComment("");
    setError(null);
    setJustSubmitted(false);
  }, [order?.orderId]);

  /* Gate 1 — only a delivered order can be rated. */
  if (!order || order.status !== "delivered") return null;

  /* Gate 2 — and only by the session that placed it.

     Phase 38 — this is the same shared helper "My Orders" filters with, so the
     two surfaces can never disagree: any order visible in the list is one this
     form will accept. That matters most right after a lost session, where the
     guest re-enters their name with different capitalization — previously the
     list could show a delivered order whose feedback form silently refused to
     render. Table context is still required; only the name comparison is
     formatting-insensitive. */
  if (!orderBelongsToSession(order, session)) return null;

  /* Already rated → read-only, whether it was submitted a second ago in this
     tab or a minute ago in another one. */
  if (feedback) {
    return (
      <Card className="fb-card fb-card--done">
        <div className="fb-card__head">
          <span className="fb-card__icon fb-card__icon--done">
            <CheckCircle2 size={17} strokeWidth={2} />
          </span>
          <div>
            <h3 className="fb-card__title">
              {justSubmitted
                ? t("feedback.thankYou", "Thank you for your feedback.")
                : t("feedback.alreadySubmitted", "Already submitted")}
            </h3>
            <p className="fb-card__sub">{formatSubmittedAt(feedback.createdAt)}</p>
          </div>
        </div>

        <div className="fb-readonly">
          <div className="fb-readonly__row">
            <span className="fb-readonly__label">{t("feedback.foodQuality", "Food Quality")}</span>
            <StarRating
              readOnly
              size={18}
              name={`food-${order.orderId}`}
              label={t("feedback.foodQuality", "Food Quality")}
              value={feedback.foodRating}
            />
          </div>
          <div className="fb-readonly__row">
            <span className="fb-readonly__label">{t("feedback.service", "Service")}</span>
            <StarRating
              readOnly
              size={18}
              name={`service-${order.orderId}`}
              label={t("feedback.service", "Service")}
              value={feedback.serviceRating}
            />
          </div>
          {feedback.comment && <p className="fb-readonly__comment">“{feedback.comment}”</p>}
        </div>
      </Card>
    );
  }

  function handleSubmit() {
    if (!foodRating || !serviceRating) {
      setError(t("feedback.bothRatingsRequired", "Please rate both food quality and service."));
      return;
    }
    setError(null);

    const result = createFeedback(restaurantSlug, {
      orderId: order.orderId,
      tableId: order.tableId,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
      foodRating,
      serviceRating,
      comment,
    });

    /* A refusal here means another tab got there first. Refreshing swaps this
       form for that submission's read-only view rather than showing an error
       the guest can do nothing about. */
    if (!result.ok && result.reason !== "already_exists") {
      setError(t("feedback.submitFailed", "Sorry, that didn't go through. Please try again."));
      return;
    }

    setJustSubmitted(true);
    refresh();
  }

  return (
    <Card className="fb-card">
      <div className="fb-card__head">
        <span className="fb-card__icon">
          <MessageSquareHeart size={17} strokeWidth={2} />
        </span>
        <div>
          <h3 className="fb-card__title">{t("feedback.feedback", "Feedback")}</h3>
          <p className="fb-card__sub">{t("feedback.howWasIt", "How was your order?")}</p>
        </div>
      </div>

      <div className="fb-field">
        <span className="fb-field__label">{t("feedback.foodQuality", "Food Quality")}</span>
        <StarRating
          name={`food-${order.orderId}`}
          label={t("feedback.foodQuality", "Food Quality")}
          value={foodRating}
          onChange={(v) => { setFoodRating(v); if (error) setError(null); }}
        />
      </div>

      <div className="fb-field">
        <span className="fb-field__label">{t("feedback.service", "Service")}</span>
        <StarRating
          name={`service-${order.orderId}`}
          label={t("feedback.service", "Service")}
          value={serviceRating}
          onChange={(v) => { setServiceRating(v); if (error) setError(null); }}
        />
      </div>

      <label className="fb-field">
        <span className="fb-field__label">{t("feedback.optionalComment", "Optional Comment")}</span>
        <textarea
          className="fb-textarea"
          rows={3}
          value={comment}
          maxLength={MAX_COMMENT_LENGTH}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t("feedback.commentPlaceholder", "Anything you'd like us to know?")}
        />
        <span className="fb-counter">
          {comment.length}/{MAX_COMMENT_LENGTH}
        </span>
      </label>

      {error && <p className="fb-error" role="alert">{error}</p>}

      <Button full size="lg" onClick={handleSubmit}>
        {t("feedback.submitFeedback", "Submit Feedback")}
      </Button>
    </Card>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function formatSubmittedAt(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
