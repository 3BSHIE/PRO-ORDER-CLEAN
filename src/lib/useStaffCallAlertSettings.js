import { useState, useEffect, useCallback } from "react";
import {
  getStaffCallAlertSettings,
  STAFF_CALL_ALERT_CHANGE_EVENT,
} from "./staffCallAlertData.js";

/**
 * useStaffCallAlertSettings — live staff-call alert settings for ONE
 * restaurant (Phase 59). Twin of useKitchenAlertSettings.js: the change
 * event handles the same tab instantly, and a light poll carries an Admin's
 * change across to another staff tab (no CustomEvent crosses tabs).
 *
 * @param {string} restaurantSlug
 * @param {{pollMs?: number}} [options] — pollMs 0 disables polling
 * @returns {{ settings: object, refresh: () => void }}
 */
export function useStaffCallAlertSettings(restaurantSlug, { pollMs = 4000 } = {}) {
  const [settings, setSettings] = useState(() => getStaffCallAlertSettings(restaurantSlug));

  const refresh = useCallback(() => {
    setSettings(getStaffCallAlertSettings(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();

    function handleAlertChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }

    window.addEventListener(STAFF_CALL_ALERT_CHANGE_EVENT, handleAlertChange);
    window.addEventListener("focus", refresh);
    const interval = pollMs > 0 ? setInterval(refresh, pollMs) : null;

    return () => {
      window.removeEventListener(STAFF_CALL_ALERT_CHANGE_EVENT, handleAlertChange);
      window.removeEventListener("focus", refresh);
      if (interval) clearInterval(interval);
    };
  }, [refresh, restaurantSlug, pollMs]);

  return { settings, refresh };
}
