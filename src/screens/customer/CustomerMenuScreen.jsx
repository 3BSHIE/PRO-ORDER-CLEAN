import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Search, ShoppingBag, RotateCcw, ShoppingCart, Clock,
} from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import ItemDetailsModal from "./components/ItemDetailsModal.jsx";
import CallStaffButton  from "./components/CallStaffButton.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import { getCustomerSession, clearCustomerSession } from "../../lib/customerSession.js";
import {
  getCustomerCart, addCartItem, clearCustomerCart,
  getCartTotal, getCartItemCount,
} from "../../lib/customerCart.js";
import { useMenuData } from "../../lib/useMenuData.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { usePrepTime } from "../../lib/usePrepTime.js";
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
  const { categories, items: allMenuItems } = useMenuData(restaurant.slug);
  /* Phase 26 — live Busy Mode flag, so a guest already sitting on the menu
     sees the notice appear when staff flip it, without reloading. */
  const { busyModeEnabled } = usePrepTime(restaurant.slug);

  /* Item details modal state */
  const [selectedItem,  setSelectedItem]  = useState(null);

  /* Cart state — loaded from sessionStorage on mount, kept in sync via customerCart.js */
  const [cart, setCart] = useState(() => getCustomerCart());

  /* Toast state (shared message for cart / clear / FAB actions) */
  const [toastVisible,  setToastVisible]  = useState(false);
  const [toastMessage,  setToastMessage]  = useState("");

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

    let items = [...allMenuItems];

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

  const sectionTitle = isSearching
    ? `${filteredItems.length} result${filteredItems.length !== 1 ? "s" : ""} for "${searchQuery.trim()}"`
    : activeCat
    ? `${activeCat.emoji} ${activeCat.name}`
    : t("customer.menu", "Menu");
  const sectionCount = isSearching
    ? null
    : `${filteredItems.length} item${filteredItems.length !== 1 ? "s" : ""}`;

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
    setToastMessage(t("customer.addedToCart", "Added to cart"));
    setToastVisible(true);
  }, []);

  /* FAB click — navigates to the real cart page (Phase 8) */
  const handleFabClick = useCallback(() => {
    onViewCart?.();
  }, [onViewCart]);

  /* Demo-only clear cart */
  function handleClearCart() {
    clearCustomerCart();
    setCart([]);
    setToastMessage(t("customer.cartCleared", "Cart cleared"));
    setToastVisible(true);
  }

  /* Clearing the session also clears the cart, then returns to onboarding */
  function handleClearSession() {
    clearCustomerSession();
    clearCustomerCart();
    onBackToAccess();
  }

  const selectedCategory = selectedItem
    ? categories.find((c) => c.id === selectedItem.categoryId)
    : null;

  return (
    <>
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <Topbar
        left={<Logo variant="icon" size="nav" />}
        right={
          <div className="menu-topbar-right">
            <span className="menu-table-pill">{t("customer.yourTable", "Table")} #{table.tableNumber}</span>
            <Button
              variant="ghost"
              size="sm"
              icon={ShoppingBag}
              onClick={onViewOrders}
              style={{ fontSize: 13 }}
            >
              {t("customer.myOrders", "My Orders")}
            </Button>
          </div>
        }
      />

      <main className={`container ${hasCartItems ? "container--with-fab" : ""}`}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="menu-header anim-rise">
          <p className="menu-header__rest">{restaurant.name}</p>
          <h1 className="menu-header__greeting">
            Hi, <i>{session.customerName}</i> 👋
          </h1>
          <p className="menu-header__meta">
            {t("customer.yourTable", "Table")} #{table.tableNumber} &middot; What are you having today?
          </p>

          {/* Phase 25 — quiet, always-available way to ask for a person.
              Deliberately understated here: ordering is the primary task on
              this screen, this is the fallback. */}
          <CallStaffButton
            restaurantSlug={restaurant.slug}
            tableId={table.id}
            tableNumber={table.tableNumber}
            customerName={session.customerName}
            variant="subtle"
            onNotify={(message) => {
              setToastMessage(message);
              setToastVisible(true);
            }}
          />
        </header>

        {/* ── Busy notice (Phase 26) ──────────────────────────────────────
            Informational only — it never disables the menu, the item modal,
            the cart, or checkout. Ordering stays fully open while busy. */}
        {busyModeEnabled && (
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
            <button
              type="button"
              className="menu-search__clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Category chips ──────────────────────────────────────────── */}
        <div className="chips-row anim-rise" style={{ animationDelay: "120ms" }}>
          <button
            type="button"
            className={`chip ${!activeCategory ? "chip--active" : ""}`}
            onClick={() => { setActiveCategory(null); setSearchQuery(""); }}
          >
            {t("common.all", "All")}
          </button>
          {categories.filter((c) => c.isActive).map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`chip ${activeCategory === cat.id ? "chip--active" : ""}`}
              onClick={() => { setActiveCategory(cat.id); setSearchQuery(""); }}
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
          <SearchEmpty query={searchQuery} />
        ) : (
          <ItemGrid items={filteredItems} categories={categories} onOpen={handleOpenItem} />
        )}

        {/* ── Demo footer actions ───────────────────────────────────────── */}
        <div className="menu-demo-foot">
          {hasCartItems && (
            <button type="button" className="menu-demo-clear" onClick={handleClearCart}>
              <RotateCcw size={12} strokeWidth={2.2} /> {t("common.clearCart", "Clear cart (demo only)")}
            </button>
          )}
          <button type="button" className="menu-demo-clear" onClick={handleClearSession}>
            <RotateCcw size={12} strokeWidth={2.2} /> {t("common.clearSession", "Clear session (demo only)")}
          </button>
        </div>
      </main>

      {/* ── Floating cart button ────────────────────────────────────────── */}
      {hasCartItems && (
        <button type="button" className="cart-fab" onClick={handleFabClick}>
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

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </>
  );
}

/* ── Grouped view (All, no search) ─────────────────────────────────────── */
function GroupedView({ items, categories, onOpen }) {
  return (
    <>
      {categories.filter((c) => c.isActive).map((cat) => {
        const catItems = items.filter((i) => i.categoryId === cat.id);
        if (!catItems.length) return null;
        return (
          <section key={cat.id} className="menu-cat-section anim-rise">
            <div className="menu-cat-section__header">
              <h2 className="menu-cat-section__title">
                {cat.emoji} {cat.name}
              </h2>
              <span className="menu-cat-section__count">
                {catItems.length} item{catItems.length !== 1 ? "s" : ""}
              </span>
            </div>
            <ItemGrid items={catItems} categories={categories} onOpen={onOpen} />
          </section>
        );
      })}
    </>
  );
}

/* ── Flat item grid ─────────────────────────────────────────────────────── */
function ItemGrid({ items, categories, onOpen }) {
  return (
    <div className="menu-grid">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} categories={categories} onOpen={onOpen} />
      ))}
    </div>
  );
}

/* ── Product card ───────────────────────────────────────────────────────── */
function ItemCard({ item, categories, onOpen }) {
  const cat = categories.find((c) => c.id === item.categoryId);
  const available = item.isAvailable;
  const { t } = useLanguage();

  return (
    <article
      className={`item-card ${available ? "item-card--available" : "item-card--unavailable"}`}
      onClick={() => onOpen(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(item)}
    >
      {/* Image / emoji placeholder */}
      <ItemImage src={item.imageUrl} alt={item.name} emoji={cat?.emoji || "🍽️"} />

      {/* Out of stock overlay badge */}
      {!available && (
        <span className="item-card__oos-badge">{t("common.outOfStock", "Out of Stock")}</span>
      )}

      {/* Body */}
      <div className="item-card__body">
        {(item.isPopular || item.isFeatured) && (
          <div className="item-card__badges">
            {item.isPopular && (
              <span className="badge badge--gold item-card__badge">{t("customer.popular", "Popular")}</span>
            )}
            {item.isFeatured && (
              <span className="badge badge--received item-card__badge">
                {t("customer.featured", "Featured")}
              </span>
            )}
          </div>
        )}
        <p className="item-card__name">{item.name}</p>
        <p className="item-card__desc">{item.description}</p>
        <div className="item-card__foot">
          <span className="item-card__price">{fmtPrice(item.price)}</span>
          <button
            type="button"
            className="item-card__add"
            disabled={!available}
            onClick={(e) => {
              e.stopPropagation();
              if (available) onOpen(item);
            }}
            aria-label={`Open ${item.name}`}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}

/* ── Image with emoji fallback ──────────────────────────────────────────── */
function ItemImage({ src, alt, emoji }) {
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
        <div className="item-card__emoji-wrap">
          <span className="item-card__emoji">{emoji}</span>
        </div>
      )}
    </div>
  );
}

/* ── Search empty state ─────────────────────────────────────────────────── */
function SearchEmpty({ query }) {
  const { t } = useLanguage();
  return (
    <div className="menu-search-empty anim-rise">
      <div className="menu-search-empty__icon">🔍</div>
      <h3 className="menu-search-empty__title">{t("customer.noItemsFound", "No items found")}</h3>
      <p className="menu-search-empty__sub">
        Nothing matched <strong>"{query.trim()}"</strong>.<br />
        Try a different word or browse by category.
      </p>
    </div>
  );
}

/* ── Invalid QR view ────────────────────────────────────────────────────── */
