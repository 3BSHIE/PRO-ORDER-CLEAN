import { useState, useEffect, useCallback } from "react";
import { getSettings, SETTINGS_CHANGE_EVENT } from "./settingsData.js";

/**
 * useSettingsData — React hook giving any component the live settings for
 * ONE restaurant, automatically re-rendering whenever Admin Restaurant
 * Settings writes a change *for that same restaurant*. Mirrors
 * useMenuData.js / useTableData.js exactly.
 *
 * @param {string} restaurantSlug
 * @returns {{ settings: object, refresh: () => void }}
 */
export function useSettingsData(restaurantSlug) {
  const [settings, setSettings] = useState(() => getSettings(restaurantSlug));

  const refresh = useCallback(() => {
    setSettings(getSettings(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();
    function handleSettingsChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }
    window.addEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, restaurantSlug]);

  return { settings, refresh };
}
