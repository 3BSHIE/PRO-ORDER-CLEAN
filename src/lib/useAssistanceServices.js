import { useState, useEffect, useCallback } from "react";
import {
  getAssistanceServices,
  getCustomerServices,
  ASSISTANCE_CHANGE_EVENT,
} from "./assistanceData.js";

/**
 * useAssistanceServices — the live assistance configuration for ONE
 * restaurant. Same shape as useStaffCalls / useMenuData / useSettingsData.
 *
 * Two lists come back because two audiences read them differently:
 *
 *   services — everything configured, including the disabled rows and the
 *              instant answers with nothing filled in. This is what Admin
 *              manages: hiding a broken row from the person able to fix it
 *              would be the opposite of useful.
 *
 *   customerServices — only what a guest should be offered, with the
 *              permanent "Other Request" appended last.
 *
 * Why it polls as well as listening:
 *   The change event only fires in the tab that wrote it. An administrator
 *   editing services in the Admin tab would otherwise not reach a customer
 *   tab open on the same browser until it was refocused. This is the same
 *   4s re-read the orders and staff-call screens already use.
 *
 *   It is worth being plain about the limit: this is localStorage. The poll
 *   makes other TABS of the same browser agree. A guest's phone is a
 *   different device with its own storage and nothing here reaches it.
 *
 * @param {string} restaurantSlug
 * @param {{pollMs?: number}} [options] — pollMs 0 disables polling
 */
export function useAssistanceServices(restaurantSlug, { pollMs = 4000 } = {}) {
  const [services, setServices] = useState(() => getAssistanceServices(restaurantSlug));
  const [customerServices, setCustomerServices] = useState(() =>
    getCustomerServices(restaurantSlug)
  );

  const refresh = useCallback(() => {
    setServices(getAssistanceServices(restaurantSlug));
    setCustomerServices(getCustomerServices(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();

    function handleChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }

    window.addEventListener(ASSISTANCE_CHANGE_EVENT, handleChange);
    window.addEventListener("focus", refresh);
    const interval = pollMs > 0 ? setInterval(refresh, pollMs) : null;

    return () => {
      window.removeEventListener(ASSISTANCE_CHANGE_EVENT, handleChange);
      window.removeEventListener("focus", refresh);
      if (interval) clearInterval(interval);
    };
  }, [refresh, restaurantSlug, pollMs]);

  return { services, customerServices, refresh };
}
