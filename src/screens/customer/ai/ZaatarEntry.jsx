import { useState } from "react";
import { ZaatarMascot } from "../../../vendor/zaatar-mascot/src/index.js";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * ZaatarEntry — Phase 121.0. The AI Waiter's way in, in a seat that already
 * existed.
 *
 * Phases 120.0 and 120.1 reserved two regions for exactly this and left them
 * empty: a square-ish 72–96px area opposite the restaurant identity in the
 * expanded header, and a 42–52px one opposite it in the compact bar. This
 * component fills those seats and nothing else — there is no floating button
 * anywhere, and no second entry point outside the two approved regions.
 *
 * ── WHY A BUTTON AROUND THE MASCOT ───────────────────────────────────────
 * Zaatar is artwork, not a control: the package renders images and animates
 * them, and knows nothing about tapping. The control is this button, which
 * carries the accessible name, the focus ring and the keyboard behaviour that
 * come free with a real <button>. The mascot inside is aria-hidden, so a
 * screen reader hears one thing, not a decorative image and then a label.
 *
 * ── HE NEVER STARTS ANYTHING ─────────────────────────────────────────────
 * Opening the chat is the customer's decision. Nothing here opens it, sends a
 * message, or interrupts a guest reading the menu. The idle pose is the
 * package's own restrained one, and reduced motion is honoured by the package
 * (it reads prefers-reduced-motion itself).
 *
 * ── WHEN THE ARTWORK WILL NOT LOAD ───────────────────────────────────────
 * The integration notes are explicit: hide him and carry on. A failed image
 * must never leave a dead control or a broken-image box in a restaurant's
 * header, so the whole button goes and the header renders as it did before
 * this phase.
 */
export default function ZaatarEntry({ variant = "hero", activity = "assistant_idle", onOpen }) {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <button
      type="button"
      className={`zaatar-entry zaatar-entry--${variant}`}
      onClick={onOpen}
      aria-label={t("ai.openAssistant", "Ask Zaatar, the AI waiter")}
    >
      <span className="zaatar-entry__figure" aria-hidden="true">
        <ZaatarMascot activity={activity} onError={() => setFailed(true)} />
      </span>
    </button>
  );
}
