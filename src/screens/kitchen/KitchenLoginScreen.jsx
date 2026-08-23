import { useState } from "react";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Input   from "../../components/ui/Input.jsx";
import LanguageSwitcher from "../../components/i18n/LanguageSwitcher.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { findRestaurantBySlug } from "../../data/mockRestaurant.js";
import { verifyStaffPin } from "../../data/mockStaff.js";
import { saveKitchenSession } from "../../lib/kitchenSession.js";

/**
 * validatePinFormat — the PIN must be present, numeric only, and either
 * 4 or 6 digits. This is a format check only; whether it actually matches
 * a staff record is checked separately by verifyStaffPin.
 *
 * Returns a translation KEY (or null if valid) rather than an English
 * string directly — this is a plain module-level function with no access
 * to useLanguage(), so the caller resolves the key to display text via t().
 */
function validatePinFormat(raw) {
  const pin = raw.trim();
  if (!pin) return "kitchen.pinRequired";
  if (!/^\d+$/.test(pin)) return "kitchen.pinNumericOnly";
  if (pin.length !== 4 && pin.length !== 6) return "kitchen.pinLength";
  return null;
}

/* English fallback text for each validation key above, used as the t()
   fallback so the message is never blank if a translation is missing. */
const PIN_ERROR_FALLBACK = {
  "kitchen.pinRequired": "Please enter your PIN.",
  "kitchen.pinNumericOnly": "PIN must contain numbers only.",
  "kitchen.pinLength": "PIN must be 4 or 6 digits.",
};

/* ═══════════════════════════════════════════════════════════════════════════
   KitchenLoginScreen — Phase 13

   Guard: if restaurantSlug doesn't resolve to a real restaurant, the parent
   (KitchenRoute) shows an invalid-restaurant state instead of rendering this
   screen at all — so by the time this component runs, the restaurant is
   already known valid.

   On successful PIN match: saves a kitchen session (sessionStorage, mirrors
   customerSession.js) and hands off to the placeholder kitchen shell.

   NOT built yet: the real kitchen order board, columns, or any status
   controls — this phase is login + a placeholder shell only.
   ═══════════════════════════════════════════════════════════════════════ */

export default function KitchenLoginScreen({ restaurantSlug, onHome, onLoggedIn }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const { t } = useLanguage();

  const restaurant = findRestaurantBySlug(restaurantSlug);

  function handlePinChange(e) {
    // Numeric-only input: strip anything that isn't a digit, cap at 6
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
    setPin(digitsOnly);
    if (error) setError(null);
  }

  function handleSubmit() {
    const formatErrorKey = validatePinFormat(pin);
    if (formatErrorKey) {
      setError(t(formatErrorKey, PIN_ERROR_FALLBACK[formatErrorKey]));
      return;
    }

    const staff = verifyStaffPin("kitchen", restaurantSlug, pin);
    if (!staff) {
      setError(t("kitchen.invalidPin", "Invalid PIN. Please try again."));
      return;
    }

    saveKitchenSession({
      restaurantSlug,
      role: staff.role,
      name: staff.name,
    });
    onLoggedIn();
  }

  return (
    <>
      <Topbar
        left={
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onHome}>
            {t("common.home", "Home")}
          </Button>
        }
        right={<Logo variant="icon" size="nav" />}
      />
      <main className="container">
        <div className="kitchen-login anim-rise">
          <LanguageSwitcher className="kitchen-login__lang-switcher" />
          <Logo variant="full" size="md" style={{ marginBottom: 22 }} />

          <p className="kitchen-login__rest">{restaurant?.name}</p>
          <h1 className="kitchen-login__heading">{t("kitchen.kitchenAccess", "Kitchen access")}</h1>
          <p className="kitchen-login__msg">{t("kitchen.enterPinMsg", "Enter your kitchen PIN to continue.")}</p>

          <div className="kitchen-login__card">
            <Input
              label={t("kitchen.kitchenPinLabel", "Kitchen PIN")}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
              value={pin}
              error={error}
              onChange={handlePinChange}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
              maxLength={6}
              style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: 20 }}
            />
            <Button full size="lg" onClick={handleSubmit} style={{ marginTop: 18 }}>
              {t("kitchen.enterKitchen", "Enter kitchen")}
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}

/* ── Invalid restaurant state (used by KitchenRoute wrapper) ─────────────── */
export function KitchenInvalidRestaurantView({ onHome }) {
  const { t } = useLanguage();
  return (
    <div className="access anim-rise">
      <span className="access__mark access__mark--error">
        <TriangleAlert size={34} strokeWidth={1.8} />
      </span>
      <h1 className="access__table">{t("kitchen.restaurantNotFound", "Restaurant not found")}</h1>
      <p className="access__msg">
        {t("kitchen.restaurantNotFoundMsg", "This kitchen link doesn't match a known restaurant.")}
      </p>
      <Button variant="outline" icon={ArrowLeft} onClick={onHome}>
        {t("common.backHome", "Back to home")}
      </Button>
    </div>
  );
}
