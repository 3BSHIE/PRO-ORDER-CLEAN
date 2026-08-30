/**
 * menuPricing — the single source of truth for what counts as a valid money
 * value in the menu (Phase 66).
 *
 * These three parsers were written for the Product editor in Phases 47 and
 * 56 and lived inside AdminMenuItemsScreen.jsx. Phase 66 needs the same
 * rules at the storage boundary in menuData.js, and a data module importing
 * a screen would be the wrong direction entirely — so they moved here rather
 * than being copied. One definition, two consumers: the editor for inline
 * field errors, the data layer as the last line of defence. A second
 * near-identical regex inside menuData.js is exactly how two copies of a
 * rule quietly drift apart.
 *
 * Each parser returns a finite Number, or null when the value is not a
 * price. Callers decide what null means — the editor shows a message against
 * the field, the data layer refuses the write.
 *
 * NUMBERS AND STRINGS
 *   The editor passes strings, because that is what an input element holds.
 *   Programmatic callers pass Numbers that have already been parsed once.
 *   Both are accepted, and a Number is judged AS a number rather than being
 *   round-tripped through String() and a regex: 1e21 stringifies to "1e+21"
 *   and would fail a rule it actually satisfies. The string path is
 *   unchanged from Phases 47/56, so the editor behaves exactly as before.
 *
 * WHY A REGEX ON THE STRING PATH
 *   The question there is about the text the manager typed, not about what
 *   JavaScript is willing to coerce. Number(" 12 ") is 12 and Number("1e3")
 *   is 1000; neither is a price a person meant to enter. Only plain decimal
 *   notation is accepted, so partial parsing cannot happen at all — a
 *   malformed string has no valid prefix to salvage.
 */

/* Plain decimal only: digits, optionally one dot and more digits. Rejects
   "", "abc", "12.5o", "-5", "+5", "1e3", "Infinity", "NaN", "1,5", ".5"
   and "5." — every one of which parseFloat would have partially salvaged. */
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Shared shape check. Returns a finite Number for anything that is genuinely
 * a plain decimal, or null. The >= 0 floor is common to all three rules; the
 * callers below apply their own additional constraint.
 *
 * @param {unknown} raw
 * @returns {number|null}
 */
function parsePlainAmount(raw) {
  if (typeof raw === "number") {
    /* Already a number: judge it directly. NaN and ±Infinity fail
       Number.isFinite, and negatives fail the floor. */
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  const text = String(raw ?? "").trim();
  if (!PLAIN_DECIMAL.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Phase 47 — a product's base price. Must be greater than zero: an item on
 * the menu at 0 is a free item, which is never what anyone meant to type.
 *
 * @param {unknown} raw
 * @returns {number|null} a finite Number > 0, or null if invalid
 */
export function parseProductPrice(raw) {
  const value = parsePlainAmount(raw);
  /* The > 0 test is what rejects "0" and "0.00". */
  return value === null || value <= 0 ? null : value;
}

/**
 * Phase 56 — a choice option's extra price.
 *
 * Zero is a real, common answer here, not a failure: 30 of the seeded
 * options are priced 0, and the customer modal renders a price badge only
 * `if (opt.price > 0)`, so a 0 option deliberately shows no surcharge at
 * all. "Rare / Medium / Well done" cost the same, and that is the point.
 * The rule is therefore >= 0, unlike the base price.
 *
 * Blank is normalised to 0 rather than rejected, because that is already the
 * user-facing meaning: the row is created with price 0, the input is
 * type="number", and clearing it produced 0. Phase 56 kept that behaviour and
 * dropped the mechanism — an explicit "empty means no extra charge" instead
 * of an accident of `|| 0` that turned "abc" into a price as well.
 *
 * @param {unknown} raw
 * @returns {number|null} a finite Number >= 0, or null if invalid
 */
export function parseChoiceOptionPrice(raw) {
  /* The one deliberate difference from the two rules around it. Note this
     covers "" and whitespace only — null/undefined fall through to
     parsePlainAmount, which rejects them, because a nested row that is
     missing its price field entirely is a malformed record rather than a
     manager clearing an input. */
  if (typeof raw === "string" && raw.trim() === "") return 0;
  return parsePlainAmount(raw);
}

/**
 * Phase 56 — a paid add-on's price.
 *
 * Audited against the actual model before choosing the rule: all 19 seeded
 * add-ons are priced above 0, the section is labelled "Paid add-ons" for the
 * manager and "Add extras" for the guest, and the customer modal prints
 * `+{price}` unconditionally — with no `> 0` guard of the kind the options
 * have. A free add-on would render "+ JOD 0.000", which is not a thing the
 * UI was built to say. Free extras belong in a choice group, which already
 * supports them properly.
 *
 * So > 0 is required, and blank is invalid rather than 0: a named add-on
 * with no price is exactly the silent free-item bug this rule exists to stop.
 *
 * @param {unknown} raw
 * @returns {number|null} a finite Number > 0, or null if invalid
 */
export function parseAddOnPrice(raw) {
  const value = parsePlainAmount(raw);
  return value === null || value <= 0 ? null : value;
}

/**
 * Phase 66 — the storage boundary's check for one whole product.
 *
 * Validates every monetary field that would actually be persisted, and
 * returns the parsed Numbers alongside, so the caller can write the
 * normalised values without parsing a second time.
 *
 * Nested rows are judged as they arrive. Unlike the editor's pre-save
 * filtering, this does NOT skip blank-named rows: anything still present in
 * the object being handed to storage is something the caller intends to
 * persist, and a persisted row with a negative price is invalid regardless
 * of what its name says.
 *
 * On an UPDATE a patch legitimately omits price — a rename must not have to
 * restate it — so an absent price is skipped. On a CREATE it must be present:
 * an item persisted with no price at all is the same free-item hazard as one
 * persisted at 0, just harder to spot. Hence requirePrice.
 *
 * @param {object} data — { price?, choices?, paidAddOns? }
 * @param {{requirePrice?: boolean}} [options]
 * @returns {{ok:true, price:number|undefined, choices:Array|undefined,
 *            paidAddOns:Array|undefined}
 *          | {ok:false, reason:string, field:string}}
 */
export function validateItemPrices(data, opts = {}) {
  let price;
  if (data.price === undefined) {
    if (opts.requirePrice) {
      return { ok: false, reason: "missing_price", field: "price" };
    }
  } else {
    price = parseProductPrice(data.price);
    if (price === null) {
      return { ok: false, reason: "invalid_price", field: "price" };
    }
  }

  let choices;
  if (data.choices !== undefined) {
    if (!Array.isArray(data.choices)) {
      return { ok: false, reason: "invalid_choices", field: "choices" };
    }
    choices = [];
    for (const group of data.choices) {
      const options = [];
      for (const option of group?.options || []) {
        const optionPrice = parseChoiceOptionPrice(option?.price);
        if (optionPrice === null) {
          return {
            ok: false,
            reason: "invalid_option_price",
            field: `choices.${group?.id ?? "?"}.${option?.id ?? "?"}.price`,
          };
        }
        /* Spread first so every existing field — id above all — survives. */
        options.push({ ...option, price: optionPrice });
      }
      choices.push({ ...group, options });
    }
  }

  let paidAddOns;
  if (data.paidAddOns !== undefined) {
    if (!Array.isArray(data.paidAddOns)) {
      return { ok: false, reason: "invalid_add_ons", field: "paidAddOns" };
    }
    paidAddOns = [];
    for (const addOn of data.paidAddOns) {
      const addOnPrice = parseAddOnPrice(addOn?.price);
      if (addOnPrice === null) {
        return {
          ok: false,
          reason: "invalid_add_on_price",
          field: `paidAddOns.${addOn?.id ?? "?"}.price`,
        };
      }
      paidAddOns.push({ ...addOn, price: addOnPrice });
    }
  }

  return { ok: true, price, choices, paidAddOns };
}
