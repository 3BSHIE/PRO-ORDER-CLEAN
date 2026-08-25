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

/* An accent is only allowed to tint customer surfaces when it is genuinely
   dark; the app's text palette is cream and would disappear on a light
   surface. A lighter pick is simply ignored for surfaces (the primary colour
   still applies), which is the "sensible safeguard" this phase asks for
   rather than an accessibility engine. */
const MAX_SURFACE_LUMINANCE = 0.12;

export function resolveHeadingFont(key) {
  return HEADING_FONTS[key] ? key : DEFAULT_HEADING_FONT;
}
export function resolveBodyFont(key) {
  return BODY_FONTS[key] ? key : DEFAULT_BODY_FONT;
}

/**
 * Build the inline style object of CSS custom properties for one restaurant's
 * customer experience.
 *
 * Returns {} when everything is at its default — see the override-only rule.
 *
 * @param {object} settings — the restaurant settings record
 * @returns {object} React style object of `--var` entries
 */
export function buildCustomerThemeVars(settings) {
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
  }

  /* ── Surface accent ────────────────────────────────────────────────────
     Only honoured when dark enough to keep the cream text legible. The three
     surface steps keep their relative ladder by mixing progressively more
     white in, so cards still read as raised above the page. */
  const accent = settings.accentColor;
  if (
    isValidHexColor(accent) &&
    accent.toLowerCase() !== DEFAULT_ACCENT_COLOR &&
    relativeLuminance(accent) <= MAX_SURFACE_LUMINANCE
  ) {
    vars["--surface-1"] = `color-mix(in srgb, ${accent} 92%, #ffffff)`;
    vars["--surface-2"] = `color-mix(in srgb, ${accent} 87%, #ffffff)`;
    vars["--surface-3"] = `color-mix(in srgb, ${accent} 80%, #ffffff)`;
  }

  /* ── Typography ────────────────────────────────────────────────────────
     Every stack ends in Arabic-capable fallbacks (see AR_SERIF / AR_SANS), so
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
