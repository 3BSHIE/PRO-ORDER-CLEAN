import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Search, SearchX, ShoppingBag, ShoppingCart, Clock, X, UtensilsCrossed,
} from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import ItemDetailsModal from "./components/ItemDetailsModal.jsx";
import CallStaffButton  from "./components/CallStaffButton.jsx";
import RestaurantIdentity from "./components/RestaurantIdentity.jsx";
import CustomerFooter     from "./components/CustomerFooter.jsx";
import RestaurantClosedNotice from "./components/RestaurantClosedNotice.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { formatItemCount, formatResultCount } from "../../i18n/counts.js";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import { getCustomerSession } from "../../lib/customerSession.js";
import {
  getCustomerCart, addCartItem,
  getCartTotal, getCartItemCount,
} from "../../lib/customerCart.js";
import { useMenuData } from "../../lib/useMenuData.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { usePrepTime } from "../../lib/usePrepTime.js";
import { useAcceptingOrders } from "../../lib/useAcceptingOrders.js";
import { isCategoryVisibleNow } from "../../lib/categoryVisibility.js";
import { fmtPrice } from "../../lib/format.js";

/* ── Price formatter ─────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════════
   CustomerMenuScreen — Phase 12

   Guards (unchanged since Phase 3):
     • QR token must be valid → else InvalidView
     • Customer session must exist → else redirect to onboarding

   Cart state (Phase 7, unchanged):
     • Real cart state, persisted in sessionStorage via src/lib/customerCart.js
     • "Add to cart" in ItemDetailsModal creates/merges a real cart line

   Cart page (Phase 8, unchanged):
     • Floating cart button (FAB) navigates to the real cart page

   What's new in Phase 12:
     • "My Orders" button is no longer disabled — it navigates to the real
       My Orders page (/r/:slug/table/:token/orders).

   NOT built yet: admin dashboard, kitchen board, backend,
   customer status-update controls, feedback/rating.
   ═══════════════════════════════════════════════════════════════════════ */

export default function CustomerMenuScreen({
  restaurantSlug,
  qrToken,
  onHome,
  onBackToAccess,
  onViewCart,
  onViewOrders,
}) {
  const result  = resolveTableAccess(restaurantSlug, qrToken);
  const session = getCustomerSession();
  const { t } = useLanguage();
  const { settings } = useSettingsData(restaurantSlug);

  const hasValidSession =
    result.ok &&
    session &&
    session.qrToken        === qrToken &&
    session.restaurantSlug === restaurantSlug &&
    !!session.customerName;

  useEffect(() => {
    if (result.ok && !hasValidSession) onBackToAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Gate 1: invalid QR */
  if (!result.ok) {
    return (
      <>
        <Topbar
          left={<Logo variant="icon" size="nav" />}
          right={<span className="badge badge--canceled">{t("common.qrAccess", "QR access")}</span>}
        />
        <main className="container">
          <InvalidAccessView reason={result.reason} onHome={onHome} />
        </main>
      </>
    );
  }

  /* Gate 2: redirect in progress */
  if (!hasValidSession) return null;

  const effectiveRestaurant = { ...result.restaurant, name: settings.name.trim() || result.restaurant.name };

  return (
    <MenuShell
      restaurant={effectiveRestaurant}
      table={result.table}
      session={session}
      onHome={onHome}
      onBackToAccess={onBackToAccess}
      onViewCart={onViewCart}
      onViewOrders={onViewOrders}
    />
  );
}

/* ── Menu Shell ──────────────────────────────────────────────────────────── */
function MenuShell({ restaurant, table, session, onHome, onBackToAccess, onViewCart, onViewOrders }) {
  const [activeCategory, setActiveCategory] = useState(null); // null = All
  const [searchQuery,    setSearchQuery]    = useState("");
  const { t } = useLanguage();
  const { categories: allCategories, items: allMenuItems } = useMenuData(restaurant.slug);
  /* Phase 26 — live Busy Mode flag, so a guest already sitting on the menu
     sees the notice appear when staff flip it, without reloading. */
  const { busyModeEnabled } = usePrepTime(restaurant.slug);
  /* Phase 79 — whether the restaurant is taking NEW orders at all. Entirely
     independent of Busy Mode above: that one only ever changes the estimate,
     this one decides whether there is anything to estimate. The hook carries
     its own poll and clock tick, so an Admin flipping the mode in another tab
     and an auto-mode window simply closing both reach this screen without a
     reload. */
  const { accepting: acceptingOrders } = useAcceptingOrders(restaurant.slug);
  /* Phase 28 — the restaurant's own timezone drives schedule evaluation, not
     the guest's device clock (a tourist's phone on the wrong timezone must
     not see a different menu than the table next to them). */
  const { settings } = useSettingsData(restaurant.slug);

  /* ONE shared clock for every scheduled category, not one timer per
     category. Schedules only have minute resolution, so a 30s tick is more
     than precise enough to retire a category within moments of its boundary
     while staying cheap. */
  const [visibilityTick, setVisibilityTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setVisibilityTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  /* Categories the guest is allowed to see right now. Everything downstream
     — chips, grouped sections, the flat grid, and search — derives from this
     one list, so there is exactly one place the rule is applied. */
  const categories = useMemo(
    () =>
      allCategories.filter((c) =>
        isCategoryVisibleNow(c, { timeZone: settings.timeZone })
      ),
    // visibilityTick is an intentional dependency: it is what re-evaluates
    // schedules for a menu that is already open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCategories, settings.timeZone, visibilityTick]
  );

  /* Item details modal state */
  const [selectedItem,  setSelectedItem]  = useState(null);

  /* Cart state — loaded from sessionStorage on mount, kept in sync via customerCart.js */
  const [cart, setCart] = useState(() => getCustomerCart());

  /* Phase 73 §23/§24 — the "Added to cart" toast is gone and nothing replaces
     it. The Cart FAB is now the acknowledgement: it already shows the count
     and the running total, which is strictly more information than the toast
     carried, and it lives where the guest goes next.

     fabVisibleRef records whether the FAB was on screen at the moment of the
     add. §25 forbids stacking its entrance and its acknowledgement, so the
     first item of an empty cart plays the entrance ONLY, and every later add
     plays the acknowledgement ONLY. A ref rather than the `cart` state
     because handleAddToCart is memoised with no deps and would otherwise
     close over a stale count. */
  const [fabAck, setFabAck] = useState(false);
  const fabVisibleRef = useRef(false);

  const cartCount = getCartItemCount(cart);
  const cartTotal = getCartTotal(cart);
  const hasCartItems = cartCount > 0;

  /* Derived: filtered + sorted items. Depends on the live categories/items
     from useMenuData (Phase 21) so Admin edits — a renamed category, a
     newly unavailable item, a reordered sort — show up immediately without
     a page reload. */
  const filteredItems = useMemo(() => {
    const catOrder = Object.fromEntries(categories.map((c) => [c.id, c.sortOrder]));
    const catNames = Object.fromEntries(
      categories.map((c) => [c.id, c.name.toLowerCase()])
    );

    /* Phase 28 — the gate for EVERY list on this screen. Filtering here
       rather than only in the grouped view is what stops a hidden
       category's products leaking through search, which previously bypassed
       the category list entirely and matched against the raw item array. */
    const visibleCategoryIds = new Set(categories.map((c) => c.id));
    let items = allMenuItems.filter((i) => visibleCategoryIds.has(i.categoryId));

    if (activeCategory) {
      items = items.filter((i) => i.categoryId === activeCategory);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          (catNames[i.categoryId] || "").includes(q)
      );
    }

    return items.sort((a, b) => {
      const cd = (catOrder[a.categoryId] || 99) - (catOrder[b.categoryId] || 99);
      return cd !== 0 ? cd : (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  }, [activeCategory, searchQuery, categories, allMenuItems]);

  const isSearching  = searchQuery.trim().length > 0;
  const showGrouped  = !activeCategory && !isSearching;
  const activeCat    = categories.find((c) => c.id === activeCategory);

  /* Phase 74 §44/§45 — is there anything at all to order right now?
     Counted BEFORE the category filter and the search query, so this is
     genuinely "this restaurant currently has no available products" and
     never "your search matched nothing" — those stay two separate states
     with two separate treatments (§45). */
  const hasAnyAvailableItem = useMemo(() => {
    const visibleCategoryIds = new Set(categories.map((c) => c.id));
    return allMenuItems.some((i) => visibleCategoryIds.has(i.categoryId));
  }, [categories, allMenuItems]);

  /* If the category the guest is currently browsing gets hidden underneath
     them (staff toggled it, or its schedule just ended), fall back to All
     rather than leaving them staring at an empty list with no chip selected. */
  useEffect(() => {
    if (activeCategory && !activeCat) setActiveCategory(null);
  }, [activeCategory, activeCat]);

  /* Phase 43 — both counted labels go through the shared formatters so each
     language picks its own shape. The category branch is untouched: emoji and
     name are Admin-entered content, not UI copy. */
  const sectionTitle = isSearching
    ? formatResultCount(t, filteredItems.length, searchQuery.trim())
    : activeCat
    ? `${activeCat.emoji} ${activeCat.name}`
    : t("customer.menu", "Menu");
  const sectionCount = isSearching
    ? null
    : formatItemCount(t, filteredItems.length);

  /* Open the modal for any tapped item (available or not) */
  const handleOpenItem = useCallback((item) => setSelectedItem(item), []);
  const handleCloseModal = useCallback(() => setSelectedItem(null), []);

  /* Real add-to-cart: builds the structured cart item, merges/saves it,
     closes the modal, and shows a confirmation toast. */
  const handleAddToCart = useCallback((item, quantity, notes, selections) => {
    const { selectedRemovals, selectedChoices, selectedPaidAddOns } = selections;

    const choicesPrice = selectedChoices.reduce((sum, c) => sum + (c.price || 0), 0);
    const addOnsPrice  = selectedPaidAddOns.reduce((sum, a) => sum + (a.price || 0), 0);
    const unitPrice    = item.price + choicesPrice + addOnsPrice;
    const lineTotal    = parseFloat((unitPrice * quantity).toFixed(3));

    const nextCart = addCartItem({
      itemId: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      basePrice: item.price,
      unitPrice,
      quantity,
      lineTotal,
      selectedRemovals,
      selectedChoices,
      selectedPaidAddOns,
      notes: notes || "",
    });

    setCart(nextCart);
    setSelectedItem(null);
    /* Acknowledge only when the FAB was already there to acknowledge with. */
    if (fabVisibleRef.current) setFabAck(true);
  }, []);

  /* Clear the one-shot class so a later add can replay it. 340ms covers the
     320ms animation with a little slack; it never loops. */
  useEffect(() => {
    if (!fabAck) return;
    const id = setTimeout(() => setFabAck(false), 340);
    return () => clearTimeout(id);
  }, [fabAck]);

  /* Kept in sync every render, read only inside the add handler. */
  useEffect(() => { fabVisibleRef.current = hasCartItems; }, [hasCartItems]);

  /* FAB click — navigates to the real cart page (Phase 8) */
  const handleFabClick = useCallback(() => {
    onViewCart?.();
  }, [onViewCart]);

  /* Phase 33 — the "Clear cart (demo only)" / "Clear session (demo only)"
     buttons that used to live in the menu footer were removed: they were
     customer-reachable destructive actions, and both are already available
     (dev-only) from the DemoSwitcher Danger zone, so nothing is lost for
     local testing. Their handlers went with them. */

  const selectedCategory = selectedItem
    ? categories.find((c) => c.id === selectedItem.categoryId)
    : null;

  return (
    <>
      {/* ── Topbar ──────────────────────────────────────────────────────────
          Phase 45 — the PRO·ORDER mark is gone from here. On this screen the
          restaurant's own identity sits immediately below in the header, so a
          platform logo in the topbar would be the louder of the two brands and
          would also repeat a mark the footer already carries. */}
      {/* Phase 73 §32/§36 — the topbar is already position:sticky, so putting
          Call Staff here is what makes it reachable at any scroll depth on a
          3,400px menu without inventing a second floating button (the Cart FAB
          owns that space). Table identity moves to the left so the right side
          reads as one action cluster rather than a mixed toolbar, and the
          labels collapse to icons on narrow phones — see .menu-topbar-right. */}
      <Topbar
        left={
          <span className="menu-table-pill">
            {t("customer.yourTable", "Table")} #{table.tableNumber}
          </span>
        }
        right={
          <div className="menu-topbar-right">
            <CallStaffButton
              restaurantSlug={restaurant.slug}
              tableId={table.id}
              tableNumber={table.tableNumber}
              customerName={session.customerName}
              variant="compact"
            />
            {/* The label is wrapped so it can collapse on narrow phones
                (§36) while the icon stays. aria-label carries the name in
                that case, so the control never becomes an unlabelled icon.

                Note: no className is passed — Button spreads ...rest AFTER
                its own className, so supplying one would replace `btn
                btn--ghost btn--sm` outright and strip the button's styling. */}
            <Button
              variant="ghost"
              size="sm"
              icon={ShoppingBag}
              onClick={onViewOrders}
              aria-label={t("customer.myOrders", "My Orders")}
              style={{ fontSize: 13 }}
            >
              <span className="menu-orders-label">
                {t("customer.myOrders", "My Orders")}
              </span>
            </Button>
          </div>
        }
      />

      <main className={`container ${hasCartItems ? "container--with-fab" : ""}`}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="menu-header anim-rise">
          {/* Phase 45 — the restaurant is now the headline. It was an 11px
              uppercase eyebrow above a 26px greeting, which made the software's
              copy louder than the venue the guest is sitting in.

              The greeting and table number merged into the single secondary
              line below: they are context, not the title, and separating them
              across two lines cost ~38px before any food appeared. The
              greeting word is translated; the name is never localized. */}
          <RestaurantIdentity
            name={restaurant.name}
            logoUrl={settings.logoUrl}
            variant="hero"
          />
          {/* Phase 73 §4 — the table number left this line. It is already in
              the sticky topbar, where it stays visible the whole way down the
              menu; repeating it here stated the same fact twice in the same
              viewport. The greeting keeps the name, which is the part that is
              actually personal. */}
          <p className="menu-header__meta">
            {t("customer.greeting", "Hi,")} <i>{session.customerName}</i>
          </p>
        </header>

        {/* ── Busy notice (Phase 26) ──────────────────────────────────────
            Informational only — it never disables the menu, the item modal,
            the cart, or checkout. Ordering stays fully open while busy.

            Phase 79 — withheld while the restaurant is not accepting orders,
            because "orders may take a little longer" directly contradicts
            "we're not accepting orders right now" and the guest would be
            reading both in one viewport. This is presentation only: Busy Mode
            itself is untouched, the prep estimate is untouched, and the Admin
            card still shows and controls it exactly as before. Nothing about
            the accepting-orders state writes to prep-time data, and nothing
            about Busy Mode is consulted when deciding whether to accept. */}
        {busyModeEnabled && acceptingOrders && (
          <div className="busy-notice anim-rise" role="status">
            <Clock size={14} strokeWidth={2.2} />
            <span>
              {t(
                "prep.customerBusyNotice",
                "We're currently busy. Orders may take a little longer."
              )}
            </span>
          </div>
        )}

        {/* Phase 74 §44/§45 — when the restaurant has nothing available, the
            page used to render a search box, a full row of category chips and
            a "Menu · 0 items" heading followed by the footer, which read as a
            broken page. Search over zero products and chips for empty
            categories cannot do useful work, so they are withheld and one
            calm fallback takes their place. Restaurant identity and the
            header above are untouched. */}
        {/* Phase 79 §18 — while the restaurant is not accepting orders the
            ordering area is replaced outright rather than left live-but-
            disabled. A grid of tappable cards over a blocked checkout would
            invite the guest to build a cart they cannot place; withholding
            search, chips and the grid states the situation once, at the top,
            where the food would have been.

            Checked BEFORE the empty-menu fallback because it is the more
            specific and more recoverable explanation: a closed restaurant
            still has a full menu, and telling the guest it is "temporarily
            unavailable" would be both wrong and less useful than telling them
            when to come back. Nothing about the menu data is touched — this is
            a render branch, and everything returns the moment the restaurant
            reopens (§18, §24). */}
        {!acceptingOrders ? (
          <RestaurantClosedNotice />
        ) : !hasAnyAvailableItem ? (
          <MenuUnavailable />
        ) : (
        <>
        {/* ── Search ──────────────────────────────────────────────────── */}
        <div className="menu-search anim-rise" style={{ animationDelay: "80ms" }}>
          <Search className="menu-search__icon" size={16} strokeWidth={2} />
          <input
            className="menu-search__input"
            type="search"
            placeholder={t("customer.searchMenuPlaceholder", "Search menu…")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
          />
          {searchQuery && (
            /* Phase 73 §13 — the bare "✕" glyph rendered at a different weight
               and baseline than every other icon on the screen. Lucide X keeps
               the clear action in the same icon family as the search mark. */
            <button
              type="button"
              className="menu-search__clear"
              onClick={() => setSearchQuery("")}
              aria-label={t("customer.clearSearch", "Clear search")}
            >
              <X size={15} strokeWidth={2.4} />
            </button>
          )}
        </div>

        {/* ── Category chips ────────────────────────────────────────────
            Phase 73 §11/§12 — the emoji stays. It is Admin-entered content
            that gives a restaurant its personality, not UI decoration, and
            removing it was explicitly rejected by the owner. Only the active
            treatment and the scroll behaviour changed. */}
        <div className="chips-row anim-rise" style={{ animationDelay: "120ms" }}>
          <button
            type="button"
            className={`chip ${!activeCategory ? "chip--active" : ""}`}
            aria-pressed={!activeCategory}
            onClick={(e) => { setActiveCategory(null); setSearchQuery(""); revealChip(e.currentTarget); }}
          >
            {t("common.all", "All")}
          </button>
          {/* `categories` is already the visibility-filtered list (which
              subsumes the old isActive check), so no extra filter here. */}
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`chip ${activeCategory === cat.id ? "chip--active" : ""}`}
              aria-pressed={activeCategory === cat.id}
              onClick={(e) => { setActiveCategory(cat.id); setSearchQuery(""); revealChip(e.currentTarget); }}
            >
              {cat.emoji} {cat.name}
            </button>
          ))}
        </div>

        {/* ── Section bar ─────────────────────────────────────────────── */}
        <div className="menu-section-bar anim-rise" style={{ animationDelay: "160ms" }}>
          <h2 className="menu-section-title">{sectionTitle}</h2>
          {sectionCount && (
            <span className="menu-section-count">{sectionCount}</span>
          )}
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        {showGrouped ? (
          <GroupedView items={filteredItems} categories={categories} onOpen={handleOpenItem} />
        ) : filteredItems.length === 0 ? (
          /* Still the Phase 73 search-no-results state, deliberately NOT
             merged with the zero-products fallback above (§45). */
          <SearchEmpty query={searchQuery} />
        ) : (
          <ItemGrid items={filteredItems} onOpen={handleOpenItem} />
        )}
        </>
        )}

        {/* Inside the container so the existing cart-FAB bottom padding keeps
            protecting it — the footer scrolls with the content and never sits
            under the floating cart button. */}
        <CustomerFooter />
      </main>

      {/* ── Floating cart button ────────────────────────────────────────── */}
      {hasCartItems && (
        <button
          type="button"
          className={`cart-fab ${fabAck ? "cart-fab--ack" : ""}`}
          onClick={handleFabClick}
        >
          <span className="cart-fab__icon-wrap">
            <ShoppingCart size={18} strokeWidth={2.2} />
            <span className="cart-fab__count">{cartCount}</span>
          </span>
          <span className="cart-fab__label">{t("customer.viewCart", "View Cart")}</span>
          <span className="cart-fab__total">{fmtPrice(cartTotal)}</span>
        </button>
      )}

      {/* ── Item details modal ─────────────────────────────────────────── */}
      <ItemDetailsModal
        item={selectedItem}
        category={selectedCategory}
        open={!!selectedItem}
        onClose={handleCloseModal}
        onPlaceholderAdd={handleAddToCart}
      />
    </>
  );
}

/**
 * Phase 73 §12 — bring a just-selected chip fully into the horizontal strip.
 *
 * `inline:"nearest"` is the whole point: a chip already fully visible does
 * not move at all, so tapping the chip you are looking at never shifts the
 * row under your finger. `block:"nearest"` keeps it from scrolling the page
 * vertically as a side effect.
 *
 * Smooth scrolling is skipped outright when the guest asks for reduced
 * motion — the global CSS rule collapses durations but cannot reach a
 * scroll behaviour passed in JS.
 */
function revealChip(el) {
  if (!el?.scrollIntoView) return;
  let smooth = true;
  try {
    smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    /* matchMedia unavailable — fall back to smooth, which degrades safely. */
  }
  el.scrollIntoView({
    behavior: smooth ? "smooth" : "auto",
    inline: "nearest",
    block: "nearest",
  });
}

/* ── Grouped view (All, no search) ─────────────────────────────────────── */
function GroupedView({ items, categories, onOpen }) {
  const { t } = useLanguage();
  return (
    <>
      {/* Receives the already visibility-filtered category list. */}
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.categoryId === cat.id);
        if (!catItems.length) return null;
        return (
          <section key={cat.id} className="menu-cat-section anim-rise">
            <div className="menu-cat-section__header">
              <h2 className="menu-cat-section__title">
                {cat.emoji} {cat.name}
              </h2>
              <span className="menu-cat-section__count">
                {formatItemCount(t, catItems.length)}
              </span>
            </div>
            <ItemGrid items={catItems} onOpen={onOpen} />
          </section>
        );
      })}
    </>
  );
}

/* ── Flat item grid ─────────────────────────────────────────────────────── */
function ItemGrid({ items, onOpen }) {
  return (
    <div className="menu-grid">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}

/* ── Product card ───────────────────────────────────────────────────────── */
function ItemCard({ item, onOpen }) {
  const available = item.isAvailable;
  const { t } = useLanguage();
  const oosId = `oos-${item.id}`;

  /* Phase 44 — an unavailable card is not a control.
     It keeps its place in the menu and stays readable, but sheds role,
     tabIndex and both handlers entirely rather than guarding inside them.
     Spreading nothing is what actually removes it from the tab order and
     stops a screen reader announcing "button": leaving role="button" and
     merely ignoring the click would still promise an action that never
     happens. Opening the sheet only to say "you cannot order this" was the
     behavior this phase removes. */
  const cardInteraction = available
    ? {
        role: "button",
        tabIndex: 0,
        onClick: () => onOpen(item),
        onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && onOpen(item),
      }
    : {};

  return (
    <article
      className={`item-card ${available ? "item-card--available" : "item-card--unavailable"}`}
      {...cardInteraction}
    >
      {/* Phase 73 §10 — the category emoji is no longer used as a product
          image stand-in. It said nothing about the dish and rendered the same
          giant glyph across every item in a category. */}
      <ItemImage src={item.imageUrl} alt={item.name} name={item.name} />

      {/* Out of stock overlay badge. Carries an id so the disabled "+" can
          point at it instead of repeating the wording — one source of truth
          for the status text, in whichever language is active. */}
      {!available && (
        <span className="item-card__oos-badge" id={oosId}>
          {t("common.outOfStock", "Out of Stock")}
        </span>
      )}

      {/* Body */}
      <div className="item-card__body">
        {/* Phase 73 §7 — at most ONE badge, priority Out of Stock > Popular >
            Featured. The product's own isPopular/isFeatured flags are
            untouched; this is purely which one the card is allowed to show.
            Out of Stock wins by being handled above as the image overlay
            (Phase 44, deliberately preserved), so an unavailable card shows
            no body badge at all rather than two competing statuses.

            The slot is always rendered, even when empty, so the product name
            sits at the same height on every card in a row. */}
        <div className="item-card__badges">
          {available && item.isPopular && (
            <span className="badge badge--gold item-card__badge">
              {t("customer.popular", "Popular")}
            </span>
          )}
          {available && !item.isPopular && item.isFeatured && (
            <span className="badge badge--featured item-card__badge">
              {t("customer.featured", "Featured")}
            </span>
          )}
        </div>
        <p className="item-card__name">{item.name}</p>
        <p className="item-card__desc">{item.description}</p>
        <div className="item-card__foot">
          <span className="item-card__price">{fmtPrice(item.price)}</span>
          {/* Unchanged behavior for an available item: this opens Item
              Details, exactly as before, and never quick-adds. When the item
              is out of stock the button is disabled and describes itself by
              pointing at the badge, so assistive tech reads the name, then
              the status, then "dimmed" — the reason, not just the refusal. */}
          <button
            type="button"
            className="item-card__add"
            disabled={!available}
            onClick={(e) => {
              e.stopPropagation();
              if (available) onOpen(item);
            }}
            aria-label={
              available
                ? t("customer.openItem", "Open {name}").replace("{name}", item.name)
                : item.name
            }
            aria-describedby={available ? undefined : oosId}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Phase 73 §10 — initials for a product that has no photograph.
 *
 * Deterministic and content-derived: the same dish always yields the same
 * mark, so a menu looks composed rather than random, and nothing needs to be
 * stored or configured.
 *
 * Two words give two initials ("Rigatoni Pomodoro" -> RP). A single word
 * gives its first two letters ("Tiramisu" -> TI), which reads better than one
 * lonely glyph. Anything that yields nothing usable falls through to an empty
 * string and the CSS simply shows the textured panel — never a broken box.
 *
 * Intl-safe by construction: it slices whole code points rather than UTF-16
 * units, so an Arabic or accented name cannot be cut in half, and it never
 * assumes a Latin alphabet.
 */
function productMonogram(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";

  const firstOf = (word) => Array.from(word)[0] ?? "";

  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join("").toLocaleUpperCase();
  }
  return (firstOf(words[0]) + firstOf(words[1])).toLocaleUpperCase();
}

/* ── Image with monogram fallback ───────────────────────────────────────── */
function ItemImage({ src, alt, name }) {
  const [imgErr, setImgErr] = useState(false);
  const useImg = src && !imgErr;
  return (
    <div className="item-card__img-wrap">
      {useImg ? (
        <img
          className="item-card__img"
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setImgErr(true)}
        />
      ) : (
        /* aria-hidden: the product name is right below in real text, so
           announcing "RP" as well would only add noise. */
        <div className="item-card__mono-wrap" aria-hidden="true">
          <span className="item-card__mono">{productMonogram(name)}</span>
        </div>
      )}
    </div>
  );
}

/* ── Menu unavailable — rare zero-products safety net (Phase 74 §44) ─────
   Not a normal restaurant workflow: a venue should never go live with an
   empty menu. This exists purely so that if it happens the page reads as a
   deliberate state rather than a rendering failure. Same shared recovery
   geometry as the other empty states, in the neutral/gold family because
   nothing has gone wrong — there is simply nothing to show yet. */
function MenuUnavailable() {
  const { t } = useLanguage();
  return (
    <div className="menu-unavailable anim-rise" role="status">
      <span className="menu-unavailable__icon">
        <UtensilsCrossed size={26} strokeWidth={1.8} />
      </span>
      <h3 className="menu-unavailable__title">
        {t("customer.menuUnavailableTitle", "Menu temporarily unavailable")}
      </h3>
      <p className="menu-unavailable__sub">
        {t(
          "customer.menuUnavailableSub",
          "There are no items available to order right now. Please ask a staff member for assistance."
        )}
      </p>
    </div>
  );
}

/* ── Search empty state ─────────────────────────────────────────────────── */
function SearchEmpty({ query }) {
  const { t } = useLanguage();
  return (
    /* Phase 73 §14 — this state is specifically "the menu HAS products, this
       query matched none", which is why it keeps its own component and copy
       and is not merged with the (separate) no-products-at-all case. The raw
       emoji became a Lucide SearchX inside the shared rounded-square mark. */
    <div className="menu-search-empty anim-fade-in">
      <span className="menu-search-empty__icon">
        <SearchX size={26} strokeWidth={1.8} />
      </span>
      <h3 className="menu-search-empty__title">{t("customer.noItemsFound", "No items found")}</h3>
      {/* Phase 43 — the query keeps its own <strong> so it stays visually
          distinct in both languages, and is never translated. */}
      <p className="menu-search-empty__sub">
        {t("customer.nothingMatched", "Nothing matched")}{" "}
        <strong>"{query.trim()}"</strong>.<br />
        {t("customer.tryDifferentWord", "Try a different word or browse by category.")}
      </p>
    </div>
  );
}

/* ── Invalid QR view ────────────────────────────────────────────────────── */
