/**
 * restaurantName — Phase 74. One rule for what to call the restaurant on a
 * customer screen. Phase 112.2c made the name optional, which this file is
 * the one place that understands.
 *
 * Tracking already resolved this correctly; Confirmation had its own shorter
 * chain that skipped the order's frozen name and fell through to the URL
 * slug, so a venue whose Settings name was blank was shown to the guest as
 * "lumiere" instead of "Lumière". Rather than copy Tracking's expression into
 * a second place — which is how the two drifted apart to begin with — both
 * screens now call this.
 *
 * THE CHAIN, most authoritative first:
 *   1. settings.name   the venue's current, live display name
 *   2. order.restaurantName  the name frozen onto the order at checkout.
 *                      Correct for a historical order even if the restaurant
 *                      has since been renamed, and still a real display name.
 *   3. slug            last resort only. It is a URL identifier, not a name,
 *                      and reaching it means every real source was empty.
 *
 * Returns "" rather than undefined when nothing at all is known, so callers
 * can rely on a string and RestaurantIdentity's own `if (!name) return null`
 * does the right thing.
 *
 * @param {{name?: string}|null|undefined} settings
 * @param {{restaurantName?: string}|null|undefined} order  optional
 * @param {string|null|undefined} slug
 * @returns {string}
 */
export function resolveRestaurantDisplayName(settings, order, slug) {
  const fromSettings = typeof settings?.name === "string" ? settings.name.trim() : "";
  if (fromSettings) return fromSettings;

  /* Phase 112.2c — a deliberately blank name is an ANSWER, so the chain stops
     here rather than reaching past it for the name frozen on an old order or,
     worse, the URL slug. The order keeps its own frozen restaurantName as a
     record of what the venue was called at checkout; this function is about
     what to put on screen now, and the owner has said: nothing. */
  if (hasDecidedName(settings)) return "";

  const fromOrder = typeof order?.restaurantName === "string" ? order.restaurantName.trim() : "";
  if (fromOrder) return fromOrder;

  return typeof slug === "string" ? slug : "";
}

/**
 * Has the owner ever made a decision about the display name?
 *
 * Phase 112.2c. Reading settings.displayNameSet directly would be wrong for a
 * record written before that field existed, so the same inference getSettings
 * uses is applied here too: a stored non-empty name is itself evidence of a
 * decision. getSettings already resolves this, so in practice callers are
 * handed a boolean; the inference is the safety net for a settings-shaped
 * object that came from somewhere else.
 *
 * @param {{name?: string, displayNameSet?: boolean}|null|undefined} settings
 * @returns {boolean}
 */
export function hasDecidedName(settings) {
  if (typeof settings?.displayNameSet === "boolean") return settings.displayNameSet;
  return typeof settings?.name === "string" && settings.name.trim() !== "";
}

/**
 * What to call this restaurant, given its settings and the static record it
 * was seeded from. Phase 112.2c — the single replacement for the
 * `settings.name.trim() || restaurant.name` expression that used to be
 * written out at eight call sites.
 *
 * The fallback applies ONLY to a restaurant whose owner has never configured
 * the field. Once they have, their answer stands — including "", which is a
 * supported configuration and renders as no name at all rather than as the
 * venue's old name coming back.
 *
 * @param {{name?: string, displayNameSet?: boolean}|null|undefined} settings
 * @param {string|null|undefined} seededName  the static record's name
 * @returns {string} possibly ""
 */
export function restaurantDisplayName(settings, seededName) {
  const stored = typeof settings?.name === "string" ? settings.name.trim() : "";
  if (stored) return stored;
  if (hasDecidedName(settings)) return "";
  return typeof seededName === "string" ? seededName.trim() : "";
}
