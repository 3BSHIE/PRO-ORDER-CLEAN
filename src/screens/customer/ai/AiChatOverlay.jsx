import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowUp } from "lucide-react";
import { ZaatarMascot, usePrefersReducedMotion, aspectRatio } from "../../../vendor/zaatar-mascot/src/index.js";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { AI_PHASE, AI_ROLE, activityFor } from "../../../lib/aiChat.js";
import { useBodyScrollLock } from "../../../lib/useBodyScrollLock.js";
import { resolveRecommendations } from "../../../lib/aiRecommendations.js";
import { getCharacter, characterName, withName } from "./characters.js";
import { useCharacterPlacement } from "./useCharacterPlacement.js";
import RecommendationCarousel from "./RecommendationCarousel.jsx";

/* Welcome → conversation. The approved reference uses 650ms; measured here,
   that is long enough to follow him across the panel without the guest
   waiting on it.

   It is the ONLY duration, because the hook only ever animates a journey:
   a re-place that is not a phase change -- a resize, a rotation -- is applied
   straight to the layer with no animation at all. */
const MOVE_MS = 650;

/* The three openers. Keys, not sentences: the copy lives in the translation
   files and a future character supplies its own. */
const SUGGESTION_KEYS = ["ai.q1", "ai.q2", "ai.q3"];

/**
 * AiChatOverlay — Phase 121.1, recomposed in 121.2.
 *
 * ── THE ARCHITECTURE THAT FIXES THE TRANSITION ───────────────────────────
 * Zaatar is NOT inside either layout. The welcome panel and the conversation
 * split each render an empty SLOT; he lives in one absolutely positioned
 * LAYER over a shared SCENE, and useCharacterPlacement measures the slot and
 * moves him there. Swapping layouts therefore cannot unmount him, cannot
 * resize him through a grid, and cannot interrupt his move. That hook carries
 * the full diagnosis of what 121.0 did instead.
 *
 * ── HE IS ON THE LEFT, IN BOTH LANGUAGES ─────────────────────────────────
 * Character left, conversation right, identically in Arabic and English.
 * Both layouts are forced to direction:ltr so the physical order of the two
 * columns cannot follow the writing mode, and the greeting and the thread
 * take their reading direction back inside it. The chips and the composer
 * sit outside the scene, so they never inherited the forced direction at
 * all. The artwork is never mirrored.
 *
 * ── 121.2: THE CARD REGION, AND WHY HIS SIZE CANNOT MOVE ─────────────────
 * The left column is two boxes stacked against its bottom edge: a reserved
 * region for one real product card, and his slot. Both heights come from
 * useCharacterPlacement, which derives them from the measured scene and
 * nothing else. A recommendation appearing, disappearing or being swiped
 * therefore cannot change either one — the region was already that size and
 * was already there, empty.
 *
 * The card inside it is the guest menu's own ItemCard, and tapping it opens
 * the guest menu's own ItemDetailsModal through the same handler the menu
 * uses. Nothing about a product is re-implemented here, and nothing is added
 * to a cart without the customer pressing Add in that sheet.
 */
export default function AiChatOverlay({
  open,
  onClose,
  messages,
  phase,
  onSend,
  restaurantName,
  /* The menu's own item handler — opens the real ItemDetailsModal. */
  onOpenItem,
  /* Product IDs only. Resolved against the live menu below, because a model
     must never be the source of a name or a price. Phase 121.2 ships no
     model; in development these come from the real menu (see devFlags). */
  recommendationIds,
  menuItems,
  customLabels,
  /* True while the real product sheet is open on top of this panel. The
     sheet listens for Escape on the window too, so without this one press
     would close the sheet AND the chat underneath it. */
  suspended = false,
}) {
  const { t } = useLanguage();
  const character = getCharacter();
  const name = characterName(character, t);
  const [draft, setDraft] = useState("");

  const sceneRef = useRef(null);
  const layerRef = useRef(null);
  const [slot, setSlot] = useState(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const closeRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  const activity = activityFor({ phase, pending: false });
  const welcome = phase === AI_PHASE.WELCOME;

  /* True when the panel is tall enough that a reserved card region still
     leaves him a real presence. Where it is not, nothing is reserved and
     nothing is shown — see useCharacterPlacement's MASCOT_MIN. */
  const cardsFit = useCharacterPlacement({
    sceneRef,
    layerRef,
    slot,
    mode: welcome ? "welcome" : "active",
    /* The hook decides whether this is a journey or a correction, from the
       key. It has to: the slot arrives as state from a ref callback, so the
       render that first sees the new phase still holds the OLD slot element
       and bails out. Anything this component measured "phase just changed"
       with would already be stale by the render that actually moves him --
       which is how the 650ms move once ran at a 180ms correction speed. */
    motion: { key: `${phase}|${open}`, ms: MOVE_MS },
    reducedMotion,
  });

  const recommendations = useMemo(
    () => resolveRecommendations(recommendationIds, menuItems),
    [recommendationIds, menuItems]
  );
  const showCards = !welcome && cardsFit && recommendations.length > 0;

  useEffect(() => {
    if (!open || suspended) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, suspended]);

  /* The same reference-counted lock the item sheet uses, so opening a
     product on top of the chat freezes the page once and releases it once,
     and the menu behind comes back on the pixel it was left on. */
  useBodyScrollLock(open);

  /* Focus the close control, not the field: opening the assistant should not
     raise a phone keyboard before the guest has decided to type. */
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);

  /* The field grows with the text to the CSS ceiling, then scrolls. Measured
     from scrollHeight because a textarea has no intrinsic content height. */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, open]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  /* Where the panel is mounted. Not document.body: a restaurant's colours
     are inline custom properties on the .customer-theme wrapper, and a
     portal outside it inherits none of them -- the assistant was painting
     itself in PRO-ORDER's default gold while the header beside it wore the
     venue's own accent. That wrapper is display:contents, so it generates no
     box: it cannot create a stacking context, and it cannot become the
     containing block for anything fixed. Mounting inside it changes only
     what is inherited.

     document.body remains the fallback, so a host that renders this outside
     a themed scope still gets a working panel.

     Keyed on `open` rather than computed once: the first render of this
     component happens while React is still building the tree, before the
     wrapper is in the document at all, and a lookup then finds nothing and
     remembers it forever. By the time the panel is asked to open, it is
     there. */
  const mount = useMemo(
    () => (!open || typeof document === "undefined"
      ? null
      : document.querySelector(".customer-theme") || document.body),
    [open]
  );

  const suggestions = useMemo(
    () => SUGGESTION_KEYS.map((key) => ({ key, text: t(key, "") })).filter((s) => s.text),
    [t]
  );

  if (!open || !mount) return null;

  const submit = (e) => {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    inputRef.current?.focus();
  };

  /* A tapped suggestion goes through the SAME path as typing it, so it gets
     the same honest answer and no separate reply machinery exists (§7). */
  const sendSuggestion = (text) => onSend(text);

  /* His canvas proportions, handed to CSS so the welcome slot can be exactly
     his shape without keeping a second copy of the number in the stylesheet. */

  return createPortal(
    <div
      className="aichat"
      role="dialog"
      aria-modal="true"
      aria-label={t(character.titleKey, "AI waiter")}
      style={{ "--zaatar-aspect": aspectRatio }}
    >
      <div className="aichat__scrim" onMouseDown={onClose} aria-hidden="true" />

      <div className={`aichat__panel ${welcome ? "aichat__panel--welcome" : "aichat__panel--talking"}`}>
        <header className="aichat__bar">
          <span className="aichat__who">
            <span className="aichat__name">{name}</span>
            <span className="aichat__role">
              {restaurantName
                ? t("ai.roleAt", "AI waiter · {venue}").replace("{venue}", restaurantName)
                : t(character.titleKey, "AI waiter")}
            </span>
          </span>
          <button
            ref={closeRef}
            type="button"
            className="aichat__x"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </header>

        {/* ── Scene: the slots live here, and so does the one layer ───── */}
        <div className="aichat__scene" ref={sceneRef}>
          {welcome ? (
            <div className="aichat__welcome">
              {/* His slot and the greeting side by side, so the words read as
                  his rather than as a caption under a picture (§6). */}
              <div className="aichat__slot aichat__slot--welcome" ref={setSlot} />
              <div className="aichat__hello">
                <p className="aichat__hello-lead">
                  {withName(t(character.greetingKey, "Hi, I'm {name}."), name)}
                </p>
                <p className="aichat__hello-body">
                  {t(character.greetingBodyKey, "I'm your AI waiter. Ask me about any dish and I'll help you choose.")}
                </p>
              </div>
            </div>
          ) : (
            <div className="aichat__split">
              {/* LEFT — the card region and the character, as one column
                  pinned to the bottom. Both heights are set from the panel,
                  so what is or is not inside the region cannot move him. */}
              <div className="aichat__side">
                <div className="aichat__recs">
                  {showCards && (
                    <RecommendationCarousel
                      items={recommendations}
                      onOpen={onOpenItem}
                      customLabels={customLabels}
                    />
                  )}
                </div>
                <div className="aichat__slot aichat__slot--talking" ref={setSlot} />
              </div>

              {/* RIGHT — the conversation. */}
              <div className="aichat__thread">
                <div className="aichat__log" ref={logRef} role="log" aria-live="polite">
                  {messages.map((m) =>
                    m.role === AI_ROLE.NOTICE ? (
                      <p className="aichat__notice" key={m.id}>
                        {t(m.key, "The AI waiter isn't connected yet — this is an early preview.")}
                      </p>
                    ) : (
                      <p className={`aichat__msg aichat__msg--${m.role}`} key={m.id}>
                        {m.text}
                      </p>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="aichat__layer" ref={layerRef} aria-hidden="true">
            <ZaatarMascot activity={activity} />
          </div>
        </div>

        {/* ── Suggestions, then the composer ──────────────────────────────
            Both sit below the scene and span the panel. On a 320px phone the
            conversation column is ~150px wide, and a 150px field is not
            somewhere anyone writes a question — §11 asks for a usable
            composer at 320px, and that wins over keeping the input strictly
            inside the right-hand region. From 768px, in the conversation,
            they are inset to line up under the thread so they read as part
            of it. */}
        {suggestions.length > 0 && (
          <div className="aichat__chips" role="group" aria-label={t("ai.suggestionsLabel", "Suggested questions")}>
            {suggestions.map((s) => (
              <button key={s.key} type="button" className="aichat__chip" onClick={() => sendSuggestion(s.text)}>
                {s.text}
              </button>
            ))}
          </div>
        )}

        <form className="aichat__composer" onSubmit={submit}>
          <textarea
            ref={inputRef}
            className="aichat__input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              /* Enter sends, Shift+Enter makes a new line. */
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={t("ai.placeholder", "Ask about the menu…")}
            aria-label={t("ai.placeholder", "Ask about the menu…")}
            autoComplete="off"
            enterKeyHint="send"
          />
          <button
            type="submit"
            className="aichat__send"
            disabled={!draft.trim()}
            aria-label={t("ai.send", "Send")}
          >
            <ArrowUp size={17} strokeWidth={2.6} />
          </button>
        </form>
      </div>
    </div>,
    mount
  );
}
