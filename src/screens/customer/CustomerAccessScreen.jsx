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
import RestaurantIdentity from "./components/RestaurantIdentity.jsx";
import CustomerFooter     from "./components/CustomerFooter.jsx";
import { resolveRestaurantDisplayName } from "../../lib/restaurantName.js";

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
      {/* Phase 45 — this topbar is shared by the invalid-QR view and the
          welcome/onboarding flow, so the PRO·ORDER mark is conditional. On an
          invalid code there is no restaurant to identify and PRO·ORDER is the
          only brand available, which is exactly when showing it is right. Once
          the table resolves, the restaurant's hero identity sits immediately
          below and a 40px platform logo above it would be the larger of the
          two marks — the inversion this phase exists to fix. */}
      {/* Phase 73 §2 — the language control moved into this bar. It used to
          float alone above the hero, align-self:flex-end inside the content
          column, which read as a stray control rather than part of the
          chrome. The topbar's left slot was empty on a valid table anyway
          (the PRO·ORDER mark only appears for an invalid code), so this is
          the natural home for it and it costs no vertical space.

          The invalid-code branch is untouched: §41 defers those screens. */}
      <Topbar
        left={
          result.ok
            ? <LanguageSwitcher className="access__lang-switcher" />
            : <Logo variant="icon" size="nav" />
        }
        /* Phase 74 §39 — the badge was red on every failure, which put an
           alarm colour above a deliberately calm amber recovery panel and
           double-signalled a situation that is not an error. Neutral here;
           the panel itself carries the severity. */
        right={<Badge tone={result.ok ? "gold" : "neutral"}>{t("common.qrAccess", "QR access")}</Badge>}
      />
      <main className="container">
        {!result.ok ? (
          /* Phase 74 §42 — name the venue only when it genuinely resolved.
             An unknown restaurant slug (reason "restaurant") has no venue to
             name, so identity is omitted rather than guessed; the settings
             name is already loaded here, so this adds no new risky read. */
          <InvalidAccessView
            reason={result.reason}
            onHome={onHome}
            restaurantName={
              result.restaurant
                ? resolveRestaurantDisplayName(
                    settings,
                    /* the helper reads .restaurantName (the shape an order
                       has); a Restaurant record calls it .name */
                    { restaurantName: result.restaurant.name },
                    null
                  )
                : undefined
            }
          />
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
    /* Phase 73 §2/§3 — access--welcome is a scoped modifier, NOT a change to
       .access itself: the same base class carries the Invalid QR and Inactive
       Table screens, which §41 explicitly defers to a later phase. Only the
       welcome composition moves. */
    <div className="access access--welcome">
      <div className="access__identity anim-enter-identity">
      {/* Phase 45 — this is the guest's first impression of the venue, so the
          restaurant owns it. It used to open with PRO·ORDER's full logo at
          100px above a 22px restaurant logo and a 12px uppercase name, which
          read as the software introducing itself. The restaurant's mark is now
          the hero and PRO·ORDER moved to the footer attribution below. */}
        <RestaurantIdentity
          name={restaurant.name}
          logoUrl={restaurant.logoUrl}
          variant="hero"
        />
        {/* The table is the guest's own context and stays the headline here —
            this is the one place it is stated on this screen, so §4's
            "once, in the top area" is satisfied without a second pill. */}
        <h1 className="access__table">
          {t("customer.welcomeToTable", "Welcome to Table")} <i>#{table.tableNumber}</i>
        </h1>
      </div>

      <div className="access__enter anim-enter-form">
        <p className="access__msg">{t("customer.almostReadyToOrder", "You're almost ready to order.")}</p>
        <Button size="lg" icon={ArrowRight} onClick={onContinue}>
          {t("common.continue", "Continue")}
        </Button>
      </div>

      <CustomerFooter />
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
    <div className="onboard anim-enter-form">
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
