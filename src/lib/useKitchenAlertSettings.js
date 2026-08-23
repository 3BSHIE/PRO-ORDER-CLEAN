import { useState, useEffect, useCallback } from "react";
import { getKitchenAlertSettings, KITCHEN_ALERT_CHANGE_EVENT } from "./kitchenAlertData.js";

/**
 * useKitchenAlertSettings — live kitchen alert settings for ONE restaurant.
 * Mirrors usePrepTime.js / useStaffCalls.js: the change event handles the
 * same tab instantly, and a light poll carries an Admin's change across to
 * the kitchen tab (no CustomEvent crosses tabs).
 *
 * @param {string} restaurantSlug
 * @param {{pollMs?: number}} [options] — pollMs 0 disables polling
 * @returns {{ settings: object, refresh: () => void }}
 */
export function useKitchenAlertSettings(restaurantSlug, { pollMs = 4000 } = {}) {
  const [settings, setSettings] = useState(() => getKitchenAlertSettings(restaurantSlug));

  const refresh = useCallback(() => {
    setSettings(getKitchenAlertSettings(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();

    function handleAlertChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }

    window.addEventListener(KITCHEN_ALERT_CHANGE_EVENT, handleAlertChange);
    window.addEventListener("focus", refresh);
    const interval = pollMs > 0 ? setInterval(refresh, pollMs) : null;

    return () => {
      window.removeEventListener(KITCHEN_ALERT_CHANGE_EVENT, handleAlertChange);
      window.removeEventListener("focus", refresh);
      if (interval) clearInterval(interval);
    };
  }, [refresh, restaurantSlug, pollMs]);

  return { settings, refresh };
}
