import { useState, useEffect, useRef } from "react";
import { Settings as SettingsIcon, Save } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Button  from "../../components/ui/Button.jsx";
import Input   from "../../components/ui/Input.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import AdminLayout from "./AdminLayout.jsx";
import KitchenAlertsCard from "./KitchenAlertsCard.jsx";
import StaffCallAlertsCard from "./StaffCallAlertsCard.jsx";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { updateSettings } from "../../lib/settingsData.js";
import { WEEKDAY_KEYS, normalizeWorkingHours } from "../../lib/acceptingOrders.js";
import { registerNavigationGuard } from "../../lib/navigationGuard.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import {
  buildCustomerThemeVars,
  defaultThemeFields,
  isDefaultTheme,
  HEADING_FONTS,
  BODY_FONTS,
} from "../../lib/theme.js";

/* ═══════════════════════════════════════════════════════════════════════════
   AdminSettingsScreen — Phase 23

   A single restaurant-scoped settings record covering General, Branding,
   Business, Languages, Payment Methods, Contact, and Working Hours — all
   edited here as one draft, saved together via updateSettings().

   Brand identity rule: the Branding section's live preview — and every
   customer screen this data feeds — always renders PRO·ORDER's own logo
   (src/components/brand/Logo.jsx) *together with* the restaurant's name/
   logo, never instead of it. This screen never edits, hides, or overrides
   the PRO·ORDER logo itself; it only customizes the restaurant identity
   that appears alongside it.

   Payment "enabled" here is a *visibility* toggle layered on top of
   paymentMethods.js's own functional-readiness `enabled` flag — Online
   Payment stays functionally disabled ("coming soon") no matter what Admin
   sets here, matching the phase's explicit instruction.

   Admin-only — enforced with the same three-layer pattern as every other
   Admin-only screen (Menu, Categories, Tables & QR): nav filtering in
   AdminLayout, a route guard in App.jsx, and this screen's own role check
   below as a third, redundant layer.
   ═══════════════════════════════════════════════════════════════════════ */

/* Phase 79.1 — the day list is no longer declared here. WEEKDAY_KEYS is the
   project's one weekday vocabulary (see acceptingOrders.js) and the schedule
   evaluator reads the very same keys, so a second list in this file could
   only ever be a way for the editor and the rule to disagree. Labels come
   from translations, keyed by the same strings. */
const DAY_LABEL_KEY = {
  sun: "admin.sunday", mon: "admin.monday", tue: "admin.tuesday",
  wed: "admin.wednesday", thu: "admin.thursday", fri: "admin.friday",
  sat: "admin.saturday",
};
const DAY_LABEL_FALLBACK = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday",
  thu: "Thursday", fri: "Friday", sat: "Saturday",
};

/* ── Phase 79.2 — dirty detection ─────────────────────────────────────────
   Key order is not meaning. The draft is built by spreading over the loaded
   settings while a fresh read rebuilds them from defaults, so two objects
   holding identical values can serialise differently — and comparing those
   strings would leave the page permanently dirty from the moment it mounted.
   Sorting keys at every level removes that as a source of false positives. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonical(value[key]);
      return acc;
    }, {});
  }
  return value;
}

/**
 * A comparable fingerprint of one settings record.
 *
 * Two deliberate exclusions/normalisations, both aimed at the same thing —
 * only a change the MANAGER made should count as unsaved work:
 *
 *   updatedAt      machinery. It changes on every save and is not editable
 *                  here, so comparing it would report a difference that no
 *                  one typed.
 *   workingHours   run through the same normaliser the storage layer uses,
 *                  so a record still carrying the pre-79.1 legacy shape
 *                  fingerprints identically to its migrated form. Without
 *                  this, simply opening Settings on a not-yet-migrated
 *                  restaurant would look like an edit (§10).
 */
function settingsFingerprint(settings) {
  if (!settings) return "";
  const { updatedAt, workingHours, ...rest } = settings;
  return JSON.stringify(canonical({
    ...rest,
    workingHours: normalizeWorkingHours(workingHours),
  }));
}

export default function AdminSettingsScreen({ restaurant, session, onSignOut, onNavigate }) {
  const { settings } = useSettingsData(restaurant.slug);
  const { t } = useLanguage();

  const [draft, setDraft] = useState(settings);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [error, setError] = useState(null);
  const [showDiscard, setShowDiscard] = useState(false);

  /* ── Phase 79.2 — unsaved-changes guard ────────────────────────────────
     This screen has always held its edits in a local draft and written them
     only on Save, but it never registered the Admin navigation guard that
     Phase 59/60 built for the Product editor. So a manager could retime all
     seven weekdays, click Overview, and lose the lot without a word — the
     one interaction model in the app that promises "nothing is written until
     you press Save" was also the one that threw the draft away silently.

     Nothing new is invented here. The same registerNavigationGuard slot, the
     same parked-navigation pattern and the same Modal and copy as the
     Product editor; only the dirty test differs, because a settings record is
     compared as a whole rather than field by field.

     BASELINE: `settings` from useSettingsData, which re-reads on the
     settings-change event — so the moment a save lands, the baseline moves
     with it and the page is clean again with no extra bookkeeping.

     Both hooks sit ABOVE the role check below, which returns early. */
  const isDirty = settingsFingerprint(draft) !== settingsFingerprint(settings);

  const pendingNavRef = useRef(null);

  useEffect(() => {
    return registerNavigationGuard((proceed) => {
      if (!isDirty) return false; // nothing to lose — let it through

      /* First intent wins, exactly as in the Product editor: a second nav
         click while the dialog is open must not silently retarget the answer
         the manager is in the middle of giving. Read from a ref so it is
         never a render behind. */
      if (pendingNavRef.current) return true;

      pendingNavRef.current = proceed;
      setShowDiscard(true);
      return true; // this dialog owns the decision now
    },
    /* Phase 79.3 — the same dirtiness the dialog uses, handed to the shared
       layer so a refresh or tab close warns too. Passed rather than
       recomputed: this screen's normalized fingerprint comparison stays the
       one definition of "unsaved settings". Re-registration on every flip is
       what keeps it current, which is why isDirty is in the deps below. */
    isDirty);
  }, [isDirty]);

  /* Both outcomes funnel through here so a parked navigation can never be
     left dangling: discarding runs it, staying clears it. */
  function resolveDiscard(discard) {
    setShowDiscard(false);
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;

    if (!discard) return; // Keep Editing — the draft survives untouched

    /* Restoring the draft to the persisted record before navigating is what
       makes "discard" mean discard. Navigating usually unmounts this screen
       anyway, but not when the destination is Settings itself, and leaving a
       rejected draft sitting in state would quietly resurrect it. */
    setDraft(settings);
    setError(null);
    if (pending) pending();
  }

  /* Phase 21-pattern architecture guard — redundant, defense-in-depth. The
     App root's route guard already refuses to render this component at all
     for a Cashier session; this second check protects against any future
     code path that might reach it another way. */
  if (session.role !== "admin") {
    return (
      <AdminLayout restaurant={restaurant} session={session} onSignOut={onSignOut} activeKey="settings" onNavigate={onNavigate}>
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <SettingsIcon size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("admin.accessRestricted", "Access restricted")}</h3>
          <p className="ad-empty__sub">{t("admin.accessRestrictedMsg", "This section is only available to Admin accounts.")}</p>
          <Button onClick={() => onNavigate("overview")} style={{ marginTop: 16 }}>
            {t("admin.backToOverview", "Back to Overview")}
          </Button>
        </div>
      </AdminLayout>
    );
  }

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }
  function setNested(key, subKey, value) {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], [subKey]: value } }));
  }
  /* Phase 79.1 — one weekday row's field. Everything stays inside the draft
     until Save, exactly like every other field on this screen. */
  function setDayField(dayKey, field, value) {
    setDraft((prev) => ({
      ...prev,
      workingHours: {
        ...prev.workingHours,
        [dayKey]: { ...prev.workingHours[dayKey], [field]: value },
      },
    }));
  }

  /* Closing a day never clears its times (§9). The values stay in the draft
     and simply stop being editable, so reopening the day restores the hours
     the manager had already entered rather than making them type them again. */
  function toggleDayClosed(dayKey) {
    setDraft((prev) => ({
      ...prev,
      workingHours: {
        ...prev.workingHours,
        [dayKey]: {
          ...prev.workingHours[dayKey],
          isClosed: !prev.workingHours[dayKey]?.isClosed,
        },
      },
    }));
  }

  /* Most restaurants keep one set of hours for most of the week, and typing
     the same two times seven times is the kind of chore that makes people
     leave a schedule wrong. Deliberately skips days marked Closed — those
     were a decision, and reopening them would be the opposite of a
     convenience. */
  function copyMondayToOpenDays() {
    setDraft((prev) => {
      const source = prev.workingHours.mon;
      if (!source) return prev;
      const next = { ...prev.workingHours };
      for (const key of WEEKDAY_KEYS) {
        if (key === "mon" || next[key]?.isClosed) continue;
        next[key] = { ...next[key], openTime: source.openTime, closeTime: source.closeTime };
      }
      return { ...prev, workingHours: next };
    });
  }

  function handleSaveAll() {
    const bothLanguagesDisabled = !draft.languagesEnabled.en && !draft.languagesEnabled.ar;
    if (bothLanguagesDisabled) {
      setError(t("admin.atLeastOneLanguageRequired", "At least one language must stay enabled."));
      return;
    }
    setError(null);
    /* Phase 79.2 — adopt what was actually persisted as the new draft.
       updateSettings normalises on write (working hours above all), so the
       stored record can legitimately differ in shape from the object handed
       in. Keeping the pre-save draft would leave those two fingerprints
       apart forever and the page permanently dirty. Taking the return value
       also means the form shows exactly what is on disk. */
    const saved = updateSettings(restaurant.slug, draft);
    setDraft(saved);
    setToastMessage(t("admin.settingsSaved", "Settings saved"));
    setToastVisible(true);
  }

  /* Phase 31 — restores ONLY the four theme fields on the draft. Identity,
     menu, tables, orders, payment, contact, hours and every operational
     setting are left exactly as they are, because this spreads over the
     existing draft rather than replacing it. It deliberately does not save
     on its own: like every other control here, the change is a draft until
     the admin presses Save, so navigating away discards it. */
  function handleResetTheme() {
    setDraft((prev) => ({ ...prev, ...defaultThemeFields() }));
    setError(null);
  }

  const previewName = draft.name.trim() || restaurant.name;
  /* The preview is rendered through the SAME function the customer screens
     use, so what an admin sees here cannot drift from what guests get. */
  const themePreviewVars = buildCustomerThemeVars(draft);
  const themeIsDefault = isDefaultTheme(draft);

  return (
    <AdminLayout restaurant={restaurant} session={session} onSignOut={onSignOut} activeKey="settings" onNavigate={onNavigate}>
      <header className="ad-header anim-rise">
        <h1 className="ad-header__title">{t("admin.restaurantSettings", "Restaurant Settings")}</h1>
        <p className="ad-header__subtitle">{t("admin.settingsSubtitle", "Customize your restaurant's identity, business details, and customer options.")}</p>
      </header>

      {error && <p className="ad-settings__error">{error}</p>}

      <div className="ad-settings__grid anim-rise">
        {/* ── General ─────────────────────────────────────────────────── */}
        <Card className="ad-settings__section">
          <h3 className="mm-section-title">{t("admin.general", "General")}</h3>
          <Input label={t("admin.restaurantNameLabel", "Restaurant Name")} value={draft.name}
            placeholder={restaurant.name} onChange={(e) => setField("name", e.target.value)} style={{ marginBottom: 14 }} />
          <Input label={t("admin.logoUrl", "Restaurant Logo URL")} value={draft.logoUrl}
            placeholder="https://…" onChange={(e) => setField("logoUrl", e.target.value)} style={{ marginBottom: 14 }} />
          <Input label={t("admin.coverImageUrl", "Cover Image URL")} value={draft.coverImageUrl}
            placeholder="https://…" onChange={(e) => setField("coverImageUrl", e.target.value)} style={{ marginBottom: 14 }} />
          <label className="field mm-field">
            <span className="field__label">{t("admin.restaurantDescription", "Restaurant Description")}</span>
            <textarea className="mm-textarea" value={draft.description} onChange={(e) => setField("description", e.target.value)} rows={3} />
          </label>
        </Card>

        {/* ── Branding ─────────────────────────────────────────────────── */}
        <Card className="ad-settings__section">
          <h3 className="mm-section-title">{t("admin.branding", "Branding")}</h3>

          {/* Live preview — PRO·ORDER always appears together with the
              restaurant's own branding, never replaced by it. */}
          <div className="ad-brand-preview" style={{ "--preview-primary": draft.primaryColor, "--preview-accent": draft.accentColor }}>
            <Logo variant="icon" size="sm" />
            <div className="ad-brand-preview__divider" />
            <div className="ad-brand-preview__restaurant">
              {draft.logoUrl && <img src={draft.logoUrl} alt="" className="ad-brand-preview__logo" />}
              <span className="ad-brand-preview__name">{previewName}</span>
            </div>
          </div>
          <p className="ad-settings__hint">
            {t("admin.brandLockupHint", "PRO·ORDER always appears alongside your restaurant's identity.")}
          </p>
        </Card>

        {/* ── Theme (Phase 31) ─────────────────────────────────────────────
            The colour fields moved here from Branding — same draft, same
            save, just grouped with the typography they combine with so the
            whole customer look lives in one place. Branding above keeps the
            PRO·ORDER + restaurant lockup, which is about brand protection
            rather than theming. */}
        <Card className="ad-settings__section">
          <h3 className="mm-section-title">{t("admin.theme", "Theme")}</h3>
          <p className="ad-settings__hint" style={{ margin: "-6px 0 4px" }}>
            {t("admin.themeHint", "Applies to your customer menu and ordering screens only.")}
          </p>

          <div className="th-row">
            <label className="field mm-field">
              <span className="field__label">{t("admin.primaryColor", "Primary Color")}</span>
              <input type="color" className="ad-settings__color" value={draft.primaryColor} onChange={(e) => setField("primaryColor", e.target.value)} />
            </label>
            <label className="field mm-field">
              <span className="field__label">{t("admin.accentColor", "Accent Color")}</span>
              <input type="color" className="ad-settings__color" value={draft.accentColor} onChange={(e) => setField("accentColor", e.target.value)} />
            </label>
          </div>

          <div className="th-row" style={{ marginTop: 12 }}>
            <label className="field mm-field">
              <span className="field__label">{t("admin.headingFont", "Heading Font")}</span>
              <select
                className="mm-select mm-select--full"
                value={draft.headingFont}
                onChange={(e) => setField("headingFont", e.target.value)}
              >
                {Object.entries(HEADING_FONTS).map(([key, font]) => (
                  <option key={key} value={key}>{t(font.labelKey, key)}</option>
                ))}
              </select>
            </label>
            <label className="field mm-field">
              <span className="field__label">{t("admin.bodyFont", "Body Font")}</span>
              <select
                className="mm-select mm-select--full"
                value={draft.bodyFont}
                onChange={(e) => setField("bodyFont", e.target.value)}
              >
                {Object.entries(BODY_FONTS).map(([key, font]) => (
                  <option key={key} value={key}>{t(font.labelKey, key)}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Compact preview of the DRAFT values, produced by the same
              buildCustomerThemeVars() the customer screens run through. */}
          <span className="field__label" style={{ display: "block", margin: "14px 0 8px" }}>
            {t("admin.preview", "Preview")}
          </span>
          <div className="th-preview" style={themePreviewVars}>
            <h4 className="th-preview__heading">{previewName}</h4>
            <p className="th-preview__body">
              {t("admin.themePreviewText", "Your guests see this typography and accent while ordering.")}
            </p>
            <div className="th-preview__row">
              <span className="th-preview__swatch" />
              <span className="th-preview__btn">{t("customer.addToCart", "Add to cart")}</span>
              <span className="th-preview__chip">{t("customer.popular", "Popular")}</span>
            </div>
          </div>

          <div className="th-actions">
            <Button variant="outline" size="sm" onClick={handleResetTheme} disabled={themeIsDefault}>
              {t("admin.resetToDefault", "Reset to Default")}
            </Button>
            <p className="th-note">
              {t("admin.themeResetNote", "Restores theme colors and fonts only. Save to apply.")}
            </p>
          </div>
        </Card>

        {/* ── Business ─────────────────────────────────────────────────── */}
        <Card className="ad-settings__section">
          <h3 className="mm-section-title">{t("admin.business", "Business")}</h3>
          <Input label={t("admin.serviceChargeLabel", "Service Charge %")} type="number" min="0" step="0.1"
            value={draft.serviceChargePercent ?? ""} placeholder={String(restaurant.serviceChargePercent)}
            onChange={(e) => setField("serviceChargePercent", e.target.value === "" ? null : Number(e.target.value))}
            style={{ marginBottom: 14 }} />
          <Input label={t("admin.currency", "Currency")} value={draft.currency}
            onChange={(e) => setField("currency", e.target.value)} style={{ marginBottom: 14 }} />
          <Input label={t("admin.timeZone", "Time Zone")} value={draft.timeZone}
            onChange={(e) => setField("timeZone", e.target.value)} />
        </Card>

        {/* ── Languages ────────────────────────────────────────────────── */}
        <Card className="ad-settings__section">
          <h3 className="mm-section-title">{t("admin.languages", "Languages")}</h3>
          <label className="field mm-field" style={{ marginBottom: 14 }}>
            <span className="field__label">{t("admin.defaultLanguage", "Default Language")}</span>
            <select className="mm-select mm-select--full" value={draft.defaultLanguage} onChange={(e) => setField("defaultLanguage", e.target.value)}>
              <option value="en">{t("common.english", "English")}</option>
              <option value="ar">{t("common.arabic", "Arabic")}</option>
            </select>
          </label>
          <p className="ad-settings__hint">{t("admin.defaultLanguageHint", "Used only for first-time visitors — returning visitors keep their own saved language.")}</p>
          <div className="mm-toggles">
            <label className="mm-toggle-row">
              <input type="checkbox" checked={draft.languagesEnabled.en} onChange={(e) => setNested("languagesEnabled", "en", e.target.checked)} />
              <span>{t("admin.enableEnglish", "Enable English")}</span>
            </label>
            <label className="mm-toggle-row">
              <input type="checkbox" checked={draft.languagesEnabled.ar} onChange={(e) => setNested("languagesEnabled", "ar", e.target.checked)} />
              <span>{t("admin.enableArabic", "Enable Arabic")}</span>
            </label>
          </div>
        </Card>

        {/* ── Payment Methods ──────────────────────────────────────────── */}
        <Card className="ad-settings__section">
          <h3 className="mm-section-title">{t("admin.paymentMethodsSection", "Payment Methods")}</h3>
          <div className="mm-toggles" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            <label className="mm-toggle-row">
              <input type="checkbox" checked={draft.paymentMethodsEnabled.cash_at_table} onChange={(e) => setNested("paymentMethodsEnabled", "cash_at_table", e.target.checked)} />
              <span>{t("payment.cashAtTable", "Cash at the table")}</span>
            </label>
            <label className="mm-toggle-row">
              <input type="checkbox" checked={draft.paymentMethodsEnabled.card_at_table} onChange={(e) => setNested("paymentMethodsEnabled", "card_at_table", e.target.checked)} />
              <span>{t("payment.cardAtTable", "Card / Visa at the table")}</span>
            </label>
            <label className="mm-toggle-row">
              <input type="checkbox" checked={draft.paymentMethodsEnabled.online_payment} onChange={(e) => setNested("paymentMethodsEnabled", "online_payment", e.target.checked)} />
              <span>{t("payment.onlinePayment", "Online payment")}</span>
            </label>
          </div>
          <p className="ad-settings__hint">{t("admin.onlinePaymentStillDisabledHint", "Online Payment remains functionally disabled — this only controls whether it's shown as an upcoming option.")}</p>
        </Card>

        {/* ── Contact Information ──────────────────────────────────────── */}
        <Card className="ad-settings__section">
          <h3 className="mm-section-title">{t("admin.contactInformation", "Contact Information")}</h3>
          <Input label={t("admin.phone", "Phone")} value={draft.contactPhone}
            onChange={(e) => setField("contactPhone", e.target.value)} style={{ marginBottom: 14 }} />
          <Input label={t("admin.email", "Email")} value={draft.contactEmail}
            onChange={(e) => setField("contactEmail", e.target.value)} style={{ marginBottom: 14 }} />
          <Input label={t("admin.address", "Address")} value={draft.contactAddress}
            onChange={(e) => setField("contactAddress", e.target.value)} />
        </Card>

        {/* ── Working Hours ────────────────────────────────────────────── */}
        <Card className="ad-settings__section">
          <h3 className="mm-section-title">{t("admin.workingHours", "Working Hours")}</h3>
          {/* Phase 79 §31 — these fields had no effect on anything until that
              phase, so the section said nothing about what they were for. Now
              that Accepting Orders' Auto mode consumes them, the one sentence
              a manager needs is which control reads them and where it lives. */}
          <p className="ad-settings__hint" style={{ margin: "0 0 14px" }}>
            {t(
              "accepting.workingHoursHint",
              "Used by Accepting Orders on the Overview page when its mode is set to Auto. Each day is independent: a closing time earlier than the opening time keeps that day open past midnight, and setting both to the same time means open 24 hours."
            )}
          </p>

          {/* Phase 79.1 — seven independent rows, one per weekday.
              Deliberately a plain vertical list rather than a table or a
              timeline: a manager scans down the days looking for the one they
              need to change, and every extra structure between them is
              something to read past. Each row is self-contained, so nothing
              here can make one day's hours depend on another's. */}
          <div className="wh-list">
            {WEEKDAY_KEYS.map((key) => {
              const day = draft.workingHours[key] || {};
              const label = t(DAY_LABEL_KEY[key], DAY_LABEL_FALLBACK[key]);
              const closed = !!day.isClosed;
              return (
                <div key={key} className={`wh-row ${closed ? "wh-row--closed" : ""}`}>
                  <span className="wh-row__day">{label}</span>

                  {/* The state is written out, never carried by colour alone
                      (§31). aria-pressed exposes it to assistive tech, and the
                      accessible name names the day so a screen reader user
                      knows which row they are on. */}
                  <button
                    type="button"
                    className={`wh-toggle ${closed ? "wh-toggle--closed" : "wh-toggle--open"}`}
                    onClick={() => toggleDayClosed(key)}
                    aria-pressed={!closed}
                    aria-label={`${label} — ${closed ? t("accepting.dayClosed", "Closed") : t("accepting.dayOpen", "Open")}`}
                  >
                    {closed ? t("accepting.dayClosed", "Closed") : t("accepting.dayOpen", "Open")}
                  </button>

                  <div className="wh-row__times">
                    <input
                      type="time"
                      className="wh-time"
                      value={day.openTime || ""}
                      disabled={closed}
                      onChange={(e) => setDayField(key, "openTime", e.target.value)}
                      aria-label={`${label} — ${t("admin.openingTime", "Opening Time")}`}
                    />
                    <span className="wh-row__dash" aria-hidden="true">–</span>
                    <input
                      type="time"
                      className="wh-time"
                      value={day.closeTime || ""}
                      disabled={closed}
                      onChange={(e) => setDayField(key, "closeTime", e.target.value)}
                      aria-label={`${label} — ${t("admin.closingTime", "Closing Time")}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="wh-actions">
            <Button variant="outline" size="sm" onClick={copyMondayToOpenDays}>
              {t("accepting.copyMondayToAll", "Copy Monday to all open days")}
            </Button>
          </div>
        </Card>

        {/* ── Kitchen Alerts (Phase 27) ────────────────────────────────────
            Self-contained: it writes to its own storage key the moment a
            control changes, so it is intentionally NOT wired to the Save
            button below (which commits the general-settings draft only). */}
        <KitchenAlertsCard
          restaurant={restaurant}
          onNotify={(message) => {
            setToastMessage(message);
            setToastVisible(true);
          }}
        />

        {/* ── Staff Call Alerts (Phase 59) ─────────────────────────────────
            Sits beside Kitchen Alerts because they are the same kind of
            control, but writes to its own key and is likewise not wired to
            the Save button. Front-of-house and kitchen are tuned separately
            on purpose — different rooms, different noise. */}
        <StaffCallAlertsCard
          restaurant={restaurant}
          onNotify={(message) => {
            setToastMessage(message);
            setToastVisible(true);
          }}
        />
      </div>

      <div className="ad-settings__save-bar anim-rise">
        <Button icon={Save} onClick={handleSaveAll}>{t("common.save", "Save")}</Button>
      </div>

      {/* Phase 79.2 — the SAME dialog the Product editor raises, down to the
          translation keys. The existing copy is already generic ("You have
          unsaved changes…"), so it is reused rather than duplicated into a
          settings-specific variant that would only drift. Keep Editing is
          ghost, Discard Changes is danger, and the shared Modal carries the
          Phase 76.2 44px footer targets automatically because this renders
          inside .container--admin. */}
      {showDiscard && (
        <Modal
          open
          onClose={() => resolveDiscard(false)}
          title={t("admin.discardChangesTitle", "Discard changes?")}
          footer={
            <>
              <Button variant="ghost" onClick={() => resolveDiscard(false)}>
                {t("admin.keepEditing", "Keep Editing")}
              </Button>
              <Button variant="danger" onClick={() => resolveDiscard(true)}>
                {t("admin.discardChanges", "Discard Changes")}
              </Button>
            </>
          }
        >
          <p className="ad-cancel-modal__msg">
            {t(
              "admin.discardChangesMsg",
              "You have unsaved changes. If you leave now, your changes will be lost."
            )}
          </p>
        </Modal>
      )}

      <Toast visible={toastVisible} message={toastMessage} onDone={() => setToastVisible(false)} />
    </AdminLayout>
  );
}
