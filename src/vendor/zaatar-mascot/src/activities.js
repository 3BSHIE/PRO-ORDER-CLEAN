// How Zaatar shows each assistant activity. The chat only publishes the
// activity; a different mascot would supply its own table here and reuse the
// same conversation logic.
export const ZAATAR_POSE_FOR_ACTIVITY = {
  assistant_welcome: 'welcome',
  assistant_processing: 'thinking',
  assistant_responding: 'responding',
  assistant_recommending: 'suggesting',
  assistant_idle: 'idle',
};

/** Every activity the mascot understands. */
export const ACTIVITIES = Object.keys(ZAATAR_POSE_FOR_ACTIVITY);

// One-shot reactions to customer events. Played over the current pose by
// useReaction, which then returns to whatever the activity maps to.
export const ZAATAR_REACTION_FOR_EVENT = {
  cart_item_added: 'acknowledging',
};

// While one of these is current the reaction is skipped: greeting a new
// guest and working on a reply take priority (the action itself still succeeds).
export const REACTION_BLOCKED_DURING = ['assistant_welcome', 'assistant_processing'];
