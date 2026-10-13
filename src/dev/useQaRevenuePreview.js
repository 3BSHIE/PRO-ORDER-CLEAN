import { useCallback, useEffect, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   useQaRevenuePreview — Phase 111.3  ·  DEVELOPMENT ONLY

   Owns the "am I looking at real money or at the fixture?" switch, and
   nothing else.

   ── HOW IT DISAPPEARS FROM PRODUCTION ───────────────────────────────────
   import.meta.env.DEV is replaced by the literal `false` at build time, so
   every branch below folds away and the dynamic import of the fixture is
   never reached — the fixture never enters a production bundle. The storage
   key is likewise only ever touched inside a DEV branch, so a production
   build cannot turn this on even if the key exists in someone's browser.

   ── WHY THE FIXTURE IS LOADED DYNAMICALLY ───────────────────────────────
   Same reason, belt and braces: a static import would put the fixture in the
   module graph whether or not the flag is ever set.

   ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────
   It writes no orders, touches no canonical storage and swaps no provider.
   The only thing it persists is one boolean under its own dev-namespaced
   key, so the preview survives a reload while the owner is looking at it.
   ═══════════════════════════════════════════════════════════════════════ */

/** True only in a development build. */
export const QA_PREVIEW_AVAILABLE = import.meta.env.DEV;

/* Deliberately long and obviously not product state. */
const STORAGE_KEY = "pro_order_dev_qa_revenue_preview";

/** `?qa=revenue` in the address bar turns it on and persists the choice. */
function urlRequestsPreview() {
  try {
    return new URLSearchParams(window.location.search).get("qa") === "revenue";
  } catch {
    return false;
  }
}

function readFlag() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeFlag(on) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "on");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode — the toggle simply does not survive a reload */
  }
}

/**
 * @param {object} context — restaurant identity and clock, for the fixture
 * @returns {{available:boolean, active:boolean, orders:Array<object>,
 *            meta:object|null, setActive:(on:boolean)=>void}}
 */
export function useQaRevenuePreview(context) {
  const [active, setActiveState] = useState(() => {
    if (!QA_PREVIEW_AVAILABLE) return false;
    if (urlRequestsPreview()) { writeFlag(true); return true; }
    return readFlag();
  });
  const [state, setState] = useState({ orders: [], meta: null });

  const { restaurantSlug, restaurantName, timeZone, serviceChargePercent } = context || {};

  useEffect(() => {
    if (!QA_PREVIEW_AVAILABLE || !active) {
      setState({ orders: [], meta: null });
      return undefined;
    }
    let cancelled = false;
    import("./qaRevenueFixture.js")
      .then((module) => {
        if (cancelled) return;
        const built = module.buildQaRevenueOrders({
          restaurantSlug,
          restaurantName,
          timeZone,
          serviceChargePercent,
        });
        setState({ orders: built.orders, meta: built.meta });
      })
      .catch(() => {
        if (!cancelled) setState({ orders: [], meta: null });
      });
    return () => { cancelled = true; };
    /* Rebuilt when the restaurant or its clock changes; NOT on every poll,
       because the fixture is deterministic and re-deriving it would hand the
       rolling values a new array to animate for no reason. */
  }, [active, restaurantSlug, restaurantName, timeZone, serviceChargePercent]);

  const setActive = useCallback((on) => {
    if (!QA_PREVIEW_AVAILABLE) return;
    writeFlag(on);
    setActiveState(on);
  }, []);

  return {
    available: QA_PREVIEW_AVAILABLE,
    active: QA_PREVIEW_AVAILABLE && active,
    orders: state.orders,
    meta: state.meta,
    setActive,
  };
}
