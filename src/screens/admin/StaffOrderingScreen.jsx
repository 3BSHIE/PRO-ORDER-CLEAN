import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingBag, Trash2, Plus, Minus, Pencil, CheckCircle2, AlertTriangle, Search,
} from "lucide-react";
import AdminLayout from "./AdminLayout.jsx";
import Button from "../../components/ui/Button.jsx";
import { GroupedView } from "../customer/CustomerMenuScreen.jsx";
import ItemDetailsModal from "../customer/components/ItemDetailsModal.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { getLocalizedText } from "../../lib/localizedContent.js";
import { useMenuData } from "../../lib/useMenuData.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { useTableData } from "../../lib/useTableData.js";
import { isCategoryVisibleNow } from "../../lib/categoryVisibility.js";
import { useAcceptingOrders } from "../../lib/useAcceptingOrders.js";
import { getEstimatedPrepMinutes } from "../../lib/prepTimeData.js";
import { buildCartLine, sumLines } from "../../lib/cartLine.js";
import { validateCart } from "../../lib/cartValidation.js";
import { createStaffOrder } from "../../lib/customerOrders.js";
import { fmtPrice } from "../../lib/format.js";
import {
  DIRECT_ORDER_CONTEXT,
  isDirectContext,
  formatTableNumber,
  getStaffDraft,
  saveStaffDraft,
  clearStaffDraft,
  addDraftLine,
  updateDraftLine,
  setDraftLineQuantity,
  removeDraftLine,
} from "../../lib/staffOrdering.js";
import { restaurantDisplayName } from "../../lib/restaurantName.js";

/* ═══════════════════════════════════════════════════════════════════════════
   StaffOrderingScreen — Phase 112.0

   An order taken by a person, on the restaurant's own screen.

   ── WHAT IS REUSED, AND WHY THAT MATTERS ─────────────────────────────────
   The product cards are the Customer Menu's own GroupedView, and the
   customization sheet is its own ItemDetailsModal — the component that
   already knows about required choice groups, minimum and maximum
   selections, option availability, removals, paid add-ons and notes. The
   line it produces is built by lib/cartLine.js, the same builder the guest's
   menu now calls. So a dish customised by a cashier and the same dish
   customised by a guest are the same record, priced by the same arithmetic.
   There is no second menu in this product.

   ── WHAT IS DELIBERATELY NOT REUSED ──────────────────────────────────────
   Nothing customer-private: no QR welcome, no guest name, no My Orders, no
   tracking, no customer session. A staff order is attributed to the member
   of staff who took it, and it is invisible to every guest's private list —
   structurally, because it carries neither a qrToken nor an identity key.

   ── THE DRAFT ────────────────────────────────────────────────────────────
   One draft per (restaurant, staff member, table-or-direct). Switching
   context swaps the draft; it does not merge, clear or leak one into
   another. Submitting clears exactly the context that was submitted.
   ═══════════════════════════════════════════════════════════════════════ */

export default function StaffOrderingScreen({
  restaurant, session, onSignOut, onNavigate, context,
}) {
  const { t, language } = useLanguage();
  const { settings } = useSettingsData(restaurant.slug);
  const { categories: allCategories, items: allItems } = useMenuData(restaurant.slug);
  const { tables } = useTableData(restaurant.slug);
  /* Read to SAY something, never to block: the approved exception is that
     staff may take an order while customer QR ordering is closed. Nothing
     here reopens the restaurant, and the guest-facing gate is untouched. */
  const { accepting } = useAcceptingOrders(restaurant.slug);

  /* The context this screen is ordering into. Direct is a context of its
     own, never a table id. An unknown or deactivated table falls back to
     direct rather than ordering into nowhere. */
  const contextId = context || DIRECT_ORDER_CONTEXT;
  const isDirect = isDirectContext(contextId);
  const table = isDirect ? null : tables.find((tb) => tb.id === contextId) || null;
  const tableInactive = !isDirect && table && !table.isActive;
  const tableMissing = !isDirect && !table;

  const [draft, setDraft] = useState(() => getStaffDraft(restaurant.slug, session, contextId));
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingLine, setEditingLine] = useState(null);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { kind:"ok"|"error", orderId?, message? }

  /* Switching table (or landing here from the sidebar) loads that context's
     own draft. The previous one is already persisted, untouched. */
  useEffect(() => {
    setDraft(getStaffDraft(restaurant.slug, session, contextId));
    setResult(null);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.slug, contextId]);

  /* Every change to the draft is written through immediately: a refresh, a
     navigation to Live Orders and back, or a closed tab must not lose a
     half-taken order. */
  const commitDraft = useCallback((lines) => {
    setDraft(lines);
    saveStaffDraft(restaurant.slug, session, contextId, lines);
  }, [restaurant.slug, session, contextId]);

  /* The same visibility rule the guest's menu applies: a category that is
     off, or outside its schedule, is not orderable by staff either. */
  const categories = useMemo(
    () => allCategories.filter((c) => isCategoryVisibleNow(c, { timeZone: settings.timeZone })),
    [allCategories, settings.timeZone]
  );

  const visibleItems = useMemo(() => {
    const allowed = new Set(categories.map((c) => c.id));
    const text = query.trim().toLowerCase();
    return allItems
      .filter((item) => allowed.has(item.categoryId))
      .filter((item) => {
        if (!text) return true;
        const name = getLocalizedText(item.name, language).toLowerCase();
        const description = getLocalizedText(item.description, language).toLowerCase();
        return name.includes(text) || description.includes(text);
      });
  }, [allItems, categories, query, language]);

  const subtotal = sumLines(draft);
  const serviceChargePercent = Number(restaurant.serviceChargePercent) || 0;
  const serviceCharge = parseFloat(((subtotal * serviceChargePercent) / 100).toFixed(3));
  const total = parseFloat((subtotal + serviceCharge).toFixed(3));

  /* The same validator the guest's cart runs: unavailable product, hidden
     category, broken choice rules, price drift. Staff get no override. */
  const validation = useMemo(
    () => validateCart(draft, {
      items: allItems,
      categories: allCategories,
      timeZone: settings.timeZone,
    }),
    [draft, allItems, allCategories, settings.timeZone]
  );
  const blockedLineIds = useMemo(
    () => new Set(
      validation.results.filter((r) => r.issues.length > 0).map((r) => r.cartItemId)
    ),
    [validation]
  );

  /* A price that moved while the order was being taken is not a blocker, it
     is a question: the cashier confirms the current price and carries on.
     Same two-step the guest's cart uses, and the same data behind it. */
  const priceOnly = validation.hasPriceChange && !validation.hasBlocking;

  function handleRefreshPrices() {
    const byLine = validation.byLine;
    commitDraft(draft.map((line) => {
      const result = byLine[line.cartItemId];
      if (!result || result.currentUnitPrice === null) return line;
      return {
        ...line,
        basePrice: result.currentBasePrice ?? line.basePrice,
        unitPrice: result.currentUnitPrice,
        selectedChoices: result.currentChoices ?? line.selectedChoices,
        selectedPaidAddOns: result.currentAddOns ?? line.selectedPaidAddOns,
        lineTotal: parseFloat((result.currentUnitPrice * line.quantity).toFixed(3)),
      };
    }));
    setResult(null);
  }

  const contextLabel = isDirect
    ? t("staffOrder.directOrder", "Direct Order")
    : `${t("customer.yourTable", "Table")} ${formatTableNumber(table?.tableNumber)}`;

  const canSubmit =
    validation.canCheckout &&
    !submitting &&
    !tableInactive &&
    !tableMissing;

  /* ── Item sheet ─────────────────────────────────────────────────────── */

  const handleOpenItem = useCallback((item) => {
    setEditingLine(null);
    setSelectedItem(item);
  }, []);

  const handleEditLine = useCallback((line) => {
    const item = allItems.find((i) => i.id === line.itemId);
    if (!item) return;
    setEditingLine(line);
    setSelectedItem(item);
  }, [allItems]);

  const handleSheetSubmit = useCallback((item, quantity, notes, selections) => {
    const line = buildCartLine({ item, quantity, notes, selections, language });
    commitDraft(
      editingLine
        ? updateDraftLine(draft, editingLine.cartItemId, line)
        : addDraftLine(draft, line)
    );
    setSelectedItem(null);
    setEditingLine(null);
    setResult(null);
  }, [draft, editingLine, commitDraft, language]);

  /* ── Submission ─────────────────────────────────────────────────────── */

  function handleSubmit() {
    /* Synchronous lock first: a second press inside the same tick finds the
       flag already set and returns before anything is written. The data
       layer's own signature guard sits behind this one. */
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);

    try {
      /* Re-validated at the press, not trusted from render: a dish can go
         out of stock while a cashier is talking to the guest. */
      const fresh = validateCart(draft, {
        items: allItems,
        categories: allCategories,
        timeZone: settings.timeZone,
      });
      if (!fresh.canCheckout) {
        setResult({ kind: "error", message: t("staffOrder.fixItemsFirst", "Some items need attention before this order can be placed.") });
        setSubmitting(false);
        return;
      }
      if (!isDirect && (!table || !table.isActive)) {
        setResult({ kind: "error", message: t("staffOrder.tableInactiveError", "This table is inactive. Reactivate it in Tables & Access, or use Direct Order.") });
        setSubmitting(false);
        return;
      }

      const order = createStaffOrder({
        restaurant: {
          id: restaurant.id,
          slug: restaurant.slug,
          name: restaurantDisplayName(settings, restaurant.name),
          serviceChargePercent,
        },
        table: isDirect ? null : { id: table.id, tableNumber: table.tableNumber },
        staff: {
          staffId: session?.username || session?.role || null,
          name: session?.name || null,
          role: session?.role || null,
        },
        cartItems: draft,
        subtotal,
        serviceCharge,
        total,
        /* Phase 112.1 — no method here. Taking an order is not collecting
           for it: the order is created UNPAID and the method is recorded in
           Live Orders when someone actually settles it. */
        estimatedPrepMinutes: getEstimatedPrepMinutes(restaurant.slug),
      });

      if (!order?.orderId) {
        setResult({ kind: "error", message: t("staffOrder.submitFailed", "The order could not be placed. Please try again.") });
        setSubmitting(false);
        return;
      }

      /* Only this context's draft is cleared, and only now that an order
         genuinely exists. Every other table keeps what it was holding. */
      clearStaffDraft(restaurant.slug, session, contextId);
      setDraft([]);
      setResult({ kind: "ok", orderId: order.orderId });
    } catch {
      /* The draft is deliberately left exactly as it was, so the cashier can
         press again rather than retyping an order. */
      setResult({ kind: "error", message: t("staffOrder.submitFailed", "The order could not be placed. Please try again.") });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCategory = selectedItem
    ? allCategories.find((c) => c.id === selectedItem.categoryId)
    : null;

  return (
    <AdminLayout
      restaurant={restaurant}
      session={session}
      onSignOut={onSignOut}
      activeKey="staffOrdering"
      onNavigate={onNavigate}
      staffOrderingContext={contextId}
    >
      <header className="ad-header anim-rise" style={{ animationDelay: "40ms" }}>
        <h1 className="ad-header__title">
          {t("staffOrder.title", "Staff Ordering")}
          <span className="so-context" data-direct={isDirect ? "true" : undefined}>
            {isDirect
              ? <ShoppingBag size={14} strokeWidth={2.2} aria-hidden="true" />
              : null}
            {contextLabel}
          </span>
        </h1>
        <p className="ad-header__subtitle">
          {isDirect
            ? t("staffOrder.directSubtitle", "An order with no table — counter, takeaway or walk-in.")
            : t("staffOrder.tableSubtitle", "Taking an order on behalf of the guests at this table.")}
        </p>
      </header>

      {!accepting && (
        <p className="so-notice">
          {t("staffOrder.closedNotice", "Customer ordering is closed. Staff orders are still allowed.")}
        </p>
      )}

      {tableMissing && (
        <p className="so-alert" role="alert">
          <AlertTriangle size={14} strokeWidth={2.2} aria-hidden="true" />
          {t("staffOrder.tableMissing", "That table no longer exists. Choose another table, or use Direct Order.")}
        </p>
      )}
      {tableInactive && (
        <p className="so-alert" role="alert">
          <AlertTriangle size={14} strokeWidth={2.2} aria-hidden="true" />
          {t("staffOrder.tableInactiveError", "This table is inactive. Reactivate it in Tables & Access, or use Direct Order.")}
        </p>
      )}

      <div className="so-layout">
        {/* ── The menu, as the guest sees it ───────────────────────────── */}
        <section className="so-menu" aria-label={t("customer.menu", "Menu")}>
          <div className="so-search">
            <Search className="so-search__icon" size={15} strokeWidth={2} aria-hidden="true" />
            <input
              className="so-search__input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("customer.searchMenuPlaceholder", "Search the menu")}
              aria-label={t("customer.searchMenuPlaceholder", "Search the menu")}
            />
          </div>

          {visibleItems.length === 0 ? (
            <p className="so-empty">
              {t("staffOrder.noItems", "No products are available to order right now.")}
            </p>
          ) : (
            <GroupedView items={visibleItems} categories={categories} onOpen={handleOpenItem} />
          )}
        </section>

        {/* ── The draft ────────────────────────────────────────────────── */}
        <aside className="so-cart" aria-label={t("staffOrder.draft", "Draft order")}>
          <div className="so-cart__head">
            <h2 className="so-cart__title">{t("staffOrder.draft", "Draft order")}</h2>
            <span className="so-cart__context">{contextLabel}</span>
          </div>

          {draft.length === 0 ? (
            <p className="so-cart__empty">
              {t("staffOrder.emptyDraft", "Nothing added yet. Choose a product to start this order.")}
            </p>
          ) : (
            <ul className="so-lines">
              {draft.map((line) => {
                const blocked = blockedLineIds.has(line.cartItemId);
                return (
                  <li className={`so-line${blocked ? " so-line--blocked" : ""}`} key={line.cartItemId}>
                    <div className="so-line__top">
                      <span className="so-line__name">{line.name}</span>
                      <span className="so-line__total">{fmtPrice(line.lineTotal)}</span>
                    </div>
                    {(line.selectedChoices?.length > 0 ||
                      line.selectedPaidAddOns?.length > 0 ||
                      line.selectedRemovals?.length > 0 ||
                      line.notes) && (
                      <p className="so-line__detail">
                        {[
                          ...(line.selectedChoices || []).map((c) => c.optionName),
                          ...(line.selectedPaidAddOns || []).map((a) => a.name),
                          /* A minus sign rather than a word: it reads the
                             same in both languages and needs no key. */
                          ...(line.selectedRemovals || []).map((r) => `− ${r}`),
                          line.notes,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {blocked && (
                      <p className="so-line__issue">
                        {t("staffOrder.lineUnavailable", "Not available any more — remove it to continue.")}
                      </p>
                    )}
                    <div className="so-line__actions">
                      <div className="so-qty">
                        <button
                          type="button"
                          className="so-qty__btn"
                          onClick={() => commitDraft(setDraftLineQuantity(draft, line.cartItemId, line.quantity - 1))}
                          disabled={line.quantity <= 1}
                          aria-label={t("common.decreaseQuantity", "Decrease quantity")}
                        >
                          <Minus size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                        <span className="so-qty__value">{line.quantity}</span>
                        <button
                          type="button"
                          className="so-qty__btn"
                          onClick={() => commitDraft(setDraftLineQuantity(draft, line.cartItemId, line.quantity + 1))}
                          aria-label={t("common.increaseQuantity", "Increase quantity")}
                        >
                          <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="so-line__btn"
                        onClick={() => handleEditLine(line)}
                      >
                        <Pencil size={12} strokeWidth={2.2} aria-hidden="true" />
                        {t("common.edit", "Edit")}
                      </button>
                      <button
                        type="button"
                        className="so-line__btn so-line__btn--danger"
                        onClick={() => commitDraft(removeDraftLine(draft, line.cartItemId))}
                      >
                        <Trash2 size={12} strokeWidth={2.2} aria-hidden="true" />
                        {t("common.remove", "Remove")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {draft.length > 0 && (
            <>
              <dl className="so-totals">
                <div>
                  <dt>{t("common.subtotal", "Subtotal")}</dt>
                  <dd>{fmtPrice(subtotal)}</dd>
                </div>
                {serviceChargePercent > 0 && (
                  <div>
                    <dt>{t("common.serviceCharge", "Service charge")} ({serviceChargePercent}%)</dt>
                    <dd>{fmtPrice(serviceCharge)}</dd>
                  </div>
                )}
                <div className="so-totals__total">
                  <dt>{t("common.total", "Total")}</dt>
                  <dd>{fmtPrice(total)}</dd>
                </div>
              </dl>

              {/* Phase 112.1 — the order leaves here unpaid, and says so.
                  How the guest settles is decided at the table, by whoever
                  takes the money, in Live Orders. */}
              <p className="so-unpaid-note">
                {t("staffOrder.unpaidNote", "This order is created unpaid. Payment is taken later from Live Orders.")}
              </p>
            </>
          )}

          {priceOnly && draft.length > 0 && (
            <div className="so-pricechange" role="status">
              <p>{t("staffOrder.pricesChanged", "A price changed while this order was open.")}</p>
              <button type="button" className="so-line__btn" onClick={handleRefreshPrices}>
                {t("staffOrder.refreshPrices", "Use current prices")}
              </button>
            </div>
          )}

          {result?.kind === "ok" && (
            <p className="so-result so-result--ok" role="status">
              <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden="true" />
              {t("staffOrder.placed", "Order placed")} — <strong>{result.orderId}</strong>
            </p>
          )}
          {result?.kind === "error" && (
            <p className="so-result so-result--error" role="alert">
              <AlertTriangle size={14} strokeWidth={2.2} aria-hidden="true" />
              {result.message}
            </p>
          )}

          {/* No confirmation step: the CTA names the destination, which is
              the confirmation. Locked while it runs so a double press cannot
              produce two orders. */}
          <Button
            variant="primary"
            className="so-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting
              ? t("staffOrder.placing", "Placing…")
              : isDirect
                ? t("staffOrder.placeDirect", "Place Direct Order")
                : `${t("staffOrder.placeOrder", "Place Order")} — ${contextLabel}`}
          </Button>
        </aside>
      </div>

      <ItemDetailsModal
        item={selectedItem}
        category={selectedCategory}
        open={!!selectedItem}
        mode={editingLine ? "edit" : "create"}
        line={editingLine}
        onClose={() => { setSelectedItem(null); setEditingLine(null); }}
        onSubmit={handleSheetSubmit}
      />
    </AdminLayout>
  );
}
