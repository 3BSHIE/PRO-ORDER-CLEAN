import { FlaskConical, Power } from "lucide-react";
/* ?inline hands the stylesheet over as a STRING instead of having Vite
   extract it into the product's stylesheet. Injected below, once, at
   runtime — so when this module is tree-shaken out of a production build
   its styles leave with it and dist/ carries no trace of the harness. A
   plain CSS import would have left ~1.3 kB of dead rules behind. */
import qaStyles from "./qaPreview.css?inline";

/* ═══════════════════════════════════════════════════════════════════════════
   QaPreviewBadge — Phase 111.3  ·  DEVELOPMENT ONLY

   Whatever a reader is looking at, they must be able to tell in one glance
   whether the money on screen is the restaurant's or the fixture's. The same
   marker therefore appears on every surface the fixture can reach: the
   analytics section, the breakdown overlay and both printed report pages.

   ── WHY THE LABEL IS BILINGUAL ALWAYS ───────────────────────────────────
   It names itself in English AND Arabic regardless of the interface
   language. The report is one document with an English page and an Arabic
   page, so a marker that followed the interface would be missing from one
   of the two; printing both on every instance keeps one component honest
   everywhere.

   ── WHY ITS STRINGS ARE NOT TRANSLATION KEYS ────────────────────────────
   A development-only artefact has no business in the product's string
   table. Both languages are stated here, in the module that is deleted when
   the harness is.

   ── HOW IT LEAVES PRODUCTION ────────────────────────────────────────────
   Every reference to these components, in every screen, sits behind
   `import.meta.env.DEV &&`. Vite replaces that with the literal `false`, the
   branch folds, the last reference disappears and this module — with its
   stylesheet — is tree-shaken out of the build.
   ═══════════════════════════════════════════════════════════════════════ */

/* Appended on first use rather than at import time, so merely loading the
   module in a test or a tool does not touch the document. */
const STYLE_ID = "qa-preview-dev-styles";
function ensureQaStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = qaStyles;
  document.head.appendChild(tag);
}

export const QA_LABEL_EN = "QA PREVIEW";
export const QA_LABEL_AR = "بيانات تجريبية";

/* One sentence, in both languages, for the places that have room for one. */
const QA_SENTENCE = {
  en: "Sample data generated for quality assurance — not a record of business revenue.",
  ar: "بيانات تجريبية أُنشئت لأغراض الاختبار — ليست سجلاً لإيرادات المطعم.",
};

/** The inline marker. `tone="paper"` is the flat variant for the report. */
export function QaPreviewBadge({ tone = "screen", className = "" }) {
  ensureQaStyles();
  return (
    <span className={`qa-badge qa-badge--${tone} ${className}`.trim()}>
      <FlaskConical size={12} strokeWidth={2.2} aria-hidden="true" />
      <span lang="en">{QA_LABEL_EN}</span>
      <span className="qa-badge__sep" aria-hidden="true">·</span>
      <span lang="ar" dir="rtl">{QA_LABEL_AR}</span>
    </span>
  );
}

/**
 * The switch itself. Off by default; turning it on swaps ONLY the Revenue
 * Analytics read path, and turning it off restores the real figures
 * immediately, with nothing to undo.
 */
export function QaPreviewToggle({ active, onChange }) {
  ensureQaStyles();
  return (
    <button
      type="button"
      className={`qa-toggle${active ? " qa-toggle--on" : ""}`}
      onClick={() => onChange(!active)}
      aria-pressed={active}
      title={
        active
          ? "Development only — Revenue Analytics is showing a synthetic QA dataset. Press to return to this restaurant's real figures."
          : "Development only — show a synthetic QA dataset in Revenue Analytics."
      }
    >
      {active
        ? <Power size={12} strokeWidth={2.4} aria-hidden="true" />
        : <FlaskConical size={12} strokeWidth={2.2} aria-hidden="true" />}
      {active ? "Exit QA preview" : "QA preview"}
    </button>
  );
}

/**
 * The strip under the report masthead, in that page's own language.
 *
 * Placed in the document body rather than in the toolbar so it is part of
 * what prints and part of what the PDF rasterises — the toolbar is removed
 * from both.
 */
export function QaPaperNotice({ language = "en" }) {
  const isArabic = language === "ar";
  return (
    <p className="qa-paper-note" lang={language} dir={isArabic ? "rtl" : "ltr"}>
      <QaPreviewBadge tone="paper" />
      <span className="qa-paper-note__text">
        {isArabic ? QA_SENTENCE.ar : QA_SENTENCE.en}
      </span>
    </p>
  );
}

/**
 * The wash across the page.
 *
 * The strip above can be cropped out of a screenshot or scrolled past; this
 * cannot. aria-hidden because the strip already says the same thing in real
 * text, so a screen reader is told once rather than twice.
 */
export function QaPaperWatermark() {
  ensureQaStyles();
  return (
    <div className="qa-watermark" aria-hidden="true">
      <span>{QA_LABEL_EN}</span>
    </div>
  );
}
