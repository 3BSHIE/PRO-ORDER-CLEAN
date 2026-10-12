import { useMemo, useState } from "react";
import { ArrowLeft, Printer, FileDown, Share2, Check } from "lucide-react";
import AdminLayout from "./AdminLayout.jsx";
import RevenueReportPage from "./RevenueReportPage.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { buildRevenueReport, reportShareText } from "../../lib/revenueReport.js";
import { formatPeriodLabel } from "../../lib/revenuePeriods.js";
import { fmtPrice, SUPPORTED_CURRENCY } from "../../lib/format.js";
import { translate } from "../../i18n/translate.js";

/* ═══════════════════════════════════════════════════════════════════════════
   AdminRevenueReportScreen — Phase 111.1

   A page, not a modal (§8.5). It reaches the same admin shell every other
   operator screen uses and sits behind the same permission as Overview,
   because it shows Overview's figures and nothing more.

   ── THE SNAPSHOT IS THE WHOLE POINT ─────────────────────────────────────
   `report` arrives already frozen: the period, the filtered order list and
   the generation instant were all captured when View Report was pressed.
   Nothing on this screen re-filters or re-reads the store, so the poll
   running behind it cannot move a figure while someone is reading, printing
   or checking the Arabic page against the English one.

   Returning to the dashboard and pressing View Report again produces a new
   snapshot with a new timestamp, which is the only way to refresh it. There
   is no stored report history in this phase.

   ── WHY BOTH LANGUAGES, ALWAYS ──────────────────────────────────────────
   The document is bilingual by requirement, not by preference: page one
   English, page two Arabic, whichever language the operator is using. Only
   the toolbar above follows the interface.
   ═══════════════════════════════════════════════════════════════════════ */

export default function AdminRevenueReportScreen({
  restaurant, session, onSignOut, onNavigate, report,
}) {
  const { t, language } = useLanguage();
  const { settings } = useSettingsData(restaurant.slug);
  const [shareState, setShareState] = useState("idle");

  /* Built once per snapshot. `report` is a new object only when the reader
     opens the screen again, so this memo is what makes the page stable. */
  const model = useMemo(
    () => (report ? buildRevenueReport(report) : null),
    [report]
  );

  const restaurantName = (settings.name || "").trim() || restaurant.name;

  /* A snapshot is required: reaching this screen without one means the page
     was restored or linked to directly, and an empty report would be worse
     than an honest way back. */
  if (!model) {
    return (
      <AdminLayout
        restaurant={restaurant}
        session={session}
        onSignOut={onSignOut}
        activeKey="overview"
        onNavigate={onNavigate}
      >
        <div className="rep-shell">
          <p className="rep-missing">
            {t("admin.reportUnavailable", "Open this report from Revenue Analytics to choose a period.")}
          </p>
          <button type="button" className="rep-action" onClick={() => onNavigate("overview")}>
            <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
            {t("admin.backToOverview", "Back to Overview")}
          </button>
        </div>
      </AdminLayout>
    );
  }

  /* Print and "Save as PDF" are the same browser dialog, and the labels say
     so rather than implying a file appears on its own (§12.2): the PDF
     button's hint names the destination the reader has to pick. Using the
     browser's own print path is also what keeps Arabic correctly shaped and
     the text selectable — rasterising the page to an image would lose both. */
  const handlePrint = () => window.print();

  const handleShare = async () => {
    const strings = {
      title: translate(language, "admin.revenueReport", "Revenue Report"),
      period: translate(language, "admin.reportPeriod", "Period"),
      total: translate(language, "admin.totalRevenue", "Total Revenue"),
      collected: translate(language, "admin.collected", "Collected"),
      pending: translate(language, "payment.pendingAtTable", "Pending at table"),
      orders: translate(language, "admin.countedOrders", "Counted orders"),
      aov: translate(language, "admin.averageOrderValue", "Average order value"),
    };
    const text = reportShareText(model, {
      restaurantName,
      periodLabel: formatPeriodLabel(model.range, language),
      money: fmtPrice,
      strings,
    });

    try {
      if (navigator.share) {
        await navigator.share({ title: `${restaurantName} — ${strings.title}`, text });
        setShareState("idle");
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2200);
    } catch {
      /* A cancelled share and a blocked clipboard both land here; neither is
         an error worth interrupting the reader for. */
      setShareState("idle");
    }
  };

  return (
    <AdminLayout
      restaurant={restaurant}
      session={session}
      onSignOut={onSignOut}
      activeKey="overview"
      onNavigate={onNavigate}
    >
      <div className="rep-shell">
        {/* Screen only — the print stylesheet removes this along with the
            rest of the admin chrome. */}
        <div className="rep-toolbar">
          <button type="button" className="rep-action" onClick={() => onNavigate("overview")}>
            <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
            {t("admin.backToOverview", "Back to Overview")}
          </button>

          <div className="rep-toolbar__right">
            <button type="button" className="rep-action" onClick={handlePrint}>
              <Printer size={14} strokeWidth={2.2} aria-hidden="true" />
              {t("admin.printReport", "Print")}
            </button>
            <button
              type="button"
              className="rep-action"
              onClick={handlePrint}
              title={t("admin.savePdfHint", "Opens your browser's print dialog — choose \"Save as PDF\" as the destination.")}
            >
              <FileDown size={14} strokeWidth={2.2} aria-hidden="true" />
              {t("admin.savePdf", "Save as PDF")}
            </button>
            <button type="button" className="rep-action" onClick={handleShare}>
              {shareState === "copied"
                ? <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                : <Share2 size={14} strokeWidth={2.2} aria-hidden="true" />}
              {shareState === "copied"
                ? t("admin.shareCopied", "Summary copied")
                : t("admin.shareReport", "Share")}
            </button>
          </div>
        </div>

        <p className="rep-hint">
          {t("admin.reportBilingualHint", "This report prints as two A4 pages: English, then Arabic.")}
        </p>

        <div className="rep-doc">
          <RevenueReportPage
            language="en"
            model={model}
            restaurantName={restaurantName}
            logoUrl={settings.logoUrl}
            currency={SUPPORTED_CURRENCY}
          />
          <RevenueReportPage
            language="ar"
            model={model}
            restaurantName={restaurantName}
            logoUrl={settings.logoUrl}
            currency={SUPPORTED_CURRENCY}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
