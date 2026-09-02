/**
 * restaurantName — Phase 74. One rule for what to call the restaurant on a
 * customer screen.
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

  const fromOrder = typeof order?.restaurantName === "string" ? order.restaurantName.trim() : "";
  if (fromOrder) return fromOrder;

  return typeof slug === "string" ? slug : "";
}
