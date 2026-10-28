import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, SendHorizontal } from "lucide-react";
import { ZaatarMascot, usePrefersReducedMotion } from "../../../vendor/zaatar-mascot/src/index.js";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { AI_PHASE, AI_ROLE, activityFor } from "../../../lib/aiChat.js";

/**
 * AiChatOverlay — Phase 121.0. The AI Waiter's room.
 *
 * ── ONE MASCOT, TWO LAYOUTS ──────────────────────────────────────────────
 * The approved transition is that the SAME Zaatar who greets the guest shrinks
 * and takes his place beside the conversation — not that one disappears and
 * another fades in somewhere else. React decides that: <ZaatarMascot> is
 * rendered at exactly one place in this tree and never moves between parents,
 * so it is never unmounted and never remounted. What changes is a class on the
 * root, and CSS moves and resizes the wrapper around him.
 *
 * That is also why the grid has named areas rather than two different JSX
 * branches: a branch would mean two elements, which would mean two mascots,
 * a flash between them, and the duplicate the brief forbids.
 *
 * ── THE LAYOUT, FROM THE REAL CARD OUTWARDS ──────────────────────────────
 * The handoff notes say not to copy ZAATAR-LAB's 56/44 split: it was tuned
 * for a mock card. PRO-ORDER's own product card is the measure, and the
 * recommendation region above Zaatar is sized to hold one of them later. The
 * conversation takes everything left over, which is most of the width on a
 * phone and the majority of it on a desktop.
 *
 * The columns do NOT swap between Arabic and English. Direction changes how
 * text sits inside the bubbles and the composer; it does not move the
 * character to the other side, and Zaatar's artwork is never mirrored.
 *
 * ── NOTHING HERE PRETENDS TO BE AN ASSISTANT ─────────────────────────────
 * There is no model, no request and no fabricated reply. A sent message is
 * answered by a NOTICE — the product saying the waiter is not connected yet —
 * styled as a notice and never as a chat bubble, so it cannot be read as an
 * answer. No products are shown, because showing invented dishes would be the
 * worst version of this screen.
 */
export default function AiChatOverlay({ open, onClose, messages, phase, onSend, restaurantName }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState("");
  const mascotRef = useRef(null);
  const charRef = useRef(null);
  const lastBox = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const closeRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  const activity = activityFor({ phase, pending: false });

  /* ── The welcome → conversation move (§4) ────────────────────────────
     The grid changes the character column's size and place in one frame,
     which on its own is a snap. This measures where the column WAS, lets
     the new layout happen, then animates the difference away — the element
     is already in its final position the whole time, so nothing can end up
     stranded if the animation is interrupted or never runs.

     It is the same element throughout: React never unmounts it, so there is
     one mascot, no duplicate and no flash. The scale is uniform, because
     the package asks hosts not to distort the artwork; this is a transient
     transform on the container, not a standing one.

     Reduced motion skips it entirely and the layout simply changes. */
  useLayoutEffect(() => {
    const el = charRef.current;
    if (!el) return;
    const next = el.getBoundingClientRect();
    const prev = lastBox.current;
    lastBox.current = next;
    if (!prev || reducedMotion || !next.width || !prev.width) return;

    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    const scale = prev.height / next.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) return;

    el.animate(
      [
        { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: 380, easing: "cubic-bezier(.2,.7,.3,1)" }
    );
  }, [phase, open, reducedMotion]);

  /* A closed overlay has no geometry worth remembering; clearing it stops a
     stale box animating the next time it opens. */
  useEffect(() => { if (!open) lastBox.current = null; }, [open]);

  /* Escape closes, like every other overlay in the product. */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* The page behind must not scroll while a full-screen sheet is over it. */
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /* Focus lands on the close control rather than the field: opening the
     assistant should not raise a phone keyboard before the guest has decided
     to type. */
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  /* Newest message in view after each exchange. */
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    inputRef.current?.focus();
  };

  const talking = phase === AI_PHASE.CONVERSATION;

  return createPortal(
    <div className="aichat" role="dialog" aria-modal="true" aria-label={t("ai.title", "AI waiter")}>
      {/* Desktop only: a scrim to sit the panel on. On a phone the panel IS
          the screen, so there is nothing behind it to dim. */}
      <div className="aichat__scrim" onMouseDown={onClose} aria-hidden="true" />

      <div className={`aichat__panel ${talking ? "aichat__panel--talking" : "aichat__panel--welcome"}`}>
        <header className="aichat__bar">
          <span className="aichat__title">
            {t("ai.title", "AI waiter")}
            {restaurantName ? <span className="aichat__venue"> · {restaurantName}</span> : null}
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

        {/* ── The stage. Two grid areas, one in each layout ──────────────
            welcome:      character centred, large, with the greeting under it
            conversation: conversation on one side, character on the other */}
        <div className="aichat__stage">
          <div className="aichat__character" ref={charRef}>
            {/* §7 — the recommendation region, reserved above him so his
                future Suggesting motion points at it. Phase 121.0 shows no
                products: it is absent rather than an empty frame, because a
                placeholder card would be a promise the menu has not made. */}
            <div className="aichat__recs" aria-hidden="true" />
            <div className="aichat__mascot">
              <ZaatarMascot ref={mascotRef} activity={activity} />
            </div>
          </div>

          <div className="aichat__talk">
            {!talking && (
              <p className="aichat__greeting">
                {t("ai.welcome", "Hi! I'm Zaatar. Ask me anything about the menu.")}
              </p>
            )}

            {talking && (
              <div className="aichat__log" ref={logRef} role="log" aria-live="polite">
                {messages.map((m) =>
                  m.role === AI_ROLE.NOTICE ? (
                    /* Deliberately not a bubble. This is the product
                       speaking, and it must never look like a reply. */
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
            )}

          </div>

          {/* The composer belongs to the conversation, but on a phone the
              conversation column is ~200px wide and a 200px text field is
              not somewhere anyone wants to write a question. So it spans the
              stage instead, under both columns, and only moves back under
              the conversation on a desktop where that column is wide enough
              to hold it (see the 768px rule in the stylesheet).

              The log and the character are still side by side above it, so
              this is not the stacked page the brief rules out. */}
          <form className="aichat__composer" onSubmit={submit}>
              <input
                ref={inputRef}
                className="aichat__input"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
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
                <SendHorizontal size={16} strokeWidth={2.2} />
              </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
