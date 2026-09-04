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
     never carries the legacy key at all. */
  const { required, ...rest } = group || {};

  return { ...rest, minSelections, maxSelections, options };
}

/** Normalize a whole `choices` array. */
export function normalizeChoiceGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map(normalizeChoiceGroup);
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

/** Every group of an item that cannot currently be answered. */
export function getUnsatisfiableGroups(item) {
  return normalizeChoiceGroups(item?.choices).filter((g) => !isGroupSatisfiable(g));
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
      return `${t("common.optional", "Optional")} · ${t("choice.chooseUpToN", "Choose up to {n}").replace("{n}", max)}`;
    case "exactly":
      return t("choice.chooseExactlyN", "Choose exactly {n}").replace("{n}", min);
    case "range":
    default:
      return t("choice.chooseRange", "Choose {min}–{max}")
        .replace("{min}", min)
        .replace("{max}", max);
  }
}

/* ── Selection validation ─────────────────────────────────────────────── */

export const CHOICE_ISSUE = {
  BELOW_MIN: "below_min",
  ABOVE_MAX: "above_max",
  OPTION_UNAVAILABLE: "option_unavailable",
  OPTION_MISSING: "option_missing",
  UNSATISFIABLE: "unsatisfiable",
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

  const byGroup = {};
  const issues = [];
  let firstInvalidGroupId = null;

  for (const group of groups) {
    const ids = chosen.filter((c) => c.groupId === group.id).map((c) => c.optionId);
    const result = validateGroupSelection(group, ids);
    byGroup[group.id] = result;
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
 * @returns {{min?:string, max?:string, options?:string}}
 */
export function validateGroupConfig(group) {
  const errors = {};

  const validOptions = (group?.options || []).filter((o) => (o.name || "").trim());
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

  return errors;
}
