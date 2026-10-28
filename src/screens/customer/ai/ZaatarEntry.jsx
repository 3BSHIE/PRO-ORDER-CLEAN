import { useState } from "react";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { getCharacter, characterName, withName } from "./characters.js";

/**
 * ZaatarEntry — Phase 121.1. One control: the character AND the words.
 *
 * ── WHY IT CHANGED ───────────────────────────────────────────────────────
 * 121.0 put the animated mascot in the header on his own. A small idle
 * character does not say "tap me to ask something" — the owner's point — so
 * the button now carries his picture and a CTA inside one surface, with a
 * real border, hover and pressed state. It reads as a control without
 * needing a hover to discover it.
 *
 * ── A STATIC PICTURE, NOT A SECOND MASCOT ────────────────────────────────
 * The header shows a plain <img>, not the animated component. Two reasons:
 * the owner wants the header artwork still, and running a second
 * ZaatarMascot — with its director, its reduced-motion listener and its
 * thirteen layers — purely as decoration is waste the package's own notes
 * warn about. The image URL comes from the character registry, which is the
 * single place the owner's forthcoming dedicated header illustration will be
 * dropped in without this button changing at all.
 *
 * ── WHEN THE PICTURE WILL NOT LOAD ───────────────────────────────────────
 * The CTA survives it. A missing image hides the portrait and leaves a
 * perfectly good labelled button, rather than removing the guest's only way
 * into the assistant — which is what 121.0 did.
 */
export default function ZaatarEntry({ variant = "hero", onOpen }) {
  const { t } = useLanguage();
  const character = getCharacter();
  const [imageFailed, setImageFailed] = useState(false);

  const label = withName(t(character.ctaKey, "Ask {name}"), characterName(character, t));
  /* The compact bar is narrow; "Ask AI" is the approved shorter variant and
     the accessible name stays the full one either way. */
  const shortLabel = t("ai.askShort", "Ask AI");

  return (
    <button
      type="button"
      className={`zaatar-cta zaatar-cta--${variant}`}
      onClick={onOpen}
      aria-label={label}
      title={label}
    >
      {!imageFailed && (
        <img
          className="zaatar-cta__face"
          src={character.headerImage}
          alt=""
          aria-hidden="true"
          draggable="false"
          onError={() => setImageFailed(true)}
        />
      )}
      <span className="zaatar-cta__label" aria-hidden="true">
        {variant === "compact" ? shortLabel : label}
      </span>
    </button>
  );
}
