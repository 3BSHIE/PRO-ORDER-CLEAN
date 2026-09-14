/**
 * alertPurposes — every configurable alert sound in the product, in one list,
 * and the rule that they must all differ.
 *
 * Phase 96.3.
 *
 * ── WHY THIS MODULE EXISTS ────────────────────────────────────────────────
 * The uniqueness rule started life inside kitchenAlertData, because when it
 * was written the only two purposes lived in the kitchen record. Staff Calls
 * are stored separately — deliberately, so Kitchen at Chime/80% and Staff
 * Calls at Bell/70% never overwrite each other — which meant a rule scoped to
 * one store could not see the third purpose at all, and Staff Call could
 * silently duplicate a kitchen sound.
 *
 * The rule is a property of the SOUNDS, not of any one storage key, so it
 * lives here: one catalogue, one detector, and both Settings cards ask the
 * same question. Adding a fourth purpose later means one entry in
 * ALERT_PURPOSES and nothing else.
 *
 * ── WHY IT MATTERS OPERATIONALLY ──────────────────────────────────────────
 * These sounds are the only way a room distinguishes three different demands
 * without looking at a screen: a ticket arrived, stop cooking that, a guest
 * is waiting. Two of them sharing a voice does not degrade gracefully — it
 * makes both meaningless.
 *
 * ── DISABLED PURPOSES STILL RESERVE THEIR SOUND (§12) ─────────────────────
 * Validation ignores each purpose's on/off switch. A purpose that is muted
 * today still owns the sound it is configured with, so re-enabling it later
 * can never surface a duplicate that was invisible while it was off. That is
 * the simplest rule that stays true over time, and the product has no
 * existing rule saying otherwise.
 */

/** Stable ids. Used for the last-touched field and for DOM ids; never shown. */
export const ALERT_PURPOSE_IDS = {
  NEW_ORDER: "newOrder",
  CANCELED_ORDER: "canceledOrder",
  STAFF_CALL: "staffCall",
};

/**
 * The catalogue. `store` and `field` say where each purpose's sound is read
 * from, so the Settings screen can assemble the current values without
 * hard-coding the mapping at the call site.
 */
export const ALERT_PURPOSES = [
  {
    id: ALERT_PURPOSE_IDS.NEW_ORDER,
    store: "kitchen",
    field: "soundType",
    labelKey: "kitchen.newOrderSound",
    fallback: "New Order Sound",
  },
  {
    id: ALERT_PURPOSE_IDS.CANCELED_ORDER,
    store: "kitchen",
    field: "canceledSoundType",
    labelKey: "kitchen.canceledOrderSound",
    fallback: "Canceled Order Sound",
  },
  {
    id: ALERT_PURPOSE_IDS.STAFF_CALL,
    store: "staffCall",
    field: "soundType",
    labelKey: "staff.staffCallAlerts",
    fallback: "Staff Call Alerts",
  },
];

/** The DOM id of a purpose's selector — shared by the card that renders it
    and the Save handler that focuses it when a conflict blocks the write. */
export function alertSoundFieldId(purposeId) {
  return `alert-sound-${purposeId}`;
}

/** The user-facing name of a purpose. Never an internal key (§13). */
export function alertPurposeLabel(purposeId, t) {
  const purpose = ALERT_PURPOSES.find((p) => p.id === purposeId);
  return purpose ? t(purpose.labelKey, purpose.fallback) : "";
}

/**
 * Read the current sound of every purpose out of the drafts that hold them.
 *
 * Takes the DRAFTS, not storage: the whole point is that an unsaved change in
 * one card is visible to the other's validation immediately (§3).
 *
 * @param {{kitchen: object, staffCall: object}} drafts
 * @returns {Array<{id, labelKey, fallback, sound}>}
 */
export function collectAlertSounds(drafts) {
  return ALERT_PURPOSES.map((purpose) => ({
    ...purpose,
    sound: drafts?.[purpose.store]?.[purpose.field],
  }));
}

/**
 * Is any sound assigned to more than one purpose?
 *
 * @param {{kitchen: object, staffCall: object}} drafts — current draft values
 * @param {string} [preferredId] — the purpose the manager just edited. When it
 *        is part of a clash the error is reported against IT, so the message
 *        lands on the control they are looking at rather than on whichever
 *        purpose happens to come first in the catalogue (§6).
 * @returns {{id: string, conflictsWith: string}|null}
 */
export function findAlertSoundConflict(drafts, preferredId) {
  const assignments = collectAlertSounds(drafts).filter((entry) => entry.sound);

  /* The just-edited purpose first: if it duplicates anything, that is the
     clash worth reporting, and it is reported on that field. */
  if (preferredId) {
    const edited = assignments.find((entry) => entry.id === preferredId);
    const clash =
      edited && assignments.find((other) => other.id !== edited.id && other.sound === edited.sound);
    if (clash) return { id: edited.id, conflictsWith: clash.id };
  }

  /* Otherwise the first duplicate pair in catalogue order — deterministic, so
     the same draft always produces the same message. */
  for (let i = 0; i < assignments.length; i += 1) {
    for (let j = i + 1; j < assignments.length; j += 1) {
      if (assignments[i].sound === assignments[j].sound) {
        return { id: assignments[j].id, conflictsWith: assignments[i].id };
      }
    }
  }
  return null;
}
