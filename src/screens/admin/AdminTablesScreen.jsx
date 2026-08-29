import { useState, useMemo } from "react";
import { Pencil, Trash2, Plus, QrCode, Copy, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Input   from "../../components/ui/Input.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { QRCodeSVG } from "qrcode.react";
import { useTableData } from "../../lib/useTableData.js";
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

              <div className="tb-row__actions">
                <button type="button" className="mm-icon-btn" onClick={() => setPreviewTable(table)} aria-label={t("admin.viewQr", "View QR")}>
                  <QrCode size={15} strokeWidth={2.2} />
                </button>
                <button type="button" className="mm-icon-btn" onClick={() => handleCopyUrl(table)} aria-label={t("admin.copyUrl", "Copy URL")}>
                  <Copy size={15} strokeWidth={2.2} />
                </button>
                <button type="button" className="mm-icon-btn" onClick={() => handleOpenUrl(table)} aria-label={t("admin.openCustomerPage", "Open customer page")}>
                  <ExternalLink size={15} strokeWidth={2.2} />
                </button>
                <button type="button" className="mm-icon-btn" onClick={() => setEditingTable(table)} aria-label={t("admin.editTable", "Edit Table")}>
                  <Pencil size={15} strokeWidth={2.2} />
                </button>
                <button type="button" className="mm-icon-btn" onClick={() => setPendingRegenerate(table)} aria-label={t("admin.regenerateQr", "Regenerate QR")}>
                  <RefreshCw size={15} strokeWidth={2.2} />
                </button>
                <button type="button" className="mm-icon-btn mm-icon-btn--danger" onClick={() => setPendingDelete(table)} aria-label={t("admin.deleteTable", "Delete Table")}>
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
          footer={
            <>
              <Button variant="ghost" icon={Copy} onClick={() => handleCopyUrl(previewLive)}>
                {t("admin.copyLink", "Copy Link")}
              </Button>
              <Button onClick={() => setPreviewTable(null)}>{t("common.close", "Close")}</Button>
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
            <p className="tb-qr-preview__url">{previewUrl}</p>
          </div>
        </Modal>
      )}

      {pendingRegenerate && (
        <Modal
          open
          onClose={() => setPendingRegenerate(null)}
          title={t("admin.regenerateQrConfirmTitle", "Regenerate QR Token?")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingRegenerate(null)}>{t("common.cancel", "Cancel")}</Button>
              <Button variant="danger" onClick={handleConfirmRegenerate}>{t("admin.regenerateQr", "Regenerate QR")}</Button>
            </>
          }
        >
          <p className="ad-cancel-modal__msg">
            {t("admin.regenerateQrWarning", "Regenerating this QR will invalidate the previous customer link for this table.")}
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

/* ── Add/Edit table form modal ────────────────────────────────────────────── */
function TableEditorModal({ table, onSave, onClose }) {
  const { t } = useLanguage();
  const isNew = !table.id;
  const [tableNumber, setTableNumber] = useState(table.tableNumber != null ? String(table.tableNumber) : "");
  const [displayName, setDisplayName] = useState(table.displayName || "");
  const [isActive, setIsActive] = useState(table.isActive !== false);
  const [sortOrder, setSortOrder] = useState(table.sortOrder != null ? String(table.sortOrder) : "");
  const [error, setError] = useState(null);

  const ERROR_MESSAGE = {
    invalid_number: t("admin.tableNumberRequired", "Please enter a valid table number."),
    duplicate_number: t("admin.tableNumberDuplicate", "This table number is already in use."),
  };

  function handleSubmit() {
    const reason = onSave({
      tableNumber,
      displayName: displayName.trim(),
      isActive,
      sortOrder: sortOrder !== "" ? sortOrder : undefined,
    });
    if (reason) setError(ERROR_MESSAGE[reason] || reason);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t("admin.addTable", "Add Table") : t("admin.editTable", "Edit Table")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
          <Button onClick={handleSubmit}>{t("common.save", "Save")}</Button>
        </>
      }
    >
      <Input
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
