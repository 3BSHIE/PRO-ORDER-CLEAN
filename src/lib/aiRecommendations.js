/**
 * aiRecommendations — Phase 121.2. Product IDs in, real menu products out.
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ─────────────────────────────────
 * A language model may one day propose dishes. It will propose them as IDs,
 * and nothing it says about them is authoritative: not the name, not the
 * price, not the description, not whether the kitchen still has any. Those
 * come from the menu the restaurant is serving right now, every time, or the
 * assistant becomes a second source of truth for prices — which is the one
 * thing a food-ordering product cannot afford.
 *
 * So the entire contract is: a list of IDs is matched against the current
 * menu, anything that does not match is dropped silently, and the caller
 * receives real product records or nothing.
 *
 * Phase 121.2 ships no model. The only caller is a development-only preview
 * that supplies IDs from this same menu, so the resolver can be exercised
 * against real cards. See lib/devFlags.js.
 */

/** At most three, because the card region shows one at a time and three dots
    is the most a guest will swipe through without it becoming a catalogue. */
export const MAX_RECOMMENDATIONS = 3;

/**
 * @param {string[]} ids    product ids, in the order they should appear
 * @param {object[]} items  the current restaurant's menu items
 * @returns {object[]}      real menu records; never fabricated, never longer
 *                          than MAX_RECOMMENDATIONS, duplicates removed
 */
export function resolveRecommendations(ids, items) {
  if (!Array.isArray(ids) || !Array.isArray(items) || ids.length === 0) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const item = byId.get(id);
    /* An id the menu does not have is dropped rather than rendered as a
       placeholder. A dish that was deleted or hidden since the suggestion
       was made must not reappear as an empty card. */
    if (!item) continue;
    seen.add(id);
    out.push(item);
    if (out.length === MAX_RECOMMENDATIONS) break;
  }
  return out;
}

/**
 * The development preview's source of IDs. Deterministic so a layout check
 * shows the same products twice in a row, and spread across the menu so the
 * cards differ in name length, description and image — which is what the
 * card region actually has to survive.
 *
 * Returns ids only, so it goes through resolveRecommendations like anything
 * else and cannot short-circuit the rule above.
 */
export function devPreviewIds(items, count = MAX_RECOMMENDATIONS) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const n = Math.min(count, MAX_RECOMMENDATIONS, items.length);
  const step = Math.max(1, Math.floor(items.length / n));
  const ids = [];
  for (let i = 0; ids.length < n && i < items.length; i += step) {
    ids.push(items[i].id);
  }
  return ids;
}
