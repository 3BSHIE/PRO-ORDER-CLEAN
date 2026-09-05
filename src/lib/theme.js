/**
 * theme — Phase 31. Turns a restaurant's saved theme settings into the CSS
 * custom properties the customer screens consume.
 *
 * ── What already existed (audited before writing this) ────────────────────
 *   settingsData.js has stored `primaryColor` and `accentColor` since Phase
 *   23, and AdminSettingsScreen has shown a small branding swatch using them.
 *   Nothing ever applied them to the customer experience — the model and the
 *   preview existed, the consumer did not. This module is that missing
 *   consumer, plus the two typography fields the phase adds. No second theme
 *   system is introduced: the same settings record, the same save flow.
 *
 * ── The override-only-when-changed rule ───────────────────────────────────
 *   A variable is emitted ONLY when the restaurant's value differs from the
 *   shipped default. A restaurant that never opens the Theme section
 *   therefore gets an empty style object and renders byte-identical CSS to
 *   Phase 30. That makes "the default theme still looks exactly like before"
 *   true by construction rather than by carefully re-deriving the same
 *   colours — which colour-mixing could not reproduce exactly anyway.
 *
 * ── Safety, deliberately simple ───────────────────────────────────────────
 *   Malformed values are ignored (fall back to default). The one real risk —
 *   an accent so light that the app's cream text vanishes on it — is handled
 *   with a single luminance threshold, and the text colour that sits ON the
 *   primary flips between dark and light by the same measure. That is the
 *   whole safeguard: no contrast engine, no auto-palette generation.
 */

/* Shipped defaults. These MUST match settingsData.js and global.css :root. */
export const DEFAULT_PRIMARY_COLOR = "#d4a94e";
export const DEFAULT_ACCENT_COLOR = "#0d0d0d";
export const DEFAULT_HEADING_FONT = "playfair";
export const DEFAULT_BODY_FONT = "dmSans";

/* Arabic-capable fallbacks appended to every stack.
 *
 * None of the Latin display faces below carry Arabic glyphs. Browsers do
 * per-glyph fallback, so without an explicit Arabic-capable entry the Arabic
 * menu would render in whatever arbitrary font the OS picked last. Naming the
 * fallbacks makes Arabic readable no matter which Latin font an admin
 * chooses, while Latin text still renders in the chosen face. */
const AR_SERIF = `"Noto Naskh Arabic","Segoe UI",Tahoma,Georgia,serif`;
const AR_SANS = `"Noto Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif`;

/** Curated heading faces. Keys are what gets stored in settings. */
export const HEADING_FONTS = {
  playfair: { labelKey: "admin.fontPlayfair", stack: `'Playfair Display',${AR_SERIF}` },
  dmSerif: { labelKey: "admin.fontDmSerif", stack: `'DM Serif Display',${AR_SERIF}` },
  georgia: { labelKey: "admin.fontGeorgia", stack: AR_SERIF },
};

/** Curated body faces. */
export const BODY_FONTS = {
  dmSans: { labelKey: "admin.fontDmSans", stack: `'DM Sans',${AR_SANS}` },
  inter: { labelKey: "admin.fontInter", stack: `'Inter',${AR_SANS}` },
  system: { labelKey: "admin.fontSystem", stack: `ui-sans-serif,system-ui,${AR_SANS}` },
};

/** Strict 6-digit hex — what <input type="color"> always produces. */
export function isValidHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/**
 * Relative luminance (0 = black, 1 = white), sRGB-weighted.
 * Used for exactly two decisions; see the safeguards note above.
 */
export function relativeLuminance(hex) {
  if (!isValidHexColor(hex)) return 0;
  const value = hex.trim().slice(1);
  const toLinear = (channel) => {
    const c = parseInt(channel, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(value.slice(0, 2));
  const g = toLinear(value.slice(2, 4));
  const b = toLinear(value.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* Above this, a colour is "light" and needs dark text on top of it. Below,
   light text. 0.45 sits comfortably either side of the default gold (~0.45
   is near the perceptual midpoint for this palette). */
const LIGHT_TEXT_THRESHOLD = 0.45;

/* ── Customer brand-mark colour (Phase 83) ─────────────────────────────────
   The animated PRO·ORDER loading mark needs a colour of its own: the same
   family as the restaurant's accent, but deeper and richer than the CTA so the
   two never read as the same element (§3).

   Why this is a search and not a subtraction. The obvious implementation —
   "mix 22% black into the primary" — is one fixed step that behaves completely
   differently depending on where you start. On the default gold it lands
   nicely. On a near-black brand colour it produces something invisible against
   the customer canvas, and on white it barely moves. §29 asks for an
   adjustment chosen by CONTRAST rather than a blind offset, so this aims at a
   luminance TARGET instead and solves for the mix that reaches it.

   The target is proportional (a little over half the primary's luminance, so
   the relationship "deeper than the CTA" holds for any hue) but clamped into a
   band:

     MIN — below this the mark starts disappearing into the dark customer
           surfaces, so a very dark brand colour is mixed toward WHITE instead.
           The mark stays in the restaurant's hue family and stays visible,
           which matters more than being literally darker than an unusable CTA.
     MAX — above this the mark would compete with the CTA it is supposed to sit
           behind, so a very light brand colour is pulled down into the band.

   The result is one exported helper and one CSS variable; the brighter
   "energy" shade the travelling highlight uses is derived from it in CSS with
   color-mix, so there is a single source of truth for the mark's colour (§3). */

const BRAND_MARK_MIN_LUMINANCE = 0.16;
const BRAND_MARK_MAX_LUMINANCE = 0.34;
/* How much of the primary's luminance the mark keeps before clamping. Chosen
   so the shipped gold lands where it was designed to: see the exported
   DEFAULT_BRAND_MARK_COLOR below. */
const BRAND_MARK_DEPTH = 0.58;

function hexToRgb(hex) {
  const v = hex.trim().slice(1);
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb) {
  return (
    "#" +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Mix `amount` (0–1) of `anchor` into `hex`. amount 0 = hex, 1 = anchor. */
function mixHex(hex, anchor, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(anchor);
  return rgbToHex(a.map((channel, i) => channel + (b[i] - channel) * amount));
}

/**
 * The customer brand-mark colour for one restaurant primary.
 *
 * @param {string} primaryColor — settings.primaryColor (any value; invalid
 *   input falls back to the shipped gold rather than throwing)
 * @returns {string} a 6-digit hex in the same family, deeper than the CTA and
 *   guaranteed to sit inside the visible luminance band above
 */
export function deriveBrandMarkColor(primaryColor) {
  const primary = isValidHexColor(primaryColor) ? primaryColor.trim() : DEFAULT_PRIMARY_COLOR;
  const luminance = relativeLuminance(primary);

  const target = Math.min(
    Math.max(luminance * BRAND_MARK_DEPTH, BRAND_MARK_MIN_LUMINANCE),
    BRAND_MARK_MAX_LUMINANCE
  );

  /* Which way we have to travel decides HOW we travel, and the two directions
     genuinely want different operations:

       deepening — mixing toward black keeps the hue and simply removes light,
         which is exactly what "richer" means for a normal brand colour.

       lightening — mixing toward WHITE would wash the hue out. A near-black
         green mixed with white lands on grey-green (#627364), which is the
         restaurant's hue in name only. Scaling the channels proportionally
         instead lifts the colour along its own ray from black, so #0f2a12
         brightens to an actual green. Scaling can overflow a channel on an
         already-bright hue, and in that case there is no headroom left and
         mixing toward white is the only way up — so that stays as the
         fallback. */
  const towardLight = target > luminance;

  if (towardLight) {
    const scaled = solveScaled(primary, target);
    if (scaled) return scaled;
  }

  /* Luminance is monotonic along a straight RGB mix toward a single anchor, so
     a short bisection lands on the target far more accurately than any fixed
     ratio could, for every possible input. 20 steps is well past the precision
     an 8-bit channel can express. */
  const anchor = towardLight ? "#ffffff" : "#000000";
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const amount = (lo + hi) / 2;
    const candidate = relativeLuminance(mixHex(primary, anchor, amount));
    const overshot = towardLight ? candidate > target : candidate < target;
    if (overshot) hi = amount;
    else lo = amount;
  }

  return mixHex(primary, anchor, (lo + hi) / 2);
}

/**
 * Brighten by scaling all three channels by one factor, preserving the hue and
 * the channel ratios that carry the colour's saturation.
 *
 * @returns {string|null} the hex that hits `target`, or null when reaching it
 *   would push a channel past 255 (the caller then falls back to white-mixing)
 */
function solveScaled(hex, target) {
  const rgb = hexToRgb(hex);
  const peak = Math.max(...rgb);
  if (peak === 0) return null; // pure black has no ray to travel along

  const maxFactor = 255 / peak;
  if (relativeLuminance(rgbToHex(rgb.map((c) => c * maxFactor))) < target) return null;

  let lo = 1;
  let hi = maxFactor;
  for (let i = 0; i < 20; i += 1) {
    const factor = (lo + hi) / 2;
    if (relativeLuminance(rgbToHex(rgb.map((c) => c * factor))) > target) hi = factor;
    else lo = factor;
  }
  return rgbToHex(rgb.map((c) => c * ((lo + hi) / 2)));
}

/** The mark colour for the shipped gold, so global.css can carry it as the
    default without recomputing it at runtime for every unthemed restaurant. */
export const DEFAULT_BRAND_MARK_COLOR = deriveBrandMarkColor(DEFAULT_PRIMARY_COLOR);

/* ── Secondary colour (Phase 83.1, Finding #2) ─────────────────────────────
   accentColor has been stored since Phase 23 and, until now, did almost
   nothing you could see: it tinted the three dark surfaces by 12–16%, which
   is a hue you have to look for, and fed two variables only the Restaurant
   Info sheet read. A manager could set it to bright blue and the product
   looked the same. That is the "saves successfully but does nothing" defect
   this phase exists to fix — so the field keeps its name and its storage
   (§23) and gains real, visible roles instead.

   The raw value cannot be used directly for those roles. accentColor's whole
   original job was to tint near-black surfaces, so its default is #0d0d0d and
   managers may well pick something equally dark; painting a border or a label
   with that on a dark UI would be invisible. So the same luminance-targeting
   used for the brand mark is applied here, with a band chosen for a colour
   that has to read as a LINE or a LABEL against --surface-1/2/3 rather than
   as a large fill.

   The surface tint keeps using the RAW accent (see buildRestaurantThemeVars):
   that role wants the untouched hue mixed into near-black, and lifting it
   first would wash the tint out. One field, two derived uses, each honest
   about what it needs. */
const SECONDARY_MIN_LUMINANCE = 0.22;
const SECONDARY_MAX_LUMINANCE = 0.60;
const SECONDARY_DEPTH = 1.0;

/**
 * A usable secondary accent in the restaurant's own hue.
 *
 * @param {string} accentColor — settings.accentColor
 * @returns {string} hex, guaranteed legible against the dark customer/admin
 *   surfaces whatever the manager picked
 */
export function deriveSecondaryColor(accentColor) {
  const accent = isValidHexColor(accentColor) ? accentColor.trim() : DEFAULT_ACCENT_COLOR;
  const luminance = relativeLuminance(accent);
  const target = Math.min(
    Math.max(luminance * SECONDARY_DEPTH, SECONDARY_MIN_LUMINANCE),
    SECONDARY_MAX_LUMINANCE
  );

  const towardLight = target > luminance;
  if (towardLight) {
    const scaled = solveScaled(accent, target);
    if (scaled) return scaled;
  }

  const anchorColor = towardLight ? "#ffffff" : "#000000";
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const amount = (lo + hi) / 2;
    const candidate = relativeLuminance(mixHex(accent, anchorColor, amount));
    const overshot = towardLight ? candidate > target : candidate < target;
    if (overshot) hi = amount;
    else lo = amount;
  }
  return mixHex(accent, anchorColor, (lo + hi) / 2);
}

export function resolveHeadingFont(key) {
  return HEADING_FONTS[key] ? key : DEFAULT_HEADING_FONT;
}
export function resolveBodyFont(key) {
  return BODY_FONTS[key] ? key : DEFAULT_BODY_FONT;
}

/**
 * Build the COLOUR custom properties for one restaurant — the shared layer
 * every product surface consumes (Phase 83.1, Finding #4).
 *
 * Returns {} when everything is at its default — see the override-only rule.
 * That is what keeps an unthemed restaurant pixel-identical across all four
 * products while a themed one changes everywhere at once.
 *
 * @param {object} settings — the restaurant settings record
 * @returns {object} React style object of `--var` entries
 */
export function buildRestaurantThemeVars(settings) {
  const vars = {};
  if (!settings) return vars;

  /* ── Primary accent ────────────────────────────────────────────────────
     Drives the whole gold family plus the primary button gradient. The
     derived shades use color-mix(), which this stylesheet already relies on
     elsewhere, so one picked colour yields a coherent set rather than a flat
     block of one hue. */
  const primary = settings.primaryColor;
  if (isValidHexColor(primary) && primary.toLowerCase() !== DEFAULT_PRIMARY_COLOR) {
    vars["--gold"] = primary;
    vars["--gold-bright"] = `color-mix(in srgb, ${primary} 72%, #ffffff)`;
    vars["--gold-soft"] = `color-mix(in srgb, ${primary} 13%, transparent)`;
    vars["--gold-line"] = `color-mix(in srgb, ${primary} 35%, transparent)`;

    vars["--btn-primary-from"] = `color-mix(in srgb, ${primary} 82%, #ffffff)`;
    vars["--btn-primary-to"] = `color-mix(in srgb, ${primary} 88%, #000000)`;

    /* Text sitting ON the primary colour flips with its lightness, so a dark
       brand colour does not end up with near-black label text. */
    vars["--on-primary"] =
      relativeLuminance(primary) > LIGHT_TEXT_THRESHOLD ? "#181203" : "#fff8e8";

    /* Phase 83 — the animated loading mark follows the restaurant's family
       too, so a venue on green does not get a gold PRO·ORDER mark. Emitted
       only here, inside the same override-only rule as everything else: a
       restaurant at the default primary inherits the default mark colour from
       the stylesheet instead. */
    vars["--brand-mark"] = deriveBrandMarkColor(primary);
  }

  /* ── Surface accent ────────────────────────────────────────────────────
     Phase 81 — this field was stored and wired since Phase 31, but behind a
     luminance gate so tight (<= 0.12) that almost anything a manager might
     pick was silently ignored. The setting looked broken because for most
     inputs it did nothing at all.

     The gate is gone. Its job — keeping the cream text legible — is now done
     by the DERIVATION instead: the accent is mixed into the near-black base
     at a small fixed ratio, so the surfaces take the restaurant's HUE while
     their lightness stays where the type was designed to sit. A hot pink
     accent tints the charcoal warm; it cannot turn the page pink. That is
     what makes the field truthful for every value without needing a contrast
     engine (§12), and it keeps the accent's original meaning rather than
     inventing a second one (§10): primaryColor is the brand accent that
     drives gold and CTAs, accentColor is the surface tint.

     The three steps keep their relative ladder, so cards still read as raised
     above the page. */
  const accent = settings.accentColor;
  if (isValidHexColor(accent) && accent.toLowerCase() !== DEFAULT_ACCENT_COLOR) {
    /* Phase 83.1 — the derived, legible form of the same hue. See
       deriveSecondaryColor for why the raw value cannot carry these roles. */
    const secondary = deriveSecondaryColor(accent);
    /* Deliberately small proportions. Enough to be seen against the default
       charcoal, nowhere near enough to move the surfaces out of the dark band
       the whole customer palette assumes. */
    vars["--surface-1"] = `color-mix(in srgb, ${accent} 16%, #101012)`;
    vars["--surface-2"] = `color-mix(in srgb, ${accent} 14%, #17171a)`;
    vars["--surface-3"] = `color-mix(in srgb, ${accent} 12%, #1f1f23)`;

    /* Three variables for restaurant-accented DETAIL — used by the Restaurant
       Info surface, and available to anything else that wants a branded
       highlight without touching a semantic colour (§9, §12). The foreground
       flips by the same luminance measure the primary already uses, so text
       on the accent is never near-invisible whichever colour is chosen. */
    /* Kept for compatibility, but pointed at the DERIVED secondary so the
       Restaurant Info sheet and the new secondary roles below are visibly the
       same colour rather than two different readings of one field. */
    vars["--restaurant-accent"] = secondary;
    vars["--restaurant-accent-foreground"] =
      relativeLuminance(secondary) > LIGHT_TEXT_THRESHOLD ? "#141414" : "#f6f1e6";
    vars["--restaurant-accent-soft"] = `color-mix(in srgb, ${secondary} 18%, transparent)`;
    vars["--restaurant-accent-line"] = `color-mix(in srgb, ${secondary} 40%, transparent)`;

    /* ── The secondary family (Phase 83.1, Finding #2) ──────────────────
       Deliberately mapped onto roles that are ACHROMATIC today — hairlines,
       card and input edges, neutral badges, supporting labels. Two reasons:

         1. a restaurant at the default accent renders byte-identical to
            before, because the stylesheet's fallbacks below hold the exact
            current literals and these overrides are only emitted when the
            manager has actually changed the colour;
         2. nothing is taken away from Primary. Secondary earns visibility by
            colouring what was previously grey, not by demoting the CTA
            colour — which keeps §3's "Primary remains the stronger action
            colour" true by construction.

       The effect is broad but quiet: every input edge, card hairline, divider
       and neutral chip across Customer, Admin, Cashier and Kitchen picks up
       the restaurant's second colour. */
    vars["--secondary"] = secondary;
    vars["--secondary-soft"] = `color-mix(in srgb, ${secondary} 13%, transparent)`;
    vars["--secondary-line"] = `color-mix(in srgb, ${secondary} 38%, transparent)`;
    vars["--on-secondary"] =
      relativeLuminance(secondary) > LIGHT_TEXT_THRESHOLD ? "#141414" : "#f6f1e6";

    vars["--border"] = `color-mix(in srgb, ${secondary} 15%, transparent)`;
    vars["--border-strong"] = `color-mix(in srgb, ${secondary} 32%, transparent)`;
  }

  return vars;
}

/**
 * The customer experience's variables: every colour above, PLUS the
 * restaurant's chosen typography.
 *
 * Phase 83.1 — the split is the point. Finding #4 asks for the restaurant's
 * COLOURS across all four products, and §4 of the same brief asks that
 * existing typography be preserved. So Admin, Cashier and Kitchen consume
 * buildRestaurantThemeVars and keep the PRO·ORDER faces they were designed
 * in, while the customer surface — the one the guest sees and the one the
 * fonts were chosen for — gets both.
 *
 * @param {object} settings — the restaurant settings record
 * @returns {object} React style object of `--var` entries
 */
export function buildCustomerThemeVars(settings) {
  const vars = buildRestaurantThemeVars(settings);
  if (!settings) return vars;

  /* Every stack ends in Arabic-capable fallbacks (see AR_SERIF / AR_SANS), so
     Arabic stays readable whichever Latin face is chosen. */
  const headingKey = resolveHeadingFont(settings.headingFont);
  if (headingKey !== DEFAULT_HEADING_FONT) {
    vars["--font-display"] = HEADING_FONTS[headingKey].stack;
  }

  const bodyKey = resolveBodyFont(settings.bodyFont);
  if (bodyKey !== DEFAULT_BODY_FONT) {
    vars["--font-body"] = BODY_FONTS[bodyKey].stack;
  }

  return vars;
}

/**
 * The theme-only fields, at their shipped defaults. Used by "Reset to
 * Default" so it can restore the look WITHOUT touching restaurant identity,
 * business, language, payment, contact, or hours settings.
 */
export function defaultThemeFields() {
  return {
    primaryColor: DEFAULT_PRIMARY_COLOR,
    accentColor: DEFAULT_ACCENT_COLOR,
    headingFont: DEFAULT_HEADING_FONT,
    bodyFont: DEFAULT_BODY_FONT,
  };
}

/** True when the given settings are already fully at the default theme. */
export function isDefaultTheme(settings) {
  if (!settings) return true;
  const defaults = defaultThemeFields();
  return (
    (settings.primaryColor || "").toLowerCase() === defaults.primaryColor &&
    (settings.accentColor || "").toLowerCase() === defaults.accentColor &&
    resolveHeadingFont(settings.headingFont) === defaults.headingFont &&
    resolveBodyFont(settings.bodyFont) === defaults.bodyFont
  );
}
