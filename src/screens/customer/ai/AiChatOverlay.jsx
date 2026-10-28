import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowUp } from "lucide-react";
import { ZaatarMascot, usePrefersReducedMotion, aspectRatio } from "../../../vendor/zaatar-mascot/src/index.js";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { AI_PHASE, AI_ROLE, activityFor } from "../../../lib/aiChat.js";
import { getCharacter, characterName, withName } from "./characters.js";
import { useCharacterPlacement } from "./useCharacterPlacement.js";

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
 * AiChatOverlay — Phase 121.1.
 *
 * ── THE ARCHITECTURE THAT FIXES THE TRANSITION ───────────────────────────
 * Zaatar is NOT inside either layout. The welcome panel and the conversation
 * split each render an empty SLOT; he lives in one absolutely positioned
 * LAYER over a shared SCENE, and useCharacterPlacement measures the slot and
 * moves him there. Swapping layouts therefore cannot unmount him, cannot
 * resize him through a grid, and cannot interrupt his move — which is what
 * made 121.0's FLIP feel wrong. That hook carries the full diagnosis.
 *
 * ── HE IS ON THE LEFT, IN BOTH LANGUAGES ─────────────────────────────────
 * The owner's decision, and it supersedes 121.0: character left, conversation
 * right, identically in Arabic and English. Both layouts are forced to
 * direction:ltr so the physical order of the two columns cannot follow the
 * writing mode, and the greeting and the thread take their reading direction
 * back inside it. The chips and the composer sit outside the scene, so they
 * never inherited the forced direction at all. The artwork is never mirrored.
 */
export default function AiChatOverlay({ open, onClose, messages, phase, onSend, restaurantName }) {
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

  useCharacterPlacement({
    sceneRef,
    layerRef,
    slot,
    mode: welcome ? "welcome" : "active",
    /* No recommendations exist yet, so no room is held for them — §3's
       "do not leave a giant empty reserved area". The hook already takes the
       flag the later phase will set. */
    showCards: false,
    /* The hook decides whether this is a journey or a correction, from the
       key. It has to: the slot arrives as state from a ref callback, so the
       render that first sees the new phase still holds the OLD slot element
       and bails out. Anything this component measured "phase just changed"
       with would already be stale by the render that actually moves him --
       which is how the 650ms move was running at the 180ms correction speed.
       The hook compares the key it last acted on, so it cannot be fooled. */
    motion: { key: `${phase}|${open}`, ms: MOVE_MS },
    reducedMotion,
  });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

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

  const suggestions = useMemo(
    () => SUGGESTION_KEYS.map((key) => ({ key, text: t(key, "") })).filter((s) => s.text),
    [t]
  );

  if (!open) return null;

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
              {/* LEFT — the character column. The recommendation zone will
                  sit above him here, and renders nothing until it has a real
                  card to hold. */}
              <div className="aichat__slot aichat__slot--talking" ref={setSlot} />

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
            conversation column is ~190px wide, and a 190px field is not
            somewhere anyone writes a question — §11 asks for a usable
            composer at 320px, and that wins over keeping the input strictly
            inside the right-hand region. From 768px, in the conversation, they
            are inset to line up under the thread so they read as part of it. */}
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
    document.body
  );
}
