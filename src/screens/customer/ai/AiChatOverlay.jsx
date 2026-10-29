import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowUp, RotateCcw, ChevronRight } from "lucide-react";
import { ZaatarMascot, usePrefersReducedMotion, aspectRatio } from "../../../vendor/zaatar-mascot/src/index.js";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { AI_PHASE, AI_ROLE, activityFor } from "../../../lib/aiChat.js";
import { useBodyScrollLock } from "../../../lib/useBodyScrollLock.js";
import { resolveRecommendations } from "../../../lib/aiRecommendations.js";
import { getCharacter, characterName, withName } from "./characters.js";
import { useCharacterPlacement } from "./useCharacterPlacement.js";
import RecommendationCarousel from "./RecommendationCarousel.jsx";
import RecommendationViewer from "./RecommendationViewer.jsx";
import NewChatConfirm from "./NewChatConfirm.jsx";

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
 * AiChatOverlay — Phase 121.1, recomposed in 121.2, re-housed in 121.3.
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
 * take their reading direction back inside it. The artwork is never mirrored.
 *
 * ── 121.3 §1: THE PANEL NO LONGER OWNS THE WHOLE SCREEN ──────────────────
 * The owner's verdict on 121.2 was that the assistant read as a separate
 * app. It did, and this is a large part of why: it covered the Customer
 * Utility Header, so the moment it opened, PRO-ORDER's own navigation —
 * Call Staff, My Orders, the language switch — vanished.
 *
 * It is NOT fixed by rendering a second header here. There is exactly one
 * utility header in the customer surface, the one the menu already renders,
 * and this panel simply stops covering it: the overlay is inset from the top
 * by that header's MEASURED height, so the header keeps its own markup, its
 * own handlers and its own position, and nothing is duplicated. Measured
 * rather than hard-coded, because the bar's height follows its content, the
 * language and the reader's font size.
 *
 * aria-modal is deliberately absent for the same reason. The header behind
 * is meant to be reachable, including by a screen reader, so claiming the
 * rest of the page is inert would be a lie — and focus is not trapped.
 *
 * ── 121.2/121.3: THE CARD REGION, AND WHY HIS SIZE CANNOT MOVE ───────────
 * The left column is two boxes stacked against its bottom edge: a reserved
 * region for recommendations, and his slot. Both heights come from
 * useCharacterPlacement, which derives them from the measured scene and
 * nothing else. A recommendation appearing, disappearing or being swiped
 * therefore cannot change either one — the region was already that size and
 * was already there, empty.
 *
 * On a tall panel that region holds one real product card. On a short one it
 * holds a compact strip that opens the same real cards across the whole
 * scene (§8), because 121.2's answer there — show nothing at all — left a
 * 320x568 phone with no recommendation, and the owner rejected it.
 *
 * The card in both is the guest menu's own ItemCard, and tapping it opens
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
  /* Clears the conversation. Confirmed by the guest first, and only ever the
     conversation: not the cart, not the orders, not the table session. */
  onReset,
  restaurantName,
  /* The menu's own item handler — opens the real ItemDetailsModal. */
  onOpenItem,
  /* Product IDs only. Resolved against the live menu below, because a model
     must never be the source of a name or a price. Phase 121.3 ships no
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
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const rootRef = useRef(null);
  const sceneRef = useRef(null);
  const layerRef = useRef(null);
  const [slot, setSlot] = useState(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const closeRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  const welcome = phase === AI_PHASE.WELCOME;

  /* ── 121.3a — the mascot's own card cue ─────────────────────────────────
     The package times the card for us: going INTO Suggesting it reports the
     card visible 360ms in, as the cane reaches up, and coming out it clears
     the card first and then lowers him. That is ZAATAR-LAB's approved
     choreography, and taking it means the card arrives WITH the gesture
     instead of sitting there waiting for him to notice it.

     `mascotFailed` is the safety valve: a product recommendation must not
     be hostage to a .webp. The package resolves exactly one of onReady or
     onError for every mount (it awaits decode() on every layer), so the
     three states are real — loading, ready, failed — and the gate is
     abandoned only in the last of them.

     It is deliberately "failed", not "not ready". A boolean that starts
     false and means "not ready yet" would show the card on the very first
     frame, then hide it the moment the artwork finished decoding, then
     show it again when the cane went up: one flicker on every open. */
  const [cardCued, setCardCued] = useState(false);
  const [mascotFailed, setMascotFailed] = useState(false);

  /* "inline" — the full card fits above him; "strip" — only the compact
     control does, and the real cards open into the viewer; "none" — this is
     the welcome, which has no card region at all. */
  const recsMode = useCharacterPlacement({
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
  const hasRecs = !welcome && recommendations.length > 0;

  /* ── 121.3a §1 — what "a recommendation is being displayed" means ───────
     A real product card, on screen, beside him. Not the existence of IDs,
     and not the compact strip: an unopened strip is a way IN to a product,
     not a product, and §6 is explicit that it must not raise the cane.

     The viewer the strip opens is a full-cover surface — he is behind it
     and cannot be seen pointing — so it does not count either, and closing
     it therefore leaves him exactly as it found him. */
  const recommending = hasRecs && recsMode === "inline";
  const activity = activityFor({ phase, pending: false, recommending });

  /* Drop the cue the moment the reason for it goes away, so a later group
     cannot inherit the previous group's "already visible". */
  useEffect(() => { if (!recommending) setCardCued(false); }, [recommending]);

  const showInlineCards = recommending && (cardCued || mascotFailed);

  /* ── §1 — where the panel starts ────────────────────────────────────────
     The Customer Utility Header stays on screen, so the overlay begins at
     its lower edge. Read from the live element in a layout effect, which
     runs before paint, so the panel is never painted over the header first
     and corrected afterwards.

     A sticky bar under this app's fixed-body scroll lock still reports a top
     of 0 and its full height — measured, not assumed — so the inset is the
     same whether the guest opened the assistant from the top of the menu or
     three thousand pixels down it. */
  const syncTopInset = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const bar = document.querySelector(".topbar");
    const bottom = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
    root.style.setProperty("--aichat-top", `${bottom}px`);
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    syncTopInset();
    const bar = document.querySelector(".topbar");
    const observer = bar ? new ResizeObserver(syncTopInset) : null;
    if (bar) observer?.observe(bar);
    window.addEventListener("resize", syncTopInset);
    window.addEventListener("orientationchange", syncTopInset);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncTopInset);
      window.removeEventListener("orientationchange", syncTopInset);
    };
  }, [open, syncTopInset]);

  /* Escape closes the topmost surface and only the topmost. The product
     sheet, the viewer and the confirmation each own the key while they are
     up — the latter two take it in the capture phase, which is what stops it
     ever reaching this listener. */
  useEffect(() => {
    if (!open || suspended || confirmingNew || viewerOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, suspended, confirmingNew, viewerOpen]);

  /* The same reference-counted lock the item sheet uses, so opening a
     product on top of the chat freezes the page once and releases it once,
     and the menu behind comes back on the pixel it was left on. */
  useBodyScrollLock(open);

  /* Focus the close control, not the field: opening the assistant should not
     raise a phone keyboard before the guest has decided to type. */
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);

  /* ── §4 — the field grows with the text, and the stray line is gone ─────
     The defect the owner photographed was a narrow vertical line between the
     text and the Send button. It was the textarea's own scrollbar, drawn
     permanently on an empty field, and the cause is one word in the line
     below: scrollHeight measures CONTENT plus PADDING and excludes the
     BORDER, while this app's box-sizing is border-box. Assigning scrollHeight
     as the height therefore handed the content two pixels less than it had
     just asked for, the field overflowed itself by exactly its own border on
     every keystroke, and overflow-y:auto did what it was told: seven pixels
     of scrollbar, forever, right next to Send.

     offsetHeight - clientHeight IS that border, read back from the element
     rather than assumed, so a themed or zoomed border stays correct. The
     field still scrolls internally once the text passes max-height — that is
     the one case where a scrollbar there is honest. */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const borders = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + borders}px`;
  }, [draft, open]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  /* A conversation that no longer exists cannot be reviewed in a viewer. */
  useEffect(() => { if (welcome) setViewerOpen(false); }, [welcome]);

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

  const confirmNewChat = useCallback(() => {
    setConfirmingNew(false);
    setViewerOpen(false);
    setDraft("");
    onReset?.();
  }, [onReset]);

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

  return createPortal(
    <div
      className="aichat"
      ref={rootRef}
      role="dialog"
      aria-label={t(character.titleKey, "AI waiter")}
      style={{ "--zaatar-aspect": aspectRatio }}
    >
      <div className="aichat__scrim" onMouseDown={onClose} aria-hidden="true" />

      <div className={`aichat__panel ${welcome ? "aichat__panel--welcome" : "aichat__panel--talking"}`}>
        {/* ── §2 — the slim secondary header ───────────────────────────────
            Subordinate by design: one row, the character's name at the size
            of a label rather than a title, with the venue's own utility bar
            immediately above it carrying the louder marks.

            §3.1 — with nothing said yet there is nothing to replace: the
            conversation IS the welcome, so New chat is disabled rather than
            putting a question in front of a guest who has not spoken. */}
        <header className="aichat__bar">
          <span className="aichat__who">
            <span className="aichat__name">{name}</span>
            <span className="aichat__role">
              {restaurantName
                ? t("ai.roleAt", "AI waiter · {venue}").replace("{venue}", restaurantName)
                : t(character.titleKey, "AI waiter")}
            </span>
          </span>
          <div className="aichat__acts">
            <button
              type="button"
              className="aichat__act"
              onClick={() => setConfirmingNew(true)}
              disabled={messages.length === 0}
              title={t("ai.newChat", "New chat")}
            >
              <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
              <span className="aichat__act-label">{t("ai.newChat", "New chat")}</span>
            </button>
            <button
              ref={closeRef}
              type="button"
              className="aichat__x"
              onClick={onClose}
              aria-label={t("common.close", "Close")}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        </header>

        {/* Everything below the AI header, and the positioning context for
            the recommendation viewer. The viewer covers the scene, the chips
            and the composer — a guest reading a dish is not typing — but
            never the AI header above it or the venue's utility bar above
            that, so the way out is always in the same place. */}
        <div className="aichat__body">
        {/* ── Scene: the slots live here, and so does the one layer ───── */}
        <div className="aichat__scene" ref={sceneRef}>
          {welcome ? (
            <div className="aichat__welcome">
              {/* His slot and the greeting side by side, so the words read as
                  his rather than as a caption under a picture. */}
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
              {/* LEFT — the recommendation region and the character, as one
                  column pinned to the bottom. Both heights are set from the
                  panel, so what is or is not inside the region cannot move
                  him. */}
              <div className="aichat__side">
                <div className="aichat__recs">
                  {showInlineCards && (
                    <RecommendationCarousel
                      items={recommendations}
                      onOpen={onOpenItem}
                      customLabels={customLabels}
                    />
                  )}
                  {hasRecs && recsMode === "strip" && (
                    <button
                      type="button"
                      className="airecs-strip"
                      onClick={() => setViewerOpen(true)}
                      aria-haspopup="dialog"
                    >
                      <span className="airecs-strip__text">
                        {t("ai.recsPeek", "Suggested dishes ({n})")
                          .replace("{n}", String(recommendations.length))}
                      </span>
                      <ChevronRight
                        className="airecs-strip__go"
                        size={15}
                        strokeWidth={2.3}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
                <div className="aichat__slot aichat__slot--talking" ref={setSlot} />
              </div>

              {/* RIGHT — the conversation. §5: the hairline that separates
                  the two sides is drawn by .aichat__split, in the gap between
                  them, so neither column has to carry a border that would eat
                  into the width the geometry already assigned it. */}
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
            <ZaatarMascot
              activity={activity}
              onReady={() => setMascotFailed(false)}
              onError={() => setMascotFailed(true)}
              onCardVisibleChange={setCardCued}
            />
          </div>
        </div>

        {/* ── Suggestions, then the composer ──────────────────────────────
            Both sit below the scene and span the panel. On a 320px phone the
            conversation column is ~150px wide, and a 150px field is not
            somewhere anyone writes a question — §7 asks for a usable
            composer, and that wins over keeping the input strictly inside
            the right-hand region. From 768px, in the conversation, they are
            inset to line up under the thread so they read as part of it. */}
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

        {/* §8 — the real cards, across everything below the AI header, on the
            panels that are too short to stand one beside him. */}
        {viewerOpen && hasRecs && (
          <RecommendationViewer
            items={recommendations}
            onOpen={onOpenItem}
            onClose={() => setViewerOpen(false)}
            customLabels={customLabels}
            suspended={suspended}
          />
        )}
        </div>
      </div>

      {confirmingNew && (
        <NewChatConfirm
          characterName={name}
          onConfirm={confirmNewChat}
          onCancel={() => setConfirmingNew(false)}
        />
      )}
    </div>,
    mount
  );
}
