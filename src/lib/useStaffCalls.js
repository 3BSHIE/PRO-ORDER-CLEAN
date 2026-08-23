import { useState, useEffect, useCallback } from "react";
import { getStaffCalls, STAFF_CALL_CHANGE_EVENT } from "./staffCallData.js";

/**
 * useStaffCalls — React hook giving any component the live staff-call list
 * for ONE restaurant. Mirrors useMenuData.js / useTableData.js /
 * useSettingsData.js, with one addition: a light polling interval.
 *
 * Why polling as well as the event:
 *   The "pro-order-staff-call-change" CustomEvent only fires in the tab that
 *   wrote it, so it alone would never tell an Admin tab that a *customer*
 *   tab just rang the bell. The orders screens (kitchen board, live orders,
 *   customer tracking) already solve exactly this with a 4s re-read of
 *   localStorage, so this reuses that established Phase 24 pattern rather
 *   than inventing a new one. No websocket/backend involved.
 *
 * Restaurant isolation: change events carrying a different restaurantSlug
 * are ignored, same as every other data hook.
 *
 * @param {string} restaurantSlug
 * @param {{pollMs?: number}} [options] — pollMs 0 disables polling
 * @returns {{ calls: object[], openCalls: object[], refresh: () => void }}
 */
export function useStaffCalls(restaurantSlug, { pollMs = 4000 } = {}) {
  const [calls, setCalls] = useState(() => getStaffCalls(restaurantSlug));

  const refresh = useCallback(() => {
    setCalls(getStaffCalls(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();

    function handleStaffCallChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }

    window.addEventListener(STAFF_CALL_CHANGE_EVENT, handleStaffCallChange);
    window.addEventListener("focus", refresh);
    const interval = pollMs > 0 ? setInterval(refresh, pollMs) : null;

    return () => {
      window.removeEventListener(STAFF_CALL_CHANGE_EVENT, handleStaffCallChange);
      window.removeEventListener("focus", refresh);
      if (interval) clearInterval(interval);
    };
  }, [refresh, restaurantSlug, pollMs]);

  const openCalls = calls.filter((c) => c.status === "open");

  return { calls, openCalls, refresh };
}
