import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { aspectRatio } from "../../../vendor/zaatar-mascot/src/index.js";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { getCharacter, characterName, withName } from "./characters.js";
import RecommendationCarousel from "./RecommendationCarousel.jsx";

/* The real card's body below its 4:3 image, worst case: a three-line name,
   a two-line description, the attribute row and the price row. The same
   number useCharacterPlacement reserves with, and for the same reason —
   solving with it means the card that arrives is never taller than the room
   made for it, whatever its name turns out to be. */
const CARD_BODY = 182 + 2;
const CARD_IMAGE = 0.75;
const DOTS_ROW = 13;
const CARD_MIN = 132;   /* what .menu-grid itself gives a card at 320px */
const CARD_MAX = 380;

const clamp = (lo, v, hi) => Math.max(lo, Math.min(v, hi));

/**
 * RecommendationViewer — Phase 121.3 §8.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * On a short panel the character and a full-size product card cannot share
 * one column; 121.2 responded by showing no recommendation at all, and the
 * owner rejected that — a recommendation is the AI waiter's whole point, not
 * a decoration that may be dropped when the screen is small.
 *
 * So the column keeps a compact, permanent strip, and this is what the strip
 * opens: the SAME shared ItemCard and the SAME carousel used beside the
 * character on a tall panel, given the whole scene instead of a 130px
 * column. At 320x568 that is a 250px-wide card — nearly twice what the menu
 * grid itself gives a card on that phone.
 *
 * ── NOTHING IS REBUILT ───────────────────────────────────────────────────
 * No AI-only card, no miniature, no alternative layout. This file contains
 * a heading, a close button and one piece of arithmetic: the width at which
 * the real card's natural height exactly fills the room available. The card
 * inside is the guest menu's own, and tapping it opens the guest menu's own
 * Product Details through the same handler.
 */
export default function RecommendationViewer({ items, onOpen, onClose, customLabels, suspended }) {
  const { t } = useLanguage();
  const name = characterName(getCharacter(), t);
  const bodyRef = useRef(null);
  const closeRef = useRef(null);
  const returnTo = useRef(null);
  const [cardW, setCardW] = useState(null);

  /* The card's width is solved from the room, not guessed: the body's height
     is fixed by the panel, and the only free variable is how wide the card
     may be before its 4:3 image makes it taller than that. */
  const measure = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const box = body.getBoundingClientRect();
    if (!box.height) return;
    const byHeight = (box.height - DOTS_ROW - CARD_BODY) / CARD_IMAGE + 2;
    const next = clamp(CARD_MIN, Math.min(byHeight, box.width), CARD_MAX);
    setCardW((prev) => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measure();
    const body = bodyRef.current;
    if (!body) return undefined;
    /* The measured box is the FULL-WIDTH body; the solved width goes on the
       stage inside it. Measuring the box the answer is applied to would
       ratchet itself narrower on every pass. */
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    returnTo.current = document.activeElement;
    closeRef.current?.focus();
    const el = returnTo.current;
    return () => {
      if (el && el.isConnected && typeof el.focus === "function") el.focus();
    };
  }, []);

  /* Escape closes the topmost surface and only the topmost — the chat behind
     keeps its own listener, so this one stops the event reaching it. And
     when the real product sheet is open ON TOP of this, the sheet is the
     topmost: this listener stands down entirely, or its capture phase would
     swallow the key before the sheet's own handler ever saw it. */
  useEffect(() => {
    if (suspended) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, suspended]);

  return (
    <div
      className="airecs-view"
      role="dialog"
      aria-modal="true"
      aria-label={withName(t("ai.recsLabel", "Dishes {name} suggests"), name)}
      /* The scene forces direction:ltr so the two columns cannot swap sides
         with the writing mode. This is a reading surface inside it, so the
         stylesheet gives it the document's direction back. */
      style={{ "--zaatar-aspect": aspectRatio }}
    >
      <div className="airecs-view__head">
        <span className="airecs-view__title">
          {withName(t("ai.recsLabel", "Dishes {name} suggests"), name)}
        </span>
        <button
          ref={closeRef}
          type="button"
          className="aichat__x airecs-view__x"
          onClick={onClose}
          aria-label={t("common.close", "Close")}
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>

      <div className="airecs-view__body" ref={bodyRef}>
        <div
          className="airecs-view__stage"
          style={cardW ? { "--airecs-view-w": `${cardW}px` } : undefined}
        >
          <RecommendationCarousel items={items} onOpen={onOpen} customLabels={customLabels} />
        </div>
      </div>
    </div>
  );
}
