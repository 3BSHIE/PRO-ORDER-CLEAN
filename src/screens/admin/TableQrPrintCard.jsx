import { QRCodeSVG } from "qrcode.react";
import Logo from "../../components/brand/Logo.jsx";
import { translations } from "../../i18n/translations.js";
import { isValidHexColor, relativeLuminance, resolveHeadingFont } from "../../lib/theme.js";

/**
 * TableQrPrintCard — Phase 69. One A6 face of a physical table stand.
 *
 * Rendered twice for the same table, once per language, so the two faces can
 * be printed duplex onto a single insert or slipped back-to-back into a clear
 * stand. Because both faces come from this one component, their geometry
 * cannot drift apart: the logo zone, name zone, table zone, QR box and footer
 * occupy identical coordinates on both pages by construction, which is the
 * whole point when they become opposite sides of the same object.
 *
 * The language is a PROP, not the app's current language. A printed stand is
 * a physical artefact — it needs both faces regardless of what the Admin
 * happens to be viewing the software in — so this reads the translation table
 * directly rather than through useLanguage(). That is also why it uses no
 * hooks at all.
 *
 * The QR is identical on both faces: language belongs to the guest's session,
 * not to the URL, so there is exactly one token and one link per table.
 */

/* Direct table lookup, because this component must render Arabic while the
   Admin is in English and vice versa. Falls back to English, then to the
   supplied default, mirroring t()'s own resolution order. */
function translate(language, key, fallback) {
  const [ns, name] = key.split(".");
  const table = translations[language] || translations.en;
  const value = table?.[ns]?.[name];
  if (typeof value === "string") return value;
  const en = translations.en?.[ns]?.[name];
  return typeof en === "string" ? en : fallback;
}

/* Two digits reads as a deliberate label on a printed card — "TABLE 05"
   rather than "TABLE 5" — while anything above 99 is left alone. */
function padTableNumber(n) {
  const num = Number(n);
  return Number.isFinite(num) && num >= 0 && num < 10 ? `0${num}` : String(n);
}

/**
 * What to call this table on the card.
 *
 * A table whose display name is still the generated "Table 7" gets the
 * localised label, so the Arabic face reads الطاولة 07 rather than a stray
 * English string. A table the restaurant has actually named — "Terrace 3",
 * "Bar 2" — keeps that name verbatim on BOTH faces: it is what the staff and
 * the guests call it out loud, and translating or replacing it with a generic
 * number would make the card less useful, not more localised.
 */
function resolveTableLabel(table, language) {
  const displayName = (table.displayName || "").trim();
  const generic = `table ${table.tableNumber}`.toLowerCase();
  const isGenerated = displayName.toLowerCase() === generic || displayName === "";

  if (isGenerated) {
    return `${translate(language, "print.table", "Table")} ${padTableNumber(table.tableNumber)}`;
  }
  return displayName;
}

/**
 * The restaurant's accent, but only when it will survive a printer.
 *
 * A pale brand colour that looks right on a dark admin screen becomes
 * unreadable as small text on white paper, so anything too light is dropped
 * for a neutral ink instead. §17 asks for exactly this trade: the accent is a
 * nicety, legibility is not.
 */
const MAX_PRINT_LUMINANCE = 0.5;
const NEUTRAL_INK = "#1a1a1a";

function printAccent(primaryColor) {
  if (!isValidHexColor(primaryColor)) return NEUTRAL_INK;
  return relativeLuminance(primaryColor) > MAX_PRINT_LUMINANCE ? NEUTRAL_INK : primaryColor;
}

/**
 * @param {object}  restaurant  — { name }
 * @param {object}  settings    — restaurant settings (name override, logoUrl, theme)
 * @param {object}  table       — { tableNumber, displayName }
 * @param {string}  qrUrl       — the single customer URL, shared with View QR / Copy Link
 * @param {"en"|"ar"} language
 */
export default function TableQrPrintCard({ restaurant, settings, table, qrUrl, language }) {
  const isArabic = language === "ar";
  const restaurantName = (settings?.name || "").trim() || restaurant.name;
  const logoUrl = (settings?.logoUrl || "").trim();
  const accent = printAccent(settings?.primaryColor);
  const headingFont = resolveHeadingFont(settings?.headingFont);

  return (
    /* lang + dir are set per card, not inherited, so the Arabic face shapes
       and aligns correctly even while the Admin UI is in English. */
    <div className="qr-stand" lang={language} dir={isArabic ? "rtl" : "ltr"}>
      <div className="qr-stand__top">
        {/* No logo, no placeholder: a restaurant without one gets a stronger
            name-only treatment rather than an empty box on a printed card. */}
        {logoUrl && (
          <img className="qr-stand__logo" src={logoUrl} alt="" aria-hidden="true" />
        )}
        <h1
          className="qr-stand__restaurant"
          style={{ color: accent, fontFamily: `var(--font-heading-${headingFont}, inherit)` }}
        >
          {restaurantName}
        </h1>
        <span className="qr-stand__rule" style={{ background: accent }} aria-hidden="true" />
        <p className="qr-stand__table">{resolveTableLabel(table, language)}</p>
      </div>

      {/* Pure black on pure white, never the restaurant's accent: a scanner
          reads reflectance, not branding. marginSize={4} carries the spec's
          quiet zone inside the SVG so it survives any surrounding restyle,
          and SVG keeps it vector at whatever DPI the printer runs. */}
      <div className="qr-stand__qr">
        <QRCodeSVG
          className="qr-stand__qr-svg"
          value={qrUrl}
          size={256}
          level="M"
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>

      {/* Below the QR, deliberately: the code is the thing being acted on,
          and the sentence explains it after the eye has already found it. */}
      <p className="qr-stand__scan">
        {translate(language, "admin.scanToOrder", "Scan to order")}
      </p>

      {/* Attribution, not advertising — the icon variant rather than the full
          wordmark logo, because the sentence beside it already says the name. */}
      <footer className="qr-stand__footer">
        <Logo variant="icon" size="nav" className="qr-stand__brand-logo" />
        <span className="qr-stand__powered">
          {translate(language, "common.poweredBy", "Powered by")} PRO·ORDER
        </span>
      </footer>
    </div>
  );
}
