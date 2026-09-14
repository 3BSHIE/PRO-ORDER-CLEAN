import { useState } from "react";
import { Volume2, Play } from "lucide-react";
import Card   from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import { useKitchenAlertSettings } from "../../lib/useKitchenAlertSettings.js";
import {
  updateKitchenAlertSettings,
  findSoundPurposeConflict,
  SOUND_PURPOSES,
} from "../../lib/kitchenAlertData.js";
import { playAlertSound, SOUND_TYPES } from "../../lib/alertSound.js";
import { useLanguage } from "../../i18n/useLanguage.js";

/* Translation keys for the three built-in voices, keyed by their stable id. */
const SOUND_LABEL_KEY = {
  bell: "kitchen.soundBell",
  chime: "kitchen.soundChime",
  beep: "kitchen.soundBeep",
};
const SOUND_LABEL_FALLBACK = { bell: "Bell", chime: "Chime", beep: "Beep" };

/**
 * KitchenAlertsCard — Phase 27, Admin-only configuration of the kitchen's
 * new-order alert sound. Rendered inside AdminSettingsScreen, which is
 * already route-guarded to Admin, so Cashier can never reach it and Kitchen
 * only ever consumes the result.
 *
 * Apply-on-change, deliberately:
 *   Every control writes immediately instead of feeding the page's main
 *   "Save" button. Two reasons — a sound setting is only meaningfully
 *   evaluated by *hearing* it, so Test Sound must reflect what you just
 *   picked; and this card writes to a different storage key than the rest of
 *   the settings page, so sharing one Save button would imply a transaction
 *   that doesn't exist. Each write is a surgical field patch.
 *
 * Props:
 *   restaurant — { slug, ... }
 *   onNotify   — (message: string) => void; parent owns the Toast
 */
export default function KitchenAlertsCard({ restaurant, onNotify }) {
  const { t } = useLanguage();
  const { settings } = useKitchenAlertSettings(restaurant.slug);
  /* Phase 96 §39 — the rejected assignment, keyed by the field it was made
     on, so the message sits against the control the Admin just used. */
  const [conflictKey, setConflictKey] = useState(null);

  function apply(patch, message) {
    const result = updateKitchenAlertSettings(restaurant.slug, patch);
    if (message && result.ok) onNotify?.(message);
    return result;
  }

  /* Human name of the purpose a sound is already committed to, for the
     message. Resolved from SOUND_PURPOSES so a future purpose needs no new
     copy here. */
  function purposeLabel(key) {
    const purpose = SOUND_PURPOSES.find((p) => p.key === key);
    return purpose ? t(purpose.labelKey, purpose.fallback) : key;
  }

  /* One handler for every sound selector. A conflicting choice is refused
     outright rather than saved-and-warned: the two purposes must never both
     be answerable by the same noise, not even briefly. Nothing is played
     either — hearing the sound would suggest the choice took. */
  function handleSoundChange(key, value) {
    const conflict = findSoundPurposeConflict(settings, { [key]: value });
    if (conflict) {
      setConflictKey(conflict);
      return;
    }
    setConflictKey(null);
    const result = apply({ [key]: value });
    if (result.ok) playAlertSound(value, settings.volume);
  }

  /* Preview always uses the values as they stand right now, so what the
     admin hears is exactly what the kitchen will hear. */
  function handleTest(soundType) {
    const played = playAlertSound(soundType, settings.volume);
    onNotify?.(
      played
        ? t("kitchen.testingSound", "Playing test sound…")
        : t("kitchen.soundUnavailable", "Audio is unavailable in this browser.")
    );
  }

  const volumePercent = Math.round(settings.volume * 100);

  /* One selector + its own Test button, rendered per purpose so the two
     cannot drift apart in behaviour or layout. */
  function renderSoundField(purpose) {
    const errorId = `ka-conflict-${purpose.key}`;
    const hasError = conflictKey?.key === purpose.key;
    return (
      <div className="field mm-field" key={purpose.key} style={{ marginTop: 12 }}>
        <span className="field__label">{t(purpose.labelKey, purpose.fallback)}</span>
        <div className="ka-sound-row">
          <select
            className={`mm-select mm-select--full ${hasError ? "input--error" : ""}`}
            value={settings[purpose.key]}
            disabled={!settings.soundEnabled}
            aria-invalid={hasError ? "true" : undefined}
            aria-describedby={hasError ? errorId : undefined}
            onChange={(e) => handleSoundChange(purpose.key, e.target.value)}
          >
            {SOUND_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(SOUND_LABEL_KEY[type], SOUND_LABEL_FALLBACK[type])}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            icon={Play}
            onClick={() => handleTest(settings[purpose.key])}
            disabled={!settings.soundEnabled}
          >
            {t("kitchen.testSound", "Test Sound")}
          </Button>
        </div>
        {hasError && (
          <p className="th-color__error" id={errorId} role="alert">
            {t(
              "kitchen.soundAlreadyUsed",
              "This sound is already used for {purpose}. Choose a different sound."
            ).replace("{purpose}", purposeLabel(conflictKey.conflictsWith))}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card className="ad-settings__section">
      <h3 className="mm-section-title">{t("kitchen.kitchenAlerts", "Kitchen Alerts")}</h3>
      <p className="ad-settings__hint" style={{ margin: "-6px 0 4px" }}>
        {t(
          "kitchen.kitchenAlertsHint",
          "Played on the Kitchen board. Each alert needs its own sound. Changes apply immediately."
        )}
      </p>

      {/* On/off */}
      <div className="mm-toggles">
        <label className="mm-toggle-row">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) =>
              apply(
                { soundEnabled: e.target.checked },
                e.target.checked
                  ? t("kitchen.alertsEnabledToast", "Kitchen alert sound turned on")
                  : t("kitchen.alertsDisabledToast", "Kitchen alert sound turned off")
              )
            }
          />
          <span>{t("kitchen.alertSoundEnabled", "Play kitchen alert sounds")}</span>
        </label>
      </div>

      {/* Phase 96 §38 — one selector per alert purpose. Each must own a
          distinct sound, so a cook can tell "an order arrived" from "stop
          cooking that" without looking up from the pass. */}
      {SOUND_PURPOSES.map(renderSoundField)}

      {/* Volume */}
      <label className="field mm-field" style={{ marginTop: 12 }}>
        <span className="field__label">
          {t("kitchen.volume", "Volume")} <span className="ka-volume__value">{volumePercent}%</span>
        </span>
        <div className="ka-volume">
          <Volume2 size={15} strokeWidth={2} />
          <input
            className="ka-volume__slider"
            type="range"
            min="0"
            max="100"
            step="5"
            value={volumePercent}
            disabled={!settings.soundEnabled}
            onChange={(e) => apply({ volume: Number(e.target.value) / 100 })}
          />
        </div>
      </label>
    </Card>
  );
}
