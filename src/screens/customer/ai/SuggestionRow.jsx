import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * SuggestionRow — Phase 121.5 §4/§5. The suggested questions, always there.
 *
 * ── WHY THIS IS NOW ITS OWN COMPONENT ────────────────────────────────────
 * Phase 121.4D's prototype reclaimed 41.5px of vertical space by removing
 * this row whenever a dish was on screen. The owner's verdict on that was
 * unambiguous: the suggested questions are a core interaction, not spacing.
 * They stay, at every size, in every state, and the layout is solved around
 * them instead of around their absence (see ./stageGeometry.js).
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
export default function SuggestionRow({ items, onSend, disabled = false }) {
  const { t } = useLanguage();

  /* An empty list renders nothing at all rather than an empty bar: the
     layout measures this row, so a 36px strip of nothing would quietly cost
     the card its width. */
  if (!items || items.length === 0) return null;

  return (
    <div
      className="aichat__chips"
      role="group"
      aria-label={t("ai.suggestionsLabel", "Suggested questions")}
    >
      {items.map((s) => (
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
