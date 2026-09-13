import { useEffect } from "react";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { buildRestaurantThemeVars, resolveAppearance } from "../../lib/theme.js";
import { applyAppearance } from "../../lib/appearance.js";

/**
 * RestaurantTheme — Phase 83.1, Finding #4.
 *
 * Applies one restaurant's Primary and Secondary colours to a product
 * surface. This is the SHARED layer: Admin, Cashier and Kitchen mount it
 * directly, and CustomerTheme builds on the same token set, so there is one
 * theme resolution in the product rather than four that can drift (§6).
 *
 * ── WHAT CHANGED, AND WHY IT IS SAFE ─────────────────────────────────────
 *   Until now the restaurant's colours reached the customer routes only, so a
 *   venue on green still ran a gold Admin and a gold Kitchen — one restaurant
 *   with two identities. The colours now reach every role.
 *
 *   That is a much smaller change than it sounds, because the operational
 *   screens were already written against the same variables the customer
 *   screens use (--gold and its family appear in ~220 rules across all four
 *   products). Nothing here recolours a component: it supplies the variables
 *   those components were always reading, at a scope that finally includes
 *   them.
 *
 * ── WHAT IT DELIBERATELY DOES NOT CARRY ──────────────────────────────────
 *   Typography. Finding #4 asks for the restaurant's COLOURS everywhere,
 *   while §4 asks that existing typography be preserved — so the restaurant's
 *   chosen faces stay on the customer surface (see buildCustomerThemeVars)
 *   and the operational screens keep the PRO·ORDER faces they were designed
 *   in.
 *
 *   And nothing about language: the compact EN | AR control belongs to the
 *   customer entry, and Admin/Kitchen language UI is reviewed in their own
 *   units (§9). CustomerTheme still owns that rule alone.
 *
 * `display:contents` means this element generates no box, so every existing
 * layout — sticky admin nav, kitchen board columns — lays out exactly as if
 * it were not here. Custom properties still inherit through it.
 *
 * @param {string} restaurantSlug
 * @param {"admin"|"kitchen"} scope — role label, for any role-specific token
 *   overrides a future unit needs; it does not change behaviour today.
 */
export default function RestaurantTheme({ restaurantSlug, scope = "admin", children }) {
  const { settings } = useSettingsData(restaurantSlug);
  const themeVars = buildRestaurantThemeVars(settings);

  /* Phase 94.1 §27/§33 — Appearance is applied to the ROOT element, not here.
     This wrapper is display:contents and the surface tokens it would carry
     (--bg above all) are read by <body>, which sits outside it — so setting
     them on this element would repaint the cards and leave the page behind
     them dark. One data attribute on <html> flips the whole token set in CSS
     instead, which is why no component in the product needs an
     appearance === "light" branch. */
  const appearance = resolveAppearance(settings?.appearance);
  useEffect(() => applyAppearance(appearance), [appearance]);

  return (
    <div className={`restaurant-theme restaurant-theme--${scope}`} style={themeVars}>
      {children}
    </div>
  );
}
