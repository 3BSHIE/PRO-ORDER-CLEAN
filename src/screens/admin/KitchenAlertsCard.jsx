import { Volume2, Play } from "lucide-react";
import Card   from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import { useKitchenAlertSettings } from "../../lib/useKitchenAlertSettings.js";
import { updateKitchenAlertSettings } from "../../lib/kitchenAlertData.js";
import { playAlertSound, SOUND_TYPES } from "../../lib/kitchenAlertSound.js";
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

  function apply(patch, message) {
    updateKitchenAlertSettings(restaurant.slug, patch);
    if (message) onNotify?.(message);
  }

  /* Preview always uses the values as they stand right now, so what the
     admin hears is exactly what the kitchen will hear. */
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
      <h3 className="mm-section-title">{t("kitchen.kitchenAlerts", "Kitchen Alerts")}</h3>
      <p className="ad-settings__hint" style={{ margin: "-6px 0 4px" }}>
        {t(
          "kitchen.kitchenAlertsHint",
          "Played on the Kitchen board when a new order arrives. Changes apply immediately."
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
          <span>{t("kitchen.alertSoundEnabled", "Play a sound for new orders")}</span>
        </label>
      </div>

      {/* Sound type */}
      <label className="field mm-field" style={{ marginTop: 12 }}>
        <span className="field__label">{t("kitchen.sound", "Sound")}</span>
        <select
          className="mm-select mm-select--full"
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
