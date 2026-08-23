import { useState } from "react";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Input   from "../../components/ui/Input.jsx";
import LanguageSwitcher from "../../components/i18n/LanguageSwitcher.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { findRestaurantBySlug } from "../../data/mockRestaurant.js";
import { verifyStaffCredentials } from "../../data/mockStaff.js";
import { saveAdminSession } from "../../lib/adminSession.js";

/**
 * validateCredentialsFormat — both fields must simply be present. The
 * actual username/password match is checked separately by
 * verifyStaffCredentials.
 *
 * Returns a translation KEY (or null if valid) rather than an English
 * string directly — this is a plain module-level function with no access
 * to useLanguage(), so the caller resolves the key to display text via t().
 */
function validateCredentialsFormat(username, password) {
  if (!username.trim()) return "admin.usernameRequired";
  if (!password) return "admin.passwordRequired";
  return null;
}

/* English fallback text for each validation key above. */
const CREDENTIALS_ERROR_FALLBACK = {
  "admin.usernameRequired": "Please enter your username.",
  "admin.passwordRequired": "Please enter your password.",
};

/* ═══════════════════════════════════════════════════════════════════════════
   AdminLoginScreen — Phase 16

   Shared login for both "admin" and "cashier" roles — either can sign in
   here with their own username/password; the role that matched is what gets
   saved into the session and later checked by the protected route.

   Guard: if restaurantSlug doesn't resolve to a real restaurant, the parent
   (AdminRoute) shows an invalid-restaurant state instead of rendering this
   screen at all — so by the time this component runs, the restaurant is
   already known valid.

   On successful login: saves an admin session (sessionStorage, mirrors
   kitchenSession.js/customerSession.js) and hands off to the placeholder
   admin shell.

   NOT built yet: the real admin dashboard, live orders page, menu/category/
   table management — this phase is login + a placeholder shell only.
   ═══════════════════════════════════════════════════════════════════════ */

export default function AdminLoginScreen({ restaurantSlug, onHome, onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const { t } = useLanguage();

  const restaurant = findRestaurantBySlug(restaurantSlug);

  function handleSubmit() {
    const formatErrorKey = validateCredentialsFormat(username, password);
    if (formatErrorKey) {
      setError(t(formatErrorKey, CREDENTIALS_ERROR_FALLBACK[formatErrorKey]));
      return;
    }

    const staff = verifyStaffCredentials(
      ["admin", "cashier"],
      restaurantSlug,
      username.trim(),
      password
    );
    if (!staff) {
      setError(t("admin.invalidCredentials", "Invalid username or password."));
      return;
    }

    saveAdminSession({
      restaurantSlug,
      role: staff.role,
      name: staff.name,
      username: staff.username,
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
        <div className="admin-login anim-rise">
          <LanguageSwitcher className="admin-login__lang-switcher" />
          <Logo variant="full" size="md" style={{ marginBottom: 22 }} />

          <p className="admin-login__rest">{restaurant?.name}</p>
          <h1 className="admin-login__heading">{t("admin.adminAccess", "Admin access")}</h1>
          <p className="admin-login__msg">{t("admin.signInMsg", "Sign in to manage restaurant operations.")}</p>

          <div className="admin-login__card">
            <Input
              label={t("admin.username", "Username")}
              type="text"
              autoComplete="username"
              placeholder="e.g. admin@pro-order.com"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
              style={{ marginBottom: 14 }}
            />
            <Input
              label={t("admin.password", "Password")}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              error={error}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <Button full size="lg" onClick={handleSubmit} style={{ marginTop: 18 }}>
              {t("admin.signIn", "Sign in")}
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}

/* ── Invalid restaurant state (used by AdminRoute wrapper) ──────────────── */
export function AdminInvalidRestaurantView({ onHome }) {
  const { t } = useLanguage();
  return (
    <div className="access anim-rise">
      <span className="access__mark access__mark--error">
        <TriangleAlert size={34} strokeWidth={1.8} />
      </span>
      <h1 className="access__table">{t("admin.restaurantNotFound", "Restaurant not found")}</h1>
      <p className="access__msg">
        {t("admin.restaurantNotFoundMsg", "This admin link doesn't match a known restaurant.")}
      </p>
      <Button variant="outline" icon={ArrowLeft} onClick={onHome}>
        {t("common.backHome", "Back to home")}
      </Button>
    </div>
  );
}
