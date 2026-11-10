import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * SuggestionRow — Phase 121.5 §4/§5. The suggested questions, always there.
 *
 * ── WHY THIS IS ITS OWN COMPONENT ────────────────────────────────────────
 * Phase 121.4D's prototype reclaimed 41.5px of vertical space by removing
 * this row whenever a dish was on screen. The owner's verdict on that was
 * unambiguous: the suggested questions are a core interaction, not spacing.
 * They stay, at every size, in every state — including while the software
 * keyboard is up — and the layout is solved around them rather than around
 * their absence (see ./stageGeometry.js).
 *
 * It is a component rather than markup inside the overlay because §5 asks
 * for a reusable presentation and a clean place for contextual suggestions
 * to arrive. What it renders is whatever list it is handed; it knows nothing
 * about where that list came from, which is the point — when the AI Brain
 * starts returning follow-ups with its replies, this file does not change.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 * It does not generate suggestions, does not remember them, and does not
 * send anything itself. Tapping a chip calls the same `onSend` the composer
 * calls, so submission locking, session state, validation, error handling
 * and conversation history are the composer's — there is exactly one path a
 * message can take into the conversation (§5).
 */
export default function SuggestionRow({ items, onSend, onViewDishes, disabled = false }) {
  const { t } = useLanguage();

  const hasItems = Array.isArray(items) && items.length > 0;
  /* An empty row renders nothing at all rather than an empty bar: the
     layout measures this row, so a 36px strip of nothing would quietly cost
     the card its width. */
  if (!hasItems && !onViewDishes) return null;

  return (
    <div
      className="aichat__chips"
      role="group"
      aria-label={t("ai.suggestionsLabel", "Suggested questions")}
    >
      {/* ── Phase 121.6 §9 — the way back to the dishes while typing ─────
          Offered only when the keyboard is up AND there is a recommendation
          group to go back to. It rides in this row because the row already
          exists and is already measured, so the action costs the composer
          and the conversation nothing; it is sticky rather than scrolling,
          so it cannot be lost behind a long set of questions.

          It dismisses the keyboard and nothing else. It does not send, does
          not clear the draft, and does not change which dish is selected —
          the caller's handler does one thing. */}
      {onViewDishes && (
        <button
          type="button"
          className="aichat__chip aichat__chip--action"
          onClick={onViewDishes}
        >
          {t("ai.viewDishes", "View dishes")}
        </button>
      )}
      {hasItems && items.map((s) => (
        <button
          key={s.id}
          type="button"
          className="aichat__chip"
          onClick={() => onSend(s.text)}
          disabled={disabled}
        >
          {s.text}
        </button>
      ))}
    </div>
  );
}
