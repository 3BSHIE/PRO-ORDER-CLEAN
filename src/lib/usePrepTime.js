import { useState, useEffect, useCallback } from "react";
import { getPrepTimeSettings, PREP_TIME_CHANGE_EVENT } from "./prepTimeData.js";

/**
 * usePrepTime — React hook giving any component the live prep-time settings
 * (including Busy Mode) for ONE restaurant. Mirrors useStaffCalls.js: the
 * change event covers same-tab updates instantly, and a light poll covers
 * cross-tab ones (an Admin toggling Busy Mode in their tab needs to reach the
 * customer's Menu tab, which no CustomEvent can do on its own).
 *
 * Same established Phase 24/25 pattern as the orders screens and the waiter
 * bell — no websocket, no backend.
 *
 * @param {string} restaurantSlug
 * @param {{pollMs?: number}} [options] — pollMs 0 disables polling
 * @returns {{ settings: object, busyModeEnabled: boolean, refresh: () => void }}
 */
export function usePrepTime(restaurantSlug, { pollMs = 4000 } = {}) {
  const [settings, setSettings] = useState(() => getPrepTimeSettings(restaurantSlug));

  const refresh = useCallback(() => {
    setSettings(getPrepTimeSettings(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();

    function handlePrepTimeChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }

    window.addEventListener(PREP_TIME_CHANGE_EVENT, handlePrepTimeChange);
    window.addEventListener("focus", refresh);
    const interval = pollMs > 0 ? setInterval(refresh, pollMs) : null;

    return () => {
      window.removeEventListener(PREP_TIME_CHANGE_EVENT, handlePrepTimeChange);
      window.removeEventListener("focus", refresh);
      if (interval) clearInterval(interval);
    };
  }, [refresh, restaurantSlug, pollMs]);

  return { settings, busyModeEnabled: settings.busyModeEnabled, refresh };
}
