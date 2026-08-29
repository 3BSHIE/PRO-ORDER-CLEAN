import { Volume2, Play } from "lucide-react";
import Card   from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import { useStaffCallAlertSettings } from "../../lib/useStaffCallAlertSettings.js";
import { updateStaffCallAlertSettings } from "../../lib/staffCallAlertData.js";
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
 * KitchenAlertsCard: same controls, same apply-on-change behaviour, same
 * 0–100 slider over a 0..1 stored volume — but a separate storage key, so
 * Kitchen at Chime/30% and Staff Calls at Bell/80% coexist without either
 * touching the other.
 *
 * Rendered inside AdminSettingsScreen, which is already route-guarded to
 * Admin, so a Cashier can never reach these controls — while still hearing
 * whatever the Admin chose.
 *
 * Apply-on-change, deliberately (same reasoning as Phase 27): a sound is
 * only meaningfully judged by hearing it, so Test Sound must reflect the
 * selection immediately; and this card writes to a different key than the
 * page's main Save button, so sharing that button would imply a transaction
 * that does not exist.
 *
 * Props:
 *   restaurant — { slug, ... }
 *   onNotify   — (message: string) => void; parent owns the Toast
 */
export default function StaffCallAlertsCard({ restaurant, onNotify }) {
  const { t } = useLanguage();
  const { settings } = useStaffCallAlertSettings(restaurant.slug);

  function apply(patch, message) {
    updateStaffCallAlertSettings(restaurant.slug, patch);
    if (message) onNotify?.(message);
  }

  /* Preview uses the values exactly as stored right now, so what the Admin
     hears here is what the floor will hear. Playing a sound touches no staff
     call data whatsoever — it cannot create, resolve or modify a call. */
  function handleTest() {
    const played = playAlertSound(settings.soundType, settings.volume);
    onNotify?.(
      played
        ? t("kitchen.testingSound", "Playing test sound…")
        : t("kitchen.soundUnavailable", "Audio is unavailable in this browser.")
    );
  }

  const volumePercent = Math.round(settings.volume * 100);

  return (
    <Card className="ad-settings__section">
      <h3 className="mm-section-title">{t("staff.staffCallAlerts", "Staff Call Alerts")}</h3>
      <p className="ad-settings__hint" style={{ margin: "-6px 0 4px" }}>
        {t(
          "staff.staffCallAlertsHint",
          "Played for Admin and Cashier when a guest requests assistance. Separate from Kitchen Alerts. Changes apply immediately."
        )}
      </p>

      {/* On/off — the master switch. Turning it off silences audio only; the
          on-screen alert still appears, so nothing is missed. */}
      <div className="mm-toggles">
        <label className="mm-toggle-row">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) =>
              apply(
                { soundEnabled: e.target.checked },
                e.target.checked
                  ? t("staff.alertsEnabledToast", "Staff call sound turned on")
                  : t("staff.alertsDisabledToast", "Staff call sound turned off")
              )
            }
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
          value={settings.soundType}
          disabled={!settings.soundEnabled}
          onChange={(e) => {
            apply({ soundType: e.target.value });
            /* Play the newly chosen voice straight away — picking a sound
               without hearing it is guesswork. */
            playAlertSound(e.target.value, settings.volume);
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
            disabled={!settings.soundEnabled}
            onChange={(e) => apply({ volume: Number(e.target.value) / 100 })}
          />
        </div>
      </label>

      <Button
        variant="outline"
        size="sm"
        icon={Play}
        onClick={handleTest}
        disabled={!settings.soundEnabled}
        style={{ marginTop: 14, alignSelf: "flex-start" }}
      >
        {t("kitchen.testSound", "Test Sound")}
      </Button>
    </Card>
  );
}
