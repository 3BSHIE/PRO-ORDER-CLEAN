import { FileText, ArrowRight } from "lucide-react";
import { useLanguage } from "../../i18n/useLanguage.js";

/* ═══════════════════════════════════════════════════════════════════════════
   RevenueReportCard — Phase 111.1

   The third card in the bottom row, and the only one that is an ACTION
   rather than a statistic. Top Selling Items and Peak Times answer
   questions; this one leaves the dashboard.

   ── WHY IT LOOKS DIFFERENT ──────────────────────────────────────────────
   It carries a tint of the restaurant's primary colour and a filled button,
   where its neighbours are plain panels of figures. That difference is the
   point: a card that looked identical to the two beside it would read as a
   third table the reader had somehow failed to fill in.

   ── THE COLOUR IS THE RESTAURANT'S, NOT A HOUSE GOLD ────────────────────
   Everything here is drawn from --gold and its derivations, which theme.js
   writes from settings.primaryColor on .restaurant-theme — so a venue
   configured green gets a green card and a green button with no code change
   and no second colour setting. --gold-ink rather than raw --gold is used
   for text, because that is the derivation Phase 97.1 clamps for contrast
   on light surfaces; the raw colour is kept for the filled button, whose
   label sits on it rather than beside it.
   ═══════════════════════════════════════════════════════════════════════ */

export default function RevenueReportCard({ onOpen }) {
  const { t } = useLanguage();

  return (
    <div className="ad-rev__panel ad-report-card">
      <div className="ad-report-card__head">
        <span className="ad-report-card__icon" aria-hidden="true">
          <FileText size={16} strokeWidth={1.9} />
        </span>
        <span className="ad-rev__panel-title ad-report-card__title">
          {t("admin.revenueReport", "Revenue Report")}
        </span>
      </div>

      <p className="ad-report-card__text">
        {t("admin.revenueReportHint", "Generate a detailed report for the selected period.")}
      </p>

      <button type="button" className="ad-report-card__btn" onClick={onOpen}>
        {t("admin.viewReport", "View Report")}
        <ArrowRight size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}
