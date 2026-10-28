/**
 * characters — Phase 121.1. Who the assistant IS, kept out of the chat shell.
 *
 * Zaatar is the only character today and this phase adds no others. What it
 * does is stop his name, his copy and his picture being written into the
 * middle of the chat UI, so adding a second character later is a new entry
 * here rather than a hunt through components (§9).
 *
 * Deliberately not a plugin framework: a plain record, read in three places.
 *
 * `headerImage` is the one piece the owner is replacing. A dedicated static
 * illustration for the menu-header button is being drawn; until it arrives
 * this points at an existing approved pose from the mascot package, and
 * swapping it later means changing this URL and nothing else.
 *
 * The asset is referenced by PATH, not by importing the package's private
 * assetUrls module — the integration rule is that only the package's public
 * entry point is imported, and a .webp file is not an implementation module.
 */

export const CHARACTERS = {
  zaatar: {
    id: "zaatar",
    /* The Latin spelling, used as the fallback and as the identity in code.
       The displayed name goes through nameKey, because "Zaatar" written in
       Latin letters inside an Arabic sentence reads as a foreign word — the
       Arabic menu has always called him زعتر and must keep doing so. */
    name: "Zaatar",
    nameKey: "ai.characterName",
    /* Translation keys, so a future character supplies its own voice. */
    ctaKey: "ai.askCharacter",
    titleKey: "ai.title",
    greetingKey: "ai.greetingLead",
    greetingBodyKey: "ai.greetingBody",
    /* TEMPORARY source — see the note above. The idle pose's base layer is
       the closest existing artwork to a calm, static header portrait. */
    headerImage: new URL(
      "../../../vendor/zaatar-mascot/assets/idle-base.webp",
      import.meta.url
    ).href,
  },
};

/** The character currently serving this restaurant. One, for now. */
export const ACTIVE_CHARACTER_ID = "zaatar";

export function getCharacter(id = ACTIVE_CHARACTER_ID) {
  return CHARACTERS[id] || CHARACTERS[ACTIVE_CHARACTER_ID];
}

/** His name in the reader's language, with the Latin spelling as fallback. */
export function characterName(character, t) {
  return t(character.nameKey, character.name) || character.name;
}

/** Fills {name} in a character's copy. Substitution, never concatenation. */
export function withName(text, name) {
  return String(text).replace("{name}", name);
}
