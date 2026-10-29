/**
 * devFlags — Phase 121.2. Switches that exist only while `npm run dev` runs.
 *
 * This is testing infrastructure, not a product feature, and it is built so
 * that it cannot become one by accident:
 *
 *   · Every read goes through `readFlag`, which returns false outright when
 *     `import.meta.env.DEV` is false. Vite replaces that with the literal
 *     `false` in a production build, so the body folds away and every caller
 *     becomes a constant false that the bundler can eliminate.
 *   · The value lives in sessionStorage under a key nothing else reads, so
 *     it dies with the tab and never touches a restaurant's saved data.
 *   · Nothing here is reachable from the customer interface. The only writer
 *     is DemoSwitcher, which App.jsx mounts behind the same DEV guard.
 *
 * Subscribers are notified in-process because sessionStorage fires no event
 * in the tab that wrote it.
 */

const PREFIX = "pro_order_dev_flag:";

/** Show one real product from this menu in the AI waiter's card region. */
export const DEV_FLAG_AI_RECS = "aiRecommendations";

const listeners = new Set();

export function readFlag(name) {
  if (!import.meta.env.DEV) return false;
  try {
    return sessionStorage.getItem(PREFIX + name) === "1";
  } catch {
    /* Private mode, blocked storage: the flag is simply off. */
    return false;
  }
}

export function writeFlag(name, value) {
  if (!import.meta.env.DEV) return;
  try {
    if (value) sessionStorage.setItem(PREFIX + name, "1");
    else sessionStorage.removeItem(PREFIX + name);
  } catch {
    /* Nothing to do: the flag just will not persist across a reload. */
  }
  listeners.forEach((fn) => fn());
}

export function subscribeFlags(fn) {
  if (!import.meta.env.DEV) return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}
