import { useState, useEffect } from "react";
import { Eye, EyeOff, Clock } from "lucide-react";
import Card  from "../../components/ui/Card.jsx";
import Badge from "../../components/ui/Badge.jsx";
import { useMenuData } from "../../lib/useMenuData.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { setCategoryVisible } from "../../lib/menuData.js";
import { getCategoryVisibilityState, formatSchedule } from "../../lib/categoryVisibility.js";
import { useLanguage } from "../../i18n/useLanguage.js";

/**
 * CategoryVisibilityCard — Phase 28 operational control on Admin Overview,
 * available to BOTH Admin and Cashier.
 *
 * Why it lives here rather than in Category Management:
 *   Category Management is Admin-only and stays that way — its three-layer
 *   guard (nav filtering, route guard, per-screen role check) is untouched
 *   by this phase. Cashier needs to 86 a category during service without
 *   being handed the ability to rename, reorder, delete, re-image, or
 *   schedule one. Overview is the shared operational surface both roles
 *   already reach, so the toggle goes there.
 *
 * What this card deliberately CANNOT do:
 *   add · delete · rename · reorder · edit image · configure schedules.
 *   It renders a name, the current state, and one switch. The only write it
 *   can perform is setCategoryVisible(), a surgical single-field patch —
 *   there is no code path from here to updateCategory/createCategory/
 *   deleteCategory/moveCategory.
 *
 * Scheduled categories are shown but their toggle stays meaningful: the
 * manual switch and the schedule are independent, so a category can be
 * manually ON yet still off-schedule, and the card says so rather than
 * leaving staff confused about why it isn't on the menu.
 */
export default function CategoryVisibilityCard({ restaurant }) {
  const { t } = useLanguage();
  const { categories } = useMenuData(restaurant.slug);
  const { settings } = useSettingsData(restaurant.slug);

  /* Shared clock so an off-schedule category flips its own label without a
     reload — one tick for the whole card, never one per category. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  /* Catalog-inactive categories are not operational concerns — they aren't
     part of the served menu at all, and re-enabling one is an Admin catalog
     decision made in Category Management. */
  const operationalCategories = categories.filter((c) => c.isActive !== false);

  if (operationalCategories.length === 0) return null;

  return (
    <Card className="cv-card">
      <div className="cv-card__head">
        <h2 className="cv-card__title">{t("admin.categoryVisibility", "Category Visibility")}</h2>
        <p className="cv-card__sub">
          {t("admin.categoryVisibilityHint", "Turn categories on or off for service.")}
        </p>
      </div>

      <div className="cv-list">
        {operationalCategories.map((category) => {
          const state = getCategoryVisibilityState(category, {
            timeZone: settings.timeZone,
            // `tick` is read so this recomputes on the shared clock.
            now: new Date(tick),
          });
          const schedule = formatSchedule(category);
          const manuallyOn = category.isVisible !== false;

          return (
            <div key={category.id} className="cv-row">
              <span className="cv-row__emoji">{category.emoji}</span>

              <div className="cv-row__info">
                <p className="cv-row__name">{category.name}</p>
                {schedule && (
                  <p className="cv-row__schedule">
                    <Clock size={11} strokeWidth={2.2} />
                    <span className="cv-row__schedule-value">{schedule}</span>
                  </p>
                )}
              </div>

              {/* Current customer-facing state. When manually on but outside
                  its window, the reason is spelled out so nobody hunts for a
                  broken switch. */}
              {state.visible ? (
                <Badge tone="ready" dot>{t("admin.visible", "Visible")}</Badge>
              ) : state.reason === "schedule" ? (
                <Badge tone="preparing" dot>{t("admin.offSchedule", "Off schedule")}</Badge>
              ) : (
                <Badge tone="canceled" dot>{t("admin.hidden", "Hidden")}</Badge>
              )}

              <button
                type="button"
                className={`cv-toggle ${manuallyOn ? "cv-toggle--on" : ""}`}
                onClick={() => setCategoryVisible(restaurant.slug, category.id, !manuallyOn)}
                aria-pressed={manuallyOn}
                aria-label={`${category.name} — ${
                  manuallyOn ? t("admin.hidden", "Hidden") : t("admin.visible", "Visible")
                }`}
              >
                {manuallyOn ? <Eye size={14} strokeWidth={2.2} /> : <EyeOff size={14} strokeWidth={2.2} />}
                <span>{manuallyOn ? t("prep.on", "ON") : t("prep.off", "OFF")}</span>
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
