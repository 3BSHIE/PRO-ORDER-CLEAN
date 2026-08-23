import { useState } from "react";
import { Settings as SettingsIcon, Save } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Button  from "../../components/ui/Button.jsx";
import Input   from "../../components/ui/Input.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import AdminLayout from "./AdminLayout.jsx";
import KitchenAlertsCard from "./KitchenAlertsCard.jsx";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { updateSettings } from "../../lib/settingsData.js";
import { useLanguage } from "../../i18n/useLanguage.js";

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

const DAYS = [
  { key: "sun", label: "Sun" }, { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" }, { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
];

export default function AdminSettingsScreen({ restaurant, session, onSignOut, onNavigate }) {
  const { settings } = useSettingsData(restaurant.slug);
  const { t } = useLanguage();

  const [draft, setDraft] = useState(settings);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [error, setError] = useState(null);

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
  function toggleClosedDay(dayKey) {
    setDraft((prev) => {
      const set = new Set(prev.workingHours.closedDays || []);
      set.has(dayKey) ? set.delete(dayKey) : set.add(dayKey);
      return { ...prev, workingHours: { ...prev.workingHours, closedDays: [...set] } };
    });
  }

  function handleSaveAll() {
    const bothLanguagesDisabled = !draft.languagesEnabled.en && !draft.languagesEnabled.ar;
    if (bothLanguagesDisabled) {
      setError(t("admin.atLeastOneLanguageRequired", "At least one language must stay enabled."));
      return;
    }
    setError(null);
    updateSettings(restaurant.slug, draft);
    setToastMessage(t("admin.settingsSaved", "Settings saved"));
    setToastVisible(true);
  }

  const previewName = draft.name.trim() || restaurant.name;

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
          <div className="mm-row-2">
            <label className="field mm-field">
              <span className="field__label">{t("admin.primaryColor", "Primary Color")}</span>
              <input type="color" className="ad-settings__color" value={draft.primaryColor} onChange={(e) => setField("primaryColor", e.target.value)} />
            </label>
            <label className="field mm-field">
              <span className="field__label">{t("admin.accentColor", "Accent Color")}</span>
              <input type="color" className="ad-settings__color" value={draft.accentColor} onChange={(e) => setField("accentColor", e.target.value)} />
            </label>
          </div>

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
          <div className="mm-row-2" style={{ marginBottom: 14 }}>
            <Input label={t("admin.openingTime", "Opening Time")} type="time" value={draft.workingHours.openTime}
              onChange={(e) => setNested("workingHours", "openTime", e.target.value)} />
            <Input label={t("admin.closingTime", "Closing Time")} type="time" value={draft.workingHours.closeTime}
              onChange={(e) => setNested("workingHours", "closeTime", e.target.value)} />
          </div>
          <span className="field__label" style={{ display: "block", marginBottom: 8 }}>{t("admin.closedDays", "Closed Days")}</span>
          <div className="chips-row" style={{ marginBottom: 0 }}>
            {DAYS.map((day) => (
              <button key={day.key} type="button"
                className={`chip ${draft.workingHours.closedDays.includes(day.key) ? "chip--active" : ""}`}
                onClick={() => toggleClosedDay(day.key)}
              >
                {day.label}
              </button>
            ))}
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
      </div>

      <div className="ad-settings__save-bar anim-rise">
        <Button icon={Save} onClick={handleSaveAll}>{t("common.save", "Save")}</Button>
      </div>

      <Toast visible={toastVisible} message={toastMessage} onDone={() => setToastVisible(false)} />
    </AdminLayout>
  );
}
