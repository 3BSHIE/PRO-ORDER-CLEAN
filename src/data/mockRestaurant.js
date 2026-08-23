/* Mock restaurant data — the one truly static record in the demo.
   No backend yet — this stands in for what the API will later return.

   Tables moved to src/lib/tableData.js in Phase 22 (Admin Tables & QR
   Management) — they're now admin-editable, restaurant-scoped data, so
   they live in the same localStorage-backed layer as menu categories/items
   rather than a static array here. resolveTableAccess and the
   ACCESS_REASON_KEY/ACCESS_REASON_FALLBACK maps used by every customer
   screen's invalid-access view also moved there. */

export const RESTAURANT = {
  id: "rest_lumiere",
  name: "Lumière",
  slug: "lumiere",
  brandName: "Lumière Dining",
  serviceChargePercent: 10,
};

export function findRestaurantBySlug(slug) {
  return RESTAURANT.slug === slug ? RESTAURANT : null;
}
