import { Volume2, Play } from "lucide-react";
import Card   from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import { SOUND_PURPOSES, soundFieldId } from "../../lib/kitchenAlertData.js";
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
 * KitchenAlertsCard — Admin-only configuration of the Kitchen alert sounds.
 * Rendered inside AdminSettingsScreen, which is already permission-guarded, so
 * Cashier can never reach it and Kitchen only ever consumes the result.
 *
 * ── Phase 96.1 §4 — FULLY CONTROLLED, NOTHING SAVES ITSELF ────────────────
 * This card used to write to storage on every change (Phase 27), so a sound
 * picked here was committed before the manager pressed anything. It now owns
 * no state at all: the parent holds the draft, this renders it and reports
 * changes upward, and the values reach storage only through the page's Save.
 *
 * That means the sounds now take part in the page's dirty state, its
 * unsaved-changes guard, its Discard and its validation — the same lifecycle
 * as every other setting on the page.
 *
 * Preview is the one thing that still acts immediately, and deliberately: a
 * sound can only be judged by hearing it. Preview plays the DRAFT value and
 * persists nothing.
 *
 * Props:
 *   value     — the alert draft { soundEnabled, soundType, canceledSoundType, volume }
 *   conflict  — {key, conflictsWith} | null, from the parent's draft validation
 *   onChange  — (patch, touchedKey?) => void
 */
export default function KitchenAlertsCard({ value, conflict, onChange }) {
  const { t } = useLanguage();

  function purposeLabel(key) {
    const purpose = SOUND_PURPOSES.find((p) => p.key === key);
    return purpose ? t(purpose.labelKey, purpose.fallback) : key;
  }

  /* Plays what is currently selected in the DRAFT, which is what the kitchen
     will hear once this is saved — not what is on disk right now. */
  function handleTest(soundType) {
    playAlertSound(soundType, value.volume);
  }

  const volumePercent = Math.round(value.volume * 100);

  /* One selector + its own Test button per purpose, so the two cannot drift
     apart in behaviour or layout. */
  function renderSoundField(purpose) {
    const id = soundFieldId(purpose.key);
    const errorId = `${id}-error`;
    const hasError = conflict?.key === purpose.key;

    return (
      <div className="field mm-field" key={purpose.key} style={{ marginTop: 12 }}>
        <label className="field__label" htmlFor={id}>
          {t(purpose.labelKey, purpose.fallback)}
        </label>
        <div className="ka-sound-row">
          <select
            id={id}
            className={`mm-select mm-select--full ${hasError ? "input--error" : ""}`}
            value={value[purpose.key]}
            disabled={!value.soundEnabled}
            aria-invalid={hasError ? "true" : undefined}
            aria-describedby={hasError ? errorId : undefined}
            onChange={(e) => onChange({ [purpose.key]: e.target.value }, purpose.key)}
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
            onClick={() => handleTest(value[purpose.key])}
            disabled={!value.soundEnabled}
          >
            {t("kitchen.testSound", "Test Sound")}
          </Button>
        </div>
        {hasError && (
          <p className="th-color__error" id={errorId} role="alert">
            {t(
              "kitchen.soundAlreadyUsed",
              "This sound is already used for {purpose}. Choose a different sound."
            ).replace("{purpose}", purposeLabel(conflict.conflictsWith))}
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
          "Played on the Kitchen board. Each alert needs its own sound."
        )}
      </p>

      <div className="mm-toggles">
        <label className="mm-toggle-row">
          <input
            type="checkbox"
            checked={value.soundEnabled}
            onChange={(e) => onChange({ soundEnabled: e.target.checked })}
          />
          <span>{t("kitchen.alertSoundEnabled", "Play kitchen alert sounds")}</span>
        </label>
      </div>

      {/* One selector per alert purpose. Each must own a distinct sound, so a
          cook can tell "an order arrived" from "stop cooking that" without
          looking up from the pass. */}
      {SOUND_PURPOSES.map(renderSoundField)}

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
            disabled={!value.soundEnabled}
            onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
          />
        </div>
      </label>
    </Card>
  );
}
