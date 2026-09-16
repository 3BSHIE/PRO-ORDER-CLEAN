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

/* ── Phase 94.1 §19/§22 — restaurant Appearance ───────────────────────────
   A deliberate branding choice, NOT a day/night mode: nothing here reads the
   clock, the device setting or prefers-color-scheme (§21). The restaurant
   picks one and every surface obeys it.

   "dark" is the default and the fallback for anything unrecognised, which is
   what keeps every existing restaurant looking exactly as it does today —
   settings saved before this phase have no appearance field at all (§62). */
export const APPEARANCE_DARK = "dark";
export const APPEARANCE_LIGHT = "light";
export const DEFAULT_APPEARANCE = APPEARANCE_DARK;

export function resolveAppearance(value) {
  return value === APPEARANCE_LIGHT ? APPEARANCE_LIGHT : APPEARANCE_DARK;
}
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

/* ── Readable foreground on a themed fill (Phase 97.1) ────────────────────
   THE BUG THIS REPLACES: a single luminance threshold at 0.45 decided between
   dark and light text. A threshold is not a contrast measurement, and this one
   sat far from where the two candidates actually cross over (~0.196), so every
   colour in between was given light text when dark text read better. Measured
   on a mid green #2E9E6B: the threshold chose light at 3.19:1 where dark gives
   5.52:1 — a colour a restaurant could plausibly pick, rendered barely legible.

   So the choice is now made by COMPARING both candidates and keeping whichever
   actually reads better, per WCAG relative luminance. One helper, used for
   Primary, Secondary and the restaurant accent alike, so the three can never
   disagree about what "readable on this colour" means.

   The two candidates are warm rather than pure black/white: they belong to the
   product's palette, and pure #fff on a brand colour reads as a different
   design system. */
const ON_COLOR_DARK = "#181203";
const ON_COLOR_LIGHT = "#fff8e8";

/* Phase 97.1.1 — the escape hatch. The warm pair belongs to the palette, but
   it is warm precisely because it is not maximal, and on a saturated mid-tone
   that costs contrast the label cannot afford. Measured on #2E9E6B: the warm
   dark reaches 4.39:1, pure black 4.94:1. Readability outranks a warm tint on
   a filled control, so these are used whenever the preferred pair falls short
   of the target. */
const ON_COLOR_DARK_MAX = "#000000";
const ON_COLOR_LIGHT_MAX = "#ffffff";

/* WCAG AA for normal text. */
const CONTRAST_TARGET = 4.5;

/**
 * WCAG contrast ratio between two opaque colours. 1 = identical, 21 = max.
 *
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The better-reading of the two foreground candidates for one or more
 * backgrounds.
 *
 * Several backgrounds may be passed because a filled control is not always one
 * flat colour: the primary button is a GRADIENT, and a foreground that is
 * comfortable against its darker stop can be weak against its lighter one. The
 * winner is therefore the candidate with the best WORST-CASE contrast across
 * every surface it has to sit on, which is the only reading that guarantees
 * the label stays legible along the whole fill.
 *
 * Phase 97.1.1 — candidates are tried in two tiers. The warm pair is
 * PREFERRED and wins whenever it clears the target, so the ordinary case keeps
 * the palette's warmth. Only when neither warm candidate reaches 4.5:1 does
 * this fall back to pure black/white, and only if that actually improves the
 * result. A 3.x:1 label is never kept when black or white can solve it.
 *
 * Some gradients genuinely cannot reach the target with ANY flat foreground —
 * a saturated mid-blue lightened 18% toward white sits in a band where black
 * and white are both mediocre. In that case the mathematically strongest
 * candidate is returned rather than a worse-but-warmer one.
 *
 * @param {...string} backgrounds — hex colours the text will sit on
 * @returns {string} the best available foreground
 */
export function readableForegroundOn(...backgrounds) {
  const usable = backgrounds.filter(isValidHexColor);
  if (usable.length === 0) return ON_COLOR_DARK;

  const worstCase = (fg) => Math.min(...usable.map((bg) => contrastRatio(fg, bg)));
  const best = (candidates) =>
    candidates
      .map((fg) => ({ fg, contrast: worstCase(fg) }))
      .reduce((a, b) => (b.contrast > a.contrast ? b : a));

  const preferred = best([ON_COLOR_DARK, ON_COLOR_LIGHT]);
  if (preferred.contrast >= CONTRAST_TARGET) return preferred.fg;

  const fallback = best([ON_COLOR_DARK_MAX, ON_COLOR_LIGHT_MAX]);
  return fallback.contrast > preferred.contrast ? fallback.fg : preferred.fg;
}

/* The primary button's gradient, at full span. */
const BTN_PRIMARY_LIGHTEN = 0.18;
const BTN_PRIMARY_DARKEN = 0.12;

/* Phase 97.1.2 — how far the span may be pulled in when contrast demands it.
   1 is the approved gradient; 0 is a flat fill of the raw primary. Tried in
   order, so a colour gives up only as much decoration as it must. */
const GRADIENT_SPAN_STEPS = [1, 0.75, 0.5, 0.25, 0];

/**
 * The primary button's gradient AND the foreground that sits on it.
 *
 * ── WHY THE GRADIENT ADAPTS (Phase 97.1.2) ───────────────────────────────
 * Phase 97.1.1 could pick the best of four foregrounds but still could not
 * save two colours: #2F6FED reached 3.76:1 and #7C3AED 4.13:1. Both read
 * fine against the RAW primary (4.62 and 5.70) — it was the GRADIENT that
 * beat them. A span that lightens 18% and darkens 12% covers enough
 * luminance that one flat foreground cannot serve both ends, and the failing
 * end is whichever the chosen foreground is closest to.
 *
 * So the span is now a variable, not a constant. The approved gradient is
 * tried first and kept whenever it works — which is the common case, so safe
 * colours render exactly as before. Only a colour that would otherwise ship
 * unreadable text gives up span, and only as much as it needs: a quarter, a
 * half, or in the worst case a flat fill of the colour the restaurant chose.
 *
 * The primary itself is never altered. Narrowing moves the STOPS toward the
 * selected colour, so the button stays centred on it and stays in its hue —
 * a narrower blue, never a pale blue or a navy.
 *
 * Returns the stops as hex, and those exact strings are what the stylesheet
 * paints — the contrast decision and the rendered pixels come from one value
 * rather than from parallel color-mix() arithmetic that could drift.
 *
 * @param {string} primary — a validated hex
 * @returns {{from:string, to:string, foreground:string, contrast:number, span:number}}
 */
export function buildPrimaryGradient(primary) {
  let best = null;

  for (const span of GRADIENT_SPAN_STEPS) {
    const from = mixHex(primary, "#ffffff", BTN_PRIMARY_LIGHTEN * span);
    const to = mixHex(primary, "#000000", BTN_PRIMARY_DARKEN * span);
    const foreground = readableForegroundOn(from, to, primary);
    const contrast = Math.min(
      contrastRatio(foreground, from),
      contrastRatio(foreground, to),
      contrastRatio(foreground, primary)
    );

    if (!best || contrast > best.contrast) best = { from, to, foreground, contrast, span };
    if (contrast >= CONTRAST_TARGET) return { from, to, foreground, contrast, span };
  }

  /* Nothing reached the target — a fully saturated mid-tone can be beyond any
     flat foreground even as a flat fill. Hand back the strongest attempt
     rather than a prettier but less readable one. */
  return best;
}

/**
 * A version of `color` that is readable against `surface`, moved as little as
 * possible.
 *
 * Used for a theme colour rendered as TEXT on a neutral surface, where the
 * colour itself is the thing being read rather than a fill behind something
 * else. It walks toward white on a dark surface (or black on a light one) and
 * stops the moment the target is met, so the hue survives and the accent
 * still looks like the restaurant's colour.
 *
 * @param {string} color
 * @param {string} surface
 * @param {number} [target]
 * @returns {string} hex
 */
export function readableInkOn(color, surface, target = CONTRAST_TARGET) {
  if (!isValidHexColor(color) || !isValidHexColor(surface)) return color;
  if (contrastRatio(color, surface) >= target) return color;

  const anchor = relativeLuminance(surface) < 0.5 ? "#ffffff" : "#000000";
  let best = color;
  let bestContrast = contrastRatio(color, surface);

  for (let amount = 0.05; amount <= 1.0001; amount += 0.05) {
    const candidate = mixHex(color, anchor, amount);
    const contrast = contrastRatio(candidate, surface);
    if (contrast > bestContrast) {
      best = candidate;
      bestContrast = contrast;
    }
    if (contrast >= target) return candidate;
  }
  return best;
}

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

    /* One call decides the stops and the label colour together, because the
       two cannot be chosen independently — narrowing the span changes which
       foreground wins. These hex values are what the stylesheet paints. */
    const gradient = buildPrimaryGradient(primary);
    vars["--btn-primary-from"] = gradient.from;
    vars["--btn-primary-to"] = gradient.to;
    vars["--on-primary"] = gradient.foreground;

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
    /* ── Phase 97.1.1 — the surface tint is a DARK-palette treatment ──────
       These three mix the accent into a hardcoded near-black base, and they
       are emitted onto the theme wrapper — a descendant of :root — so they
       beat the light appearance block on specificity. The result, for any
       restaurant with a custom Secondary in Light mode, was a cream PAGE with
       near-black CARDS. Measured before the fix with accent #8b6565:
       --surface-1 resolved to color-mix(#8b6565 16%, #101012).

       The tint has no light-palette equivalent — mixing a dark accent into a
       cream base at these ratios would simply dirty the surfaces — so it is
       now emitted only for the appearance it was designed for. In Light the
       accent keeps every one of its other visible roles (borders, hairlines,
       soft tints, the neutral badge's ink); it just stops repainting the
       page. */
    if (resolveAppearance(settings.appearance) === APPEARANCE_DARK) {
      /* Computed rather than emitted as color-mix() so the tinted surface is
         a value this module can also MEASURE against — see the ink below. */
      const surface1 = mixHex(accent, "#101012", 0.84);
      const surface2 = mixHex(accent, "#17171a", 0.86);
      const surface3 = mixHex(accent, "#1f1f23", 0.88);
      vars["--surface-1"] = surface1;
      vars["--surface-2"] = surface2;
      vars["--surface-3"] = surface3;

      /* ── Phase 97.1.2 §10/§11 — the neutral badge ─────────────────────
         Secondary is rendered as TEXT on surface-2 by .badge--neutral. The
         legible accent is tuned against the STANDARD dark surfaces, but a
         themed surface-2 carries the accent's own hue, which pushes the two
         closer together: with accent #8b6565 the pair measured 4.05:1.

         So the ink is nudged against the surface it will actually sit on,
         and only as far as the target requires. --secondary-accent is left
         alone, so borders, hairlines and every soft treatment keep the exact
         colour they had (§12) — this moves the text derivative only. */
      vars["--secondary-ink"] = readableInkOn(secondary, surface2);
    }

    /* Three variables for restaurant-accented DETAIL — used by the Restaurant
       Info surface, and available to anything else that wants a branded
       highlight without touching a semantic colour (§9, §12). The foreground
       flips by the same luminance measure the primary already uses, so text
       on the accent is never near-invisible whichever colour is chosen. */
    /* Kept for compatibility, but pointed at the DERIVED secondary so the
       Restaurant Info sheet and the new secondary roles below are visibly the
       same colour rather than two different readings of one field. */
    vars["--restaurant-accent"] = secondary;
    vars["--restaurant-accent-foreground"] = readableForegroundOn(secondary);
    vars["--restaurant-accent-soft"] = `color-mix(in srgb, ${secondary} 18%, transparent)`;
    vars["--restaurant-accent-line"] = `color-mix(in srgb, ${secondary} 40%, transparent)`;

    /* ── Phase 97.1.1 §5/§6 — raw Secondary is the source of truth ────────
       THE BEHAVIOUR THIS REPLACES: --secondary held the DERIVED value, so a
       manager who chose #0d1b3a navy got #4280e6 — a different colour, two
       thirds lighter. deriveSecondaryColor exists for good reason (a near
       black hairline on a near black card is invisible), but lifting the
       colour for that role should not redefine what the restaurant chose.

       So the two concepts are now separate tokens:

         --secondary          EXACTLY what the manager saved. The canonical
                              value, and what a direct filled Secondary
                              surface must paint.
         --secondary-accent   the legibility-adjusted form, which is what the
                              derived roles below are built from — soft tints,
                              hairlines, card and input borders, the neutral
                              badge's ink.

       Nothing consumed --secondary directly before this change, so promoting
       it to the raw value cannot alter any existing surface; it makes the
       token honest and gives a future filled-Secondary control something
       truthful to paint. */
    vars["--secondary-accent"] = secondary;

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
    /* The manager's exact choice, untouched. */
    vars["--secondary"] = accent;
    /* Derived, soft roles keep building from the legible form. */
    vars["--secondary-soft"] = `color-mix(in srgb, ${secondary} 13%, transparent)`;
    vars["--secondary-line"] = `color-mix(in srgb, ${secondary} 38%, transparent)`;
    /* §9 — computed against the TRUE secondary, because that is the colour a
       filled Secondary surface actually paints. Judging it against the lifted
       accent would answer a question about a colour nobody sees. */
    vars["--on-secondary"] = readableForegroundOn(accent);

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
