import { useState, useEffect, useMemo, useRef } from "react";
import { Pencil, Trash2, Plus, QrCode, Copy, Check, ExternalLink, RefreshCw, Search, X, Printer, Power } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Input   from "../../components/ui/Input.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { QRCodeSVG } from "qrcode.react";
import TableQrPrintCard from "./TableQrPrintCard.jsx";
import { useTableData } from "../../lib/useTableData.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import {
  createTable,
  updateTable,
  deleteTable,
  regenerateQrToken,
} from "../../lib/tableData.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { formatTableCount } from "../../i18n/counts.js";

/* ═══════════════════════════════════════════════════════════════════════════
   AdminTablesScreen — Phase 22

   Full table CRUD for Admin: view, add, edit (number/display name/active/
   sort order — never qrToken directly), delete, and a separate explicit
   "Regenerate QR Token" action that requires its own confirmation modal
   since it immediately invalidates the table's previous customer link.

   Admin-only — enforced with the same three-layer pattern as Menu/
   Categories Management (Phase 21 architecture review): nav filtering in
   AdminLayout, a route guard in App.jsx, and this screen's own role check
   below as a third, redundant layer.

   All writes go through src/lib/tableData.js, which persists to
   localStorage (scoped per restaurant) and dispatches
   "pro-order-table-change" — any customer screen currently open picks up
   the change (a deactivated/deleted/regenerated table's QR route stops
   working) without a reload, via useTableData()/resolveTableAccess().
   ═══════════════════════════════════════════════════════════════════════ */

function customerUrl(restaurantSlug, qrToken) {
  const origin = typeof window !== "undefined" && window.location ? window.location.origin : "";
  return `${origin}/r/${restaurantSlug}/table/${qrToken}`;
}

/**
 * Phase 58 — search normalisation for the table list.
 *
 * Trim, collapse inner runs of whitespace, lowercase. Applied to BOTH the
 * query and the value it is compared against, so "  terrace   1 " finds
 * "Terrace 1" without either side having to be typed precisely.
 */
function normalizeSearchText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Phase 58 — does one table match the manager's query?
 *
 * Matches the two things a manager actually knows about a table: what it is
 * called and what number it carries. It deliberately never reads qrToken —
 * the token is security/implementation data, and making it searchable would
 * turn a convenience field into a way to confirm a guessed token.
 *
 * An empty query matches everything, so the caller can pass it unconditionally.
 *
 * @param {object} table
 * @param {string} normalizedQuery — already through normalizeSearchText
 */
export function tableMatchesQuery(table, normalizedQuery) {
  if (!normalizedQuery) return true;
  if (normalizeSearchText(table?.displayName).includes(normalizedQuery)) return true;
  /* Substring, not equality: typing "1" while looking for "12" should keep
     narrowing rather than jump to an exact-match-only empty state. */
  return String(table?.tableNumber ?? "").includes(normalizedQuery);
}

/**
 * Phase 58 — does a table match the Active/Inactive filter?
 *
 * Reads the existing isActive field and introduces no new state. The
 * `!== false` test mirrors how the rest of the screen treats the flag, so a
 * legacy row saved without it still counts as active rather than vanishing.
 */
export function tableMatchesStatus(table, statusFilter) {
  if (statusFilter === "active") return table?.isActive !== false;
  if (statusFilter === "inactive") return table?.isActive === false;
  return true;
}

export default function AdminTablesScreen({ restaurant, session, onSignOut, onNavigate }) {
  const { tables } = useTableData(restaurant.slug);
  /* Phase 69 — the printed stand carries the restaurant identity the guest
     sees: the settings name, logo and accent, not the static record. */
  const { settings } = useSettingsData(restaurant.slug);
  const { t } = useLanguage();

  /* Phase 58 — view-only list controls. Held in component state and never
     persisted: a search string is a momentary intent, not a setting, and
     writing it to storage would mean a manager returns to a filtered list
     with no memory of why. */
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | inactive

  const [editingTable, setEditingTable] = useState(null); // table object, or {} for "new"
  const [previewTable, setPreviewTable] = useState(null);
  const [pendingRegenerate, setPendingRegenerate] = useState(null);
  /* Phase 93 §8/§10 — the table whose deactivation is awaiting confirmation.
     Only deactivation asks: turning a table back ON is not a decision anyone
     needs protecting from (§9), so Activate applies immediately. */
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  /* Phase 58 — filter only; deliberately no sort. The order useTableData
     hands back is the order the manager already knows, and Array.filter
     preserves it, so narrowing the list never reshuffles what remains.

     Derived straight from `tables`, so every live write — an edit, a
     deactivation, a delete, a new row — re-runs this on the next render.
     A table that stops matching simply stops being rendered, which is what
     makes "deactivate under the Active filter" behave correctly for free. */
  const visibleTables = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    return tables.filter((tb) => tableMatchesStatus(tb, statusFilter) && tableMatchesQuery(tb, q));
  }, [tables, searchQuery, statusFilter]);

  const isNarrowed = visibleTables.length !== tables.length;

  /* Phase 21-pattern architecture guard — redundant, defense-in-depth. The
     App root's route guard already refuses to render this component at all
     for a Cashier session; this second check protects against any future
     code path that might reach it another way. */
  if (session.role !== "admin") {
    return (
      <AdminLayout restaurant={restaurant} session={session} onSignOut={onSignOut} activeKey="tables" onNavigate={onNavigate}>
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <QrCode size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("admin.accessRestricted", "Access restricted")}</h3>
          <p className="ad-empty__sub">{t("admin.accessRestrictedMsg", "This section is only available to Admin accounts.")}</p>
          <Button onClick={() => onNavigate("overview")} style={{ marginTop: 16 }}>
            {t("admin.backToOverview", "Back to Overview")}
          </Button>
        </div>
      </AdminLayout>
    );
  }

  function handleSave(data) {
    const result = editingTable?.id
      ? updateTable(restaurant.slug, editingTable.id, data)
      : createTable(restaurant.slug, data);

    if (result.ok) {
      setToastMessage(t("admin.tableSaved", "Table saved"));
      setToastVisible(true);
      setEditingTable(null);
      return null; // no error
    }
    return result.reason; // let the form show the specific validation error
  }

  /* ── Phase 93 §8/§9 — Active / Inactive ───────────────────────────────
     Deactivating is NOT deleting and NOT regenerating: it flips one boolean
     and nothing else. updateTable restores qrToken from the stored record
     regardless of what the patch carries, so the table keeps its identity,
     its printed stand stays valid for when it reopens, and historical orders
     — which snapshot their own tableNumber — are untouched.

     resolveTableAccess already refuses an inactive table with reason
     "inactive", which routes a new scan to the approved Inactive Table state
     (§62) rather than Invalid QR. This screen only had to make that state
     reachable: until now the toggle existed solely inside the Edit form, so
     the most routine operation on this page — close a table for the evening
     — meant opening a form and hunting for a checkbox. */
  function setTableActive(table, nextActive) {
    const result = updateTable(restaurant.slug, table.id, { isActive: nextActive });
    if (!result.ok) {
      setToastMessage(t("admin.tableSaveFailed", "Couldn't update this table. Please try again."));
      setToastVisible(true);
      return;
    }
    setToastMessage(
      nextActive
        ? t("admin.tableActivated", "Table activated")
        : t("admin.tableDeactivated", "Table deactivated")
    );
    setToastVisible(true);
  }

  function handleConfirmDeactivate() {
    const table = pendingDeactivate;
    setPendingDeactivate(null);
    if (!table) return;
    setTableActive(table, false);
  }

  function handleConfirmRegenerate() {
    const table = pendingRegenerate;
    setPendingRegenerate(null);
    if (!table) return;
    regenerateQrToken(restaurant.slug, table.id);
    setToastMessage(t("admin.qrRegenerated", "QR token regenerated"));
    setToastVisible(true);
  }

  function handleConfirmDelete() {
    const table = pendingDelete;
    setPendingDelete(null);
    if (!table) return;
    deleteTable(restaurant.slug, table.id);
    setToastMessage(t("admin.tableDeleted", "Table deleted"));
    setToastVisible(true);
  }

  /* Phase 57 — copy with a real fallback, and honest feedback.
     navigator.clipboard exists only in a secure context, so it is simply
     absent when the app is served over plain http on a LAN — which is
     exactly how a restaurant would reach this screen while testing a QR
     from a phone. The execCommand path still works there. If both fail the
     toast says so rather than claiming success: the URL is on screen to be
     copied by hand, so a wrong "copied" is worse than an honest failure. */
  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to the legacy path below
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      /* Off-screen but still focusable — execCommand ignores hidden nodes. */
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  /* Phase 76 §29 — the modal's copy acknowledgement lives INSIDE the button
     rather than firing the page toast: the modal covers the toast anyway, and
     a label that briefly reads "Copied" is a quieter, more local
     confirmation. The row's own copy button still uses the toast, because
     there is no button label there to change. Reuses the same copyText call;
     only the feedback surface differs. */
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!copiedLink) return;
    const id = setTimeout(() => setCopiedLink(false), 1600);
    return () => clearTimeout(id);
  }, [copiedLink]);

  async function handleCopyLink(table) {
    const ok = await copyText(customerUrl(restaurant.slug, table.qrToken));
    if (ok) {
      setCopiedLink(true);
      return;
    }
    /* Failure still needs to say so, and the button cannot carry that. */
    setToastMessage(t("admin.urlCopyFailed", "Couldn't copy — select the URL above to copy it manually."));
    setToastVisible(true);
  }

  async function handleCopyUrl(table) {
    const url = customerUrl(restaurant.slug, table.qrToken);
    const ok = await copyText(url);
    setToastMessage(
      ok
        ? t("admin.urlCopied", "Customer URL copied")
        : t("admin.urlCopyFailed", "Couldn't copy — select the URL above to copy it manually.")
    );
    setToastVisible(true);
  }

  /* Phase 57 — the preview holds a table object captured at click time.
     Re-reading it from the live list means Regenerate QR (which replaces the
     token) can never leave the modal showing a token that no longer exists.
     Falls back to the snapshot only if the row has since been deleted. */
  const previewLive = previewTable
    ? tables.find((x) => x.id === previewTable.id) || previewTable
    : null;
  /* One source of truth for the modal: the SAME string is encoded into the
     QR, printed beneath it, and written to the clipboard — they cannot drift
     apart because there is only one of them. */
  const previewUrl = previewLive ? customerUrl(restaurant.slug, previewLive.qrToken) : "";

  /* Phase 69 — the cards are already in the DOM and print CSS decides what
     reaches paper, so this only has to open the dialog. Nothing is written,
     generated or fetched; printing mutates no table data. */
  function handlePrintStand() {
    window.print();
  }

  function handleOpenUrl(table) {
    const url = customerUrl(restaurant.slug, table.qrToken);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <AdminLayout restaurant={restaurant} session={session} onSignOut={onSignOut} activeKey="tables" onNavigate={onNavigate}>
      <header className="ad-header anim-rise">
        <h1 className="ad-header__title">{t("admin.tablesAndQr", "Tables & QR")}</h1>
        <p className="ad-header__subtitle">
          {t("admin.manageTablesSubtitle", "Add, edit, and manage your restaurant's tables and QR codes.")}
        </p>
      </header>

      {/* Phase 58 — the same toolbar shape Menu Management already uses:
          search, a native select, then the primary action. .mm-toolbar wraps,
          so on a narrow Admin viewport these stack instead of overflowing. */}
      <div className="mm-toolbar anim-rise">
        <div className="mm-search">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <input
            type="search"
            /* The field has no visible label in this compact toolbar, so the
               accessible name has to come from here. */
            aria-label={t("admin.searchTables", "Search tables")}
            placeholder={t("admin.searchTables", "Search tables")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
          />
          {/* An explicit control rather than the browser's native search
              cancel button: that one is unlabelled, keyboard-unreachable in
              Chrome, and renders as a near-invisible grey X on this dark
              surface. Clearing the text leaves statusFilter untouched. */}
          {searchQuery && (
            <button
              type="button"
              className="tb-search__clear"
              onClick={() => setSearchQuery("")}
              aria-label={t("admin.clearSearch", "Clear search")}
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>
        {/* A native select carries its own selected state to assistive tech
            and cannot overflow the way a row of chips can. */}
        <select
          className="mm-select"
          aria-label={t("admin.filterByStatus", "Filter by status")}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">{t("admin.allTables", "All tables")}</option>
          <option value="active">{t("admin.active", "Active")}</option>
          <option value="inactive">{t("admin.inactive", "Inactive")}</option>
        </select>
        <Button icon={Plus} onClick={() => setEditingTable({})}>
          {t("admin.addTable", "Add Table")}
        </Button>
      </div>

      {/* Phase 58 — count. aria-live so a screen-reader user hears the list
          shrink as they type, rather than having to go and count the rows. */}
      {tables.length > 0 && (
        <p className="tb-count anim-rise" role="status" aria-live="polite">
          {formatTableCount(t, visibleTables.length, tables.length)}
        </p>
      )}

      {tables.length === 0 ? (
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <QrCode size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("admin.noTablesYet", "No tables yet.")}</h3>
        </div>
      ) : visibleTables.length === 0 ? (
        /* Phase 58 — a distinct state. "No tables yet" would be a lie here:
           tables exist, this search just does not reach them, and the fix is
           to change the query rather than to create something. */
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <Search size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("admin.noTablesMatch", "No tables match your search.")}</h3>
          <p className="ad-empty__sub">{t("admin.noTablesMatchHint", "Try a different name or number, or change the status filter.")}</p>
        </div>
      ) : (
        <div className="mm-cat-list anim-rise">
          {visibleTables.map((table) => (
            <Card key={table.id} className="tb-row">
              <div className="tb-row__main">
                <div className="tb-row__id">
                  <span className="tb-row__number">#{table.tableNumber}</span>
                  <p className="tb-row__name">{table.displayName}</p>
                </div>
                <Badge tone={table.isActive ? "gold" : "neutral"}>
                  {table.isActive ? t("admin.active", "Active") : t("admin.inactive", "Inactive")}
                </Badge>
              </div>

              {/* Phase 76 §22 — the token, the full customer URL and both
                  timestamps used to sit in the row at full strength, which
                  made every table read like a developer panel: four lines of
                  machine data above the actual controls, with the table
                  number itself the smallest thing present.

                  They move into a native <details>. Nothing is removed — the
                  data is one click away, still selectable and still
                  copyable (§51) — and <details>/<summary> is keyboard
                  operable and announced without any ARIA of our own. */}
              <details className="tb-row__tech">
                <summary className="tb-row__tech-summary">
                  {t("admin.technicalDetails", "Technical details")}
                </summary>
                <div className="tb-row__tech-body">
                  <div className="tb-row__meta">
                    <span className="tb-row__meta-label">{t("admin.qrTokenLabel", "QR Token")}:</span>
                    <span className="tb-row__token">{table.qrToken}</span>
                  </div>
                  <div className="tb-row__meta">
                    <span className="tb-row__meta-label">{t("admin.customerUrl", "Customer URL")}:</span>
                    <span className="tb-row__url">{customerUrl(restaurant.slug, table.qrToken)}</span>
                  </div>
                  <div className="tb-row__timestamps">
                    <span>{t("admin.created", "Created")}: {formatTimestamp(table.createdAt)}</span>
                    <span>{t("admin.updatedLabel", "Updated")}: {formatTimestamp(table.updatedAt)}</span>
                  </div>
                </div>
              </details>

              {/* Phase 93 §3/§14/§20 — the row carried SIX equally-weighted
                  controls: View QR, Copy URL, Open customer page, Edit,
                  Regenerate and Delete, five of them unlabelled icons of
                  identical size. With everything equally loud nothing reads as
                  the main action, and Regenerate — which invalidates a printed
                  stand — sat one icon away from Edit.

                  Copy URL, Open customer page and Regenerate all move into the
                  QR modal, which is where §14 places them and where they have
                  the table's QR in front of them for context. Nothing is
                  removed. What is left is the four things this page is for:
                  see the QR, open or close the table, rename it, remove it. */}
              <div className="tb-row__actions">
                {/* §3 — the QR is what this screen exists for. */}
                <button type="button" className="mm-edit-btn" onClick={() => setPreviewTable(table)}>
                  <QrCode size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>{t("admin.viewQr", "View QR")}</span>
                </button>
                {/* §7/§50 — labelled, not a bare icon: "which way does this
                    power symbol point right now" is exactly the question a
                    manager should not have to answer. The name states the
                    action AND implies the current state. */}
                <button
                  type="button"
                  className={`tb-toggle-btn ${table.isActive ? "" : "tb-toggle-btn--off"}`}
                  onClick={() =>
                    table.isActive ? setPendingDeactivate(table) : setTableActive(table, true)
                  }
                >
                  <Power size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>
                    {table.isActive
                      ? t("admin.deactivateTable", "Deactivate")
                      : t("admin.activateTable", "Activate")}
                  </span>
                </button>
                <button type="button" className="mm-icon-btn" onClick={() => setEditingTable(table)} aria-label={`${t("admin.editTable", "Edit Table")} — ${table.displayName}`}>
                  <Pencil size={15} strokeWidth={2.2} />
                </button>
                {/* §29 — Delete is pushed to its own end of the row by the
                    separator so it is never the button next to the one you
                    meant to press. */}
                <span className="tb-row__actions-sep" aria-hidden="true" />
                <button type="button" className="mm-icon-btn mm-icon-btn--danger" onClick={() => setPendingDelete(table)} aria-label={`${t("admin.deleteTable", "Delete Table")} — ${table.displayName}`}>
                  <Trash2 size={15} strokeWidth={2.2} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editingTable && (
        <TableEditorModal table={editingTable} onSave={handleSave} onClose={() => setEditingTable(null)} />
      )}

      {/* Phase 57 — a real, scannable QR. `previewLive` is re-read from the
          table list rather than trusted from the click-time snapshot, so the
          code on screen always encodes the token that is stored right now —
          a regeneration can never leave a stale QR being shown. Rendering
          only; nothing here writes. */}
      {previewLive && (
        <Modal
          open
          onClose={() => setPreviewTable(null)}
          title={t("admin.qrPreviewTitle", "Table QR Code")}
          /* Phase 76 §27 — the hierarchy here was upside down: Close was the
             gold primary while Print Table Stand — the reason the modal is
             opened — was an outline, and Copy Link was the faintest of the
             three. Print is primary now, Copy is the secondary, and Close
             steps back to ghost. No action was added or removed, and Print
             still runs the unchanged Phase 69 bilingual stand (§28). */
          footer={
            <>
              <Button variant="ghost" onClick={() => setPreviewTable(null)}>
                {t("common.close", "Close")}
              </Button>
              <Button
                variant="outline"
                icon={copiedLink ? Check : Copy}
                onClick={() => handleCopyLink(previewLive)}
              >
                {copiedLink
                  ? t("admin.copied", "Copied")
                  : t("admin.copyLink", "Copy Link")}
              </Button>
              <Button icon={Printer} onClick={handlePrintStand}>
                {t("admin.printTableStand", "Print Table Stand")}
              </Button>
            </>
          }
        >
          <div className="tb-qr-preview">
            <p className="tb-qr-preview__restaurant">{restaurant.name}</p>
            <p className="tb-qr-preview__table">{previewLive.displayName} (#{previewLive.tableNumber})</p>
            {/* The white plate is the quiet zone's carrier: the QR is always
                black on white regardless of the Admin theme, because a scanner
                reads reflectance, not our design tokens. marginSize={4} bakes
                the spec's 4-module quiet zone into the SVG itself, so it holds
                even if this box is ever restyled. */}
            <div className="tb-qr-preview__box">
              <QRCodeSVG
                className="tb-qr-preview__code"
                value={previewUrl}
                size={220}
                level="M"
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#000000"
                role="img"
                aria-label={`${t("admin.qrCodeOpensOrdering", "QR code that opens ordering for")} ${previewLive.displayName} (#${previewLive.tableNumber})`}
              />
            </div>
            <p className="tb-qr-preview__scan">{t("admin.scanToOrder", "Scan to order")}</p>
            {/* The same URL the code encodes, shown as text so the modal is
                usable without a second phone — and readable to a screen
                reader, which cannot scan anything. */}
            {/* §19/§44 — the link the code encodes, shown as text so the
                modal works without a second phone and so a screen reader has
                something to read. LTR-isolated in CSS: a URL inside an Arabic
                page must not be reordered by the bidi algorithm. */}
            <p className="tb-qr-preview__url">{previewUrl}</p>

            {/* §14 — the secondary pair. Copy and Preview live here now
                rather than as two more icons in the row: both are about THIS
                table's link, and here the QR they belong to is on screen.
                Ghost weight, so Print in the footer stays the primary. */}
            <div className="tb-qr-actions">
              <Button
                variant="ghost"
                size="sm"
                icon={ExternalLink}
                onClick={() => handleOpenUrl(previewLive)}
              >
                {t("admin.openCustomerPage", "Open customer page")}
              </Button>
            </div>

            {/* §20 — Regenerate is sensitive and rare, so it sits below the
                actions a manager actually came here for, in its own quiet
                framed area rather than as a peer of Print. Amber, not red:
                §52 — this is consequential but recoverable, and Delete keeps
                the filled red. */}
            <div className="tb-qr-sensitive">
              <p className="tb-qr-sensitive__title">{t("admin.regenerateQr", "Regenerate QR")}</p>
              <p className="tb-qr-sensitive__text">
                {t(
                  "admin.regenerateQrHint",
                  "Replaces this table's code. Only needed if the printed QR was copied or misused."
                )}
              </p>
              <Button
                variant="warn"
                size="sm"
                icon={RefreshCw}
                onClick={() => { setPreviewTable(null); setPendingRegenerate(previewLive); }}
              >
                {t("admin.regenerateQr", "Regenerate QR")}
              </Button>
            </div>
            {/* Phase 69 — an inactive table can still be printed; the stand
                is a physical object and the restaurant may be preparing a
                table before opening it. This warns the Admin on screen only
                and never appears on the card itself. */}
            {previewLive.isActive === false && (
              <p className="tb-qr-preview__warning" role="status">
                {t("admin.printInactiveWarning", "This table is currently inactive.")}
              </p>
            )}
          </div>

          {/* Phase 69 — the two printable faces. Off-screen normally, shown
              only by print media. Both are fed the SAME previewUrl, so the
              English face, the Arabic face, the preview above and Copy Link
              can never encode different links. */}
          <div className="qr-stand-sheet" aria-hidden="true">
            <TableQrPrintCard
              restaurant={restaurant}
              settings={settings}
              table={previewLive}
              qrUrl={previewUrl}
              language="en"
            />
            <TableQrPrintCard
              restaurant={restaurant}
              settings={settings}
              table={previewLive}
              qrUrl={previewUrl}
              language="ar"
            />
          </div>
        </Modal>
      )}

      {pendingRegenerate && (
        <Modal
          open
          onClose={() => setPendingRegenerate(null)}
          title={t("admin.regenerateQrConfirmTitle", "Generate a new QR code?")}
          footer={
            <>
              {/* Phase 76.1 §6 — the safe way out is named for what it does
                  rather than a generic "Cancel", so the two options read as a
                  real choice: keep the code that is already printed, or
                  replace it. It stays an outline rather than a ghost so it is
                  never the harder of the two to find. */}
              <Button variant="outline" onClick={() => setPendingRegenerate(null)}>
                {t("admin.keepCurrentQr", "Keep Current QR")}
              </Button>
              {/* §4/§9 — warning, not danger. Delete keeps the filled red and
                  stays the strongest destructive action on this screen; this
                  is consequential but recoverable (a new stand can be
                  printed), so it sits one step below. */}
              <Button variant="warn" onClick={handleConfirmRegenerate}>
                {t("admin.regenerateQr", "Regenerate QR")}
              </Button>
            </>
          }
        >
          {/* §5 — the consequence stated physically. The previous wording
              ("will invalidate the previous customer link") described what
              happens to a URL; what actually matters to the person clicking
              is that the printed card on the table stops working. */}
          {/* Phase 93 §21 — the old copy said only what BREAKS. §21 asks the
              dialog to also say what SURVIVES, so a manager can judge the
              real cost of pressing it.

              MEASURED, not assumed. §22 states the approved rule as "active
              sessions survive regeneration", and this dialog originally said
              so — until the end-to-end test showed the current build does not
              behave that way: every Customer screen gates on the token in the
              URL (session.qrToken === qrToken, five screens), so a guest
              already ordering lands on Invalid QR the moment the token
              changes. Closing that gap means making the Customer session
              table-bound rather than token-bound, which is Customer session
              architecture and is explicitly out of scope here (§61/§62).

              So the dialog states what is true of THIS build: the order
              records are untouched, and guests have to re-scan. Promising
              uninterrupted service would be the one failure mode that
              actually costs a restaurant money mid-shift. */}
          <p className="ad-cancel-modal__msg">
            {t(
              "admin.regenerateQrWarning",
              "The current QR code for this table will stop working. Any printed stand using the old QR will need to be replaced."
            )}
          </p>
          <ul className="tb-regen-effects">
            <li>{t("admin.regenerateKeepsOrders", "Open orders, tracking and past history are not changed.")}</li>
            <li>{t("admin.regenerateRescanNeeded", "Guests currently ordering at this table will need to scan the new code to continue.")}</li>
            <li>{t("admin.regenerateBetweenServices", "Best done between services, when no one is seated at this table.")}</li>
          </ul>
        </Modal>
      )}

      {/* Phase 93 §10 — deactivation is operational, not destructive, so it
          gets a light confirmation in neutral/amber rather than the filled red
          Delete uses (§52). The point of the dialog is not to frighten anyone;
          it is to state the two facts a manager needs: guests can no longer
          start here, and nothing has been thrown away. */}
      {pendingDeactivate && (
        <Modal
          open
          onClose={() => setPendingDeactivate(null)}
          title={t("admin.deactivateTableTitle", "Close this table?")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDeactivate(null)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button variant="warn" onClick={handleConfirmDeactivate}>
                {t("admin.deactivateTable", "Deactivate")}
              </Button>
            </>
          }
        >
          <p className="ad-cancel-modal__msg">
            {t(
              "admin.deactivateTableMsg",
              "Guests scanning this table's QR won't be able to start a new order. The table and its QR code are kept, and you can reactivate it at any time."
            )}
          </p>
        </Modal>
      )}

      {pendingDelete && (
        <Modal
          open
          onClose={() => setPendingDelete(null)}
          title={t("admin.deleteTable", "Delete Table")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>{t("common.cancel", "Cancel")}</Button>
              <Button variant="danger" onClick={handleConfirmDelete}>{t("admin.deleteTable", "Delete Table")}</Button>
            </>
          }
        >
          <p className="ad-cancel-modal__msg">
            {t("admin.deleteTableConfirmMsg", "This table will be permanently removed. Historical orders are not affected.")}
          </p>
        </Modal>
      )}

      <Toast visible={toastVisible} message={toastMessage} onDone={() => setToastVisible(false)} />
    </AdminLayout>
  );
}

/* The one field validation can land on, so focus never has to be guessed. */
const TABLE_NUMBER_FIELD_ID = "tb-table-number";

/* ── Add/Edit table form modal ────────────────────────────────────────────── */
function TableEditorModal({ table, onSave, onClose }) {
  const { t } = useLanguage();
  const isNew = !table.id;
  const [tableNumber, setTableNumber] = useState(table.tableNumber != null ? String(table.tableNumber) : "");
  const [displayName, setDisplayName] = useState(table.displayName || "");
  const [isActive, setIsActive] = useState(table.isActive !== false);
  const [sortOrder, setSortOrder] = useState(table.sortOrder != null ? String(table.sortOrder) : "");
  const [error, setError] = useState(null);

  /* ── Phase 93 §27 — one save per press ────────────────────────────────
     Same defect Phase 92 found in the Product Editor, and the same fix.
     createTable is synchronous, so two clicks landing in the same tick both
     reached it and produced TWO tables — each with its own generated QR
     token — from one press. On this screen that is worse than a duplicate
     product: the second table is a second printable code for a table that
     does not exist.

     The ref is the guard; state updates are batched and a second click in
     the same tick would still read the old flag. await + finally so the lock
     survives onSave becoming a request later, and releases on rejection. */
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const ERROR_MESSAGE = {
    invalid_number: t("admin.tableNumberRequired", "Please enter a valid table number."),
    duplicate_number: t("admin.tableNumberDuplicate", "This table number is already in use."),
  };

  async function handleSubmit() {
    if (savingRef.current) return;
    /* §26/§27 — validated before anything is written. An empty or
       non-numeric table number is caught here rather than being handed to
       the data layer, so the message lands on the field instead of arriving
       as a generic failure. The data layer still rejects it independently
       (duplicate numbers included); this is the inline half. */
    const trimmedNumber = String(tableNumber).trim();
    if (trimmedNumber === "" || !Number.isFinite(Number(trimmedNumber)) || Number(trimmedNumber) < 1) {
      setError(ERROR_MESSAGE.invalid_number);
      document.getElementById(TABLE_NUMBER_FIELD_ID)?.focus();
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    try {
      const reason = await onSave({
        tableNumber,
        displayName: displayName.trim(),
        isActive,
        sortOrder: sortOrder !== "" ? sortOrder : undefined,
      });
      if (reason) {
        setError(ERROR_MESSAGE[reason] || reason);
        document.getElementById(TABLE_NUMBER_FIELD_ID)?.focus();
      }
    } finally {
      savingRef.current = false;
      /* A successful save unmounts this modal. */
      if (mountedRef.current) setIsSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t("admin.addTable", "Add Table") : t("admin.editTable", "Edit Table")}
      footer={
        <>
          {/* §27 — both disabled mid-save: leaving Cancel live would let the
              modal be dismissed while a write is in flight. */}
          <Button variant="ghost" disabled={isSaving} onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={isSaving} onClick={handleSubmit}>
            {isSaving ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </>
      }
    >
      <Input
        id={TABLE_NUMBER_FIELD_ID}
        label={t("admin.tableNumber", "Table Number")}
        type="number"
        min="1"
        value={tableNumber}
        error={error}
        onChange={(e) => { setTableNumber(e.target.value); if (error) setError(null); }}
        style={{ marginBottom: 14 }}
        autoFocus
      />
      <Input
        label={t("admin.displayName", "Display Name")}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={`Table ${tableNumber || ""}`}
        style={{ marginBottom: 14 }}
      />
      <Input
        label={t("admin.productSortOrder", "Sort order")}
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        style={{ marginBottom: 14 }}
      />
      <label className="mm-toggle-row">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>{t("admin.active", "Active")}</span>
      </label>
    </Modal>
  );
}

function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
