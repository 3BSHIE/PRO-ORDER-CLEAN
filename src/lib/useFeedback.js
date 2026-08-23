import { useState, useEffect, useCallback } from "react";
import { getFeedback, getFeedbackForOrder, FEEDBACK_CHANGE_EVENT } from "./feedbackData.js";

/* Shared subscription wiring for both hooks below.
 *
 * On top of the usual CustomEvent + focus + poll trio every data hook in this
 * app uses, this one also listens for the native `storage` event. That event
 * fires in OTHER tabs the moment localStorage changes, which is exactly the
 * multi-tab case this phase cares about: a guest who left the same delivered
 * order open in two tabs sees the second one flip to the submitted state
 * immediately rather than after the next poll. The data layer already makes a
 * duplicate impossible — this just stops the stale tab from showing a form
 * that is guaranteed to be refused.
 */
function useFeedbackSubscription(restaurantSlug, refresh, pollMs) {
  useEffect(() => {
    refresh();

    function handleFeedbackChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }
    function handleStorage(event) {
      // Only react to this restaurant's feedback key.
      if (event.key && !event.key.startsWith("pro_order_feedback:")) return;
      refresh();
    }

    window.addEventListener(FEEDBACK_CHANGE_EVENT, handleFeedbackChange);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refresh);
    const interval = pollMs > 0 ? setInterval(refresh, pollMs) : null;

    return () => {
      window.removeEventListener(FEEDBACK_CHANGE_EVENT, handleFeedbackChange);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refresh);
      if (interval) clearInterval(interval);
    };
  }, [refresh, restaurantSlug, pollMs]);
}

/**
 * useFeedback — every feedback record for ONE restaurant, newest first.
 * Used by the Admin feedback screen.
 *
 * @param {string} restaurantSlug
 * @param {{pollMs?: number}} [options]
 * @returns {{ feedback: object[], refresh: () => void }}
 */
export function useFeedback(restaurantSlug, { pollMs = 4000 } = {}) {
  const [feedback, setFeedback] = useState(() => getFeedback(restaurantSlug));

  const refresh = useCallback(() => {
    setFeedback(getFeedback(restaurantSlug));
  }, [restaurantSlug]);

  useFeedbackSubscription(restaurantSlug, refresh, pollMs);

  return { feedback, refresh };
}

/**
 * useOrderFeedback — the single feedback record for ONE order, or null.
 * Used by the customer-facing feedback section.
 *
 * @param {string} restaurantSlug
 * @param {string} orderId
 * @param {{pollMs?: number}} [options]
 * @returns {{ feedback: object|null, refresh: () => void }}
 */
export function useOrderFeedback(restaurantSlug, orderId, { pollMs = 4000 } = {}) {
  const [feedback, setFeedback] = useState(() => getFeedbackForOrder(restaurantSlug, orderId));

  const refresh = useCallback(() => {
    setFeedback(getFeedbackForOrder(restaurantSlug, orderId));
  }, [restaurantSlug, orderId]);

  useFeedbackSubscription(restaurantSlug, refresh, pollMs);

  return { feedback, refresh };
}
