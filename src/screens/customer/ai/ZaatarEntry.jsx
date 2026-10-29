import { useState } from "react";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { getCharacter, characterName, withName } from "./characters.js";

/**
 * ZaatarEntry — Phase 121.2. One pill: the character and the invitation.
 *
 * ── WHY IT CHANGED AGAIN ─────────────────────────────────────────────────
 * 121.1 stacked a portrait over a label inside a bordered rectangle, and the
 * owner read it as a sticker dropped next to the restaurant's name — a
 * picture in a box rather than a control. The fault was the shape: a tall
 * rectangle with the artwork floating in its own padding belongs to a
 * promotion, not to a button.
 *
 * So the composition is horizontal now, and the portrait is no longer inside
 * the surface. He stands ON the pill: his feet sit on its lower edge and his
 * head rises above it, which ties the two together instead of framing him.
 * The pill keeps the restaurant's own accent tokens, so it reads as part of
 * this venue's header rather than as something the app pasted in.
 *
 * ── A STATIC PICTURE, NOT A SECOND MASCOT ────────────────────────────────
 * A plain <img>, not the animated component: running a second ZaatarMascot —
 * its director, its reduced-motion listener, thirteen layers — as header
 * decoration is waste, and the owner wants this image to hold still. Only
 * the pill reacts to hover and press.
 *
 * The URL comes from the character registry, which is where the owner's
 * forthcoming dedicated header artwork will be dropped in. Nothing in this
 * file needs to change when it arrives: a taller or wider illustration is
 * handled by the two CSS custom properties the variants set.
 *
 * ── WHEN THE PICTURE WILL NOT LOAD ───────────────────────────────────────
 * The pill survives it, with its label and its accessible name intact. The
 * guest keeps the way in.
 */
export default function ZaatarEntry({ variant = "hero", onOpen }) {
  const { t } = useLanguage();
  const character = getCharacter();
  const [imageFailed, setImageFailed] = useState(false);

  const label = withName(t(character.ctaKey, "Ask {name}"), characterName(character, t));
  /* The collapsed bar is narrow and sits beside the search field; the short
     form is the approved fallback there. The accessible name stays full. */
  const shortLabel = t("ai.askShort", "Ask AI");

  return (
    <button
      type="button"
      className={`zaatar-cta zaatar-cta--${variant} ${imageFailed ? "zaatar-cta--noface" : ""}`}
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
