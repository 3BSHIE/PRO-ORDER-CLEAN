import { Volume2, Play } from "lucide-react";
import Card   from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import { playAlertSound, SOUND_TYPES } from "../../lib/alertSound.js";
import { useLanguage } from "../../i18n/useLanguage.js";

/* Translation keys for the three built-in voices, keyed by their stable id.
   Shared wording with the Kitchen card — they are the same three sounds. */
const SOUND_LABEL_KEY = {
  bell: "kitchen.soundBell",
  chime: "kitchen.soundChime",
  beep: "kitchen.soundBeep",
};
const SOUND_LABEL_FALLBACK = { bell: "Bell", chime: "Chime", beep: "Beep" };

/**
 * StaffCallAlertsCard — Phase 59, Admin-only configuration of the sound
 * played when a guest rings for a waiter. Deliberately the twin of
 * KitchenAlertsCard: same controls, same 0–100 slider over a 0..1 stored
 * volume — but a separate storage key, so Kitchen at Chime/30% and Staff
 * Calls at Bell/80% coexist without either touching the other.
 *
 * Rendered inside AdminSettingsScreen, which is already permission-guarded to
 * Admin, so a Cashier can never reach these controls — while still hearing
 * whatever the Admin chose.
 *
 * ── Phase 96.2 — FULLY CONTROLLED, NOTHING SAVES ITSELF ───────────────────
 * This card used to write to storage on every control change (Phase 59),
 * matching Kitchen Alerts at the time. Phase 96.1 moved Kitchen Alerts onto
 * the page's explicit Save and left this one behind, so two identical-looking
 * cards side by side committed differently — the worse of the two outcomes.
 *
 * It now owns no state: the parent holds the draft, this renders it and
 * reports changes upward, and values reach storage only through the page's
 * Save. Preview is the one thing that still acts immediately, and
 * deliberately: a sound can only be judged by hearing it. It plays the DRAFT
 * value and persists nothing.
 *
 * Props:
 *   value    — the staff-call alert draft { soundEnabled, soundType, volume }
 *   onChange — (patch) => void
 */
export default function StaffCallAlertsCard({ value, onChange }) {
  const { t } = useLanguage();

  /* Plays what is currently selected in the DRAFT, which is what the floor
     will hear once this is saved — not what is on disk right now. Playing a
     sound touches no staff call data whatsoever: it cannot create, resolve or
     modify a call, and it persists nothing. */
  function handleTest() {
    playAlertSound(value.soundType, value.volume);
  }

  const volumePercent = Math.round(value.volume * 100);

  return (
    <Card className="ad-settings__section">
      <h3 className="mm-section-title">{t("staff.staffCallAlerts", "Staff Call Alerts")}</h3>
      <p className="ad-settings__hint" style={{ margin: "-6px 0 4px" }}>
        {t(
          "staff.staffCallAlertsHint",
          "Played for Admin and Cashier when a guest requests assistance. Separate from Kitchen Alerts."
        )}
      </p>

      {/* On/off — the master switch. Turning it off silences audio only; the
          on-screen alert still appears, so nothing is missed. */}
      <div className="mm-toggles">
        <label className="mm-toggle-row">
          <input
            type="checkbox"
            checked={value.soundEnabled}
            onChange={(e) => onChange({ soundEnabled: e.target.checked })}
          />
          <span>{t("staff.alertSoundEnabled", "Play a sound for new staff calls")}</span>
        </label>
      </div>

      {/* Sound type */}
      <label className="field mm-field" style={{ marginTop: 12 }}>
        <span className="field__label">{t("kitchen.sound", "Sound")}</span>
        <select
          className="mm-select mm-select--full"
          aria-label={t("kitchen.sound", "Sound")}
          value={value.soundType}
          disabled={!value.soundEnabled}
          onChange={(e) => {
            onChange({ soundType: e.target.value });
            /* Play the newly chosen voice straight away — picking a sound
               without hearing it is guesswork. Preview only; the choice
               reaches storage through the page's Save. */
            playAlertSound(e.target.value, value.volume);
          }}
        >
          {SOUND_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(SOUND_LABEL_KEY[type], SOUND_LABEL_FALLBACK[type])}
            </option>
          ))}
        </select>
      </label>

      {/* Volume — 0 is allowed and is genuinely silent, matching Phase 27.
          The toggle above is the intended way to turn alerts off; a 0 here
          simply behaves the way it reads. */}
      <label className="field mm-field" style={{ marginTop: 12 }}>
        <span className="field__label">
          {t("kitchen.volume", "Volume")} <span className="ka-volume__value">{volumePercent}%</span>
        </span>
        <div className="ka-volume">
          <Volume2 size={15} strokeWidth={2} aria-hidden="true" />
          <input
            className="ka-volume__slider"
            type="range"
            min="0"
            max="100"
            step="5"
            aria-label={t("kitchen.volume", "Volume")}
            value={volumePercent}
            disabled={!value.soundEnabled}
            onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
          />
        </div>
      </label>

      <Button
        variant="outline"
        size="sm"
        icon={Play}
        onClick={handleTest}
        disabled={!value.soundEnabled}
        style={{ marginTop: 14, alignSelf: "flex-start" }}
      >
        {t("kitchen.testSound", "Test Sound")}
      </Button>
    </Card>
  );
}
