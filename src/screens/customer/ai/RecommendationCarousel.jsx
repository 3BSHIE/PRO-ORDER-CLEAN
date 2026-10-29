import { useCallback, useEffect, useRef, useState } from "react";
import { ItemCard } from "../components/ProductCard.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { getCharacter, characterName, withName } from "./characters.js";

/**
 * RecommendationCarousel — Phase 121.2. One real product at a time.
 *
 * ── WHAT IS AND IS NOT NEW HERE ──────────────────────────────────────────
 * The card is the guest menu's own ItemCard, imported, not reimplemented:
 * same image, badges, attributes, description, price, out-of-stock
 * treatment and "+" action, and the same `onOpen` that the menu hands to the
 * real ItemDetailsModal. Everything this file adds is the sliding: a
 * scroll-snap track, dots, and keyboard arrows.
 *
 * ── WHY scrollIntoView AND NOT scrollLeft ────────────────────────────────
 * Arabic. A right-to-left scroller's scrollLeft has had three different
 * conventions across engines, and the one thing all of them agree on is
 * scrollIntoView. Reading the active slide back works the same way: compare
 * each slide's centre against the track's, which has no handedness at all.
 *
 * ── HEIGHT ───────────────────────────────────────────────────────────────
 * The track fills the region the chat reserves for it, and every card
 * stretches to that height, exactly as a card stretches to its row in
 * .menu-grid. A long product name therefore cannot make one slide taller
 * than its neighbours, and — the rule this phase is built around — cannot
 * change anything below it, because the region's height is decided by the
 * panel, never by the card inside it.
 */
export default function RecommendationCarousel({ items, onOpen, customLabels }) {
  const { t } = useLanguage();
  const name = characterName(getCharacter(), t);
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);

  const count = items.length;

  /* Which slide is currently under the track's centre line. Measured rather
     than remembered, so a flick that lands between two cards still reports
     the one the guest is looking at. */
  const syncIndex = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
    let best = 0;
    let bestGap = Infinity;
    [...track.children].forEach((slide, i) => {
      const box = slide.getBoundingClientRect();
      const gap = Math.abs(box.left + box.width / 2 - mid);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    setIndex(best);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncIndex);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
    };
  }, [syncIndex]);

  /* A new group starts at its first card. */
  useEffect(() => {
    setIndex(0);
    const track = trackRef.current;
    if (track?.firstElementChild) {
      track.firstElementChild.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [items]);

  const goTo = useCallback((i) => {
    const track = trackRef.current;
    const slide = track?.children?.[i];
    if (!slide) return;
    slide.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  if (count === 0) return null;

  /* Arrows move by one, in reading order — so in Arabic, Left goes forward.
     Keys only: §6 asks for no visible previous/next buttons. */
  const onKeyDown = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const next = Math.min(count - 1, Math.max(0, index + (forward ? 1 : -1)));
    if (next === index) return;
    e.preventDefault();
    goTo(next);
  };

  return (
    <div className="airecs">
      <div
        className="airecs__track"
        ref={trackRef}
        onKeyDown={onKeyDown}
        role="group"
        aria-roledescription={t("ai.recsRole", "Suggested dishes")}
        aria-label={withName(t("ai.recsLabel", "Dishes {name} suggests"), name)}
      >
        {items.map((item) => (
          <div className="airecs__slide" key={item.id}>
            <ItemCard item={item} onOpen={onOpen} customLabels={customLabels} />
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="airecs__dots">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`airecs__dot ${i === index ? "airecs__dot--on" : ""}`}
              aria-current={i === index ? "true" : undefined}
              aria-label={t("ai.recsGoTo", "Show dish {n}").replace("{n}", String(i + 1))}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
