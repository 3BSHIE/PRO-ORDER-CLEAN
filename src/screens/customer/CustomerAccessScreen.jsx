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
import RestaurantInfo from "./components/RestaurantInfo.jsx";
import { isSafeImageSrc } from "../../lib/safeImage.js";
import { useRestaurantLogoSrc } from "../../lib/restaurantLogoAssets.js";
import { restaurantDisplayName } from "../../lib/restaurantName.js";

/* How long the landing composition is given to leave before the Menu route is
   pushed, measured from the moment the leaving values are applied — not from
   the press. Must stay in step with the .cx-landing--leaving transitions in
   global.css, whose longest run (identity and table badge) now ends at 260ms.

   Phase 83.2 set this to 290ms when the delays in front of those transitions
   were 30ms longer. Phase 112.2b spends those 30ms on the release stage
   instead (see below), so the number came down with them: the movement still
   starts about 30ms after the press and still runs for the same 230ms. With
   the Menu's 105ms identity settle on the other side the whole choreography
   reads over ~395ms — inside the 360–400ms window the owner asked for, and
   long enough that the movement is noticeable without having to look for it.

   Skipped entirely under reduced motion: navigation is never held for an
   animation that is not going to run. */
const EXIT_MS = 260;

/* Phase 112.2b — the exit runs in two stages, and this is the first.

   Stage 1 releases the entrance animations WITHOUT changing anything the eye
   can see; stage 2, two frames later, applies the leaving values so the
   browser has a settled before-change style to interpolate from. See
   beginExit() below for why that separation is load-bearing.

   The two frames cost ~33ms at 60Hz, which is paid for out of the leaving
   transitions' own start delays (60ms -> 30ms for the identity, 105ms -> 75ms
   for the badge, in global.css). Every duration, distance and the 45ms
   stagger between identity and badge are untouched, the movement still begins
   about 30ms after the press, and the whole choreography still lands inside
   the approved ~395ms: ~33ms release + 260ms exit + 105ms Menu settle. */

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
    ? { ...result.restaurant, name: restaurantDisplayName(settings, result.restaurant.name), logoUrl: settings.logoUrl }
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
          {/* Phase 90 §3 — the venue is named only when it genuinely resolved.
               The settings override and the logo are now resolved inside the
               view itself, so all six call sites are identical. */}
          <InvalidAccessView
            reason={result.reason}
            onHome={onHome}
            restaurantName={result.restaurant?.name}
            restaurantSlug={restaurantSlug}
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
  /* null -> "release" -> "leave". See beginExit(). */
  const [exitStage, setExitStage] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);

  /* §36 — one press, one session, one navigation. The exit animation opens a
     ~240ms window in which the button is still mounted, so without this a
     second tap (or an Enter key while the animation runs) would save a second
     customer session and push the Menu route twice. */
  const startedRef = useRef(false);
  const timerRef   = useRef(null);
  /* The composition itself, so the exit can settle its animations and force a
     style flush on the real subtree rather than guessing at selectors. */
  const landingRef = useRef(null);
  /* Both pending frames, so an unmount mid-exit cancels them instead of
     calling setState on a component that is already gone. */
  const framesRef  = useRef([]);
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    framesRef.current.forEach(cancelAnimationFrame);
    framesRef.current = [];
  }, []);

  /* Phase 112.2c — may legitimately be "". Resolved once here so the heading,
     the logo's alt and the layout modifier all agree. */
  const displayName = (restaurant.name || "").trim();
  const logoUrl = (restaurant.logoUrl || "").trim();
  /* Phase 112.2 — see CustomerLoadingScreen: resolve, then validate. */
  const resolvedLogo = useRestaurantLogoSrc(logoUrl);
  /* §5 — http(s) only, and a logo that fails to load is dropped rather than
     leaving a broken-image icon on the venue's first impression. The fallback
     is the restaurant's NAME, never the PRO·ORDER logo. */
  const showLogo = isSafeImageSrc(resolvedLogo) && !logoFailed;

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
       animation that is not going to run, and there is no blank interval:
       this screen unmounts and the Menu renders in the same commit. */
    if (prefersReducedMotion()) { onStart(trimmed); return; }

    beginExit(trimmed);
  }

  /* ── The staged exit (Phase 112.2b) ─────────────────────────────────────

     THE BUG THIS EXISTS TO FIX.

     Every piece of the landing enters with `animation: cx-enter ... both`.
     A filling animation keeps ownership of the properties it animates —
     transform and opacity — for as long as it is applied. Phase 83.1 spotted
     that and had .cx-landing--leaving set `animation:none` to hand them back.

     That part was right. What was wrong was doing it in the SAME style change
     that applies the leaving transform and opacity: the browser then has no
     settled before-change style to interpolate from, so it simply adopts the
     end state. Measured on the approved build: the identity sat at
     translateY(-42px) scale(.74) opacity 0 by the first animation frame after
     the press, and no transitionrun, transitionstart or transitionend ever
     fired. The guest saw the composition vanish, then ~330ms of near-empty
     screen, then the Menu header animate in on its own.

     THE CORRECTION — three stages, no new CSS layered on the old:

       1. finish() the entrance animations and release them (--releasing).
          They are long over by the time anyone types a name, so finishing
          them is a no-op in practice; it is there so that a guest who
          submits within the first ~340ms gets a settled start rather than a
          half-played one. The released style is identical to the filled one
          (cx-enter's implicit `to` IS the element's own style), so this
          stage is invisible.
       2. Let the browser actually commit that state. One frame to let React
          land the class, a forced layout read so style is recomputed with it,
          and a second frame so the paint has happened. Two frames rather
          than a timeout because the thing being waited for is a rendering
          step, not an interval.
       3. Apply --leaving. Now transform and opacity belong to the normal
          cascade and have a stable before-change value, so the transitions
          declared in global.css run.

     The route change is scheduled from stage 3, not from the press, so the
     290/260ms hand-off stays measured from the moment the movement starts. */
  function beginExit(trimmed) {
    const node = landingRef.current;

    /* Stage 1 */
    if (node) {
      /* Per-animation, because one that refuses to finish must not stop the
         rest from settling. */
      node.getAnimations({ subtree: true }).forEach((anim) => {
        try { anim.finish(); } catch { /* infinite or already done */ }
      });
    }
    setExitStage("release");

    /* Stage 2 */
    framesRef.current.push(requestAnimationFrame(() => {
      /* Forces style and layout to be recomputed with the entrance released,
         so stage 3 cannot be coalesced into the same recalculation. */
      if (node) void node.offsetHeight;

      /* Stage 3 */
      framesRef.current.push(requestAnimationFrame(() => {
        setExitStage("leave");
        /* §25 — the composition leaves, then the route changes. The session
           is saved by onStart at the END so that a navigation which never
           happens cannot leave a session behind. */
        timerRef.current = setTimeout(() => onStart(trimmed), EXIT_MS);
      }));
    }));
  }

  return (
    <main
      ref={landingRef}
      className={[
        "cx-landing",
        exitStage ? "cx-landing--releasing" : "",
        exitStage === "leave" ? "cx-landing--leaving" : "",
      ].filter(Boolean).join(" ")}
    >
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

      {/* Finding #1 — Restaurant Info is a utility, not part of the venue's
          introduction. It used to sit centred directly under the name, which
          gave it the weight of a primary action on a page whose only primary
          action is Start Ordering. It now sits in the opposite top corner
          from the language control: both are chrome, balanced across the
          page's shoulders.

          inset-inline-start mirrors it with the language control in Arabic,
          so the pair swaps sides together and neither is hand-positioned. */}
      <div className="cx-landing__info">
        <RestaurantInfo
          settings={settings}
          restaurantName={restaurant.name}
          variant="icon"
        />
      </div>

      {/* Phase 112.2c — the identity is whatever the restaurant actually has.
          --logo-only lets the logo claim the vertical and horizontal room the
          name would have taken (see global.css); with no name there is no
          empty heading left behind to reserve it. */}
      <section
        className={`cx-landing__identity${
          showLogo && !displayName ? " cx-landing__identity--logo-only" : ""
        }`}
      >
        {showLogo && (
          <img
            className="cx-landing__logo"
            src={resolvedLogo}
            /* Decorative while the name follows as real text; with no name
               the logo is the only identity on the screen, so it carries a
               generic translated description rather than nothing at all. */
            alt={displayName ? "" : t("common.restaurantLogo", "Restaurant logo")}
            onError={() => setLogoFailed(true)}
          />
        )}
        {displayName && <h1 className="cx-landing__name">{displayName}</h1>}

        {/* Phase 81 §13 — one restrained line, clamped, so a venue can
            introduce itself without the entry turning into an About page. */}
        {(settings?.description || "").trim() && (
          <p className="cx-landing__description">{settings.description.trim()}</p>
        )}

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
        {/* Phase 97.6 §3 — the greeting the entry screen never had. The
            restaurant identity and the table badge above already say WHERE
            the guest is, so this says nothing about either (§3 rules out
            repeating table identity here) and only greets them and asks the
            one question the screen exists to ask.

            The question IS the field label rather than a separate line: a
            heading, a helper sentence and a "Your name" label would be three
            rows saying one thing, and putting it on the <label> keeps the
            input natively named for assistive tech. */}
        <h2 className="cx-landing__welcome">{t("customer.welcomeTitle", "Welcome")}</h2>
        <div className="cx-landing__field">
          <Input
            label={t("customer.welcomeHelper", "What should we call you?")}
            placeholder={t("customer.namePlaceholder", "Your name")}
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
