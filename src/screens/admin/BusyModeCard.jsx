import { useState, useEffect } from "react";
import { Clock, Zap, Lock } from "lucide-react";
import Card   from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input  from "../../components/ui/Input.jsx";
import { usePrepTime } from "../../lib/usePrepTime.js";
import {
  setBusyMode,
  updatePrepTimeConfig,
  isValidMinutes,
  MIN_PREP_MINUTES,
  MAX_PREP_MINUTES,
} from "../../lib/prepTimeData.js";
import { useLanguage } from "../../i18n/useLanguage.js";

/**
 * BusyModeCard — Phase 26 operational control, shown on the Admin Overview.
 *
 * Deliberately NOT placed in Restaurant Settings: that screen is Admin-only
 * (route-guarded), and the phase requires Cashier to be able to flip Busy
 * Mode. Overview is reachable by both roles, so the control lives there.
 *
 * Role split, using the app's existing pattern of checking session.role:
 *   Admin   — toggle Busy Mode AND edit basePrepMinutes / busyExtraMinutes
 *   Cashier — toggle Busy Mode only; the two numbers render as read-only
 *             values with a short explanation of why
 *
 * The numeric editor is simply not rendered for a Cashier, and
 * updatePrepTimeConfig() is never reachable from their UI — the same
 * "hide it and also never wire it up" approach the Admin-only screens use.
 * Note the toggle itself is a surgical single-field write (setBusyMode), so
 * a Cashier flipping it can never disturb the Admin's numbers, and an Admin
 * saving numbers can never disturb the Cashier's toggle.
 *
 * Props:
 *   restaurant — { slug, ... }
 *   session    — { role, ... }
 *   onNotify   — (message: string) => void; parent owns the Toast, matching
 *                every other screen in the app
 */
export default function BusyModeCard({ restaurant, session, onNotify }) {
  const { t } = useLanguage();
  const { settings } = usePrepTime(restaurant.slug);
  const isAdmin = session.role === "admin";

  const [baseDraft, setBaseDraft] = useState(String(settings.basePrepMinutes));
  const [extraDraft, setExtraDraft] = useState(String(settings.busyExtraMinutes));
  const [error, setError] = useState(null);

  /* Keep the drafts in step with storage when the values change underneath
     us (another admin tab saving, or a demo reset) — but only while the
     admin isn't mid-edit, which is what comparing against the saved value
     achieves: an untouched field tracks storage, a touched one is left
     alone until Save or the next external change. */
  useEffect(() => {
    setBaseDraft(String(settings.basePrepMinutes));
    setExtraDraft(String(settings.busyExtraMinutes));
  }, [settings.basePrepMinutes, settings.busyExtraMinutes]);

  const busyOn = settings.busyModeEnabled;
  /* What a brand-new order would be told right now — the same formula
     getEstimatedPrepMinutes() applies, surfaced so staff can see the effect
     of the toggle before a guest does. */
  const currentEstimate =
    settings.basePrepMinutes + (busyOn ? settings.busyExtraMinutes : 0);

  function handleToggle() {
    const next = !busyOn;
    setBusyMode(restaurant.slug, next);
    onNotify?.(
      next
        ? t("prep.busyModeOnToast", "Busy Mode turned on")
        : t("prep.busyModeOffToast", "Busy Mode turned off")
    );
  }

  function handleSaveConfig() {
    if (!isValidMinutes(baseDraft) || !isValidMinutes(extraDraft)) {
      setError(
        t("prep.invalidMinutes", "Please enter a whole number of minutes (0–240).")
      );
      return;
    }
    setError(null);
    const result = updatePrepTimeConfig(restaurant.slug, {
      basePrepMinutes: Number(baseDraft),
      busyExtraMinutes: Number(extraDraft),
    });
    if (result.ok) {
      onNotify?.(t("prep.prepConfigSaved", "Preparation time settings saved"));
    }
  }

  const isDirty =
    baseDraft !== String(settings.basePrepMinutes) ||
    extraDraft !== String(settings.busyExtraMinutes);

  return (
    <Card className={`busy-card ${busyOn ? "busy-card--on" : ""}`}>
      <div className="busy-card__head">
        <div className="busy-card__title-wrap">
          <span className="busy-card__icon">
            <Zap size={16} strokeWidth={2} />
          </span>
          <div>
            <h2 className="busy-card__title">{t("prep.serviceSpeed", "Service speed")}</h2>
            <p className="busy-card__sub">
              {t("prep.newOrdersEstimate", "New orders will show")}{" "}
              <strong className="busy-card__estimate">
                {t("prep.aboutXMinutes", "About {n} minutes").replace("{n}", currentEstimate)}
              </strong>
            </p>
          </div>
        </div>

        {/* Toggle — both Admin and Cashier */}
        <button
          type="button"
          className={`busy-toggle ${busyOn ? "busy-toggle--on" : ""}`}
          onClick={handleToggle}
          aria-pressed={busyOn}
        >
          <span className="busy-toggle__label">{t("prep.busyMode", "Busy Mode")}</span>
          <span className="busy-toggle__state">
            {busyOn ? t("prep.on", "ON") : t("prep.off", "OFF")}
          </span>
        </button>
      </div>

      {busyOn && (
        <div className="busy-card__banner" role="status">
          <Clock size={14} strokeWidth={2.2} />
          <span>{t("prep.busyModeActive", "Busy Mode is active")}</span>
        </div>
      )}

      <div className="busy-card__divider" />

      {isAdmin ? (
        <div className="busy-card__config">
          <div className="busy-card__fields">
            <Input
              label={t("prep.basePrepMinutes", "Base preparation time (minutes)")}
              type="number"
              inputMode="numeric"
              min={MIN_PREP_MINUTES}
              max={MAX_PREP_MINUTES}
              value={baseDraft}
              onChange={(e) => {
                setBaseDraft(e.target.value);
                if (error) setError(null);
              }}
            />
            <Input
              label={t("prep.busyExtraMinutes", "Extra time when busy (minutes)")}
              type="number"
              inputMode="numeric"
              min={MIN_PREP_MINUTES}
              max={MAX_PREP_MINUTES}
              value={extraDraft}
              onChange={(e) => {
                setExtraDraft(e.target.value);
                if (error) setError(null);
              }}
            />
          </div>

          {error && <p className="busy-card__error">{error}</p>}

          <Button size="sm" onClick={handleSaveConfig} disabled={!isDirty}>
            {t("common.save", "Save")}
          </Button>
        </div>
      ) : (
        /* Cashier — same numbers, read-only, with the reason stated plainly
           rather than showing disabled inputs that look broken. */
        <div className="busy-card__readonly">
          <div className="busy-card__readonly-row">
            <span>{t("prep.basePrepMinutes", "Base preparation time (minutes)")}</span>
            <strong>{settings.basePrepMinutes}</strong>
          </div>
          <div className="busy-card__readonly-row">
            <span>{t("prep.busyExtraMinutes", "Extra time when busy (minutes)")}</span>
            <strong>{settings.busyExtraMinutes}</strong>
          </div>
          <p className="busy-card__lock">
            <Lock size={12} strokeWidth={2.2} />
            {t("prep.configAdminOnly", "Only Admin accounts can change these values.")}
          </p>
        </div>
      )}
    </Card>
  );
}
