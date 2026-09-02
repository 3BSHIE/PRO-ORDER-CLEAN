import { useState, useEffect, useCallback, useMemo } from "react";
import { getSettings, SETTINGS_CHANGE_EVENT } from "./settingsData.js";
import {
  getAcceptingOrdersMode,
  ACCEPTING_ORDERS_CHANGE_EVENT,
} from "./acceptingOrdersData.js";
import { getAcceptingOrdersState } from "./acceptingOrders.js";

/**
 * useAcceptingOrders — Phase 79. The live accepting-orders verdict for ONE
 * restaurant, for any component that needs to know whether new orders may be
 * placed right now.
 *
 * Mirrors usePrepTime.js / useStaffCalls.js: the change events cover same-tab
 * updates instantly, and a light poll covers cross-tab ones (an Admin
 * flipping the mode in their tab has to reach a customer's Menu tab, which no
 * CustomEvent can do on its own).
 *
 * TWO SOURCES, TWO EVENTS
 *   The verdict depends on the operational mode (acceptingOrdersData) AND on
 *   the configured schedule (settingsData), which live in different keys and
 *   fire different events for the reason set out in acceptingOrdersData.js.
 *   Both are subscribed here so editing Working Hours while the mode is auto
 *   updates the verdict with no mode change (§25), and flipping the mode
 *   updates it with no settings change.
 *
 * THE CLOCK IS A THIRD INPUT
 *   In auto mode the verdict changes at 23:00 with no storage write and no
 *   event of any kind — the only thing that moved is the time. So this hook
 *   owns a tick as well, at the same 30s cadence the customer menu already
 *   uses for scheduled categories: minute-resolution schedules do not need
 *   finer, and a restaurant closes within moments of its boundary.
 *
 * NOT THE AUTHORITATIVE GATE
 *   This is for rendering. The order-creation boundary re-reads storage
 *   directly and calls getAcceptingOrdersState() itself, exactly as the
 *   Phase 37 revalidation re-reads the menu rather than trusting a hook —
 *   a tab that has sat open for an hour must not be able to push an order
 *   through on a stale verdict.
 *
 * @param {string} restaurantSlug
 * @param {{pollMs?: number, tickMs?: number}} [options] — 0 disables either timer
 * @returns {{
 *   mode: "auto"|"open"|"closed",
 *   accepting: boolean,
 *   reason: string,
 *   timeZone: string,
 *   workingHours: object,
 *   refresh: () => void
 * }}
 */
export function useAcceptingOrders(restaurantSlug, { pollMs = 4000, tickMs = 30000 } = {}) {
  const [mode, setMode] = useState(() => getAcceptingOrdersMode(restaurantSlug));
  const [settings, setSettings] = useState(() => getSettings(restaurantSlug));
  const [tick, setTick] = useState(() => Date.now());

  const refresh = useCallback(() => {
    setMode(getAcceptingOrdersMode(restaurantSlug));
    setSettings(getSettings(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();

    function handleChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }

    window.addEventListener(ACCEPTING_ORDERS_CHANGE_EVENT, handleChange);
    window.addEventListener(SETTINGS_CHANGE_EVENT, handleChange);
    window.addEventListener("focus", refresh);
    const poll = pollMs > 0 ? setInterval(refresh, pollMs) : null;

    return () => {
      window.removeEventListener(ACCEPTING_ORDERS_CHANGE_EVENT, handleChange);
      window.removeEventListener(SETTINGS_CHANGE_EVENT, handleChange);
      window.removeEventListener("focus", refresh);
      if (poll) clearInterval(poll);
    };
  }, [refresh, restaurantSlug, pollMs]);

  /* Separate from the storage subscription above: this timer exists only to
     re-evaluate the clock, and re-reading storage every 30s would be a
     different (and redundant) job. */
  useEffect(() => {
    if (tickMs <= 0) return undefined;
    const interval = setInterval(() => setTick(Date.now()), tickMs);
    return () => clearInterval(interval);
  }, [tickMs]);

  const state = useMemo(
    () => getAcceptingOrdersState(mode, settings, { now: new Date(tick) }),
    // `tick` is an intentional dependency — it is what retires an auto-mode
    // window whose closing time passes while the screen sits open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, settings, tick]
  );

  return { ...state, refresh };
}
