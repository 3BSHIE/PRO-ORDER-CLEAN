/**
 * cartValidation — Phase 37. Reconciles a frozen cart against the live menu.
 *
 * Pure functions only: callers pass the cart plus the current menu data, so
 * the same logic serves the cart screen's live display AND the authoritative
 * re-check performed immediately before an order is created. One
 * implementation means the screen and the checkout gate can never disagree.
 *
 * ── Why this refines the Phase 21 policy ─────────────────────────────────
 *   Phase 21 deliberately froze cart lines so later menu edits could never
 *   rewrite what a guest chose, and that principle stands: nothing here
 *   mutates a line by itself. What it adds is that a frozen line may no
 *   longer be *orderable*. Phase 32 verified an item could be marked
 *   unavailable and repriced 8.50 -> 14.00 and still be ordered silently at
 *   the stale price. Preserving the snapshot is right; letting it check out
 *   unexamined is not.
 *
 * ── Join keys (audited, not assumed) ─────────────────────────────────────
 *   line.itemId                  -> item.id
 *   line.selectedChoices[].groupId/.optionId -> item.choices[].id / .options[].id
 *   line.selectedPaidAddOns[].id -> item.paidAddOns[].id
 *   The Admin item editor only mints new ids for newly-added rows and spreads
 *   existing ones through edits, so these survive editing and are safe to
 *   compare on. No name-based matching is used anywhere.
 *
 * ── What deliberately does NOT invalidate a line ─────────────────────────
 *   name, description, image, Popular/Featured. Those are presentation; the
 *   guest's snapshot keeps showing what they picked. This phase is only about
 *   orderability and price correctness.
 */

import { getCategoryVisibilityState } from "./categoryVisibility.js";
import { validateItemSelections, CHOICE_ISSUE } from "./choiceRules.js";

/** Issue codes. Everything except PRICE_CHANGED requires removing the line. */
export const CART_ISSUE = {
  ITEM_MISSING: "item_missing",
  ITEM_UNAVAILABLE: "item_unavailable",
  CATEGORY_UNAVAILABLE: "category_unavailable",
  CATEGORY_SCHEDULED: "category_scheduled",
  OPTION_MISSING: "option_missing",
  PRICE_CHANGED: "price_changed",
  /* Phase 80 — additive, and deliberately a small vocabulary. Every code
     above keeps its exact meaning; these three name the failures the
     min/max/availability model makes possible for the first time.

     OPTION_UNAVAILABLE is separate from OPTION_MISSING because the guest
     needs different advice: a deleted option is gone for good, a sold-out
     one is a different pick from the same list. CHOICE_RULE_UNMET covers
     both directions of a count failure (too few, too many) and an
     unanswerable group — three phrasings of "open the item and fix the
     choices", which is one action, so one code. */
  OPTION_UNAVAILABLE: "option_unavailable",
  CHOICE_RULE_UNMET: "choice_rule_unmet",
};

/* Issues the guest can only resolve by removing the line — the thing they
   chose cannot be produced right now. PRICE_CHANGED is excluded because it
   is resolvable in place, by accepting the new price. */
const BLOCKING_ISSUES = [
  CART_ISSUE.ITEM_MISSING,
  CART_ISSUE.ITEM_UNAVAILABLE,
  CART_ISSUE.CATEGORY_UNAVAILABLE,
  CART_ISSUE.CATEGORY_SCHEDULED,
  CART_ISSUE.OPTION_MISSING,
  /* Both Phase 80 codes block. Neither is resolvable in place the way a
     price change is — the guest has to reopen the item and choose again,
     which is what the line's action offers. */
  CART_ISSUE.OPTION_UNAVAILABLE,
  CART_ISSUE.CHOICE_RULE_UNMET,
];

/* Money is stored to 3 decimals; compare at that precision so floating-point
   noise never reads as a price change. */
function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

/**
 * Validate one cart line against the live menu.
 *
 * @param {object} line — a cart line (see customerCart.js for its shape)
 * @param {{items: object[], categories: object[], timeZone?: string, now?: Date}} ctx
 * @returns {{cartItemId, issues: string[], blocking: boolean,
 *            previousUnitPrice: number, currentUnitPrice: number|null,
 *            currentBasePrice: number|null,
 *            currentChoices: object[]|null, currentAddOns: object[]|null}}
 */
export function validateCartLine(line, ctx) {
  const { items = [], categories = [], timeZone, now } = ctx || {};
  const issues = [];

  const base = {
    cartItemId: line.cartItemId,
    previousUnitPrice: round3(line.unitPrice),
    currentUnitPrice: null,
    currentBasePrice: null,
    currentChoices: null,
    currentAddOns: null,
  };

  /* 1 — does the product still exist? */
  const item = items.find((i) => i.id === line.itemId);
  if (!item) {
    return { ...base, issues: [CART_ISSUE.ITEM_MISSING], blocking: true };
  }

  /* 2 — is it still being served? */
  if (item.isAvailable === false) issues.push(CART_ISSUE.ITEM_UNAVAILABLE);

  /* 3 — is its category orderable right now? Uses the LIVE item's category
     (an admin may have moved it) and the Phase 28 rule verbatim, including
     the restaurant-timezone schedule evaluation — no duplicated logic. */
  const category = categories.find((c) => c.id === item.categoryId);
  if (!category) {
    issues.push(CART_ISSUE.CATEGORY_UNAVAILABLE);
  } else {
    const state = getCategoryVisibilityState(category, { timeZone, now });
    if (!state.visible) {
      issues.push(
        state.reason === "schedule"
          ? CART_ISSUE.CATEGORY_SCHEDULED
          : CART_ISSUE.CATEGORY_UNAVAILABLE
      );
    }
  }

  /* 4 — do the chosen options still exist, are they still orderable, and at
     what price?

     Phase 80 splits the old single "missing" verdict in two. An option that
     has been deleted is OPTION_MISSING as before; one that is merely sold
     out is OPTION_UNAVAILABLE, because the guest can fix that by picking
     another from the same list. Both stop the line; only the advice differs. */
  let optionMissing = false;
  let optionUnavailable = false;
  let choicesTotal = 0;
  const currentChoices = [];

  for (const chosen of line.selectedChoices || []) {
    const group = (item.choices || []).find((g) => g.id === chosen.groupId);
    const option = group?.options?.find((o) => o.id === chosen.optionId);
    if (!option) {
      optionMissing = true;
      break;
    }
    if (option.isAvailable === false) {
      optionUnavailable = true;
      break;
    }
    choicesTotal += Number(option.price) || 0;
    currentChoices.push({ ...chosen, price: Number(option.price) || 0 });
  }

  if (optionUnavailable) {
    issues.push(CART_ISSUE.OPTION_UNAVAILABLE);
    return { ...base, issues, blocking: true };
  }

  let addOnsTotal = 0;
  const currentAddOns = [];

  if (!optionMissing) {
    for (const chosen of line.selectedPaidAddOns || []) {
      const addOn = (item.paidAddOns || []).find((a) => a.id === chosen.id);
      if (!addOn) {
        optionMissing = true;
        break;
      }
      addOnsTotal += Number(addOn.price) || 0;
      currentAddOns.push({ ...chosen, price: Number(addOn.price) || 0 });
    }
  }

  if (optionMissing) {
    issues.push(CART_ISSUE.OPTION_MISSING);
    return { ...base, issues, blocking: true };
  }

  /* 4b — Phase 80. Every option the guest picked is present and orderable;
     now do the GROUPS still agree with what they picked?

     This is the case the per-option loop above cannot see, because it only
     visits options that were chosen. A group whose minimum was raised from 1
     to 2 after the line was built has no failing option — it has a failing
     COUNT — and a group left untouched has no entries in selectedChoices at
     all. validateItemSelections walks the item's groups rather than the
     line's picks, which is what catches both.

     It also re-checks availability, one line of overlap with the loop above
     that is worth keeping: this module must not depend on the order of its
     own checks to stay correct. */
  const selectionCheck = validateItemSelections(item, line.selectedChoices || []);
  if (!selectionCheck.ok) {
    issues.push(
      selectionCheck.issues.includes(CHOICE_ISSUE.OPTION_MISSING)
        ? CART_ISSUE.OPTION_MISSING
        : selectionCheck.issues.includes(CHOICE_ISSUE.OPTION_UNAVAILABLE)
          ? CART_ISSUE.OPTION_UNAVAILABLE
          : CART_ISSUE.CHOICE_RULE_UNMET
    );
    return { ...base, issues, blocking: true, choiceCheck: selectionCheck };
  }

  /* 5 — price. Recomputed the same way the item modal builds unitPrice, so a
     change in the base price, a paid choice, or an add-on is all caught by
     one comparison. */
  const currentBasePrice = round3(item.price);
  const currentUnitPrice = round3(currentBasePrice + choicesTotal + addOnsTotal);

  if (currentUnitPrice !== round3(line.unitPrice)) {
    issues.push(CART_ISSUE.PRICE_CHANGED);
  }

  return {
    ...base,
    issues,
    blocking: issues.some((i) => BLOCKING_ISSUES.includes(i)),
    currentBasePrice,
    currentUnitPrice,
    currentChoices,
    currentAddOns,
  };
}

/**
 * Validate a whole cart.
 *
 * @returns {{byLine: Object<string,object>, results: object[],
 *            hasBlocking: boolean, hasPriceChange: boolean,
 *            needsReview: boolean, canCheckout: boolean}}
 */
export function validateCart(cart, ctx) {
  const lines = Array.isArray(cart) ? cart : [];
  const results = lines.map((line) => validateCartLine(line, ctx));

  const hasBlocking = results.some((r) => r.blocking);
  const hasPriceChange = results.some((r) => r.issues.includes(CART_ISSUE.PRICE_CHANGED));

  const byLine = {};
  for (const result of results) byLine[result.cartItemId] = result;

  return {
    byLine,
    results,
    hasBlocking,
    hasPriceChange,
    needsReview: hasBlocking || hasPriceChange,
    /* An empty cart is not "checkout-able" either — the cart screen already
       shows its own empty state, this just keeps the flag honest. */
    canCheckout: lines.length > 0 && !hasBlocking && !hasPriceChange,
  };
}

/** True when this line has any issue at all. */
export function lineHasIssue(result) {
  return !!result && result.issues.length > 0;
}
