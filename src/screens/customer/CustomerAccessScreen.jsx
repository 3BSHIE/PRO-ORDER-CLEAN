import { useEffect, useRef, useState } from "react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Input   from "../../components/ui/Input.jsx";
import LanguageSwitcher from "../../components/i18n/LanguageSwitcher.jsx";
import { resolveEnabledLanguages } from "../../i18n/language.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { useDeferredLoading } from "../../lib/useDeferredLoading.js";
import { prefersReducedMotion } from "../../lib/motion.js";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import { saveCustomerSession } from "../../lib/customerSession.js";
import CustomerLoadingScreen from "./components/CustomerLoadingScreen.jsx";
import RestaurantInfo, { isSafeImageUrl } from "./components/RestaurantInfo.jsx";
import { resolveRestaurantDisplayName } from "../../lib/restaurantName.js";

/* How long the landing composition is given to leave before the Menu route is
   pushed (§25). Short enough that it reads as one continuous movement rather
   than a wait — and skipped entirely under reduced motion. */
const EXIT_MS = 240;

/* Name validation — trimmed, 2–30 chars.
   Phase 43 — takes `t` rather than reaching for the language module itself, so
   the message it returns is in whatever language is active at the moment the
   caller validates. The rules are unchanged; only the wording is translated.

   Phase 83 keeps these EXACTLY as they were (§20/§23). The entry screen was
   redesigned around them; it did not get stricter. */
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
  const result = resolveTableAccess(restaurantSlug, qrToken);
  const { t } = useLanguage();
  const { settings } = useSettingsData(restaurantSlug);
  /* Phase 81 §33 — the recovery states share this topbar, so the switcher must
     reflect the restaurant's enabled languages here too rather than offering a
     locale the venue has switched off. */
  const enabledLanguages = resolveEnabledLanguages(settings.languagesEnabled);

  /* Phase 23's "default language on a true first visit" rule still applies —
     it just no longer lives here. Phase 82.1 moved it into CustomerTheme,
     which wraps this screen: deciding it in a child effect meant the default
     was applied after the first paint (a visible snap) and could name a
     language the restaurant had since disabled, which CustomerTheme then had
     to undo. One rule, one owner — see resolveCustomerLanguage(). Phase 83
     changed the layout around it and nothing about the rule (§17). */

  /* ── Loading state (§10/§37) ───────────────────────────────────────────
     A real expression over the real data, not a hardcoded flag. Both reads
     above are synchronous localStorage today, so both are always populated on
     the first render and this is false every time — the loading screen never
     mounts and the guest goes straight to the landing, with no added latency
     and no artificial delay anywhere (§38).

     It is written this way rather than `false` so that when these become
     network reads and start returning nothing while in flight, the loading
     experience switches itself on with no code to delete. */
  const isBootstrapping = !settings || !result;
  const showLoader = useDeferredLoading(isBootstrapping);

  /* §11 — when a loader that was genuinely visible finishes, the mark settles
     and fades while the restaurant identity stays put, rather than the whole
     screen cutting out at once. Dormant in this build for the reason above. */
  const [settling, setSettling] = useState(false);
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (showLoader) { wasLoadingRef.current = true; return undefined; }
    if (!wasLoadingRef.current) return undefined;   // never showed — nothing to settle
    wasLoadingRef.current = false;

    if (prefersReducedMotion()) return undefined;   // §12 — no settle, just go
    setSettling(true);
    const id = setTimeout(() => setSettling(false), EXIT_MS);
    return () => clearTimeout(id);
  }, [showLoader]);

  /* Phase 23 — the restaurant's own customized name (if set in Settings)
     is what customer screens display; it never replaces or hides
     PRO·ORDER's own logo, which is rendered independently just above. */
  const effectiveRestaurant = result.ok
    ? { ...result.restaurant, name: settings.name.trim() || result.restaurant.name, logoUrl: settings.logoUrl }
    : null;

  /* The loading screen owns the whole viewport: it is the restaurant's first
     impression and a chrome bar above it would break the hierarchy §4 sets. */
  if (result.ok && (showLoader || settling)) {
    return <CustomerLoadingScreen restaurant={effectiveRestaurant} settling={settling} />;
  }

  /* ── Recovery states ───────────────────────────────────────────────────
     Untouched by Phase 83 (§35). They keep the shared Topbar — on an invalid
     code there is no restaurant to identify, so PRO·ORDER is the only brand
     available and showing it is exactly right. The valid-table branch below
     drops the Topbar instead, because a "QR access" chip and an app chrome bar
     are what made the old entry read as a form rather than a landing (§13). */
  if (!result.ok) {
    return (
      <>
        <Topbar
          left={<Logo variant="icon" size="nav" />}
          /* Phase 74 §39 — neutral, not red: the panel carries the severity. */
          right={<Badge tone="neutral">{t("common.qrAccess", "QR access")}</Badge>}
        />
        <main className="container">
          {/* Phase 74 §42 — name the venue only when it genuinely resolved. */}
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
        </main>
      </>
    );
  }

  return (
    <LandingView
      restaurant={effectiveRestaurant}
      table={result.table}
      settings={settings}
      enabledLanguages={enabledLanguages}
      onStart={(customerName) => {
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
  );
}

/* ── The landing ─────────────────────────────────────────────────────────
   Phase 83 replaces the previous two-step Welcome → "What should we call
   you?" flow with ONE composition (§13).

   The old second step was a max-width 440px bordered card holding an eyebrow,
   a heading, a sub-line, a field and a button, centred on an otherwise empty
   page — structurally a login form, which is precisely what §13 rules out. It
   also meant the venue's identity was introduced on one screen and then
   replaced by a form on the next, so the restaurant did not survive its own
   entry flow.

   Everything the guest needs is now on one open page, in the order they
   actually think about it: whose restaurant this is, which table they are at,
   who they are, and then go. Nothing is inside a card. */
function LandingView({ restaurant, table, settings, enabledLanguages, onStart }) {
  const { t } = useLanguage();
  const [name,    setName]    = useState("");
  const [error,   setError]   = useState(null);
  const [touched, setTouched] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  /* §36 — one press, one session, one navigation. The exit animation opens a
     ~240ms window in which the button is still mounted, so without this a
     second tap (or an Enter key while the animation runs) would save a second
     customer session and push the Menu route twice. */
  const startedRef = useRef(false);
  const timerRef   = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const logoUrl = (restaurant.logoUrl || "").trim();
  /* §5 — http(s) only, and a logo that fails to load is dropped rather than
     leaving a broken-image icon on the venue's first impression. The fallback
     is the restaurant's NAME, never the PRO·ORDER logo. */
  const showLogo = isSafeImageUrl(logoUrl) && !logoFailed;

  const nameError = validateName(name, t);
  const canStart = nameError === null;

  function handleChange(e) {
    setName(e.target.value);
    /* Unchanged from the previous screen: the message appears only once the
       field has been left or submitted, so it never scolds mid-word (§20). */
    if (touched) setError(validateName(e.target.value, t));
  }

  function handleStart() {
    if (startedRef.current) return;          // already leaving

    setTouched(true);
    const err = validateName(name, t);
    if (err) { setError(err); return; }

    startedRef.current = true;
    const trimmed = name.trim();

    /* §12 — reduced motion navigates immediately. Nothing waits on an
       animation that is not going to run. */
    if (prefersReducedMotion()) { onStart(trimmed); return; }

    /* §25 — the composition leaves, then the route changes. The session is
       saved by onStart at the END so that a navigation which never happens
       cannot leave a session behind. */
    setLeaving(true);
    timerRef.current = setTimeout(() => onStart(trimmed), EXIT_MS);
  }

  return (
    <main className={`cx-landing ${leaving ? "cx-landing--leaving" : ""}`}>
      {/* ── Identity block ──────────────────────────────────────────────
          §14 — logo and name stay LARGE here. They shrink to the compact
          Menu-header treatment only after Start Ordering, which is what makes
          the entry feel like arriving somewhere rather than filling a form. */}
      {/* §16 — the language control sits to the SIDE, in the page's upper
          corner, and is a direct child of the landing rather than of the
          identity block.

          That parentage is deliberate. The identity block carries an entrance
          animation whose fill-mode leaves a transform on it permanently — an
          identity matrix, but a transform all the same — which makes it a
          containing block for positioned descendants. Nested inside it, the
          control resolved its offsets against the identity instead of the
          page, and on desktop (where the identity is only the left column)
          that put the language switch in the middle of the screen. Phase 81.1
          hit the same trap with the Restaurant Info overlay.

          inset-inline-end moves it to the upper LEFT in Arabic on its own;
          nothing here is mirrored by hand (§33). */}
      <div className="cx-landing__lang">
        <LanguageSwitcher variant="compact" enabled={enabledLanguages} />
      </div>

      <section className="cx-landing__identity">
        {showLogo && (
          <img
            className="cx-landing__logo"
            src={logoUrl}
            alt=""
            onError={() => setLogoFailed(true)}
          />
        )}
        {/* Decorative alt above — the name follows immediately as real text. */}
        <h1 className="cx-landing__name">{restaurant.name}</h1>

        {/* Phase 81 §13 — one restrained line, clamped, so a venue can
            introduce itself without the entry turning into an About page. */}
        {(settings?.description || "").trim() && (
          <p className="cx-landing__description">{settings.description.trim()}</p>
        )}

        <RestaurantInfo
          settings={settings}
          restaurantName={restaurant.name}
          className="cx-landing__info-btn"
        />
      </section>

      {/* ── Table badge (§18) ───────────────────────────────────────────
          A strong, simple badge — the word small and quiet, the NUMBER
          dominant, because the number is the fact the guest needs to confirm
          at a glance. Not a card, not a sentence, no QR iconography, no token.
          The accent is carried by the number and a hairline, not by filling
          the whole block with gold.

          The number comes from result.table, which is the record
          resolveTableAccess validated — no display value bypasses that (§19). */}
      <section className="cx-landing__table" aria-label={`${t("customer.yourTable", "Table")} ${table.tableNumber}`}>
        <span className="cx-landing__table-word">{t("customer.yourTable", "Table")}</span>
        <span className="cx-landing__table-number">{table.tableNumber}</span>
      </section>

      {/* ── Name + CTA (§21/§22) ────────────────────────────────────────
          Deliberately not wrapped in a card or a panel: the field and the
          button belong to the page composition, the way a landing page's
          single action does, rather than looking like an auth product. */}
      {/* Input and Button both spread ...rest AFTER their own className, so
          passing one would replace `field` / `btn btn--primary btn--lg`
          outright and strip the component's styling. Both are therefore
          targeted through a wrapper rather than a prop — the same trap the
          Menu topbar documents. */}
      <section className="cx-landing__start">
        <div className="cx-landing__field">
          <Input
            label={t("customer.yourName", "Your name")}
            placeholder={t("customer.namePlaceholder", "e.g. Mohammad")}
            value={name}
            error={touched ? error : null}
            autoComplete="given-name"
            onChange={handleChange}
            onBlur={() => { setTouched(true); setError(validateName(name, t)); }}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
          />
        </div>

        <div className="cx-landing__cta">
          <Button
            full
            size="lg"
            onClick={handleStart}
            /* §23 — the same rule as before, surfaced rather than hidden: with
               no usable name the guest cannot proceed. disabled carries that
               to assistive tech honestly, and the field's own message (on
               blur) says why, so the state is never unexplained (§32). */
            disabled={!canStart}
          >
            {t("customer.startOrdering", "Start Ordering")}
          </Button>
        </div>
      </section>

      {/* §24 — no "Powered by PRO·ORDER", no phone/email/social block here.
          Platform attribution begins at the Menu and is reviewed in Unit 2. */}
    </main>
  );
}
