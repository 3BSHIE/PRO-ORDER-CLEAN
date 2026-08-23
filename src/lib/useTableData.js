import { useState, useEffect, useCallback } from "react";
import { getTables, TABLE_CHANGE_EVENT } from "./tableData.js";

/**
 * useTableData — React hook giving any component the live tables list for
 * ONE restaurant, automatically re-rendering whenever Admin Tables & QR
 * Management writes a change (create/update/delete/regenerate token) *for
 * that same restaurant*. Mirrors useMenuData.js exactly.
 *
 * @param {string} restaurantSlug
 * @returns {{ tables: object[], refresh: () => void }}
 */
export function useTableData(restaurantSlug) {
  const [tables, setTables] = useState(() => getTables(restaurantSlug));

  const refresh = useCallback(() => {
    setTables(getTables(restaurantSlug));
  }, [restaurantSlug]);

  useEffect(() => {
    refresh();
    function handleTableChange(event) {
      if (event.detail?.restaurantSlug && event.detail.restaurantSlug !== restaurantSlug) return;
      refresh();
    }
    window.addEventListener(TABLE_CHANGE_EVENT, handleTableChange);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(TABLE_CHANGE_EVENT, handleTableChange);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, restaurantSlug]);

  return { tables, refresh };
}
