import { useState, useEffect } from "react";
import { ArrowRight, ChevronLeft } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Input   from "../../components/ui/Input.jsx";
import LanguageSwitcher from "../../components/i18n/LanguageSwitcher.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { applyRestaurantDefaultLanguageIfFirstVisit } from "../../i18n/language.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import { saveCustomerSession } from "../../lib/customerSession.js";

/* Name validation — trimmed, 2–30 chars.
   Phase 43 — takes `t` rather than reaching for the language module itself, so
   the message it returns is in whatever language is active at the moment the
   caller validates. The rules are unchanged; only the wording is translated. */
function validateName(raw, t) {
  const name = raw.trim();
  if (!name)           return t("customer.nameRequired", "Please enter your name.");
  if (name.length < 2)  return t("customer.nameTooShort", "Name must be at least 2 characters.");
  if (name.length > 30) return t("customer.nameTooLong", "Name must be 30 characters or fewer.");
  return null; // valid
}

export default function CustomerAccessScreen({
  restaurantSlug,
  qrToken,
  onHome,
  onEnterMenu,   // () => void — called after session saved
}) {
  const [step, setStep] = useState("welcome"); // "welcome" | "onboarding"
  const result = resolveTableAccess(restaurantSlug, qrToken);
  const { t } = useLanguage();
  const { settings } = useSettingsData(restaurantSlug);

  /* Phase 23 — a restaurant's configured Default Language only ever applies
     on a true first visit (no language preference stored at all yet);
     anyone who already has a preference — including one set by an earlier
     visit to a *different* restaurant — keeps it untouched. See
     src/i18n/language.js for the exact rule. */
  useEffect(() => {
    if (result.ok) applyRestaurantDefaultLanguageIfFirstVisit(settings.defaultLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.ok, settings.defaultLanguage]);

  /* Phase 23 — the restaurant's own customized name (if set in Settings)
     is what customer screens display; it never replaces or hides
     PRO·ORDER's own logo, which is rendered independently just above. */
  const effectiveRestaurant = result.ok
    ? { ...result.restaurant, name: settings.name.trim() || result.restaurant.name, logoUrl: settings.logoUrl }
    : null;

  return (
    <>
      <Topbar
        left={<Logo variant="icon" size="nav" />}
        right={<Badge tone={result.ok ? "gold" : "canceled"}>{t("common.qrAccess", "QR access")}</Badge>}
      />
      <main className="container">
        {!result.ok ? (
          <InvalidAccessView reason={result.reason} onHome={onHome} />
        ) : step === "welcome" ? (
          <WelcomeView
            restaurant={effectiveRestaurant}
            table={result.table}
            onContinue={() => setStep("onboarding")}
          />
        ) : (
          <NameOnboardingView
            restaurant={effectiveRestaurant}
            table={result.table}
            onBack={() => setStep("welcome")}
            onSubmit={(customerName) => {
              saveCustomerSession({
                restaurantId:   result.restaurant.id,
                restaurantSlug,
                tableId:        result.table.id,
                tableNumber:    result.table.tableNumber,
                qrToken,
                customerName,
              });
              onEnterMenu();
            }}
          />
        )}
      </main>
    </>
  );
}

/* ── Step 1: Welcome ─────────────────────────────────────────────────────── */
function WelcomeView({ restaurant, table, onContinue }) {
  const { t } = useLanguage();
  return (
    <div className="access anim-rise">
      <LanguageSwitcher className="access__lang-switcher" />
      {/* PRO·ORDER's own logo always renders first and stays — the
          restaurant's own logo (if configured in Settings) appears
          alongside its name below, never replacing this. */}
      <Logo variant="full" size="md" style={{ marginBottom: 22 }} />
      <div className="access__restaurant-row">
        {restaurant.logoUrl && <img src={restaurant.logoUrl} alt="" className="access__restaurant-logo" />}
        <p className="access__restaurant">{restaurant.name}</p>
      </div>
      <h1 className="access__table">
        {t("customer.welcomeToTable", "Welcome to Table")} <i>#{table.tableNumber}</i>
      </h1>
      <p className="access__msg">{t("customer.almostReadyToOrder", "You're almost ready to order.")}</p>
      <Button size="lg" icon={ArrowRight} onClick={onContinue}>
        {t("common.continue", "Continue")}
      </Button>
    </div>
  );
}

/* ── Step 2: Name onboarding ─────────────────────────────────────────────── */
function NameOnboardingView({ restaurant, table, onBack, onSubmit }) {
  const [name,    setName]    = useState("");
  const [error,   setError]   = useState(null);
  const [touched, setTouched] = useState(false);
  const { t } = useLanguage();

  function handleChange(e) {
    setName(e.target.value);
    if (touched) setError(validateName(e.target.value, t));
  }

  function handleSubmit() {
    setTouched(true);
    const err = validateName(name, t);
    if (err) { setError(err); return; }
    onSubmit(name.trim());
  }

  return (
    <div className="onboard anim-rise">
      {/* subtle back link */}
      <button
        type="button"
        className="onboard__back"
        onClick={onBack}
      >
        <ChevronLeft size={15} strokeWidth={2.3} /> {t("common.back", "Back")}
      </button>

      <div className="onboard__card">
        <p className="onboard__eyebrow">{restaurant.name} · {t("customer.yourTable", "Table")} #{table.tableNumber}</p>
        <h2 className="onboard__heading">{t("customer.enterYourName", "What should we call you?")}</h2>
        <p className="onboard__sub">
          {t("customer.identifyOrderMsg", "We'll use your name to identify your order at Table")} #{table.tableNumber}.
        </p>

        <Input
          label={t("customer.yourName", "Your name")}
          placeholder={t("customer.namePlaceholder", "e.g. Mohammad")}
          value={name}
          error={error}
          autoFocus
          autoComplete="given-name"
          onChange={handleChange}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <Button
          full
          size="lg"
          icon={ArrowRight}
          onClick={handleSubmit}
          style={{ marginTop: 22 }}
        >
          {t("customer.continueToMenu", "Continue to menu")}
        </Button>
      </div>
    </div>
  );
}

/* ── Invalid QR ──────────────────────────────────────────────────────────── */
