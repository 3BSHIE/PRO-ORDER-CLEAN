import { parseSortOrder } from "./menuSortOrder.js";
import { hasLocalizedText } from "./localizedContent.js";

/**
 * choiceRules — Phase 80. The single source of truth for what a choice group
 * ASKS and whether an answer satisfies it.
 *
 * Nothing here reads or writes storage. The Admin editor, the customer item
 * sheet, the cart validator and the order-creation gate all pass a group and
 * a selection in, so four surfaces that must never disagree about "is this
 * order valid" cannot.
 *
 * ── MIN/MAX IS THE RULE; `required` IS A VIEW OF IT ─────────────────────
 *   Before this phase a group carried `required` (a boolean) and
 *   `maxSelections` (a number). Between them they could express exactly two
 *   things — "pick one, or don't" and "pick up to N, or don't" — and nothing
 *   else. A meal that needs two sides, or a build-your-own that wants two to
 *   four toppings, had no representation at all.
 *
 *   minSelections and maxSelections replace that pair, and `required` becomes
 *   a derived reading of one of them:
 *
 *       required  ===  minSelections >= 1
 *
 *   It is deliberately NOT stored. Two editable fields that mean overlapping
 *   things is how a product ends up flagged required with a minimum of zero,
 *   and no amount of validation makes that pair trustworthy afterwards.
 *
 * ── PER-OPTION AVAILABILITY ─────────────────────────────────────────────
 *   An option carries `isAvailable`, so a sold-out size takes only itself out
 *   of circulation. This is a different question from the product's own
 *   `isAvailable`, and the two must not be confused: a burger whose Large is
 *   gone is still a burger you can buy.
 *
 *   An unavailable option is not deleted, not hidden, and never counts
 *   towards a minimum — which is what makes "choose exactly 2 from 3 options,
 *   2 of them sold out" an impossible group rather than a silently broken
 *   one. See isGroupSatisfiable.
 *
 * ── FAIL-SAFE DIRECTION ─────────────────────────────────────────────────
 *   Note this module fails CLOSED, unlike the schedule logic in
 *   acceptingOrders.js which fails open. The asymmetry is deliberate:
 *   accepting an order a few minutes outside opening hours costs nothing,
 *   while accepting one for a dish the kitchen cannot make costs a guest
 *   their meal. A malformed group blocks the item rather than waving it
 *   through.
 */

/* The stored field for an option's surcharge is `price`, not `priceDelta` —
   it is what mockMenu.js, the editor, the cart lines, the order snapshots and
   menuPricing.js already call it, and renaming it here would fork the
   vocabulary for no gain. */

/** Largest sane selection bound. Stops a typo, not a business rule. */
export const MAX_SELECTION_LIMIT = 99;

/**
 * Parse one of the two bounds. Returns a non-negative integer or null.
 * @param {unknown} raw
 * @param {{min?: number}} [opts] — floor, 0 for minSelections and 1 for max
 */
export function parseSelectionBound(raw, { min = 0 } = {}) {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= min && raw <= MAX_SELECTION_LIMIT ? raw : null;
  }
  const text = String(raw ?? "").trim();
  /* Digits only: rejects "", "1.5", "-1", "+1", "abc", "1e2". Same rule the
     price parsers use, for the same reason — only what a person could have
     meant to type. */
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= min && value <= MAX_SELECTION_LIMIT ? value : null;
}

/**
 * One option, in canonical shape. A missing `isAvailable` reads as available
 * (§10) — every option that existed before this phase was orderable, and the
 * absence of a flag must not retire them all.
 */
export function normalizeChoiceOption(option) {
  return {
    ...option,
    isAvailable: option?.isAvailable !== false,
  };
}

/**
 * One group, in canonical shape.
 *
 * MIGRATION (§4). A stored group predates minSelections, so it is derived:
 *
 *     required === true   → minSelections = 1
 *     otherwise           → minSelections = 0
 *
 * maxSelections is preserved as-is when usable. When it is missing or
 * malformed the safest replacement is `max(1, minSelections)`: it keeps a
 * required group answerable and never invents extra capacity a manager did
 * not ask for.
 *
 * `required` is dropped from the output — it is derivable, and carrying it
 * alongside minSelections is exactly the two-sources-of-truth problem this
 * phase exists to remove. It survives in storage until the next save
 * rewrites the product, and nothing reads it in the meantime.
 *
 * Idempotent: a group already in the new shape passes through unchanged,
 * because minSelections is only derived when it is absent or unusable.
 */
export function normalizeChoiceGroup(group) {
  const options = (group?.options || []).map(normalizeChoiceOption);

  const storedMin = parseSelectionBound(group?.minSelections, { min: 0 });
  const minSelections = storedMin !== null ? storedMin : group?.required === true ? 1 : 0;

  const storedMax = parseSelectionBound(group?.maxSelections, { min: 1 });
  const maxSelections = storedMax !== null ? storedMax : Math.max(1, minSelections);

  /* Deliberately destructured out rather than deleted, so the returned object
     never carries the legacy key at all. The condition is taken out for the
     same reason: a malformed one stored by some other route must not survive
     by riding along in the rest. */
  const { required, visibilityCondition: storedCondition, ...rest } = group || {};

  /* Phase 114.0 §5/§14 — the condition is resolved on READ, never migrated.
     A group that predates this phase has no field, reads as "Always Show"
     and keeps behaving exactly as it does today.

     The key is OMITTED rather than set to null when there is no condition,
     and that is deliberate. Normalized groups are what gets written back the
     next time anything saves the menu, so emitting the field unconditionally
     would quietly stamp "visibilityCondition": null onto every choice group
     in the restaurant the first time a manager edited any product — a
     rewrite of legacy data to record the absence of a feature, which §14
     rules out. Absent and null mean the same thing to every reader here, so
     the one that leaves stored products untouched is the one to write. */
  const visibilityCondition = normalizeVisibilityCondition(storedCondition);

  return {
    ...rest,
    minSelections,
    maxSelections,
    options,
    ...(visibilityCondition ? { visibilityCondition } : {}),
  };
}

/** Normalize a whole `choices` array. */
export function normalizeChoiceGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map(normalizeChoiceGroup);
}

/* ── Customization section order (Phase 85, §9–§12, §19, §57, §58) ─────────

   The Item Details sheet used to render a fixed sequence: removable
   ingredients, then choice groups, then paid add-ons. That is precisely the
   global ordering the owner ruled out — a restaurant whose burger needs
   "Choose your bun" answered before anything else had no way to say so, and
   a venue whose removals matter more than its extras could not put them
   first.

   Order is now data, not layout. Every customization block is a SECTION with
   a sortOrder, and the three kinds sit in one sequence so they can interleave
   freely: a required choice group can sit above removals, add-ons can sit
   between two groups, whatever the product needs.

   ── WHY THE DEFAULTS ARE SPACED ─────────────────────────────────────────
   REMOVALS_DEFAULT 100, choice groups 200 + their array index, ADDONS_DEFAULT
   300. Two things fall out of that, both required:

     · a product that configures nothing renders in exactly the order it
       renders today, so no existing demo product moves (§58);
     · the gaps leave room to slot a section between kinds without having to
       renumber everything else.

   ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────
   It does not touch validation. Ordering is presentation; minSelections and
   maxSelections decide what is required, and a group that appears last is as
   required as one that appears first (§11). Nothing downstream of this
   function reads position to infer a rule.

   It also does not reorder OPTIONS inside a group. Options already render in
   stable array order, which the Admin editor writes in the order the manager
   arranged them, so there is no ambiguity to resolve and no field to add
   (§12).
*/

export const REMOVALS_DEFAULT_SORT_ORDER = 100;
export const CHOICE_GROUP_DEFAULT_SORT_BASE = 200;
export const ADDONS_DEFAULT_SORT_ORDER = 300;

/**
 * Build the ordered list of customization sections for one product.
 *
 * @param {object} item — a normalized menu item
 * @param {Array<object>} [paidAddOns] — the add-ons the caller intends to
 *   show; passed in rather than re-derived so this can never disagree with
 *   the pricing the sheet is already using.
 * @returns {Array<{key:string, kind:"removals"|"choice"|"addOns",
 *   sortOrder:number, seq:number, group?:object, ingredients?:Array<string>,
 *   addOns?:Array<object>}>} sorted ascending, ties broken by original
 *   position so the result is stable and never shuffles (§57).
 */
export function buildCustomizationSections(item, paidAddOns) {
  const sections = [];

  const removals = item?.removableIngredients || [];
  if (removals.length > 0) {
    sections.push({
      key: "removals",
      kind: "removals",
      sortOrder: parseSortOrder(item?.removalsSortOrder) ?? REMOVALS_DEFAULT_SORT_ORDER,
      seq: 0,
      ingredients: removals,
    });
  }

  (item?.choices || []).forEach((group, index) => {
    sections.push({
      key: `choice:${group.id}`,
      kind: "choice",
      /* A group with no configured position keeps the slot its array index
         gives it, which is what makes an unconfigured product render
         identically to before. */
      sortOrder: parseSortOrder(group?.sortOrder) ?? CHOICE_GROUP_DEFAULT_SORT_BASE + index,
      seq: 1 + index,
      group,
    });
  });

  const addOns = paidAddOns || [];
  if (addOns.length > 0) {
    sections.push({
      key: "addOns",
      kind: "addOns",
      sortOrder: parseSortOrder(item?.addOnsSortOrder) ?? ADDONS_DEFAULT_SORT_ORDER,
      /* Last among equals: with the shipped defaults nothing collides here,
         but if a product gives add-ons the same number as a group, the group
         it was configured to sit beside wins the tie deterministically. */
      seq: Number.MAX_SAFE_INTEGER,
      addOns,
    });
  }

  /* Array.prototype.sort is stable in every engine this ships to, but the
     explicit seq tie-break makes the guarantee independent of that. */
  return sections.sort((a, b) => a.sortOrder - b.sortOrder || a.seq - b.seq);
}

/** The derived reading. Never stored. */
export function isGroupRequired(group) {
  return (group?.minSelections ?? 0) >= 1;
}

/** Only the options a guest can actually pick right now. */
export function getAvailableOptions(group) {
  return (group?.options || []).filter((o) => o.isAvailable !== false);
}

/**
 * Can this group ever be satisfied as configured?
 *
 * The count that matters is of AVAILABLE options: a group asking for two
 * when only one is in stock is impossible today even though it will be fine
 * tomorrow. Admin save refuses to create this state (§6/§11/§42/§43); the
 * customer side still checks, because legacy or externally-edited data can
 * reach it (§25).
 */
export function isGroupSatisfiable(group) {
  return getAvailableOptions(group).length >= (group?.minSelections ?? 0);
}

/**
 * Every group of an item that cannot currently be answered.
 *
 * Phase 114.0 — optionally scoped to the groups that are actually VISIBLE
 * for a given selection. A conditional group nobody has triggered is not a
 * reason to refuse the whole item: a burger whose optional meal-upgrade
 * sides are out of stock is still a burger you can buy, and blocking it
 * would take a sellable product off the menu over a group the guest may
 * never open. Once the trigger IS selected the group is visible, its
 * problem becomes real, and the sheet blocks exactly as it always has.
 *
 * The argument is optional and omitting it keeps the original behaviour —
 * every group judged — so callers that have no selection to offer are
 * unchanged.
 *
 * @param {object} item
 * @param {Record<string,string[]>} [selectedIdsByGroup]
 */
export function getUnsatisfiableGroups(item, selectedIdsByGroup) {
  const groups = normalizeChoiceGroups(item?.choices);
  const scope = selectedIdsByGroup
    ? getVisibleChoiceGroups(groups, selectedIdsByGroup)
    : groups;
  return scope.filter((g) => !isGroupSatisfiable(g));
}

/* ── Rule descriptions ────────────────────────────────────────────────────
   One place decides which sentence a rule deserves, so the customer sheet
   and the Admin summary cannot describe the same group differently. The
   caller supplies `t`, keeping this module free of the i18n layer. */

/**
 * A machine-readable summary of the rule.
 * @returns {{kind:"optional"|"single"|"upTo"|"exactly"|"range", min:number, max:number}}
 */
export function describeGroupRule(group) {
  const min = group?.minSelections ?? 0;
  const max = group?.maxSelections ?? 1;

  if (min === 0 && max === 1) return { kind: "optional", min, max };
  if (min === 1 && max === 1) return { kind: "single", min, max };
  if (min === 0) return { kind: "upTo", min, max };
  if (min === max) return { kind: "exactly", min, max };
  return { kind: "range", min, max };
}

/**
 * The guest-facing sentence for a rule. Never exposes the raw field names
 * (§14) — a diner reads "Choose 2–4", not "minSelections=2".
 *
 * @param {object} group
 * @param {(key:string, fallback:string)=>string} t
 */
export function formatGroupRule(group, t) {
  const { kind, min, max } = describeGroupRule(group);
  switch (kind) {
    case "optional":
      return t("common.optional", "Optional");
    case "single":
      return t("choice.chooseOne", "Choose 1");
    case "upTo":
      /* Phase 97.6 §6 — the "Optional · " prefix is gone. The section head
         already carries an Optional badge beside the group name, so this
         hint was repeating that word before stating the rule. §6 specifies
         the rule alone. */
      return t("choice.chooseUpToN", "Choose up to {n}").replace("{n}", max);
    case "exactly":
      return t("choice.chooseExactlyN", "Choose {n}").replace("{n}", min);
    case "range":
    default:
      return t("choice.chooseRange", "Choose {min} to {max}")
        .replace("{min}", min)
        .replace("{max}", max);
  }
}

/**
 * Phase 85 §34 — the validation message for a failed group, stated as the
 * RULE rather than as a generic complaint.
 *
 * "Please complete your selection for Doneness" tells the guest that
 * something is wrong but not what would fix it, and it says the same thing
 * whether the group wanted one option or four. Since describeGroupRule
 * already knows the exact shape of the ask, the message can simply be that
 * ask — "Choose exactly 2 options" — which is both more specific and
 * impossible to drift from the rule it describes.
 *
 * Lives here rather than in the sheet so the wording has one home, next to
 * the rule it is derived from.
 *
 * @param {object} group
 * @param {string} issue — a CHOICE_ISSUE value
 * @param {(key:string, fallback:string)=>string} t
 * @returns {string}
 */
export function formatGroupError(group, issue, t) {
  if (issue === CHOICE_ISSUE.UNSATISFIABLE) {
    return t("choice.groupUnsatisfiable", "Not enough options are available for this choice right now.");
  }
  if (issue === CHOICE_ISSUE.OPTION_UNAVAILABLE || issue === CHOICE_ISSUE.OPTION_MISSING) {
    return t("choice.reselectOption", "One of your selections is no longer available. Please choose again.");
  }
  if (issue === CHOICE_ISSUE.HIDDEN_SELECTION) {
    /* Reachable from a stored cart line, not from the live sheet — the sheet
       clears hidden selections as part of the same state change that hides
       the group, so it has nothing to report. Worded as what the guest needs
       to do rather than as what the data did. */
    return t(
      "choice.selectionNoLongerApplies",
      "One of your selections no longer applies. Please open this item and choose again."
    );
  }

  const { kind, min, max } = describeGroupRule(group);

  if (issue === CHOICE_ISSUE.ABOVE_MAX) {
    return max === 1
      ? t("choice.errorAtMostOne", "Choose no more than 1 option")
      : t("choice.errorAtMost", "Choose no more than {n} options").replace("{n}", max);
  }

  /* BELOW_MIN — what the group still needs. */
  switch (kind) {
    case "single":
      return t("choice.errorChooseOne", "Choose 1 option");
    case "exactly":
      return t("choice.errorExactly", "Choose exactly {n} options").replace("{n}", min);
    case "range":
    default: {
      /* Phase 110.2 — "range" starts at min 1 (min === max is "exactly" and
         min 0 is "upTo"), so this branch really can be asked for 1 and used
         to read "Choose at least 1 options". The two branches only ever
         differed by the Math.max floor, which is what n is clamped to here
         before the singular/plural choice is made. */
      const n = Math.max(1, min);
      return n === 1
        ? t("choice.errorAtLeastOne", "Choose at least 1 option")
        : t("choice.errorAtLeast", "Choose at least {n} options").replace("{n}", n);
    }
  }
}

/* ── Selection validation ─────────────────────────────────────────────── */

export const CHOICE_ISSUE = {
  BELOW_MIN: "below_min",
  ABOVE_MAX: "above_max",
  OPTION_UNAVAILABLE: "option_unavailable",
  OPTION_MISSING: "option_missing",
  UNSATISFIABLE: "unsatisfiable",
  /* Phase 114.0 §18/§24 — a selection survives for a group that is no longer
     visible. Distinct from every code above because nothing about the
     OPTION is wrong: it exists, it is in stock, and it is a legal answer to
     its group. What has changed is that the group is not being asked. The
     selection must therefore contribute nothing — no price, no order line,
     no required-validation — and a cart line still carrying one is stale
     rather than merely incomplete. */
  HIDDEN_SELECTION: "hidden_selection",
};

/**
 * Judge one group against the option ids chosen for it.
 *
 * Order matters: an impossible group is reported before a count problem,
 * because "you must pick two" is useless advice when only one option is left.
 *
 * @param {object} group — normalized
 * @param {string[]} selectedIds
 * @returns {{ok:boolean, issue:string|null, selectedCount:number}}
 */
export function validateGroupSelection(group, selectedIds) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  const min = group?.minSelections ?? 0;
  const max = group?.maxSelections ?? 1;

  if (!isGroupSatisfiable(group)) {
    return { ok: false, issue: CHOICE_ISSUE.UNSATISFIABLE, selectedCount: ids.length };
  }

  for (const id of ids) {
    const option = (group?.options || []).find((o) => o.id === id);
    if (!option) {
      return { ok: false, issue: CHOICE_ISSUE.OPTION_MISSING, selectedCount: ids.length };
    }
    if (option.isAvailable === false) {
      return { ok: false, issue: CHOICE_ISSUE.OPTION_UNAVAILABLE, selectedCount: ids.length };
    }
  }

  if (ids.length < min) {
    return { ok: false, issue: CHOICE_ISSUE.BELOW_MIN, selectedCount: ids.length };
  }
  if (ids.length > max) {
    return { ok: false, issue: CHOICE_ISSUE.ABOVE_MAX, selectedCount: ids.length };
  }

  return { ok: true, issue: null, selectedCount: ids.length };
}

/**
 * Judge every group of an item against a flat selection list of the shape the
 * cart stores — [{ groupId, optionId, ... }].
 *
 * A group with NO entries is still judged, which is the whole point: an
 * untouched required group is exactly the failure worth catching.
 *
 * @param {object} item — a menu item (choices normalized internally)
 * @param {Array<{groupId:string, optionId:string}>} selectedChoices
 * @returns {{ok:boolean, byGroup:Record<string,object>, issues:string[],
 *            firstInvalidGroupId:string|null}}
 */
export function validateItemSelections(item, selectedChoices) {
  const groups = normalizeChoiceGroups(item?.choices);
  const chosen = Array.isArray(selectedChoices) ? selectedChoices : [];

  /* Phase 114.0 §19/§27 — which groups is this item actually ASKING, given
     what has been chosen? Derived from the selection itself, so one list
     answers both halves of the question below: a visible group is validated
     normally, and a hidden one must contribute nothing at all.

     Note the evaluation reads only PARENT selections, so a hidden group's
     own entries can never influence whether it is hidden — there is no
     circularity to resolve and no iteration to settle. */
  const selectionMap = selectionMapFromList(chosen);
  const visibleIds = new Set(
    getVisibleChoiceGroups(groups, selectionMap).map((g) => g.id)
  );

  const byGroup = {};
  const issues = [];
  let firstInvalidGroupId = null;

  for (const group of groups) {
    const ids = chosen.filter((c) => c.groupId === group.id).map((c) => c.optionId);

    if (!visibleIds.has(group.id)) {
      /* §19 — a hidden group is NOT required, however it is configured. The
         guest is never shown it, so failing them for not answering it would
         make the item unorderable for reasons they cannot see or fix.

         §18/§24 — but a leftover selection is a real problem, and the
         direction it fails matters: it is reported rather than ignored, so
         a stale cart line is stopped and re-examined instead of quietly
         pricing an option the guest can no longer see. */
      const ok = ids.length === 0;
      byGroup[group.id] = {
        ok,
        issue: ok ? null : CHOICE_ISSUE.HIDDEN_SELECTION,
        selectedCount: ids.length,
        hidden: true,
      };
      if (!ok) {
        if (!issues.includes(CHOICE_ISSUE.HIDDEN_SELECTION)) {
          issues.push(CHOICE_ISSUE.HIDDEN_SELECTION);
        }
        if (!firstInvalidGroupId) firstInvalidGroupId = group.id;
      }
      continue;
    }

    const result = validateGroupSelection(group, ids);
    byGroup[group.id] = { ...result, hidden: false };
    if (!result.ok) {
      if (!issues.includes(result.issue)) issues.push(result.issue);
      if (!firstInvalidGroupId) firstInvalidGroupId = group.id;
    }
  }

  /* A selection pointing at a group the item no longer has is its own kind of
     stale — caught here rather than being silently ignored by the loop above,
     which only ever visits groups that still exist. */
  for (const c of chosen) {
    if (!groups.some((g) => g.id === c.groupId)) {
      if (!issues.includes(CHOICE_ISSUE.OPTION_MISSING)) issues.push(CHOICE_ISSUE.OPTION_MISSING);
      break;
    }
  }

  return { ok: issues.length === 0, byGroup, issues, firstInvalidGroupId };
}

/* ── Admin configuration validation ───────────────────────────────────── */

/**
 * Judge a group as CONFIGURATION rather than as an answer — what the Product
 * editor blocks Save on.
 *
 * Returns error codes rather than sentences so this stays pure; the editor
 * maps them to translated copy, exactly as validateChoiceGroups already did.
 *
 * @param {object} group — a DRAFT group (bounds may still be raw strings)
 * @param {Array<object>} [siblings] — Phase 114.0. The product's OTHER draft
 *   groups, needed to judge a visibility condition: whether the parent still
 *   exists, is unconditional, owns the triggering option and sits above this
 *   group. Omitted, the visibility check is skipped entirely — a caller with
 *   no product context can still judge the bounds and options exactly as it
 *   did before this phase.
 * @returns {{min?:string, max?:string, options?:string, visibility?:string}}
 */
export function validateGroupConfig(group, siblings) {
  const errors = {};

  /* Phase 98.0 — an option NAME is merchant-authored text, so since Phase
     97.7 it is either a legacy string or a localized { en, ar } object.
     This used to read (o.name || "").trim(), which threw the moment a
     manager typed an Arabic option name and took the whole Product editor
     down with it. hasLocalizedText asks the question that was always meant
     here — "did the manager name this option, in ANY language?" — and is
     total across both shapes. */
  const validOptions = (group?.options || []).filter((o) => hasLocalizedText(o.name));
  const availableCount = validOptions.filter((o) => o.isAvailable !== false).length;

  const min = parseSelectionBound(group?.minSelections, { min: 0 });
  const max = parseSelectionBound(group?.maxSelections, { min: 1 });

  if (min === null) errors.min = "invalid";
  if (max === null) errors.max = "invalid";

  if (min !== null && max !== null && min > max) {
    /* Reported against MAX so the message sits beside the field a manager is
       most likely to be fixing, and because a minimum is usually the number
       they meant. */
    errors.max = "minAboveMax";
  }

  if (validOptions.length === 0) {
    errors.options = min !== null && min >= 1 ? "requiredNeedsOption" : "needsOption";
  } else {
    if (max !== null && max > validOptions.length) errors.max = "tooHigh";
    /* §6/§42/§43 — the rule this phase adds. Judged on AVAILABLE options, so
       marking enough of them sold out is itself a blocking edit. */
    if (min !== null && min > availableCount) errors.options = "notEnoughAvailable";
  }

  /* §9 — the condition, judged as configuration. Deliberately a save-blocking
     error like the others rather than something the dropdowns merely avoid
     offering: hiding an invalid choice cannot catch a configuration that went
     invalid AFTER it was made, which is most of the ways one goes wrong. */
  if (siblings !== undefined) {
    const visibility = validateVisibilityDraft(group, siblings);
    if (visibility) errors.visibility = visibility;
  }

  return errors;
}

/* ══ CONDITIONAL VISIBILITY — Phase 114.0 ════════════════════════════════

   One choice group may control whether another is shown. "Make it a meal?"
   answered yes reveals "Choose your fries" and "Choose your drink"; answered
   no hides them, and anything already picked inside them stops existing —
   not merely stops being painted.

   ── THE SHAPE ─────────────────────────────────────────────────────────
       visibilityCondition: { parentGroupId, triggerOptionId }   | null

   Two STABLE IDS and nothing else (§13). Names are editable and bilingual,
   options are renameable, and groups are reorderable, so a reference built
   from any of those would break the first time a manager tidied their menu.
   The ids are the same ones the cart lines, the order snapshots and Phase
   37's validation already join on, so a condition survives exactly what
   those survive.

   ── ONE LEVEL, BY CONSTRUCTION ────────────────────────────────────────
   A parent must itself be unconditional (§3). That single rule is what makes
   chains and cycles unrepresentable rather than merely discouraged: with no
   second level there is nothing to recurse into, so every evaluation below
   is one lookup deep, terminates trivially, and needs no cycle detection at
   all. Several dependants MAY share one parent and one trigger, which is the
   case the feature exists for.

   ── FAIL-SAFE DIRECTION ───────────────────────────────────────────────
   Every uncertainty here resolves to HIDDEN, which is the conservative
   answer in both directions that matter: a hidden group charges nothing, and
   a hidden group is never required, so corrupt or half-written data can
   neither bill a guest for something they cannot see nor block a checkout
   over a question they were never asked. This is the same instinct as the
   fail-closed note at the top of this module, pointed the other way for the
   same reason — the cost of the two mistakes is not symmetric.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A condition in canonical shape, or null for "Always Show".
 *
 * Both ids must be present and non-empty. A half-written condition — the
 * state the Admin editor passes through while a manager is filling in the
 * two dropdowns — is NOT a condition, and reading it as one would hide a
 * group the moment the first field was touched. The editor keeps its own
 * raw draft precisely so it can tell "still being written" from "Always
 * Show"; everything downstream of storage only ever sees the resolved form.
 */
export function normalizeVisibilityCondition(raw) {
  if (!raw || typeof raw !== "object") return null;
  const parentGroupId = typeof raw.parentGroupId === "string" ? raw.parentGroupId.trim() : "";
  const triggerOptionId = typeof raw.triggerOptionId === "string" ? raw.triggerOptionId.trim() : "";
  if (!parentGroupId || !triggerOptionId) return null;
  return { parentGroupId, triggerOptionId };
}

/** Does this group appear only under a condition? */
export function isConditionalGroup(group) {
  return normalizeVisibilityCondition(group?.visibilityCondition) !== null;
}

/**
 * The product's choice groups in the order the guest will meet them.
 *
 * Mirrors the choice-group branch of buildCustomizationSections exactly —
 * stored sortOrder when set, otherwise the array index offset by the shared
 * base, ties broken by position. It has to: "the controlling group appears
 * before the dependent one" is only meaningful if both this module and the
 * sheet mean the same thing by "before".
 */
export function orderedChoiceGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((group, index) => ({
      group,
      sortOrder: parseSortOrder(group?.sortOrder) ?? CHOICE_GROUP_DEFAULT_SORT_BASE + index,
      seq: index,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.seq - b.seq)
    .map((entry) => entry.group);
}

/**
 * The groups that may legally control this one (§8).
 *
 * Three filters, each one of §9's prevention rules expressed as absence
 * rather than as a refusal: groups that come BEFORE this one (so the guest
 * has answered the question before being asked what depends on it), that are
 * themselves unconditional (so no chain can form), and that have at least
 * one named option to trigger on (an empty group offers nothing to pick).
 *
 * A group not present in the list — a brand-new one still being added — is
 * treated as sitting last, so every existing group is offered to it.
 */
export function getEligibleParentGroups(groups, groupId) {
  const ordered = orderedChoiceGroups(groups);
  const at = ordered.findIndex((g) => g?.id === groupId);
  const preceding = at === -1 ? ordered : ordered.slice(0, at);
  return preceding.filter(
    (g) =>
      g?.id !== groupId &&
      !isConditionalGroup(g) &&
      /* A group with no name in either language is discarded by the product
         save, so it is not something another group can be anchored to. */
      hasLocalizedText(g?.name) &&
      (g?.options || []).some((o) => hasLocalizedText(o?.name))
  );
}

/** Why a condition is not usable. Codes, not sentences — the editor translates. */
export const CONDITION_ISSUE = {
  INCOMPLETE: "incomplete",
  SELF: "self",
  PARENT_MISSING: "parentMissing",
  PARENT_CONDITIONAL: "parentConditional",
  OPTION_MISSING: "optionMissing",
  PARENT_AFTER: "parentAfter",
};

/**
 * Judge a RESOLVED condition against the product it belongs to.
 *
 * Covers §9 A–H. F (a reference to another product) cannot be expressed:
 * every lookup here is inside this product's own group list, so a foreign id
 * simply fails to resolve and reports PARENT_MISSING. H (cycles) likewise
 * cannot be expressed, because PARENT_CONDITIONAL forbids the second level a
 * cycle would need.
 *
 * @param {object} group — the dependent group
 * @param {Array<object>} groups — every group of the same product
 * @returns {string|null} a CONDITION_ISSUE, or null when the condition is
 *   sound (or absent).
 */
export function validateVisibilityConfig(group, groups) {
  const condition = normalizeVisibilityCondition(group?.visibilityCondition);
  if (!condition) return null;

  if (condition.parentGroupId === group?.id) return CONDITION_ISSUE.SELF;

  const list = Array.isArray(groups) ? groups : [];
  const parent = list.find((g) => g?.id === condition.parentGroupId);
  if (!parent) return CONDITION_ISSUE.PARENT_MISSING;
  if (isConditionalGroup(parent)) return CONDITION_ISSUE.PARENT_CONDITIONAL;

  /* Covers both "the option was deleted" and "the option belongs to a
     different group": in either case it is not among this parent's options,
     which is the only question worth asking. */
  const option = (parent.options || []).find((o) => o?.id === condition.triggerOptionId);
  if (!option) return CONDITION_ISSUE.OPTION_MISSING;

  const ordered = orderedChoiceGroups(list);
  const parentAt = ordered.findIndex((g) => g?.id === parent.id);
  const groupAt = ordered.findIndex((g) => g?.id === group?.id);
  if (parentAt > -1 && groupAt > -1 && parentAt > groupAt) {
    return CONDITION_ISSUE.PARENT_AFTER;
  }

  return null;
}

/**
 * The same judgement, for a group still being edited (§12).
 *
 * The difference is one case: an object that is PRESENT but not yet filled
 * in. Storage never holds that shape, but the editor does for as long as it
 * takes a manager to answer two dropdowns, and it must be refused at Save
 * rather than silently resolving to "Always Show" — a group that quietly
 * stopped being conditional is exactly the kind of change nobody notices
 * until a guest is charged for it.
 */
export function validateVisibilityDraft(group, groups) {
  const raw = group?.visibilityCondition;
  if (raw == null) return null; // Always Show

  const condition = normalizeVisibilityCondition(raw);
  if (condition === null) return CONDITION_ISSUE.INCOMPLETE;

  /* A parent whose name has been blanked is already on its way out: the
     product save drops every unnamed group, so persisting this condition
     would write a reference to a group that will not be in the saved
     product. Reported as missing, which is what it is about to be, and the
     manager fixes it the same way — name the group again, or point the
     condition somewhere else. */
  const parent = (Array.isArray(groups) ? groups : []).find(
    (g) => g?.id === condition.parentGroupId
  );
  if (parent && !hasLocalizedText(parent.name)) return CONDITION_ISSUE.PARENT_MISSING;

  return validateVisibilityConfig(group, groups);
}

/**
 * Is this group being asked right now?
 *
 * @param {object} group — the group to judge
 * @param {Array<object>} groups — every group of the same product
 * @param {Record<string,string[]>} selectedIdsByGroup — chosen option ids,
 *   keyed by group id. Missing keys read as "nothing chosen".
 */
export function isGroupVisible(group, groups, selectedIdsByGroup) {
  const condition = normalizeVisibilityCondition(group?.visibilityCondition);
  if (!condition) return true; // Always Show — the default, and the legacy shape

  const parent = (Array.isArray(groups) ? groups : []).find(
    (g) => g?.id === condition.parentGroupId
  );
  /* Dangling parent (§33Y). Hidden, not shown: an unresolvable reference is
     not evidence that the guest should be asked something. */
  if (!parent) return false;
  /* An unsupported chain. Admin validation refuses to create one, so this is
     data that arrived some other way; one level is what this phase defines,
     and anything beyond it resolves to hidden rather than to a guess. */
  if (isConditionalGroup(parent)) return false;

  const option = (parent.options || []).find((o) => o?.id === condition.triggerOptionId);
  if (!option) return false;
  /* §21 — availability is not overridden by a condition. An option that
     cannot be picked cannot reveal anything, and a trigger that goes out of
     stock takes its dependants down with it rather than leaving them
     stranded and chargeable. */
  if (option.isAvailable === false) return false;

  const selected = selectedIdsByGroup?.[parent.id] || [];
  /* §17 — one test for both kinds of parent. For a single-select group the
     array holds at most one id, so "includes" is "is the selected one"; for
     a multi-select it is "is among the selected ones". Nothing about how the
     parent itself behaves changes. */
  return selected.includes(condition.triggerOptionId);
}

/** Every group of the product that is currently being asked. */
export function getVisibleChoiceGroups(groups, selectedIdsByGroup) {
  const list = Array.isArray(groups) ? groups : [];
  return list.filter((g) => isGroupVisible(g, list, selectedIdsByGroup));
}

/**
 * Turn the flat shape a cart line stores — [{ groupId, optionId }] — into the
 * keyed shape the evaluator reads. The two shapes exist for good reasons
 * (one is a serialisable record of what was chosen, the other is the
 * editor's working state) and this is the single place they meet.
 */
export function selectionMapFromList(list) {
  const map = {};
  for (const entry of Array.isArray(list) ? list : []) {
    const groupId = entry?.groupId;
    if (typeof groupId !== "string" || !groupId) continue;
    if (!map[groupId]) map[groupId] = [];
    map[groupId].push(entry.optionId);
  }
  return map;
}

/**
 * Drop every selection belonging to a group that is not currently visible
 * (§18 — the financial-integrity rule).
 *
 * Returns the SAME object when nothing had to go, so a caller can use the
 * identity as its "did anything change" test and React state that did not
 * actually change does not re-render.
 *
 * One pass is complete. A dependent group cannot itself be a parent, so
 * hiding one can never hide another, and there is no cascade to settle.
 *
 * Hidden groups keep their key with an empty array rather than losing it:
 * the shape stays stable across the transition, which is what lets the sheet
 * treat "hidden" and "visible but unanswered" identically everywhere except
 * where the difference matters.
 *
 * @param {Array<object>} groups
 * @param {Record<string,string[]>} selectedIdsByGroup
 * @returns {Record<string,string[]>}
 */
export function pruneHiddenSelections(groups, selectedIdsByGroup) {
  const current = selectedIdsByGroup || {};
  const visible = new Set(getVisibleChoiceGroups(groups, current).map((g) => g.id));

  let changed = false;
  const next = {};
  for (const [groupId, ids] of Object.entries(current)) {
    if (visible.has(groupId)) {
      next[groupId] = ids;
      continue;
    }
    if ((ids || []).length > 0) changed = true;
    next[groupId] = [];
  }
  return changed ? next : current;
}

/**
 * Every group that depends on the given parent group — and optionally on
 * one specific option of it.
 *
 * This is what the Admin editor asks before allowing a destructive edit
 * (§10). It is deliberately phrased as "who would break", not "may I", so
 * the caller can name them in the explanation rather than just refusing.
 *
 * @param {Array<object>} groups
 * @param {string} parentGroupId
 * @param {string} [triggerOptionId] — narrow to dependants on this option
 */
export function getDependentGroups(groups, parentGroupId, triggerOptionId) {
  return (Array.isArray(groups) ? groups : []).filter((g) => {
    const condition = normalizeVisibilityCondition(g?.visibilityCondition);
    if (!condition || condition.parentGroupId !== parentGroupId) return false;
    return triggerOptionId === undefined || condition.triggerOptionId === triggerOptionId;
  });
}
