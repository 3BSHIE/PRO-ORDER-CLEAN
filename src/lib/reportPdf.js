/**
 * reportPdf — Phase 111.2
 *
 * Save as PDF, as an actual downloaded file.
 *
 * ── WHY THE PAGES ARE RASTERISED ────────────────────────────────────────
 * The obvious alternative — drawing the report with jsPDF's text API — does
 * not survive Arabic. jsPDF writes glyphs in the order it is given them; it
 * performs no bidi reordering and no contextual shaping, so Arabic comes out
 * as disconnected letters in reverse order. Every workaround for that means
 * shipping a shaping engine.
 *
 * Painting each page through html2canvas instead hands the job to the thing
 * that already does it correctly: the browser's own text engine. The Arabic
 * in the file is the Arabic the reader just approved on screen, shaped and
 * ordered by Chrome, and the layout is pixel-for-pixel the page they looked
 * at rather than a second template that drifts from it.
 *
 * The cost is stated plainly: the text in the PDF is an image, so it is not
 * selectable or searchable. That is the trade the brief allows — layout
 * correctness and Arabic legibility first.
 *
 * ── WHY EXACTLY TWO PAGES ───────────────────────────────────────────────
 * Each .rep-page is captured on its own and placed on its own A4 sheet at
 * 0,0 filling 210×297mm. There is no pagination algorithm to overflow, no
 * slicing of a tall canvas, and therefore no third page: the file has as
 * many pages as the document has .rep-page elements, which is two.
 *
 * The on-screen page box is already exactly A4 with the same 12mm inset the
 * print stylesheet applies as a page margin, so the mapping is 1:1 and
 * nothing is scaled or letterboxed.
 *
 * ── WHY THE IMPORTS ARE DYNAMIC ─────────────────────────────────────────
 * jsPDF and html2canvas together are larger than the rest of the admin
 * bundle. Loading them only when someone actually presses the button keeps
 * them out of every other page in the product.
 */

/** Characters no common filesystem accepts, plus runs of whitespace. */
function sanitizeForFilename(value) {
  return String(value || "")
    .normalize("NFKD")
    /* Strip combining marks so an accented restaurant name becomes plain
       ASCII rather than a name some filesystems render oddly. */
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 48);
}

/**
 * PRO-ORDER_Lumiere_Revenue_Report_2026-10-12.pdf
 *
 * The period's own start key is the date in the name, not today's: two
 * reports for two different weeks must not collide, and a report for last
 * March should say so. Nothing identifying a session or a token goes near
 * this.
 */
export function buildReportFilename(restaurantName, range) {
  const name = sanitizeForFilename(restaurantName) || "Restaurant";
  const period = range?.startKey || "";
  const suffix = range?.type === "day" ? period
    : range?.type === "month" ? period.slice(0, 7)
      : `${period}_${range?.endKey || ""}`;
  return `PRO-ORDER_${name}_Revenue_Report_${suffix}.pdf`.replace(/_+\.pdf$/, ".pdf");
}

/**
 * Render the given page elements into one A4 PDF and download it.
 *
 * @param {Array<HTMLElement>} pages — the .rep-page elements, in order
 * @param {string} filename
 * @returns {Promise<{pages:number}>}
 */
export async function downloadReportPdf(pages, filename) {
  if (!pages || pages.length === 0) throw new Error("no-pages");

  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

  for (let i = 0; i < pages.length; i += 1) {
    const element = pages[i];
    /* The screen page carries a drop shadow to lift it off the dark admin
       background. On paper that is a grey smear around the sheet, so it is
       suppressed for the capture and restored immediately after. */
    element.classList.add("rep-page--capturing");
    let canvas;
    try {
      canvas = await html2canvas(element, {
        /* 2× so the raster is ~150dpi at A4 — crisp for 8pt tables without
           producing a file too large to email. */
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        /* A restaurant logo served without CORS headers would otherwise
           taint the canvas and make the export throw at the last step. It
           is skipped instead, which costs the logo and saves the file. */
        allowTaint: false,
        logging: false,
        imageTimeout: 4000,
      });
    } finally {
      element.classList.remove("rep-page--capturing");
    }

    if (i > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.95),
      "JPEG",
      0, 0, 210, 297,
      undefined,
      "FAST"
    );
  }

  pdf.save(filename);
  return { pages: pages.length };
}
