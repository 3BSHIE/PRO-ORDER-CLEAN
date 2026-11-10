import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowUp, SquarePen, ChevronRight } from "lucide-react";
import { ZaatarMascot, usePrefersReducedMotion, aspectRatio } from "../../../vendor/zaatar-mascot/src/index.js";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { AI_PHASE, AI_ROLE, activityFor } from "../../../lib/aiChat.js";
import { useBodyScrollLock } from "../../../lib/useBodyScrollLock.js";
import { resolveRecommendations } from "../../../lib/aiRecommendations.js";
import { getCharacter, characterName, withName } from "./characters.js";
import { useCharacterPlacement } from "./useCharacterPlacement.js";
import { stageGeometry } from "./stageGeometry.js";
import DepthCarousel from "./DepthCarousel.jsx";
import RecommendationCarousel from "./RecommendationCarousel.jsx";
import RecommendationViewer from "./RecommendationViewer.jsx";
import SuggestionRow from "./SuggestionRow.jsx";
import NewChatConfirm from "./NewChatConfirm.jsx";

/* Welcome → conversation. The approved 650ms journey: long enough to follow
   him across the panel without the guest waiting on it. */
const MOVE_MS = 650;
/* ZAATAR-LAB's RESIZE_MS: what the lab uses when the card's space changes.
   A dish arriving is a resize, not a journey — he stays where he is and
   only his box changes, and the gesture is meant to run WITH it. */
const RESIZE_MS = 450;
/* The card's CSS exit is 320ms. This is only a net under the transitionend
   below, for an engine that reports no event because a reduced-motion rule
   removed the transition. */
const EXIT_NET_MS = 420;
/* The gap .aichat__stack puts between the conversation and the stage. The
   geometry has to spend it out of the same scene, so it is declared once
   and handed over rather than written in two places. */
const SPLIT_GAP = 12;

/* Phase 121.5 §9 — the overlay's own opening. Deliberately short and
   deliberately NOT the mascot's 650ms journey: this is the surface arriving,
   that is the character crossing it, and conflating them is what made the
   panel feel like a different application opening. */
const OPEN_MS = 240;

/* The openers. Keys, not sentences: the copy lives in the translation files
   and a future character supplies its own. They are what the suggested
   questions show until the AI Brain starts returning follow-ups of its own
   (see lib/aiChat.js — normalizeFollowUps and the seam in `send`). */
const OPENER_KEYS = ["ai.q1", "ai.q2", "ai.q3"];

/* One identity, so clearing the held group cannot loop a state update. */
const NO_RECOMMENDATIONS = [];

/**
 * AiChatOverlay — Phase 121.1, recomposed in 121.2, re-housed in 121.3,
 * and rebuilt on the approved "B Refined" composition in Phase 121.5.
 *
 * ── THE ARCHITECTURE THAT FIXES THE TRANSITION ───────────────────────────
 * Zaatar is NOT inside either layout. Each layout renders an empty SLOT; he
 * lives in one absolutely positioned LAYER over a shared SCENE, and
 * useCharacterPlacement measures the slot and moves him there. Swapping
 * layouts therefore cannot unmount him, cannot resize him through a grid,
 * and cannot interrupt his move. That hook carries the full diagnosis.
 *
 * ── THE COMPOSITION (121.5 §2) ───────────────────────────────────────────
 * The owner selected the vertical stage after three interactive comparisons:
 *
 *   ┌──────────────────────────────┐
 *   │  CUSTOMER UTILITY HEADER     │  the menu's own .topbar, uncovered
 *   ├──────────────────────────────┤
 *   │  AI HEADER                   │  name, role, two icon actions
 *   ├──────────────────────────────┤
 *   │  CONVERSATION   (scrolls)    │  full width
 *   ├──────────────────────────────┤
 *   │  RECOMMENDATION (depth)      │  the real ItemCard, above him
 *   │  ZAATAR                      │  one stage, does not scroll
 *   ├──────────────────────────────┤
 *   │  SUGGESTED QUESTIONS         │  §4 — always present
 *   │  COMPOSER                    │
 *   └──────────────────────────────┘
 *
 * The product card spends the conversation's HEIGHT here, where the old
 * side-by-side spent its WIDTH. That is the whole trade, and ./stageGeometry
 * is where it is divided.
 *
 * ── WHY THE SIDE-BY-SIDE LAYOUT IS STILL IN THE FILE ─────────────────────
 * Not as an option: as the landscape fallback. A landscape phone leaves
 * about 144px of scene, and no vertical division of 144px keeps a
 * conversation, a product and a character. Short AND wide, the arrangement
 * changes rather than the numbers — stageGeometry says which, and both
 * branches carry a React `key` so the two subtrees can never be reconciled
 * into one another (doing so silently mutates the slot the placement pass is
 * about to measure, and the character lands on a box that no longer exists).
 *
 * ── 121.3 §1: THE PANEL DOES NOT OWN THE WHOLE SCREEN ────────────────────
 * There is exactly one utility header in the customer surface — the one the
 * menu already renders — and this panel is inset from the top by that
 * header's MEASURED height, so nothing is duplicated and Call Staff, My
 * Orders and the language switch stay reachable. aria-modal is deliberately
 * absent for the same reason, and focus is not trapped.
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
     must never be the source of a name or a price. */
  recommendationIds,
  menuItems,
  customLabels,
  /* §5 — the follow-ups belonging to the latest reply, already normalised by
     the conversation layer. Empty until the AI Brain supplies any, and the
     row falls back to the openers meanwhile. */
  followUps = NO_RECOMMENDATIONS,
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
  const returnFocusRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  const welcome = phase === AI_PHASE.WELCOME;

  /* ── §9 — the overlay's opening and closing ─────────────────────────────
     `present` keeps the panel in the DOM; `shown` drives the CSS. They are
     separate because the exit has to be able to run on a panel the parent
     has already called closed — unmounting on `open === false` is what made
     closing feel like the surface being deleted rather than leaving.

     Nothing about the conversation is torn down here: the messages live in
     useAiChat, above this component, so a panel finishing its fade is
     showing the real state, not a copy of it. */
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) { setPresent(true); return undefined; }
    setShown(false);
    if (reducedMotion) { setPresent(false); return undefined; }
    const id = setTimeout(() => setPresent(false), OPEN_MS + 20);
    return () => clearTimeout(id);
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!present || !open) return undefined;
    if (reducedMotion) { setShown(true); return undefined; }
    /* One frame with the entry state applied, so the transition has
       somewhere to come from. */
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [present, open, reducedMotion]);

  /* ── 121.3a — the mascot's own card cue ─────────────────────────────────
     The package times the card for us: going INTO Suggesting it reports the
     card visible 360ms in, as the cane reaches up, and coming out it clears
     the card first and then lowers him. Taking it means the card arrives
     WITH the gesture instead of waiting for him to notice it.

     `mascotFailed` is the safety valve: a product recommendation must not be
     hostage to a .webp. */
  const [cardCued, setCardCued] = useState(false);
  const [mascotFailed, setMascotFailed] = useState(false);

  const recommendations = useMemo(
    () => resolveRecommendations(recommendationIds, menuItems),
    [recommendationIds, menuItems]
  );
  const hasRecs = !welcome && recommendations.length > 0;

  /* ── Is the card region part of the stage right now? ────────────────────
     Not the same question as "is there a recommendation". In this
     composition the stage's budget decides HIS SIZE, so releasing the card's
     height the instant the recommendation goes away would snap him larger
     while the card was still fading — and would collapse the card's own box
     underneath it.

     The falling edge is taken during the render that sees it, not in an
     effect: an effect would commit one frame with the card off the stage,
     and the placement hook would start animating him toward the larger box
     before the card had begun to leave. */
  const [exiting, setExiting] = useState(false);
  const [sawRecs, setSawRecs] = useState(hasRecs);
  if (sawRecs !== hasRecs) {
    setSawRecs(hasRecs);
    setExiting(!hasRecs);
  }
  const onStage = hasRecs || exiting;

  /* Released by the card's own transitionend below. This is the net for an
     engine that fires none, cleared the moment the real signal arrives. */
  useEffect(() => {
    if (!exiting) return undefined;
    const id = setTimeout(() => setExiting(false), EXIT_NET_MS);
    return () => clearTimeout(id);
  }, [exiting]);

  /* ── Journey or resize, and which duration each gets ────────────────────
     A JOURNEY is welcome → conversation: he crosses the panel, and the lab
     pins the pose to Welcome for its whole length so a pose transition never
     runs against it. A RESIZE is the card arriving or leaving: he stays
     where he is and only his box changes, which the lab gives 450ms and no
     pose hold.

     The distinguishing fact is not which key changed — a key is a string and
     comes round again, which once put him back in the Welcome pose a second
     after the card had gone. It is simply this: a journey is a move that
     STARTS from the Welcome pose, and nothing else ever does. The latch is
     taken in the render that SEES the phase change, because the hook only
     reports its move one commit later and by then the director has already
     been handed the new activity. */
  const [sawWelcome, setSawWelcome] = useState(welcome);
  const [glide, setGlide] = useState(0);   // 0 none, 1 pending, 2 running
  if (sawWelcome !== welcome) {
    setSawWelcome(welcome);
    /* Reduced motion never glides, so it never holds — as the lab also
       skips its own hold there. */
    setGlide(welcome || reducedMotion ? 0 : 1);
  }
  const fromWelcome = glide > 0;

  const count = recommendations.length;
  const geometry = useCallback(
    (w, h) => stageGeometry(w, h, { recs: onStage, count, splitGap: SPLIT_GAP }),
    [onStage, count]
  );
  const motion = useMemo(
    () => ({ key: `${phase}|${open}|${onStage ? "card" : "plain"}`, ms: fromWelcome ? MOVE_MS : RESIZE_MS }),
    [phase, open, onStage, fromWelcome]
  );

  /* "inline" — the full card fits above him; "strip" — only the compact
     control does, and the real cards open into the viewer; "none" — this is
     the welcome. `stack` is the composition: the vertical stage, or the
     side-by-side fallback a landscape phone needs. */
  const { recsMode, stack, moving } = useCharacterPlacement({
    sceneRef,
    layerRef,
    slot,
    mode: welcome ? "welcome" : "active",
    motion,
    reducedMotion,
    geometry,
  });

  /* ── What "a recommendation is being displayed" means ───────────────────
     A real product card, on screen, beside him. Not the existence of IDs,
     and not the compact strip: an unopened strip is a way IN to a product,
     not a product, and it must not raise the cane. */
  const recommending = hasRecs && recsMode === "inline";

  const activity = fromWelcome
    ? "assistant_welcome"
    : activityFor({ phase, pending: false, recommending });

  /* pending → running → done. The rAF is the escape hatch for a move that
     never starts at all (the hook places him instantly on his very first
     placement); it is cancelled the moment the real move reports in. */
  useEffect(() => {
    if (glide === 0) return undefined;
    if (moving) { if (glide === 1) setGlide(2); return undefined; }
    if (glide === 2) { setGlide(0); return undefined; }
    const id = requestAnimationFrame(() => setGlide(0));
    return () => cancelAnimationFrame(id);
  }, [glide, moving]);

  /* Drop the cue the moment the reason for it goes away, so a later group
     cannot inherit the previous group's "already visible". */
  useEffect(() => { if (!recommending) setCardCued(false); }, [recommending]);

  /* ── The group that is on screen, or on its way off it ──────────────────
     Without this the array empties and the card has nothing left to fade: it
     would vanish instantly while the character was still holding the cane up
     for it. Hold the last real group, and let visibility do the work.

     The Welcome exclusion is DERIVED, not an effect that empties the state:
     clearing it on `welcome` left nothing to refill it, because the resolved
     list keeps its identity across a New Chat. */
  const [held, setHeld] = useState(recommendations);
  useEffect(() => {
    if (recommendations.length > 0) setHeld(recommendations);
  }, [recommendations]);
  const displayed = welcome ? NO_RECOMMENDATIONS : held;

  const cardVisible = recommending && (cardCued || mascotFailed);
  /* Mounted whenever there is anything to show OR to finish hiding. */
  const mountInlineCards = !welcome && recsMode === "inline" && displayed.length > 0;

  /* The honest end of the exit: the card's own opacity transition finishing
     while it is on its way out. Bubbles from .airecs to this wrapper. */
  const onRecsTransitionEnd = useCallback((e) => {
    if (e.propertyName === "opacity" && !cardVisible) setExiting(false);
  }, [cardVisible]);

  /* ── §1 — where the panel starts ────────────────────────────────────────
     The Customer Utility Header stays on screen, so the overlay begins at
     its lower edge. Read from the live element in a layout effect, which
     runs before paint, so the panel is never painted over the header first
     and corrected afterwards. */
  const syncTopInset = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const bar = document.querySelector(".topbar");
    const bottom = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
    root.style.setProperty("--aichat-top", `${bottom}px`);
  }, []);

  useLayoutEffect(() => {
    if (!present) return undefined;
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
  }, [present, syncTopInset]);

  /* Escape closes the topmost surface and only the topmost. The product
     sheet, the viewer and the confirmation each own the key while they are
     up — the latter two take it in the capture phase. */
  useEffect(() => {
    if (!open || suspended || confirmingNew || viewerOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, suspended, confirmingNew, viewerOpen]);

  /* Held for the whole time the panel is present, so the page behind cannot
     scroll out from under the closing animation. */
  useBodyScrollLock(present);

  /* ── §9 — focus in, and focus back out ──────────────────────────────────
     Focus the close control, not the field: opening the assistant should not
     raise a phone keyboard before the guest has decided to type. On the way
     out, focus returns to whatever opened the panel — the menu's own "Ask
     Zaatar" control — rather than being dropped on the document, which is
     what sends a screen reader back to the top of a 3,000px menu. */
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    /* A tap does not always leave the control focused — a programmatic open
       never does, and some engines blur a button on touchend — so the
       remembered element can be the body, which is the one place focus must
       not be dropped: a screen reader restarts at the top of a 3,000px menu
       from there. The entry control is the honest destination in that case,
       because it is what the guest used and what they will use again. */
    returnFocusRef.current =
      opener && opener !== document.body ? opener : null;
    /* One frame after the panel is in the document. Focusing in the same
       commit that mounts it is refused by some engines, which left the
       guest's focus on the body with a dialog open in front of them. */
    const id = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      const remembered = returnFocusRef.current;
      returnFocusRef.current = null;
      const target = remembered && document.contains(remembered)
        ? remembered
        /* The entry control, and specifically one that is actually on
           screen: the menu renders a compact copy in the topbar and a hero
           copy in the header, and whichever is hidden at this width cannot
           take focus. */
        : [...document.querySelectorAll(".zaatar-cta")]
            .find((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
      if (target && typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }
    };
  }, [open]);

  /* ── §4 — the field grows with the text ─────────────────────────────────
     scrollHeight measures CONTENT plus PADDING and excludes the BORDER,
     while this app's box-sizing is border-box, so assigning it directly once
     left the field overflowing itself by its own border and drawing a
     permanent scrollbar beside Send. offsetHeight - clientHeight IS that
     border, read back from the element rather than assumed. */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const borders = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + borders}px`;
  }, [draft, present]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length]);

  /* ── Re-pin when the card changes the thread's height ───────────────────
     Found by measurement in 121.4D: with sixteen messages the thread is
     853px of content in a box that drops from 350 to 149 when a dish is
     presented. The browser keeps scrollTop, so the newest message — the one
     the recommendation answers — ended up 200px below the fold the moment
     the card arrived. */
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [onStage, recsMode, stack]);

  /* A conversation that no longer exists cannot be reviewed in a viewer. */
  useEffect(() => { if (welcome) setViewerOpen(false); }, [welcome]);

  /* Where the panel is mounted. Not document.body: a restaurant's colours
     are inline custom properties on the .customer-theme wrapper, and a
     portal outside it inherits none of them. That wrapper is
     display:contents, so it generates no box and changes only inheritance.

     Keyed on `present` rather than computed once: the first render happens
     while React is still building the tree, before the wrapper is in the
     document at all, and a lookup then finds nothing and remembers it. */
  const mount = useMemo(
    () => (!present || typeof document === "undefined"
      ? null
      : document.querySelector(".customer-theme") || document.body),
    [present]
  );

  /* ── §5 — what the suggested questions show ─────────────────────────────
     Whatever the latest reply offered, and the openers when it offered
     nothing. Today that is always the openers, because nothing produces
     follow-ups yet; the component below does not know the difference, which
     is the point of the contract. */
  const openers = useMemo(
    () => OPENER_KEYS.map((key) => ({ id: key, text: t(key, "") })).filter((s) => s.text),
    [t]
  );
  const suggestions = followUps.length > 0 ? followUps : openers;

  const confirmNewChat = useCallback(() => {
    setConfirmingNew(false);
    setViewerOpen(false);
    setDraft("");
    onReset?.();
  }, [onReset]);

  if (!present || !mount) return null;

  const submit = (e) => {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    inputRef.current?.focus();
  };

  /* A tapped suggestion goes through the SAME path as typing it, so it gets
     the same answer and no separate reply machinery exists (§5). */
  const sendSuggestion = (text) => onSend(text);

  /* The strip is the same control in both compositions; only its width
     differs, and that is the stylesheet's business. */
  const strip = hasRecs && recsMode === "strip" ? (
    <button
      type="button"
      className="airecs-strip"
      onClick={() => setViewerOpen(true)}
      aria-haspopup="dialog"
    >
      <span className="airecs-strip__text">
        {t("ai.recsPeek", "Suggested dishes ({n})").replace("{n}", String(recommendations.length))}
      </span>
      <ChevronRight className="airecs-strip__go" size={15} strokeWidth={2.3} aria-hidden="true" />
    </button>
  ) : null;

  const thread = (
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
  );

  return createPortal(
    <div
      className={`aichat ${shown ? "aichat--in" : ""}`}
      ref={rootRef}
      role="dialog"
      aria-label={t(character.titleKey, "AI waiter")}
      style={{ "--zaatar-aspect": aspectRatio }}
    >
      <div className="aichat__scrim" onMouseDown={onClose} aria-hidden="true" />

      <div className={`aichat__panel ${welcome ? "aichat__panel--welcome" : "aichat__panel--talking"} ${!welcome && !stack ? "aichat__panel--beside" : ""}`}>
        {/* ── §6 — the compact AI header ────────────────────────────────
            Primary: the character's name, in the restaurant's own primary
            colour via --gold-ink, which is the theme's contrast-corrected
            form of that colour rather than a second hard-coded brand gold.
            Secondary: a small role label. Actions: two icon buttons of the
            same size and the same treatment.

            The restaurant's name is NOT here. It was the third identity in a
            40px row — the venue's own utility bar is directly above saying
            it already — and it now appears once, in the greeting, where it
            is a welcome rather than a label. */}
        <header className="aichat__bar">
          <span className="aichat__who">
            <span className="aichat__name">{name}</span>
            <span className="aichat__role">{t(character.titleKey, "AI waiter")}</span>
          </span>
          <div className="aichat__acts">
            {/* §7 — icon only. SquarePen rather than a reset arrow: this
                starts a new conversation, it does not undo anything, and a
                circular arrow reads as "undo" in every other surface of
                this app. Disabled until there is a conversation to replace,
                so a guest who has not spoken is never asked to confirm
                clearing nothing. */}
            <button
              type="button"
              className="aichat__icon"
              onClick={() => setConfirmingNew(true)}
              disabled={messages.length === 0}
              title={t("ai.newChat", "New chat")}
              aria-label={t("ai.newChat", "New chat")}
            >
              <SquarePen size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              ref={closeRef}
              type="button"
              className="aichat__icon"
              onClick={onClose}
              title={t("common.close", "Close")}
              aria-label={t("common.close", "Close")}
            >
              <X size={17} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Everything below the AI header, and the positioning context for
            the recommendation viewer. The viewer covers the scene, the chips
            and the composer — a guest reading a dish is not typing — but
            never the AI header above it or the venue's utility bar above
            that, so the way out is always in the same place. */}
        <div className="aichat__body">
          <div className="aichat__scene" ref={sceneRef}>
            {/* ── Why every branch carries a key ────────────────────────
                Without one React reconciles two sibling-position <div>s as
                the same element and REUSES the node: the old slot is mutated
                in place into the new layout, ref callbacks fire in the same
                commit, and the placement pass that runs before the new slot
                arrives measures a live element that is no longer a slot at
                all. It then animates him toward a box that does not exist
                and the next pass snaps him back. */}
            {welcome ? (
              <div className="aichat__welcome" key="welcome">
                {/* His slot and the greeting side by side, so the words read
                    as his rather than as a caption under a picture. */}
                <div className="aichat__slot aichat__slot--welcome" ref={setSlot} />
                <div className="aichat__hello">
                  <p className="aichat__hello-lead">
                    {/* §6 — the restaurant is named once, here, as a
                        welcome. Without one the greeting is unchanged; a
                        venue with no name is never invented. */}
                    {restaurantName
                      ? withName(
                          t("ai.greetingLeadAt", "Welcome to {venue}! I'm {name}.")
                            .replace("{venue}", restaurantName),
                          name
                        )
                      : withName(t(character.greetingKey, "Hi, I'm {name}."), name)}
                  </p>
                  <p className="aichat__hello-body">
                    {t(character.greetingBodyKey, "I'm your AI waiter. Ask me about any dish and I'll help you choose.")}
                  </p>
                </div>
              </div>
            ) : stack ? (
              /* ── The approved composition ──────────────────────────────
                 Conversation above, one stage below holding the card and
                 the character. The stage is a SIBLING of the scroller, not
                 a sticky child of it, so there is no scroll position at
                 which it can move or hide him. */
              <div className="aichat__stack" key="stack">
                <div className="aichat__thread">{thread}</div>

                <div className="aichat__stage">
                  <div className="aichat__recs" onTransitionEnd={onRecsTransitionEnd}>
                    {mountInlineCards && (
                      <DepthCarousel
                        items={displayed}
                        onOpen={onOpenItem}
                        customLabels={customLabels}
                        visible={cardVisible}
                      />
                    )}
                    {strip}
                  </div>
                  <div className="aichat__slot aichat__slot--talking" ref={setSlot} />
                </div>
              </div>
            ) : (
              /* ── The landscape fallback ────────────────────────────────
                 Character and card in a column on the left, conversation
                 beside them. The flat track rather than the depth stack:
                 depth needs horizontal slack to put the next dish in, and
                 a column this narrow has none. */
              <div className="aichat__split" key="split">
                <div className="aichat__side">
                  <div className="aichat__recs" onTransitionEnd={onRecsTransitionEnd}>
                    {mountInlineCards && (
                      <RecommendationCarousel
                        items={displayed}
                        onOpen={onOpenItem}
                        customLabels={customLabels}
                        visible={cardVisible}
                      />
                    )}
                    {strip}
                  </div>
                  <div className="aichat__slot aichat__slot--talking" ref={setSlot} />
                </div>
                <div className="aichat__thread">{thread}</div>
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

          {/* ── §4 — always here ───────────────────────────────────────
              The suggested questions are a core interaction, not spacing.
              The layout is solved around their measured height rather than
              around their absence: stageGeometry is handed the scene that
              is left after this row and the composer have taken theirs. */}
          <SuggestionRow items={suggestions} onSend={sendSuggestion} />

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

          {/* The real cards, across everything below the AI header, on the
              panels that are too short to stand one above him. */}
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
