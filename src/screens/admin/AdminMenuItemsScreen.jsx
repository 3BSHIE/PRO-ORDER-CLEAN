import { useState, useMemo, useRef, useEffect } from "react";
import { Pencil, Trash2, Plus, X, Search, UtensilsCrossed, ChevronUp, ChevronDown } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Input   from "../../components/ui/Input.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { useMenuData } from "../../lib/useMenuData.js";
/* Phase 103.0 §25 — the project's existing URL guard, already used by
   RestaurantIdentity and CustomerLoadingScreen. Reused, not reimplemented. */
import { isSafeImageSrc } from "../../lib/safeImage.js";
import ImageAssetField from "../../components/admin/ImageAssetField.jsx";
import {
  IMAGE_ERROR,
  deleteImageAsset,
  useImageAssetSrc,
} from "../../lib/imageAssets.js";
import { productMonogram } from "../customer/CustomerMenuScreen.jsx";
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  setMenuItemAvailable,
  genChoiceGroupId,
  genChoiceOptionId,
  genAddOnId,
} from "../../lib/menuData.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import LocalizedField from "../../components/ui/LocalizedField.jsx";
import {
  getLocalizedText,
  localizedVariants,
  hasLocalizedText,
  trimLocalizedText,
  BASE_CONTENT_LANGUAGE,
} from "../../lib/localizedContent.js";
import { can, PERMISSIONS } from "../../lib/permissions.js";
/* Phase 66 — the price rules moved to src/lib/menuPricing.js so the storage
   boundary can enforce the identical rules. Behaviour here is unchanged. */
import { parseProductPrice, parseChoiceOptionPrice, parseAddOnPrice } from "../../lib/menuPricing.js";
import { parseSortOrder } from "../../lib/menuSortOrder.js";
import {
  validateGroupConfig,
  parseSelectionBound,
  buildCustomizationSections,
  describeGroupRule,
  /* Phase 114.0 — conditional visibility. The editor judges and offers; the
     RULES live in the shared module, so what Admin refuses to save and what
     the guest sheet, the cart and the order gate refuse to honour are the
     same definition rather than two that have to be kept in step. */
  getEligibleParentGroups,
  getDependentGroups,
  normalizeVisibilityCondition,
  CONDITION_ISSUE,
} from "../../lib/choiceRules.js";
import { registerNavigationGuard } from "../../lib/navigationGuard.js";
import { fmtPrice } from "../../lib/format.js";

/* ═══════════════════════════════════════════════════════════════════════════
   AdminMenuItemsScreen — Phase 21

   Full product CRUD for Admin/Cashier: view, add, edit, delete every field
   the customer Item Details Modal reads — name, description, price,
   category, image URL, sort order, availability, featured, popular — plus
   the full customization configuration: removable ingredients, choice
   groups (name/required/max-selections/options with per-option price), and
   paid add-ons.

   All writes go through src/lib/menuData.js (localStorage + a
   "pro-order-menu-change" event), so the customer Menu screen and Item
   Details Modal reflect edits immediately — no reload needed. Deleting or
   editing an item never touches historical orders, which store their own
   frozen snapshot of name/price/customizations at purchase time.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Phase 47 — strict price parsing for the product editor.
 *
 * The form previously did `parseFloat(price) || 0`, which is permissive in
 * three separate ways, each of which published a bad product silently:
 *   ""      → 0        an empty field became a free item
 *   "abc"   → 0        so did anything unparseable
 *   "12.5o" → 12.5     parseFloat stops at the first bad character, so a
 *                      typo saved a *different* price than was typed
 *   "-5"    → -5       negatives passed straight through and subtract from
 *                      the cart total
 *
 * A regex is used rather than Number()/parseFloat because the requirement is
 * about the *string the manager typed*, not about what JavaScript is willing
 * to coerce. Number(" 12 ") is 12 and Number("1e3") is 1000; neither is a
 * price a person meant to enter. Only plain decimal notation is accepted, so
 * partial parsing cannot happen at all — a malformed string has no valid
 * prefix to salvage.
 *
 * Note the input is type="number", so most junk never reaches state (the DOM
 * reports "" for unparseable content). This does not rely on that: the same
 * value can arrive by paste, autofill, or a future change of input type, and
 * the rule should hold wherever it comes from.
 *
 * @param {unknown} raw — the field's current string value
 * @returns {number|null} a finite Number > 0, or null if the input is invalid
 */
/* Stable id so a failed validation can focus the field it belongs to. Only
   one product editor is ever mounted at a time, so a constant is safe. */
const PRICE_FIELD_ID = "mm-product-price";
/* Phase 67 — same purpose: a failed save can focus the field it belongs to. */
const SORT_ORDER_FIELD_ID = "mm-product-sort-order";

/* Phase 48 — per-group field ids, same purpose as PRICE_FIELD_ID above. */
const groupNameFieldId = (groupId) => `mm-group-name-${groupId}`;
const groupMaxFieldId  = (groupId) => `mm-group-max-${groupId}`;
const groupMinFieldId  = (groupId) => `mm-group-min-${groupId}`;
/* Phase 114.0 — the focus target when a save fails on a broken condition. */
const groupVisFieldId  = (groupId) => `mm-group-vis-${groupId}`;

/* ── Phase 115.0 — product image limits ──────────────────────────────────
   Deliberately different from the logo's 512px / 6 MB. A logo is a mark that
   is never painted large; a product photograph is the hero of the Item
   Details sheet and fills a card on a high-density phone, so 1024px on the
   longest edge is the point where keeping more pixels stops being visible.
   8 MB of source allows a photo straight off a phone camera, which is where
   these images actually come from, while still refusing a file that is
   plainly not a menu picture. */
const MAX_PRODUCT_IMAGE_EDGE = 1024;
const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;

/* One sentence per failure, each naming what the manager can do about it.
   Keyed by the code processImageFile throws, with STORAGE as the fallback
   for anything unexpected — the honest reading of an error we did not
   anticipate is "it did not get stored". */
const IMAGE_ERROR_COPY = {
  [IMAGE_ERROR.TYPE]: ["admin.imageTypeError", "Choose a PNG, JPG or WebP image."],
  [IMAGE_ERROR.SIZE]: ["admin.imageSizeError", "That image is too large. Choose one under 8 MB."],
  [IMAGE_ERROR.DECODE]: ["admin.imageDecodeError", "That file could not be read as an image."],
  [IMAGE_ERROR.STORAGE]: ["admin.imageStorageError", "The image could not be stored on this device. The previous image is unchanged."],
};

/**
 * Phase 48 — strict parsing for a choice group's selection limit.
 *
 * The editor previously coerced this on every keystroke with
 * `parseInt(value, 10) || 1`, which destroyed the manager's input before it
 * could ever be judged:
 *   ""    -> 1     an emptied field silently became "choose one"
 *   "0"   -> 1     so did zero
 *   "abc" -> 1     and anything unparseable
 *   "1.5" -> 1     a decimal was truncated without a word
 *   "-1"  -> -1    negative survived, because parseInt("-1") is truthy
 *
 * Whole numbers only — a selection limit of 2.5 has no meaning — so the
 * regex rejects any decimal point rather than rounding one away.
 *
 * @param {unknown} raw
 * @returns {number|null} an integer >= 1, or null if invalid
 */
export function parseSelectionLimit(raw) {
  const text = String(raw ?? "").trim();
  /* Digits only: rejects "", "1.5", "-1", "+1", "abc", "1e2", " ". */
  if (!/^\d+$/.test(text)) return null;

  const value = Number(text);
  /* The >= 1 test is what rejects "0" and "00". */
  if (!Number.isInteger(value) || value < 1) return null;

  return value;
}

/**
 * Phase 48 — validate every choice group the save would actually persist.
 *
 * Judged against the FINAL options, not the visible rows: the save filters
 * out blank-named options, so a group showing three empty rows really has
 * zero options and is treated that way. That is the exact case Phase 46
 * found — a required group could be saved with nothing to choose from, and
 * the customer then met a required question with no answers and an item that
 * could never be added to the cart.
 *
 * Blank-NAMED groups are skipped, not flagged: the save already discards
 * them entirely, so an untouched leftover row is not the manager's problem.
 * A group that HAS a name is a stated intention, and an intention with no
 * options is incomplete rather than ignorable — see the empty-optional-group
 * note in handleSubmit.
 *
 * Returns error codes rather than sentences so this stays pure and testable;
 * the component maps them to translated copy.
 *
 * @param {Array<object>} choices — draft choice groups
 * @returns {{ok:boolean, errors:Record<string,{max?:string,options?:string}>,
 *            firstInvalidGroupId:string|null}}
 */
export function validateChoiceGroups(choices) {
  const errors = {};
  let firstInvalidGroupId = null;

  for (const group of choices || []) {
    if (!hasLocalizedText(group.name)) continue; // dropped on save anyway

    /* Phase 80 — the per-group rules moved to lib/choiceRules.js so the
       editor, the customer sheet, the cart and the order gate all judge a
       configuration by one definition. This function keeps its shape and its
       error-code contract; only the source of the codes changed.

       Phase 114.0 — the whole draft list goes with it. A visibility
       condition is the first rule here that cannot be judged from the group
       alone: whether the parent exists, is unconditional, owns the trigger
       and sits above this group are all questions about the PRODUCT. Passing
       the list is also what makes §9's "validate the final configuration
       before persistence" real, rather than trusting that the dropdowns
       never offered anything invalid. */
    const groupError = validateGroupConfig(group, choices || []);

    if (Object.keys(groupError).length > 0) {
      errors[group.id] = groupError;
      if (!firstInvalidGroupId) firstInvalidGroupId = group.id;
    }
  }

  return { ok: !firstInvalidGroupId, errors, firstInvalidGroupId };
}


/* Phase 56 — per-row field ids for the customization price inputs, so a
   failed save can focus the exact one that is wrong. Composite for options
   because an option id is only unique within its group. */
const optionPriceFieldId = (groupId, optionId) => `mm-option-price-${groupId}-${optionId}`;
const addOnPriceFieldId  = (addOnId) => `mm-addon-price-${addOnId}`;
const optionErrorKey     = (groupId, optionId) => `${groupId}:${optionId}`;


/**
 * Phase 56 — judge every customization price the save would actually persist.
 *
 * Scoped to what survives handleSubmit, exactly like Phase 48: groups with a
 * blank name are dropped, and so are options and add-ons with a blank name.
 * Judging them anyway would mean clicking "Add option" and then Save was
 * blocked by a row the save was about to discard.
 *
 * Every invalid row is collected in one pass so fixing the first does not
 * reveal the second one problem at a time.
 *
 * @param {Array<object>} choices
 * @param {Array<object>} paidAddOns
 * @returns {{ok:boolean, optionErrors:Record<string,true>,
 *            addOnErrors:Record<string,true>, firstInvalidFieldId:string|null}}
 */
export function validateCustomizationPrices(choices, paidAddOns) {
  const optionErrors = {};
  const addOnErrors  = {};
  let firstInvalidFieldId = null;

  for (const group of choices || []) {
    if (!hasLocalizedText(group.name)) continue; // dropped on save anyway
    for (const opt of group.options || []) {
      if (!hasLocalizedText(opt.name)) continue; // dropped on save anyway
      if (parseChoiceOptionPrice(opt.price) === null) {
        optionErrors[optionErrorKey(group.id, opt.id)] = true;
        if (!firstInvalidFieldId) firstInvalidFieldId = optionPriceFieldId(group.id, opt.id);
      }
    }
  }

  for (const addon of paidAddOns || []) {
    if (!hasLocalizedText(addon.name)) continue; // dropped on save anyway
    if (parseAddOnPrice(addon.price) === null) {
      addOnErrors[addon.id] = true;
      if (!firstInvalidFieldId) firstInvalidFieldId = addOnPriceFieldId(addon.id);
    }
  }

  return {
    ok: firstInvalidFieldId === null,
    optionErrors,
    addOnErrors,
    firstInvalidFieldId,
  };
}

export default function AdminMenuItemsScreen({ restaurant, session, onSignOut, onNavigate }) {
  const { categories, items } = useMenuData(restaurant.slug);
  const { t, language } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingItem, setEditingItem] = useState(null); // item object, or {} for "new"
  const [pendingDelete, setPendingDelete] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  /* Phase 97.7 — resolved, never the raw value: a bilingual category name is
     an object, and React throws rather than printing it. */
  const categoryName = (categoryId) =>
    getLocalizedText(categories.find((c) => c.id === categoryId)?.name, language) || "—";

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((i) => categoryFilter === "all" || i.categoryId === categoryFilter)
      /* Admin search matches every language too, so a manager can find a
         product by either name regardless of the interface language. */
      .filter(
        (i) =>
          !q ||
          localizedVariants(i.name).some((v) => v.toLowerCase().includes(q)) ||
          localizedVariants(i.description).some((v) => v.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const cd = (categories.findIndex((c) => c.id === a.categoryId)) - (categories.findIndex((c) => c.id === b.categoryId));
        return cd !== 0 ? cd : (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }, [items, categories, searchQuery, categoryFilter]);

  /* Phase 95.1 — what THIS session may do on this screen, resolved once.
     Read as a sentence: a manager may edit, create and delete; a cashier may
     only change what is being served right now. */
  const canCreateProducts = can(session, PERMISSIONS.PRODUCTS_CREATE);
  const canManageProducts = can(session, PERMISSIONS.PRODUCTS_EDIT);
  const canDeleteProducts = can(session, PERMISSIONS.PRODUCTS_DELETE);
  const canToggleProducts = can(session, PERMISSIONS.PRODUCTS_TOGGLE_AVAILABILITY);

  /* The availability-only write. Deliberately setMenuItemAvailable() and not
     updateMenuItem({isAvailable}): the narrow helper cannot carry any other
     field, so this path is incapable of changing a price even if a future
     caller passed one. */
  function handleToggleAvailability(item) {
    const next = !(item.isAvailable !== false);
    setMenuItemAvailable(restaurant.slug, item.id, next);
    setToastMessage(
      next
        ? t("admin.itemMarkedAvailable", "Item marked available")
        : t("admin.itemMarkedUnavailable", "Item marked unavailable")
    );
    setToastVisible(true);
  }

  /* Layer 3 — redundant, defense-in-depth guard. App.jsx's AdminRoute
     already refuses to render this component without menu.view; this second
     check protects any future code path that reaches it another way. All
     hooks above still run unconditionally (React's rules of hooks), only the
     returned UI differs.

     Phase 95.1 — the question is menu.view, not "is this an Admin". Cashier
     now holds menu.view and reaches this screen; what differs between the
     roles is the per-action permissions read below, not access to the page. */
  if (!can(session, PERMISSIONS.MENU_VIEW)) {
    return (
      <AdminLayout restaurant={restaurant} session={session} onSignOut={onSignOut} activeKey="menu" onNavigate={onNavigate}>
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <UtensilsCrossed size={28} strokeWidth={1.7} />
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

  /* Phase 66 — the data layer can now refuse a write, so the result is
     checked instead of assumed. In normal use this never fires: Phases 47,
     48 and 56 catch every bad value inline, with a message against the exact
     field, and that remains the primary experience. This is the case where
     something reached storage that the form did not anticipate — and the one
     outcome that must never happen is a cheerful "Item saved" over a write
     that did not occur. The editor stays open with the draft intact so the
     work is recoverable. */
  function handleSave(data) {
    const result = editingItem?.id
      ? updateMenuItem(restaurant.slug, editingItem.id, data)
      : createMenuItem(restaurant.slug, data);

    if (!result.ok) {
      setToastMessage(t("admin.productSaveFailed", "Couldn't save this item. Please check the prices and try again."));
      setToastVisible(true);
      return; // editor stays open, draft preserved
    }

    setToastMessage(t("admin.productSaved", "Item saved"));
    setToastVisible(true);
    setEditingItem(null);
  }

  function handleConfirmDelete() {
    const item = pendingDelete;
    setPendingDelete(null);
    if (!item) return;
    deleteMenuItem(restaurant.slug, item.id);
    /* Phase 92 §29 — the delete can now be started from inside the editor, so
       the editor has to come down with the product it was editing. Closing it
       here rather than in the editor keeps the draft mounted until the
       manager actually confirms: cancelling the dialog returns them to their
       work untouched. */
    setEditingItem(null);
    setToastMessage(t("admin.productDeleted", "Item deleted"));
    setToastVisible(true);
  }

  return (
    <AdminLayout
      restaurant={restaurant}
      session={session}
      onSignOut={onSignOut}
      activeKey="menu"
      onNavigate={onNavigate}
    >
      <header className="ad-header anim-rise">
        <h1 className="ad-header__title">{t("customer.menu", "Menu")}</h1>
        {/* The subtitle states the job this session can actually do here.
            Promising "add, edit and manage" to someone who may only switch
            items on and off would describe a screen they are not looking at. */}
        <p className="ad-header__subtitle">
          {canManageProducts
            ? t("admin.manageMenuSubtitle", "Add, edit, and manage your menu items.")
            : t("admin.availabilityMenuSubtitle", "Mark items available or unavailable for today's service.")}
        </p>
      </header>

      <div className="mm-toolbar anim-rise">
        <div className="mm-search">
          <Search size={15} strokeWidth={2} />
          <input
            type="search"
            placeholder={t("admin.searchProducts", "Search items…")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="mm-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">{t("admin.allCategories", "All categories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {getLocalizedText(c.name, language)}</option>
          ))}
        </select>
        {canCreateProducts && (
          <Button
            icon={Plus}
            disabled={categories.length === 0}
            onClick={() => setEditingItem({ categoryId: categories[0]?.id })}
          >
            {t("admin.addProduct", "Add Item")}
          </Button>
        )}
      </div>

      {filteredItems.length === 0 ? (
        /* Phase 92 §43 — "you have no items" and "your search matched
           nothing" are different facts, and showing the first when the second
           is true tells a manager their menu is empty while it is not. The
           distinction is the same one Phase 90 made mandatory on the Customer
           side; it was missing here.

           Only the genuinely-empty state offers Add Item. Offering it under a
           failed search would answer a question nobody asked — the fix there
           is to clear the search, which is what the action does. */
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            {items.length === 0 ? <UtensilsCrossed size={28} strokeWidth={1.7} /> : <Search size={28} strokeWidth={1.7} />}
          </span>
          <h3 className="ad-empty__title">
            {items.length === 0
              ? t("admin.noProductsYet", "No items yet.")
              : t("admin.noProductsMatch", "No items match your search.")}
          </h3>
          <p className="ad-empty__sub">
            {items.length === 0
              ? canCreateProducts
                ? t("admin.noProductsSub", "Add your first item to start building the menu.")
                : /* Offering "add your first item" to someone who cannot add
                     one would name an action they have no button for. */
                  t("admin.noProductsSubReadOnly", "Items will appear here once an Admin adds them.")
              : t("admin.noProductsMatchSub", "Try a different search term or category.")}
          </p>
          <div className="ad-empty__actions">
            {items.length === 0 ? (
              canCreateProducts && (
                <Button
                  icon={Plus}
                  disabled={categories.length === 0}
                  onClick={() => setEditingItem({ categoryId: categories[0]?.id })}
                >
                  {t("admin.addProduct", "Add Item")}
                </Button>
              )
            ) : (
              <Button
                variant="outline"
                onClick={() => { setSearchQuery(""); setCategoryFilter("all"); }}
              >
                {t("admin.clearFilters", "Clear search and filters")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mm-item-list anim-rise">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              /* §10 — an unavailable item stays fully listed and fully
                 legible; it simply recedes, so a long menu reads as "these
                 are off today" at a glance without anything disappearing. */
              className={`mm-item-row ${item.isAvailable === false ? "mm-item-row--off" : ""}`}
            >
              <ProductThumb
                item={item}
                categories={categories}
                language={language}
              />

              <div className="mm-item-row__info">
                <p className="mm-item-row__name">{getLocalizedText(item.name, language)}</p>
                <p className="mm-item-row__meta">
                  <span className="mm-item-row__cat">{categoryName(item.categoryId)}</span>
                  <span className="mm-item-row__price">{fmtPrice(item.price)}</span>
                </p>
                <div className="mm-item-row__badges">
                  {/* Phase 76 §3 — availability is now stated in BOTH directions.
                      Previously an available product carried no marker at all, so
                      "available" had to be inferred from the absence of a badge —
                      fine once you know the rule, useless when scanning a long
                      list. The state is spelled out in words either way, so it
                      never depends on colour alone (§48). */}
                  <span
                    className={`mm-avail ${item.isAvailable ? "mm-avail--on" : "mm-avail--off"}`}
                  >
                    {item.isAvailable
                      ? t("admin.available", "Available")
                      : t("admin.unavailable", "Unavailable")}
                  </span>
                  {/* Both flags stay visible — Admin genuinely needs to know
                      each one, so the Customer's single-badge rule deliberately
                      does NOT apply here (§5). They are just quieter now. */}
                  {item.isFeatured && (
                    <span className="mm-flag">{t("common.featured", "Featured")}</span>
                  )}
                  {item.isPopular && (
                    <span className="mm-flag mm-flag--popular">{t("common.popular", "Popular")}</span>
                  )}
                </div>
              </div>

              {/* Phase 76 §6 — Edit is the job on this screen, so it is a real
                  labelled button; Delete stays an icon-only control and can no
                  longer be mistaken for an equal peer. Both were bare icons of
                  identical weight before, which put a destructive action level
                  with the primary one. */}
              {/* Phase 95.1 — the actions a session may actually perform.
                  A manager gets Edit and Delete exactly as before. Someone
                  with availability-only rights gets ONE control, and it is
                  the operational one: a real toggle, not a disabled copy of
                  the management UI. Nothing is rendered greyed — a control
                  that cannot be used is not shown. */}
              <div className="mm-item-row__actions">
                {canToggleProducts && !canManageProducts && (
                  <button
                    type="button"
                    className={`mm-avail-toggle ${item.isAvailable ? "mm-avail-toggle--on" : "mm-avail-toggle--off"}`}
                    aria-pressed={item.isAvailable !== false}
                    onClick={() => handleToggleAvailability(item)}
                  >
                    {item.isAvailable
                      ? t("admin.markUnavailable", "Mark unavailable")
                      : t("admin.markAvailable", "Mark available")}
                  </button>
                )}
                {canManageProducts && (
                  <button
                    type="button"
                    className="mm-edit-btn"
                    onClick={() => setEditingItem(item)}
                  >
                    <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                    <span>{t("common.edit", "Edit")}</span>
                  </button>
                )}
                {canDeleteProducts && (
                  <button
                    type="button"
                    className="mm-icon-btn mm-icon-btn--danger"
                    onClick={() => setPendingDelete(item)}
                    aria-label={t("admin.deleteProduct", "Delete Item")}
                  >
                    <Trash2 size={15} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editingItem && (
        <MenuItemEditorModal
          item={editingItem}
          categories={categories}
          /* Phase 115.0 — recorded on every uploaded image, so a future
             cleanup can tell one restaurant's assets from another's on a
             device that serves more than one. */
          restaurant={restaurant}
          onSave={handleSave}
          onClose={() => setEditingItem(null)}
          /* §29 — the editor raises the request; the confirmation dialog and
             the delete itself stay here, so there is exactly one delete path
             and one confirmation in this screen. */
          onRequestDelete={() => setPendingDelete(editingItem)}
        />
      )}

      {pendingDelete && (
        <Modal
          open
          onClose={() => setPendingDelete(null)}
          title={t("admin.deleteProduct", "Delete Item")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete}>
                {t("admin.deleteProduct", "Delete Item")}
              </Button>
            </>
          }
        >
          <p className="ad-cancel-modal__msg">
            {t(
              "admin.deleteProductConfirmMsg",
              "This will permanently remove it from the menu. Existing orders are not affected."
            )}
          </p>
        </Modal>
      )}

      <Toast visible={toastVisible} message={toastMessage} onDone={() => setToastVisible(false)} />
    </AdminLayout>
  );
}

/* ── Product thumbnail ───────────────────────────────────────────────────

   Phase 103.0 §25 — a product whose imageUrl is non-empty but unreachable
   (deleted file, dead host, a URL that was never valid) rendered the
   BROWSER'S broken-image glyph: the row showed a torn-page icon rather than
   the fallback, which §25 says must never happen. An absent image was
   already handled; a broken one was not.

   This is the same guard RestaurantIdentity and CustomerLoadingScreen
   already use — a safe-source check plus a failed-url latch — so no new
   technique is introduced. The fallback is the EXISTING category emoji, not a new
   placeholder (§25 rules out introducing one).

   The latch stores the URL rather than a boolean so that editing an item to
   a new image retries instead of staying stuck on the fallback. Nothing
   about upload or image storage changes; this is render-time only. */
function ProductThumb({ item, categories, language }) {
  const [failedUrl, setFailedUrl] = useState(null);
  /* Phase 115.0 — the stored field may now be an "asset:<id>" reference to
     an uploaded image rather than a hosted URL. Resolving it here, through
     the shared hook, is what makes an upload appear in this list without
     this component knowing anything about IndexedDB. A plain URL comes back
     unchanged, so rows that always worked still work.

     isSafeImageSrc rather than isSafeImageUrl: the resolved value of an
     uploaded image is a data URL this application produced itself, which
     the URL-only guard deliberately refuses. The distinction between "a URL
     the restaurant typed" and "a source we resolved" is the one safeImage.js
     already draws. */
  const url = useImageAssetSrc(item.imageUrl);
  const showImage = isSafeImageSrc(url) && failedUrl !== url;

  return (
    <div className="mm-item-row__thumb">
      {showImage ? (
        <img
          src={url}
          alt={getLocalizedText(item.name, language)}
          loading="lazy"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span className="mm-item-row__emoji">
          {categories.find((c) => c.id === item.categoryId)?.emoji || "🍽️"}
        </span>
      )}
    </div>
  );
}

/* ── Live customer preview (Phase 108.0 §4–§11) ──────────────────────────

   A compact read-only rendering of what this product will look like in the
   guest menu, pinned to the top of the editor so it stays answerable while
   the form scrolls past it.

   It deliberately does NOT reimplement the guest card. The badge rule, the
   image fallback and the price formatting are the customer ones:
     - fmtPrice is the same formatter the guest card calls
     - productMonogram is imported from CustomerMenuScreen, not copied
     - the badge priority below mirrors CustomerMenuScreen exactly:
         unavailable  -> "Out of Stock" and NO body badge
         available + isPopular            -> Popular
         available + !isPopular + featured -> Featured
       i.e. at most one badge, Out of Stock > Popular > Featured (§10).

   §8/§56 — informational only. The "+" is a <span aria-hidden>, not a
   button: it cannot be clicked, focused or tabbed to, and it carries no
   handler at all, so there is nothing to disable. The whole strip is inert.

   §9 — every value comes from the live draft state passed in, so it tracks
   edits with no save and no extra state of its own (§60). */
function ProductLivePreview({
  name, price, categoryId, imageUrl, isAvailable, isPopular, isFeatured,
  categories, isNew,
}) {
  const { t, language } = useLanguage();
  /* Phase 115.0 — the latch stores WHICH source failed, not merely that one
     did. A plain boolean stayed true after the admin replaced a dead image
     with a working upload, so the strip kept showing the monogram for an
     image that loads perfectly well. */
  const [failedUrl, setFailedUrl] = useState(null);

  /* Phase 115.0 — same resolution as the list and the guest card, so the
     preview keeps telling the truth the moment an image is uploaded rather
     than only after a save. */
  const url = useImageAssetSrc(imageUrl.trim());
  const showImg = isSafeImageSrc(url) && failedUrl !== url;
  const displayName =
    getLocalizedText(name, language).trim() ||
    (isNew ? t("admin.newProduct", "New item") : t("admin.untitledProduct", "Untitled item"));
  const category = categories.find((c) => c.id === categoryId);
  const parsed = parseProductPrice(price);

  return (
    <div className="mm-preview">
      <span className="mm-preview__label">
        {t("admin.livePreview", "Customer preview")}
      </span>

      <div className="mm-preview__card">
        <span className="mm-preview__media">
          {showImg ? (
            /* alt="" — the name is right beside it in real text. */
            <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} />
          ) : (
            <span className="mm-preview__mono" aria-hidden="true">
              {productMonogram(displayName)}
            </span>
          )}
          {!isAvailable && (
            <span className="mm-preview__oos">
              {t("common.outOfStock", "Out of Stock")}
            </span>
          )}
        </span>

        <span className="mm-preview__info">
          <span className="mm-preview__name">{displayName}</span>
          <span className="mm-preview__cat">
            {category ? `${category.emoji} ${getLocalizedText(category.name, language)}` : "—"}
          </span>
          <span className="mm-preview__foot">
            <span className="mm-preview__price">
              {parsed !== null ? fmtPrice(parsed) : "—"}
            </span>
            {/* §10 — one badge at most, customer priority. */}
            {isAvailable && isPopular && (
              <span className="badge badge--gold mm-preview__badge">
                {t("customer.popular", "Popular")}
              </span>
            )}
            {isAvailable && !isPopular && isFeatured && (
              <span className="badge badge--featured mm-preview__badge">
                {t("customer.featured", "Featured")}
              </span>
            )}
          </span>
        </span>

        {/* §56 — decorative only: inert, unfocusable, out of the tab order
            and hidden from assistive tech. */}
        <span className="mm-preview__add" aria-hidden="true">+</span>
      </div>
    </div>
  );
}

/* ── Add/Edit item form modal — the big one ──────────────────────────────── */
function MenuItemEditorModal({ item, categories, restaurant, onSave, onClose, onRequestDelete }) {
  const { t, language } = useLanguage();
  const isNew = !item.id;

  /* Phase 97.7 §21 — the draft carries each value in whatever shape it is
     stored in, legacy string included. Merely opening a product must not
     rewrite it; the bilingual object is produced by Save and nowhere else.
     Both take part in draftSignature below exactly as before, so dirty state,
     the discard guard and the double-save lock all keep working untouched. */
  const [name, setName] = useState(item.name ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState(item.price != null ? String(item.price) : "");
  const [categoryId, setCategoryId] = useState(item.categoryId || categories[0]?.id || "");
  const [imageUrl, setImageUrl] = useState(item.imageUrl || "");
  const [sortOrder, setSortOrder] = useState(item.sortOrder != null ? String(item.sortOrder) : "");
  const [isAvailable, setIsAvailable] = useState(item.isAvailable !== false);
  const [isFeatured, setIsFeatured] = useState(!!item.isFeatured);
  const [isPopular, setIsPopular] = useState(!!item.isPopular);
  const [removableIngredients, setRemovableIngredients] = useState(item.removableIngredients || []);
  const [newIngredient, setNewIngredient] = useState("");
  const [choices, setChoices] = useState(item.choices || []);
  const [paidAddOns, setPaidAddOns] = useState(item.paidAddOns || []);
  /* Phase 92 §16 — where the removals and add-ons blocks sit in the guest's
     Item Details sheet. Choice groups carry their own sortOrder on the group
     object; these two kinds have nowhere to put it, so the position lives on
     the product. null means "never configured", which is what lets
     buildCustomizationSections fall back to the shipped defaults and keeps
     an untouched product rendering exactly as it does today. */
  const [removalsSortOrder, setRemovalsSortOrder] = useState(
    item.removalsSortOrder != null ? item.removalsSortOrder : null
  );
  const [addOnsSortOrder, setAddOnsSortOrder] = useState(
    item.addOnsSortOrder != null ? item.addOnsSortOrder : null
  );
  const [error, setError] = useState(null);
  /* Phase 47 — kept separate from `error` so the message can render against
     the price field itself rather than under the item name, which is where
     the shared `error` state is displayed. */
  const [priceError, setPriceError] = useState(null);
  /* Phase 67 — kept separate from `error` for the same reason priceError is:
     the message belongs beside the sort-order field, not under the name. */
  const [sortOrderError, setSortOrderError] = useState(null);
  /* Phase 48 — { [groupId]: { max?: code, options?: code } }. Keyed by group
     so every invalid group keeps its own error rather than one shared banner
     losing all but the last problem. */
  const [groupErrors, setGroupErrors] = useState({});
  /* Phase 56 — one entry per invalid customization price, so every bad row
     keeps its own message instead of a single banner showing only the last
     one. Options are keyed by group id + option id, because an option id
     is only unique inside its own group; add-ons are keyed by their own id. */
  const [optionPriceErrors, setOptionPriceErrors] = useState({});
  const [addOnPriceErrors,  setAddOnPriceErrors]  = useState({});

  /* ── Ingredients ──────────────────────────────────────────────────────── */
  function handleAddIngredient() {
    const value = newIngredient.trim();
    /* Compared against each entry's base-language text, so adding "onions"
       twice is still refused once the first one has an Arabic translation. */
    const exists = removableIngredients.some(
      (entry) => getLocalizedText(entry, BASE_CONTENT_LANGUAGE).trim() === value
    );
    if (!value || exists) { setNewIngredient(""); return; }
    setRemovableIngredients([...removableIngredients, value]);
    setNewIngredient("");
  }
  function handleRemoveIngredient(idx) {
    setRemovableIngredients(removableIngredients.filter((_, i) => i !== idx));
  }

  /* ── Choice groups ────────────────────────────────────────────────────── */
  function handleAddChoiceGroup() {
    setChoices([
      ...choices,
      /* Phase 80 — a new group starts optional-single (0..1), the least
         committal rule and the one an existing group with required:false
         normalises to.  is not seeded at all: minSelections is the
         source of truth now. */
      { id: genChoiceGroupId(), name: "", minSelections: 0, maxSelections: 1, options: [] },
    ]);
  }
  /* Phase 114.0 §10 — the names of the groups that would break, ready to be
     dropped into a sentence. An unnamed group still has to be nameable in
     the message, hence the fallback the section bar already uses. */
  function dependentGroupNames(parentGroupId, triggerOptionId) {
    return getDependentGroups(choices, parentGroupId, triggerOptionId).map(
      (g) =>
        getLocalizedText(g.name, language).trim() ||
        t("admin.untitledGroup", "Untitled group")
    );
  }

  function handleRemoveChoiceGroup(groupId) {
    /* §10 — prevented and explained, never silently repaired. Converting the
       dependants to Always Show instead would quietly expose groups the
       manager had deliberately hidden, and a required one among them would
       start blocking checkout for every guest — a far worse outcome than
       being asked to update one setting first. */
    const dependents = dependentGroupNames(groupId);
    if (dependents.length > 0) {
      setBlockedEdit(
        t(
          "admin.visibilityGroupInUse",
          "This group controls when {groups} appears. Update that group's condition before deleting this one."
        ).replace("{groups}", dependents.join(", "))
      );
      return;
    }
    setChoices(choices.filter((g) => g.id !== groupId));
  }
  function handleUpdateChoiceGroup(groupId, patch) {
    setChoices(choices.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  }
  function handleAddOption(groupId) {
    setChoices(
      choices.map((g) =>
        g.id === groupId
          ? { ...g, options: [...g.options, { id: genChoiceOptionId(), name: "", price: 0, isAvailable: true }] }
          : g
      )
    );
  }
  function handleRemoveOption(groupId, optionId) {
    /* §10 — the triggering option is the other half of the reference, and
       deleting it breaks a condition exactly as deleting the group would. */
    const dependents = dependentGroupNames(groupId, optionId);
    if (dependents.length > 0) {
      setBlockedEdit(
        t(
          "admin.visibilityOptionInUse",
          "This option controls when {groups} appears. Update that group's condition before deleting this option."
        ).replace("{groups}", dependents.join(", "))
      );
      return;
    }
    setChoices(
      choices.map((g) =>
        g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g
      )
    );
  }

  /**
   * Phase 114.0 §11 — switch one group between Always Show and a condition.
   *
   * Passing null returns it to an ordinary group: options, prices, bounds
   * and every other attribute are untouched, and only the reference is
   * dropped, so no stale condition is left behind to be revived by a later
   * edit. Passing the empty pair starts a condition the manager has yet to
   * fill in — a state storage never holds, and one Save refuses, which is
   * what stops an incomplete condition being persisted.
   */
  function setGroupVisibility(group, nextCondition) {
    /* §9B/§10 — a group that already controls another cannot itself become
       conditional: that is the second dependency level this phase does not
       support, and allowing it would leave the dependant's own condition
       evaluating against a parent that may not be on screen. */
    if (nextCondition !== null) {
      const dependents = dependentGroupNames(group.id);
      if (dependents.length > 0) {
        setBlockedEdit(
          t(
            "admin.visibilityParentInUse",
            "This group controls when {groups} appears, so it cannot itself be shown conditionally. Update that group's condition first."
          ).replace("{groups}", dependents.join(", "))
        );
        return;
      }
    }
    /* undefined, not null, for "Always Show" — the draft has to serialise
       the same way the UNTOUCHED product does, or returning a group to
       Always Show and changing nothing else would leave the editor
       permanently flagged as having unsaved changes. JSON.stringify drops an
       undefined value, and a normalized group with no condition has no key
       at all, so the two agree. */
    const value = nextCondition === null ? undefined : nextCondition;
    handleUpdateChoiceGroup(group.id, { visibilityCondition: value });
    revalidateGroupInDraft({ ...group, visibilityCondition: value });
  }

  /* Re-judge ONE group against the whole draft and update only its own
     entry. Lifted out of the group card in Phase 114.0 because the
     visibility controls need it too, and because a condition can only be
     judged with the sibling groups in hand — the single-group list the card
     used to pass would have reported every parent as missing. */
  function revalidateGroupInDraft(patchedGroup) {
    const draftGroups = choices.map((g) => (g.id === patchedGroup.id ? patchedGroup : g));
    const { errors } = validateChoiceGroups(draftGroups);
    setGroupErrors((prev) => {
      const next = { ...prev };
      if (errors[patchedGroup.id]) next[patchedGroup.id] = errors[patchedGroup.id];
      else delete next[patchedGroup.id];
      return next;
    });
  }
  function handleUpdateOption(groupId, optionId, patch) {
    setChoices(
      choices.map((g) =>
        g.id === groupId
          ? { ...g, options: g.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) }
          : g
      )
    );
  }

  /* ── Paid add-ons ─────────────────────────────────────────────────────── */
  function handleAddAddOn() {
    setPaidAddOns([...paidAddOns, { id: genAddOnId(), name: "", price: 0 }]);
  }
  function handleRemoveAddOn(addOnId) {
    setPaidAddOns(paidAddOns.filter((a) => a.id !== addOnId));
  }
  function handleUpdateAddOn(addOnId, patch) {
    setPaidAddOns(paidAddOns.map((a) => (a.id === addOnId ? { ...a, ...patch } : a)));
  }

  /* ── Phase 56 — clearing a customization price error ──────────────────
     Deliberately one-directional: a keystroke can CLEAR a price error but
     never raise one. Errors are introduced only by a Save attempt, so a
     manager halfway through typing "1." — momentarily invalid — is not
     interrupted, while a corrected field stops complaining the instant it
     becomes valid. Each row clears only its own key, so fixing one price
     leaves the other invalid rows flagged. */
  function clearOptionPriceError(groupId, optionId, nextValue) {
    if (parseChoiceOptionPrice(nextValue) === null) return;
    const key = optionErrorKey(groupId, optionId);
    setOptionPriceErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }
  function clearAddOnPriceError(addOnId, nextValue) {
    if (parseAddOnPrice(nextValue) === null) return;
    setAddOnPriceErrors((prev) => {
      if (!prev[addOnId]) return prev;
      const next = { ...prev };
      delete next[addOnId];
      return next;
    });
  }

  /* ── Phase 55 — unsaved-changes guard ──────────────────────────────────
     This editor can hold dozens of fields across nested choice groups and
     add-ons, and every dismissal path used to close it instantly, so a
     mis-aimed click on the backdrop threw the lot away without a word.

     Dirtiness is decided by serialising the whole draft and comparing it
     with the FIRST serialisation of this mount. Capturing the baseline from
     the state itself, rather than rebuilding it from `item`, is what keeps
     it honest: on the first render the state IS the initial values, so the
     two can never drift apart as fields are added, and the normalisation
     the form applies (stored numbers becoming input strings) is already
     baked into both sides. Opening a product and touching nothing therefore
     cannot register as dirty.

     Covers everything editable, nested structures included — a renamed
     choice option or a flipped Required toggle counts exactly like a
     changed product name. */
  const draftSignature = JSON.stringify({
    name, description, price, categoryId, imageUrl, sortOrder,
    isAvailable, isFeatured, isPopular,
    removableIngredients, choices, paidAddOns,
    /* §28 — reordering customization sections is a real edit, so it has to
       arm the unsaved-changes guard like any other. */
    removalsSortOrder, addOnsSortOrder,
  });
  const initialSignature = useRef(null);
  if (initialSignature.current === null) initialSignature.current = draftSignature;
  const isDirty = draftSignature !== initialSignature.current;

  const [showDiscard, setShowDiscard] = useState(false);
  /* Phase 114.0 §10 — the explanation shown when an edit is REFUSED because
     another group depends on what it would remove or move. Holds the
     sentence, not a flag, because every refusal names the group that has to
     be updated first — a bare "you can't do that" would leave the manager
     hunting for which of their groups objected. */
  const [blockedEdit, setBlockedEdit] = useState(null);

  /* ── Phase 92 §23 — one save per press ────────────────────────────────
     The write is synchronous today, so two clicks landing in the same tick
     both reached onSave: on an existing product that was a harmless double
     write, but on a NEW one it called createMenuItem twice and produced two
     products from one press. Nothing prevented it.

     The ref is the actual guard — state updates are batched and a second
     click in the same tick would still read the old isSaving. The state
     exists only so the button can show it is busy, which matters the moment
     this stops being synchronous. */
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  /* ── Phase 115.0 §14 — images uploaded during THIS editing session ──────
     An upload has to be written to IndexedDB at the moment it is chosen,
     because the draft needs a reference to point at. That means a manager
     who uploads three images before settling on the third has left two
     behind, and abandoning the editor entirely leaves all three.

     Only refs created here are ever released. An image that was already
     saved against this product is never touched, even when it is replaced:
     nothing in this editor can prove that no OTHER product points at the
     same asset, and deleting a picture that is still in use somewhere is not
     recoverable, while leaving a replaced one behind costs some bytes. */
  const createdImageRefs = useRef([]);
  function releaseUnusedImages(keepRef) {
    const orphans = createdImageRefs.current.filter((ref) => ref !== keepRef);
    /* Emptied, NOT re-seeded with keepRef. Putting the surviving reference
       back would make an image that is now SAVED eligible for deletion by a
       later release in the same session — the one case this must never do,
       because by then another product may point at it too. The list means
       "uploaded here and not yet committed", and once something is
       committed it leaves the list for good. */
    createdImageRefs.current = [];
    /* Fire and forget: a leftover image is not worth blocking a save or a
       close on, and a failed cleanup costs storage rather than correctness. */
    for (const ref of orphans) deleteImageAsset(ref);
  }

  /* Every dismissal path — X, overlay, Escape and Cancel — comes through
     here, because this component owns both the Modal and its footer. A clean
     form closes straight away; only unsaved work is worth interrupting for.

     The showDiscard check is what keeps Escape sane while the confirmation
     is open: both modals listen on window, so one keypress reaches both.
     Returning early lets the confirmation close on its own without this
     handler immediately reopening it. */
  function handleRequestClose() {
    if (showDiscard) return;
    if (isDirty) { setShowDiscard(true); return; }
    onClose();
  }

  /* ── Phase 59 — protect this draft from navigation started elsewhere ────
     The Phase 55 guard covers this modal's own four dismissal paths, but it
     cannot see a click on the staff-call alert's "View Call" up in
     AdminLayout: that sets adminPage, which unmounts this whole screen and
     takes the draft with it silently.

     Registering here closes that hole without the alert needing to know
     anything about products. A clean draft declines the guard and navigation
     proceeds untouched; a dirty one opens the very same "Discard changes?"
     dialog, with the pending navigation parked until the Admin answers —
     Discard Changes goes, Keep Editing stays and the draft survives.

     Registered only while the editor is mounted, and only meaningful while
     it is dirty. */
  const pendingNavRef = useRef(null);

  useEffect(() => {
    return registerNavigationGuard((proceed) => {
      if (!isDirty) return false; // nothing to lose — let it through

      /* Phase 60 — first intent wins. If a destination is already parked,
         a second click while the dialog is open is ignored rather than
         silently retargeting the answer the Admin is in the middle of
         giving: they read "Discard changes?" having asked for Overview, so
         Discard must go to Overview. Choosing Keep Editing clears the park,
         after which a different destination is accepted normally. Read from
         a ref, not state, so it is never a render behind. */
      if (pendingNavRef.current) return true;

      pendingNavRef.current = proceed;
      setShowDiscard(true);
      return true; // this dialog owns the decision now
    },
    /* Phase 79.3 — hand the editor's existing draft-signature dirtiness to
       the shared layer, which uses it (and only it) to arm the browser-exit
       warning. The signature comparison above is unchanged. */
    isDirty);
  }, [isDirty]);

  /* Both discard-dialog outcomes funnel through here so a parked navigation
     can never be left dangling: discarding runs it, keeping clears it. */
  function resolveDiscard(discard) {
    setShowDiscard(false);
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;

    if (!discard) return; // Keep Editing — draft, errors and editor all stay

    /* §13/§14 — discarding means the product keeps the image it was saved
       with, so every image uploaded during this session is now unreachable
       and is released. The SAVED image is not in this list and is therefore
       untouched, which is exactly what "the original image remains" means. */
    releaseUnusedImages(null);

    /* Phase 60 — close first, then navigate, in that order and once only.
       Closing unmounts this modal and unregisters the guard, so the parked
       proceed cannot be re-intercepted on its way out. It also covers the
       case where the destination is the page already showing (clicking
       "Menu" from Menu): nothing would unmount, and without this the editor
       would sit there still holding the draft the Admin just discarded. */
    onClose();
    if (pending) pending();
  }


  async function handleSubmit() {
    /* Before validation, so a double press cannot even re-run the checks. */
    if (savingRef.current) return;
    if (!hasLocalizedText(name)) { setError(t("admin.nameRequiredAnyLanguage", "Enter a name in at least one language.")); return; }
    if (!categoryId) { setError(t("admin.productCategoryRequired", "Please choose a category.")); return; }

    /* Phase 47 — the save is abandoned before onSave, so nothing is written
       and every other field the manager filled in stays exactly as typed;
       the editor simply stays open with the price flagged. */
    const parsedPrice = parseProductPrice(price);
    if (parsedPrice === null) {
      setPriceError(t("admin.productPriceInvalid", "Enter a valid price greater than 0."));
      /* Bring the field into view — the editor is a tall scrolling modal and
         the price row can easily be off-screen when Save is pressed. */
      document.getElementById(PRICE_FIELD_ID)?.focus();
      return;
    }

    /* Phase 48 — every named group must be orderable before anything is
       written. All invalid groups are marked at once so fixing one does not
       hide the next; focus goes to the first, in display order. */
    const groupCheck = validateChoiceGroups(choices);
    if (!groupCheck.ok) {
      setGroupErrors(groupCheck.errors);
      const bad = groupCheck.errors[groupCheck.firstInvalidGroupId];
      /* Focus the field that is actually wrong. focus() makes the browser
         reveal it inside the modal's own scroll container, which is why this
         does not need scrollIntoView (that would also move the page behind
         the editor). */
      /* Phase 80 — min is checked before max so a group failing both lands on
         the field a manager reads first. The options error still falls
         through to the group name, which is where its message renders. */
      const targetId = bad.min
        ? groupMinFieldId(groupCheck.firstInvalidGroupId)
        : bad.max
        ? groupMaxFieldId(groupCheck.firstInvalidGroupId)
        /* Phase 114.0 — the condition's own control, so a save blocked on a
           broken dependency lands on the setting that is wrong rather than
           on the group name, where its message does not appear. */
        : bad.visibility
        ? groupVisFieldId(groupCheck.firstInvalidGroupId)
        : groupNameFieldId(groupCheck.firstInvalidGroupId);
      document.getElementById(targetId)?.focus();
      return;
    }

    /* Phase 56 — last of the three price/structure checks, so Phase 47 and
       Phase 48 keep judging first and their behaviour is untouched. Every
       invalid customization price is marked in one pass; focus goes to the
       first in document order (options before add-ons, as displayed). */
    const priceCheck = validateCustomizationPrices(choices, paidAddOns);
    if (!priceCheck.ok) {
      setOptionPriceErrors(priceCheck.optionErrors);
      setAddOnPriceErrors(priceCheck.addOnErrors);
      document.getElementById(priceCheck.firstInvalidFieldId)?.focus();
      return;
    }

    /* Phase 67 — the position is judged before anything is written. Blank is
       allowed and means "leave it to the data layer": on create that becomes
       the next free position in the category, on edit it leaves the stored
       value alone. Only a value the manager actually typed is validated.

       parseInt used to run here, which truncated "1.5" to 1 and turned "abc"
       into NaN — both saved without a word. */
    const trimmedSortOrder = sortOrder.trim();
    const parsedSortOrder = trimmedSortOrder === "" ? undefined : parseSortOrder(trimmedSortOrder);
    if (parsedSortOrder === null) {
      setSortOrderError(
        t("admin.productSortOrderInvalid", "Enter a valid whole number of 0 or more.")
      );
      document.getElementById(SORT_ORDER_FIELD_ID)?.focus();
      return;
    }

    /* Every validation gate above returns early, so reaching here means the
       draft is good and a write is genuinely about to happen — which is the
       only point at which blocking further presses is correct. Flagging on
       entry instead would leave the editor stuck after a failed validation.

       await + finally so this still behaves when onSave becomes a request:
       an awaited promise keeps the lock for the whole round trip, and a
       rejection releases it instead of freezing the button forever. */
    savingRef.current = true;
    setIsSaving(true);
    try {
      await onSave({
      name: trimLocalizedText(name),
      description: trimLocalizedText(description),
      /* Already a validated finite Number > 0 — storage shape is unchanged. */
      price: parsedPrice,
      categoryId,
      imageUrl: imageUrl.trim(),
      sortOrder: parsedSortOrder,
      isAvailable,
      isFeatured,
      isPopular,
      removableIngredients,
      /* §12 — one effective source. imageUrl carries either a hosted URL or
         an "asset:<id>" reference, never both and never a merged value. */
      /* §16 — undefined rather than null when never configured, so the data
         layer leaves the stored value alone instead of writing a position
         nobody chose. */
      removalsSortOrder: removalsSortOrder == null ? undefined : removalsSortOrder,
      addOnsSortOrder: addOnsSortOrder == null ? undefined : addOnsSortOrder,
      // Drop any choice group left with an empty name, or an option left with
      // an empty name — a half-filled row shouldn't silently save as blank.
      //
      // Phase 48: maxSelections is normalised back to a Number here. The
      // field now holds the raw string while editing (so invalid input can be
      // judged instead of silently coerced), but storage keeps the numeric
      // shape the customer modal and Phase 37 already expect. Spreading `g`
      // and the untouched option objects preserves every existing group and
      // option id, which Phase 37's cart matching depends on.
      choices: choices
        .filter((g) => hasLocalizedText(g.name))
        .map((g) => ({
          ...g,
          name: trimLocalizedText(g.name),
          /* Phase 80 — both bounds become Numbers here, and the legacy
             `required` flag is dropped rather than written back, so a saved
             product carries exactly one description of its rule. */
          required: undefined,
          minSelections: parseSelectionBound(g.minSelections, { min: 0 }) ?? 0,
          maxSelections: parseSelectionLimit(g.maxSelections),
          /* Phase 114.0 §11/§13 — resolved on the way out. A sound condition
             is written as two stable ids and nothing else; Always Show is
             written as undefined, which JSON drops, so the saved product
             carries no empty condition object and a group that never had one
             is byte-identical to how it saved before this phase (§14).

             Reaching here means validateChoiceGroups already approved the
             condition, so this normalises rather than decides. */
          visibilityCondition: normalizeVisibilityCondition(g.visibilityCondition) ?? undefined,
          /* Phase 56: prices become Numbers here for the same reason
             maxSelections does — the row holds the raw string while editing
             so invalid input can be judged, and storage keeps the numeric
             shape the customer modal and Phase 37 expect. Spreading the
             existing option object preserves its id. */
          options: g.options
            .filter((o) => hasLocalizedText(o.name))
            .map((o) => ({
              ...o,
              name: trimLocalizedText(o.name),
              price: parseChoiceOptionPrice(o.price),
              /* Persisted with the option it belongs to (§10) — there is no
                 separate availability store to fall out of step with. */
              isAvailable: o.isAvailable !== false,
            })),
        })),
      paidAddOns: paidAddOns
        .filter((a) => hasLocalizedText(a.name))
        .map((a) => ({ ...a, name: trimLocalizedText(a.name), price: parseAddOnPrice(a.price) })),
      });
      /* §14 — the write succeeded, so the draft's image is now the product's
         image and every OTHER image uploaded in this session is unreachable.
         Released only here, against what was actually persisted, so a failed
         save never costs the manager the picture they just chose. */
      releaseUnusedImages(imageUrl.trim());
    } finally {
      savingRef.current = false;
      /* A successful save unmounts this editor, so only touch state if the
         component is still mounted. */
      if (mountedRef.current) setIsSaving(false);
    }
  }

  /* ── Phase 92 §16/§18 — configurable customization order ──────────────
     The guest's Item Details sheet has rendered customization sections from
     data since Phase 85: buildCustomizationSections reads item.removalsSortOrder,
     each group's own sortOrder and item.addOnsSortOrder, and sorts all three
     kinds into ONE sequence so they can interleave. Nothing in Admin ever
     wrote those numbers, so the capability existed and was unreachable — the
     order a guest saw was whatever the defaults produced.

     This calls the very same function the guest's sheet calls, rather than
     re-deriving the order here. That is the whole point: if these two ever
     disagreed, the Admin would be arranging one order and the guest reading
     another, which is exactly what §18 forbids.

     The placeholder arrays force the removals and add-ons sections to be
     present even when empty — buildCustomizationSections drops empty ones
     because a guest should not see an empty heading, but a manager still has
     to be able to position a block before filling it. The bodies rendered
     below are the real (possibly empty) ones. */
  /* ── Phase 108.1 §2/§3 — two customization concepts, not three ──────────

     Paid add-ons and choice groups were two ways to author the same thing:
     an extra the guest picks and pays for. A choice group already expresses
     everything a paid add-on could (bilingual names, a price delta per
     option, availability) AND adds the rules add-ons never had, so the
     standalone add-ons editor was a second, weaker authoring path.

     Passing an EMPTY add-ons array is the whole removal: buildCustomization-
     Sections only emits an add-ons section when there are add-ons to show, so
     the section simply stops being produced. Nothing is deleted.

     §37/§38 — WHAT HAPPENS TO EXISTING DATA. paidAddOns is NOT an editor-only
     concept: menuPricing.js prices it, cartValidation.js validates cart lines
     against it, choiceRules.js reads it and ten seeded products carry real
     add-ons. So the data is left exactly where it is. `paidAddOns` stays in
     this component's state, stays in draftSignature, and is written back
     unchanged by Save — a legacy product edited today keeps every add-on it
     had, and the guest sheet keeps rendering and pricing them as before.

     What is removed is only the ADMIN authoring surface, which is what §3
     asks for. No conversion is attempted: rewriting add-ons into a choice
     group would change which code path prices them for products that are
     live, and §37 rules out irreversible assumptions. A manager who still
     has legacy add-ons sees them named in a read-only notice below (§40), so
     nothing is hidden, and new products author extras as choice groups. */
  const editorSections = useMemo(
    () =>
      buildCustomizationSections(
        {
          removableIngredients: ["__section_placeholder__"],
          removalsSortOrder,
          choices,
          addOnsSortOrder,
        },
        []
      ),
    [removalsSortOrder, choices, addOnsSortOrder]
  );

  /* Swap one section with its neighbour, then renumber EVERY section from the
     resulting arrangement. Renumbering all of them, rather than editing the
     two that moved, is what stops a product accumulating a half-configured
     mix of stored numbers and defaults — after any move the stored order is
     complete and describes exactly what is on screen.

     Spacing of 10 leaves room for a future drag-to-position to land between
     two sections without renumbering, and keeps these values clear of the
     100/200/300 defaults so a configured product is recognisable as such. */
  function moveCustomizationSection(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= editorSections.length) return;
    const arranged = [...editorSections];
    [arranged[index], arranged[target]] = [arranged[target], arranged[index]];

    /* Phase 114.0 §8/§10 — a controlling group must stay ABOVE the groups it
       reveals. The move is judged on the arrangement it WOULD produce and
       refused before any state is written, so a blocked reorder leaves the
       product exactly as it was rather than saving a position and then
       complaining about it. Only choice sections can carry a condition;
       removals and add-ons move freely. */
    const positionOf = {};
    arranged.forEach((sec, i) => {
      if (sec.kind === "choice") positionOf[sec.group.id] = i;
    });
    for (const sec of arranged) {
      if (sec.kind !== "choice") continue;
      const condition = normalizeVisibilityCondition(sec.group.visibilityCondition);
      if (!condition) continue;
      const parentAt = positionOf[condition.parentGroupId];
      if (parentAt === undefined || parentAt <= positionOf[sec.group.id]) continue;
      const parent = choices.find((g) => g.id === condition.parentGroupId);
      setBlockedEdit(
        t(
          "admin.visibilityOrderBlocked",
          "{group} appears only when an option in {parent} is selected, so {parent} must stay above it."
        )
          .replace(/\{group\}/g, sectionLabel(sec))
          .replace(
            /\{parent\}/g,
            (parent && getLocalizedText(parent.name, language).trim()) ||
              t("admin.untitledGroup", "Untitled group")
          )
      );
      return;
    }

    let nextRemovals = removalsSortOrder;
    let nextAddOns = addOnsSortOrder;
    const groupOrder = {};
    arranged.forEach((sec, i) => {
      const position = (i + 1) * 10;
      if (sec.kind === "removals") nextRemovals = position;
      else if (sec.kind === "addOns") nextAddOns = position;
      else groupOrder[sec.group.id] = position;
    });
    setRemovalsSortOrder(nextRemovals);
    setAddOnsSortOrder(nextAddOns);
    setChoices((prev) =>
      prev.map((g) => (groupOrder[g.id] != null ? { ...g, sortOrder: groupOrder[g.id] } : g))
    );
  }

  const sectionLabel = (sec) =>
    sec.kind === "removals"
      ? t("admin.removableIngredientsLabel", "Removable ingredients")
      : sec.kind === "addOns"
      ? t("admin.paidAddOns", "Paid add-ons")
      : getLocalizedText(sec.group.name, language).trim() || t("admin.untitledGroup", "Untitled group");

  /* Phase 92 §16/§17 — the choice-group card, lifted out of the JSX so the
     editor can emit each group wherever the configured customization order
     puts it rather than always in array order. The body is unchanged from
     Phase 80; only its wrapper moved. */
  const renderChoiceGroupCard = (group) => {
          /* Phase 48 — this group's outstanding problems, if any. */
          const gErr = groupErrors[group.id] || {};
          const maxErrorText =
            gErr.max === "invalid"
              ? t("admin.maxSelectionsInvalid", "Enter a valid selection limit.")
              : gErr.max === "tooHigh"
              ? t("admin.maxSelectionsTooHigh", "Selection limit cannot exceed the number of options.")
              : gErr.max === "minAboveMax"
              ? t("admin.minAboveMax", "Maximum cannot be lower than the minimum.")
              : null;
          const optionsErrorText =
            gErr.options === "requiredNeedsOption"
              ? t("admin.requiredGroupNeedsOption", "Required groups must have at least one option.")
              : gErr.options === "needsOption"
              ? t("admin.groupNeedsOption", "Add at least one option, or remove this group.")
              : gErr.options === "notEnoughAvailable"
              ? t(
                  "admin.notEnoughAvailableOptions",
                  "Not enough available options to meet the minimum. Mark more options available or lower the minimum."
                )
              : null;
          /* Phase 80 — min has its own message, and the min>max case is
             reported against max so it sits beside the field most likely to
             be wrong. */
          const minErrorText =
            gErr.min === "invalid"
              ? t("admin.minSelectionsInvalid", "Enter a valid minimum (0 or more).")
              : null;

          /* ── Phase 114.0 §4/§6/§9 — conditional visibility ──────────────
             The RAW field is what the radio reads, not the normalized one:
             an object that is present but still half-filled is "the manager
             chose Show Conditionally and has not finished", which must keep
             the second state selected and its two dropdowns on screen.
             Normalizing here would snap the control back to Always Show the
             moment it was touched. */
          const rawCondition = group.visibilityCondition;
          const isConditional = rawCondition != null;
          const conditionParentId = rawCondition?.parentGroupId || "";
          const conditionOptionId = rawCondition?.triggerOptionId || "";

          const eligibleParents = getEligibleParentGroups(choices, group.id);
          /* A stored condition may point at a group that is no longer
             offered — it was renamed to nothing, or it became conditional
             through some path this editor does not take. Keeping it in the
             list means the manager SEES what the group currently depends on
             instead of an empty select, and the validation below says what
             is wrong with it. */
          const storedParent = choices.find((g) => g.id === conditionParentId);
          const parentChoices =
            storedParent && !eligibleParents.some((g) => g.id === storedParent.id)
              ? [storedParent, ...eligibleParents]
              : eligibleParents;
          /* §6 — only the chosen parent's own options, so an option from an
             unrelated group is not selectable in the first place. */
          const triggerChoices = (storedParent?.options || []).filter((o) =>
            hasLocalizedText(o.name)
          );

          const visibilityErrorText =
            gErr.visibility === CONDITION_ISSUE.INCOMPLETE
              ? t(
                  "admin.visibilityIncomplete",
                  "Choose both a group and an option, or set this group to Always Show."
                )
              : gErr.visibility === CONDITION_ISSUE.PARENT_MISSING
              ? t(
                  "admin.visibilityParentMissing",
                  "The group this depends on is no longer available. Choose another, or set this group to Always Show."
                )
              : gErr.visibility === CONDITION_ISSUE.PARENT_CONDITIONAL
              ? t(
                  "admin.visibilityParentConditional",
                  "A group that already appears conditionally cannot control another group."
                )
              : gErr.visibility === CONDITION_ISSUE.OPTION_MISSING
              ? t(
                  "admin.visibilityOptionMissing",
                  "The option this depends on no longer exists in that group. Choose another option."
                )
              : gErr.visibility === CONDITION_ISSUE.SELF
              ? t("admin.visibilitySelf", "A group cannot depend on itself.")
              : gErr.visibility === CONDITION_ISSUE.PARENT_AFTER
              ? t(
                  "admin.visibilityParentAfter",
                  "The controlling group must appear before this one."
                )
              : null;

          /* §8 — derived, never stored, so it always describes the two fields
             as they currently stand. */
          const normalizedRule = {
            minSelections: parseSelectionBound(group.minSelections, { min: 0 }) ?? 0,
            maxSelections: parseSelectionBound(group.maxSelections, { min: 1 }) ?? 1,
          };
          const groupRequired = normalizedRule.minSelections >= 1;
          const groupRuleDesc = describeGroupRule(normalizedRule);
          const groupRuleText =
            groupRuleDesc.kind === "optional"
              ? t("admin.ruleOptionalSingle", "Guests may choose one, or none.")
              : groupRuleDesc.kind === "single"
              ? t("admin.ruleExactlyOne", "Guests must choose exactly one.")
              : groupRuleDesc.kind === "upTo"
              ? t("admin.ruleUpTo", "Guests may choose up to {n}.").replace("{n}", groupRuleDesc.max)
              : groupRuleDesc.kind === "exactly"
              ? t("admin.ruleExactly", "Guests must choose exactly {n}.").replace("{n}", groupRuleDesc.min)
              : t("admin.ruleRange", "Guests must choose between {min} and {max}.")
                  .replace("{min}", groupRuleDesc.min)
                  .replace("{max}", groupRuleDesc.max);

          /* Re-run validation for THIS group after any edit to it, so a fixed
             group clears immediately and a still-broken one keeps its message
             — without touching the other groups' errors. */
          /* Phase 114.0 — now judged against the whole draft rather than
             against a one-element list, because a condition is a statement
             about the product. Still writes only THIS group's entry, so a
             fixed group clears immediately and the other groups' messages
             are left exactly where they were. */
          const revalidateGroup = revalidateGroupInDraft;

          return (
          <Card key={group.id} className={`mm-group-card ${gErr.max || gErr.options || gErr.visibility ? "mm-group-card--invalid" : ""}`}>
            {/* §7/§12 — the group name is the group's identity, so it gets a
                row of its own with both languages side by side and a divider
                beneath it separating identity from options. */}
            <div className="mm-bi-row mm-bi-row--group">
              <LocalizedField
                id={groupNameFieldId(group.id)}
                label={t("admin.groupName", "Group name")}
                value={group.name}
                error={optionsErrorText}
                compact
                inline
                onChange={(next) => {
                  handleUpdateChoiceGroup(group.id, { name: next });
                  revalidateGroup({ ...group, name: next });
                }}
              />
            </div>

            {/* Phase 80 — the rule, as two numbers. The Required checkbox is
                gone: it and a minimum are the same statement, and keeping both
                editable is how a product ends up flagged required with a
                minimum of zero. Required is now shown, not set — see the
                summary line below. */}
            <div className="mm-row-2">
              <Input
                id={groupMinFieldId(group.id)}
                label={t("admin.minSelections", "Min selections")}
                type="number"
                min="0"
                step="1"
                value={group.minSelections}
                error={minErrorText}
                aria-invalid={minErrorText ? "true" : undefined}
                onChange={(e) => {
                  handleUpdateChoiceGroup(group.id, { minSelections: e.target.value });
                  revalidateGroup({ ...group, minSelections: e.target.value });
                }}
              />
              <Input
                id={groupMaxFieldId(group.id)}
                label={t("admin.maxSelections", "Max selections")}
                type="number"
                min="1"
                step="1"
                /* Phase 48 — the raw string is kept in state now. Coercing
                   here with `parseInt(v) || 1` was what made "", "0", "abc"
                   and "1.5" all silently become 1 before anything could
                   check them. */
                value={group.maxSelections}
                error={maxErrorText}
                aria-invalid={maxErrorText ? "true" : undefined}
                onChange={(e) => {
                  handleUpdateChoiceGroup(group.id, { maxSelections: e.target.value });
                  revalidateGroup({ ...group, maxSelections: e.target.value });
                }}
              />
            </div>

            {/* §8 — a read-only reading of what those two numbers mean, in the
                same words the guest will see. Not a second setting: there is
                nothing here to edit, so it cannot diverge from the fields
                above it. */}
            <p className="mm-group-rule">
              <span className="mm-group-rule__badge">
                {groupRequired
                  ? t("common.required", "Required")
                  : t("common.optional", "Optional")}
              </span>
              <span className="mm-group-rule__text">{groupRuleText}</span>
            </p>

            {/* ── Phase 114.0 §4/§7 — ONE extra property, not a rule builder.
                Native radios in a fieldset, the same construction the
                Accepting Orders control uses: the group role, arrow-key
                navigation and the announced selected state all come from the
                platform, and the choice is never conveyed by colour alone
                (§32) because each mode says its own name.

                The vocabulary is deliberately plain — "when should this
                group appear", "show this group when" — with no dependency,
                predicate or reference language anywhere in it (§7). */}
            <fieldset className="mm-vis">
              <legend className="mm-vis__legend">
                {t("admin.visibilityLabel", "When should this group appear?")}
              </legend>
              <div className="mm-vis__modes">
                <label className={`mm-vis__mode ${!isConditional ? "mm-vis__mode--active" : ""}`}>
                  <input
                    type="radio"
                    className="mm-vis__input"
                    name={`mm-vis-${group.id}`}
                    checked={!isConditional}
                    onChange={() => setGroupVisibility(group, null)}
                  />
                  <span className="mm-vis__mode-label">
                    {t("admin.visibilityAlways", "Always Show")}
                  </span>
                </label>
                <label
                  className={`mm-vis__mode ${isConditional ? "mm-vis__mode--active" : ""} ${
                    !isConditional && parentChoices.length === 0 ? "mm-vis__mode--disabled" : ""
                  }`}
                >
                  <input
                    id={groupVisFieldId(group.id)}
                    type="radio"
                    className="mm-vis__input"
                    name={`mm-vis-${group.id}`}
                    checked={isConditional}
                    /* §8 — with nothing above it to depend on, the second
                       mode is unreachable rather than reachable-and-broken,
                       and the line below says why. The editor is never left
                       in a state it cannot be saved from. */
                    disabled={!isConditional && parentChoices.length === 0}
                    onChange={() =>
                      setGroupVisibility(group, { parentGroupId: "", triggerOptionId: "" })
                    }
                  />
                  <span className="mm-vis__mode-label">
                    {t("admin.visibilityConditional", "Show Conditionally")}
                  </span>
                </label>
              </div>

              {!isConditional && parentChoices.length === 0 && (
                <p className="mm-vis__hint">
                  {t(
                    "admin.visibilityNoParent",
                    "Add a choice group above this one to make this group appear conditionally."
                  )}
                </p>
              )}

              {isConditional && (
                <>
                  <p className="mm-vis__hint">
                    {t(
                      "admin.visibilityHint",
                      "Show this group only when a specific option is selected in another group."
                    )}
                  </p>
                  <div className="mm-row-2 mm-vis__fields">
                    <label className="field">
                      <span className="field__label">
                        {t("admin.visibilityParentGroup", "Choice group")}
                      </span>
                      <select
                        className="mm-select mm-select--full"
                        value={conditionParentId}
                        aria-invalid={visibilityErrorText ? "true" : undefined}
                        onChange={(e) => {
                          /* Changing the parent clears the trigger: an
                             option from the previous group is not an answer
                             to this one, and carrying it over is exactly
                             §9C. The manager picks again from the new list. */
                          const next = {
                            parentGroupId: e.target.value,
                            triggerOptionId: "",
                          };
                          handleUpdateChoiceGroup(group.id, { visibilityCondition: next });
                          revalidateGroup({ ...group, visibilityCondition: next });
                        }}
                      >
                        <option value="">
                          {t("admin.visibilitySelectGroup", "Choose a group")}
                        </option>
                        {parentChoices.map((g) => (
                          <option key={g.id} value={g.id}>
                            {getLocalizedText(g.name, language).trim() ||
                              t("admin.untitledGroup", "Untitled group")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field__label">
                        {t("admin.visibilityTriggerOption", "Selected option")}
                      </span>
                      <select
                        className="mm-select mm-select--full"
                        value={conditionOptionId}
                        disabled={!conditionParentId}
                        aria-invalid={visibilityErrorText ? "true" : undefined}
                        onChange={(e) => {
                          const next = {
                            parentGroupId: conditionParentId,
                            triggerOptionId: e.target.value,
                          };
                          handleUpdateChoiceGroup(group.id, { visibilityCondition: next });
                          revalidateGroup({ ...group, visibilityCondition: next });
                        }}
                      >
                        <option value="">
                          {t("admin.visibilitySelectOption", "Choose an option")}
                        </option>
                        {triggerChoices.map((o) => (
                          <option key={o.id} value={o.id}>
                            {getLocalizedText(o.name, language).trim() ||
                              t("admin.optionName", "Option name")}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {visibilityErrorText && (
                    <p className="field__hint field__hint--error" role="alert">
                      {visibilityErrorText}
                    </p>
                  )}
                </>
              )}
            </fieldset>

            <div className="mm-options-list">
              {group.options.map((opt) => {
                const optPriceError = !!optionPriceErrors[optionErrorKey(group.id, opt.id)];
                return (
                <div className="mm-option-row" key={opt.id}>
                  {/* §8/§9 — inline, so these two language rows become grid
                      items of .mm-option-row and the price can be ordered
                      BETWEEN them. */}
                  <LocalizedField
                    value={opt.name}
                    placeholder={t("admin.optionName", "Option name")}
                    compact
                    inline
                    onChange={(next) => {
                      handleUpdateOption(group.id, opt.id, { name: next });
                      /* Naming a blank option is what turns an empty group
                         valid, so this is the edit that most often clears
                         the error. */
                      revalidateGroup({
                        ...group,
                        options: group.options.map((o) =>
                          o.id === opt.id ? { ...o, name: next } : o
                        ),
                      });
                    }}
                  />
                  <input
                    id={optionPriceFieldId(group.id, opt.id)}
                    className={`input mm-option-row__price ${optPriceError ? "input--error" : ""}`}
                    type="number"
                    step="0.01"
                    min="0"
                    /* The field has no visible label — it sits in a bare
                       three-column row — so the error below it would other-
                       wise announce against nothing. */
                    aria-label={t("admin.optionExtraPrice", "Extra price")}
                    aria-invalid={optPriceError ? "true" : undefined}
                    /* Phase 56 — the raw string is kept in state now. Coercing
                       here with `parseFloat(v) || 0` is what turned "", "abc"
                       and "-1" into a price before anything could check it,
                       and silently saved "12.5o" as 12.5. */
                    value={opt.price}
                    onChange={(e) => {
                      handleUpdateOption(group.id, opt.id, { price: e.target.value });
                      clearOptionPriceError(group.id, opt.id, e.target.value);
                    }}
                  />
                  {optPriceError && (
                    <p className="field__hint field__hint--error mm-option-row__error" role="alert">
                      {t("admin.optionPriceInvalid", "Enter a valid extra price of 0 or more.")}
                    </p>
                  )}
                  {/* Phase 108.2 §2 — the per-option availability control is
                      gone from the editor. It was the eye toggle Phase 108.1
                      kept; the row is now name, price, name, delete and
                      nothing else.

                      §3 — the DATA is untouched. `isAvailable` is still read
                      from each option, still carried through the draft, still
                      written back by Save, and still honoured by the guest
                      sheet, by cart validation and by this group's own "not
                      enough available options" rule. An option stored sold
                      out stays sold out — there is simply no Admin control
                      for it any more, and nothing replaces it. */}
                  <button
                    type="button"
                    className="mm-icon-btn mm-icon-btn--danger"
                    onClick={() => {
                      handleRemoveOption(group.id, opt.id);
                      /* Removing the last option can invalidate the group. */
                      revalidateGroup({
                        ...group,
                        options: group.options.filter((o) => o.id !== opt.id),
                      });
                    }}
                    aria-label={t("common.remove", "Remove")}
                  >
                    <X size={14} strokeWidth={2.4} />
                  </button>
                </div>
                );
              })}
            </div>
            <div className="mm-group-card__actions">
              <Button type="button" variant="outline" size="sm" onClick={() => handleAddOption(group.id)}>
                {t("admin.addOption", "Add option")}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  handleRemoveChoiceGroup(group.id);
                  /* Drop the removed group's error with it, so a deleted
                     group cannot keep blocking Save from the shadows. */
                  setGroupErrors((prev) => {
                    const next = { ...prev };
                    delete next[group.id];
                    return next;
                  });
                }}
              >
                {t("admin.removeGroup", "Remove group")}
              </Button>
            </div>
          </Card>
          );
  };

  /* Phase 92 §16 — the removals and add-ons editors, lifted out of the JSX
     so they can be emitted at whatever position the configured order gives
     them. Both bodies are unchanged; only their wrapper moved. Their own
     <h4> headings are gone because the section bar above each one now
     carries the label, and two headings for one block read as two blocks. */
  const removalsBody = (
    <>
        {/* Phase 97.7 §16 — an ingredient is merchant-authored text like any
            other, so it needs its second language. A static tag cannot hold
            two editable values, so each entry becomes one compact pair with
            the same remove control it always had. The add row below is
            untouched and still adds in the base language. */}
        <div className="mm-localized-rows">
          {removableIngredients.map((ing, idx) => (
            /* Phase 108.2 §6/§7 — one compact row with both languages side by
               side, matching the density of a choice-group option row.
               `inline` dissolves the field wrapper so its two language rows
               become grid items of this row and the remove button trails
               them. No price, no availability, no required/min/max — an
               ingredient is just a name the guest may take off. */
            <div className="mm-localized-row" key={`ingredient-${idx}`}>
              <LocalizedField
                value={ing}
                placeholder={t("admin.ingredientPlaceholder", "e.g. onions")}
                compact
                inline
                onChange={(next) =>
                  setRemovableIngredients(
                    removableIngredients.map((entry, i) => (i === idx ? next : entry))
                  )
                }
              />
              <button
                type="button"
                className="mm-localized-row__remove"
                onClick={() => handleRemoveIngredient(idx)}
                aria-label={t("common.remove", "Remove")}
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
        <div className="mm-inline-add">
          <input
            className="input"
            value={newIngredient}
            onChange={(e) => setNewIngredient(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddIngredient(); } }}
            placeholder={t("admin.ingredientPlaceholder", "e.g. onions")}
          />
          <Button type="button" variant="outline" size="sm" onClick={handleAddIngredient}>
            {t("admin.addIngredient", "Add ingredient")}
          </Button>
        </div>
    </>
  );

  const addOnsBody = (
    <>
        <div className="mm-options-list">
          {paidAddOns.map((addon) => {
            const addOnPriceError = !!addOnPriceErrors[addon.id];
            return (
            <div className="mm-option-row" key={addon.id}>
              <LocalizedField
                value={addon.name}
                placeholder={t("admin.addOnName", "Add-on name")}
                compact
                onChange={(next) => handleUpdateAddOn(addon.id, { name: next })}
              />
              <input
                id={addOnPriceFieldId(addon.id)}
                className={`input mm-option-row__price ${addOnPriceError ? "input--error" : ""}`}
                type="number"
                step="0.01"
                min="0"
                aria-label={t("admin.productPrice", "Price")}
                aria-invalid={addOnPriceError ? "true" : undefined}
                /* Phase 56 — raw string until Save, as above. */
                value={addon.price}
                onChange={(e) => {
                  handleUpdateAddOn(addon.id, { price: e.target.value });
                  clearAddOnPriceError(addon.id, e.target.value);
                }}
              />
              <button
                type="button"
                className="mm-icon-btn mm-icon-btn--danger"
                onClick={() => handleRemoveAddOn(addon.id)}
                aria-label={t("common.remove", "Remove")}
              >
                <X size={14} strokeWidth={2.4} />
              </button>
              {addOnPriceError && (
                <p className="field__hint field__hint--error mm-option-row__error" role="alert">
                  {t("admin.addOnPriceInvalid", "Enter a valid price greater than 0.")}
                </p>
              )}
            </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" size="sm" icon={Plus} onClick={handleAddAddOn}>
          {t("admin.addAddOn", "Add add-on")}
        </Button>
    </>
  );

  return (
    <>
    <Modal
      open
      onClose={handleRequestClose}
      title={isNew ? t("admin.addProduct", "Add Item") : t("admin.editProduct", "Edit Item")}
      className="modal--editor"
      /* Phase 108.0 §4/§12 — the preview rides with the title and the X in
         one sticky block, so "which product am I in, and how will it look"
         stays answerable from anywhere in a 1859px form. */
      stickyHead={
        <ProductLivePreview
          name={name}
          price={price}
          categoryId={categoryId}
          imageUrl={imageUrl}
          isAvailable={isAvailable}
          isPopular={isPopular}
          isFeatured={isFeatured}
          categories={categories}
          isNew={isNew}
        />
      }
      footer={
        <>
          {/* §23 — both disabled while a save is in flight: leaving Cancel
              live would let a manager dismiss the editor mid-write. */}
          <Button variant="ghost" disabled={isSaving} onClick={handleRequestClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button disabled={isSaving} onClick={handleSubmit}>
            {isSaving ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </>
      }
    >
      <div className="mm-editor">
        {/* Phase 108.0 §14 — ONE Product Details section, in the order the
            brief approves: what it is called, what it costs and where it
            lives, what it says, then what it looks like. The old summary
            strip that used to open this body is gone — it is the sticky
            customer preview above now (§4), which does the same job without
            scrolling away and without reading as another form card (§6). */}
        <h4 className="mm-section-title mm-sec">{t("admin.productDetails", "Product Details")}</h4>

        <LocalizedField
          id="product-name"
          label={t("admin.productName", "Item name")}
          value={name}
          error={error}
          required
          onChange={(next) => { setName(next); if (error) setError(null); }}
        />

        <div className="mm-row-2">
          <Input
            id={PRICE_FIELD_ID}
            label={t("admin.productPrice", "Price")}
            type="number"
            step="0.01"
            /* Phase 47 — min is 0.01 rather than 0 so the browser's own
               spinner and native hints agree with the rule actually enforced
               on save. It is a hint, not the guard: parseProductPrice is
               what decides, since min is trivially bypassed by typing. */
            min="0.01"
            value={price}
            error={priceError}
            aria-invalid={priceError ? "true" : undefined}
            onChange={(e) => {
              setPrice(e.target.value);
              /* Phase 47 — clear as soon as the value becomes valid, so a
                 corrected price re-enables Save without pressing it first. */
              if (priceError && parseProductPrice(e.target.value) !== null) setPriceError(null);
            }}
          />
          <label className="field mm-field">
            <span className="field__label">{t("admin.productCategory", "Category")}</span>
            <select
              className="mm-select mm-select--full"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {getLocalizedText(c.name, language)}</option>
              ))}
            </select>
          </label>
        </div>

        {/* §17 — descriptions after the commercial identity, still multiline
            and still bilingual; LocalizedField and its validation are
            untouched. */}
        <label className="field mm-field">
          <LocalizedField
            id="product-description"
            label={t("admin.productDescription", "Description")}
            value={description}
            multiline
            rows={3}
            onChange={(next) => setDescription(next)}
          />
        </label>

        {/* §18 — the image comes last in Product Details: the preview above
            is its feedback.

            Phase 115.0 §2/§19 — this cell held a bare "Image URL" text input,
            which asked every restaurant to host their photographs somewhere
            before they could use them. It is now the shared upload control,
            and it is still ONE ROW: a 72px preview with its actions beside
            it, the URL field folded behind a text toggle, and no hint line.
            The row it shares with Sort order is a little taller than a text
            input and nothing else about the editor moved. */}
        <div className="mm-row-2">
          <ImageAssetField
            label={t("admin.productImage", "Product image")}
            value={imageUrl}
            onChange={setImageUrl}
            onAssetCreated={(ref) => createdImageRefs.current.push(ref)}
            restaurantSlug={restaurant.slug}
            maxEdge={MAX_PRODUCT_IMAGE_EDGE}
            maxBytes={MAX_PRODUCT_IMAGE_BYTES}
            idPrefix="img"
            errorCopy={IMAGE_ERROR_COPY}
            urlLabel={t("admin.productImageUrl", "Image URL")}
            previewAlt=""
          />
          <Input
            id={SORT_ORDER_FIELD_ID}
            label={t("admin.productSortOrder", "Sort order")}
            type="number"
            min="0"
            step="1"
            value={sortOrder}
            error={sortOrderError}
            aria-invalid={sortOrderError ? "true" : undefined}
            onChange={(e) => {
              setSortOrder(e.target.value);
              /* Clear as soon as it becomes valid again — including when it
                 is emptied, which is a legitimate "leave it to the system". */
              const next = e.target.value.trim();
              if (sortOrderError && (next === "" || parseSortOrder(next) !== null)) {
                setSortOrderError(null);
              }
            }}
          />
        </div>

        {/* Phase 92 §15 — three identical checkbox rows said these three
            matter equally. They do not: Available decides whether a guest can
            order the thing at all, Featured and Popular only decide where it
            is shown. Same control, same behaviour — availability just gets
            its own framed row and the two merchandising flags share a quieter
            line underneath.

            Phase 108.0 §20 — named as its own section now. The three controls,
            their state and their meaning are unchanged; Popular and Featured
            stay separate flags and neither disables the other (§22). */}
        <h4 className="mm-section-title mm-sec">
          {t("admin.visibilityPromotion", "Visibility & Promotion")}
        </h4>
        <div className="mm-toggles mm-toggles--visibility">
          <label className="mm-toggle-row mm-toggle-row--primary">
            <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
            <span>{t("admin.available", "Available")}</span>
          </label>
          {/* Phase 108.3 — Popular sits before Featured, matching both the
              approved row order and the badge priority the preview applies
              (Popular outranks Featured). Swapped in the MARKUP rather than
              with CSS order, so reading, tab and visual order stay the same
              three things. Both remain independent flags; neither disables
              the other and no meaning changes. */}
          <div className="mm-flags-row">
            <label className="mm-toggle-row">
              <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} />
              <span>{t("common.popular", "Popular")}</span>
            </label>
            <label className="mm-toggle-row">
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              <span>{t("common.featured", "Featured")}</span>
            </label>
          </div>
        </div>

        <div className="mm-divider" />

        {/* ── Phase 92 §16/§17 — Customization, in the order guests see it ──
            One sequence, not three fixed blocks. Each choice group is its own
            movable section, so a product can put removals between two groups
            or add-ons first — the arrangement the guest sheet already
            supports and nothing could previously express. */}
        <div className="mm-cz-head">
          <h4 className="mm-section-title">{t("admin.customization", "Customization")}</h4>
          <p className="mm-cz-head__hint">
            {t("admin.customizationOrderHint", "Guests see these sections in this order.")}
          </p>
        </div>

        {/* Phase 108.2 §9/§10 — the legacy paid add-ons note is gone. Old
            seeded products may still carry paidAddOns; that data is left
            silently intact for backward compatibility and is still written
            back unchanged by Save, but it is implementation history the
            manager has no action to take on, so the editor no longer
            mentions it. No migration, no conversion, no deletion. */}
        <div className="mm-cz-list">
          {editorSections.map((sec, index) => (
            <section className="mm-cz" key={sec.key}>
              <div className="mm-cz__bar">
                <span className="mm-cz__pos" aria-hidden="true">{index + 1}</span>
                <span className="mm-cz__label">{sectionLabel(sec)}</span>
                {/* §19 — quiet controls, and §50/§49: each one names the
                    section it moves, so a screen reader user is never left
                    with a column of identical "Move up" buttons. */}
                <div className="mm-cz__move">
                  <button
                    type="button"
                    className="mm-reorder-btn"
                    disabled={index === 0}
                    onClick={() => moveCustomizationSection(index, -1)}
                    aria-label={`${t("admin.moveUp", "Move up")} — ${sectionLabel(sec)}`}
                  >
                    <ChevronUp size={15} strokeWidth={2.4} />
                  </button>
                  <button
                    type="button"
                    className="mm-reorder-btn"
                    disabled={index === editorSections.length - 1}
                    onClick={() => moveCustomizationSection(index, 1)}
                    aria-label={`${t("admin.moveDown", "Move down")} — ${sectionLabel(sec)}`}
                  >
                    <ChevronDown size={15} strokeWidth={2.4} />
                  </button>
                </div>
              </div>

              <div className="mm-cz__body">
                {sec.kind === "removals" && removalsBody}
                {sec.kind === "addOns" && addOnsBody}
                {sec.kind === "choice" && renderChoiceGroupCard(sec.group)}
              </div>
            </section>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" icon={Plus} onClick={handleAddChoiceGroup}>
          {t("admin.addChoiceGroup", "Add choice group")}
        </Button>

        {/* Phase 92 §29 — Delete lives at the far end of the sheet, in its own
            framed area, and never beside Save. An existing product only: there
            is nothing to delete before the first save.

            It opens the same confirmation the list uses (§52) rather than a
            second dialog of its own, so there is one delete path in this
            screen and one place where the wording can be got right. */}
        {!isNew && onRequestDelete && (
          <div className="mm-danger-zone">
            <p className="mm-danger-zone__title">{t("admin.dangerZone", "Delete this item")}</p>
            <p className="mm-danger-zone__text">
              {t(
                "admin.deleteProductConfirmMsg",
                "This will permanently remove it from the menu. Existing orders are not affected."
              )}
            </p>
            <Button type="button" variant="danger" size="sm" icon={Trash2} onClick={onRequestDelete}>
              {t("admin.deleteProduct", "Delete Item")}
            </Button>
          </div>
        )}
      </div>
    </Modal>

    {/* Phase 55 — discard confirmation, rendered ABOVE the editor rather than
        replacing it, so the draft stays mounted and every field, validation
        error and scroll position is exactly where it was if the manager
        decides to carry on.

        Dismissing THIS dialog (its own X, overlay or Escape) only closes the
        dialog — discarding is reachable solely through the explicit button,
        so a stray backdrop click can never destroy the draft it is warning
        about. */}
    {/* Phase 114.0 §10 — a refusal, not a confirmation: there is one way
        out and it changes nothing. The destructive edit was never applied,
        so there is no "do it anyway" to offer — the manager updates the
        dependent group's condition first, which the message names. */}
    {blockedEdit && (
      <Modal
        open
        onClose={() => setBlockedEdit(null)}
        title={t("admin.visibilityBlockedTitle", "Update the dependent group first")}
        footer={
          <Button variant="outline" onClick={() => setBlockedEdit(null)}>
            {t("common.close", "Close")}
          </Button>
        }
      >
        <p className="ad-cancel-modal__msg">{blockedEdit}</p>
      </Modal>
    )}

    {showDiscard && (
      <Modal
        open
        onClose={() => resolveDiscard(false)}
        title={t("admin.discardChangesTitle", "Discard changes?")}
        footer={
          <>
            <Button variant="ghost" onClick={() => resolveDiscard(false)}>
              {t("admin.keepEditing", "Keep Editing")}
            </Button>
            <Button
              variant="danger"
              onClick={() => resolveDiscard(true)}
            >
              {t("admin.discardChanges", "Discard Changes")}
            </Button>
          </>
        }
      >
        <p className="ad-cancel-modal__msg">
          {t(
            "admin.discardChangesMsg",
            "You have unsaved changes. If you leave now, your changes will be lost."
          )}
        </p>
      </Modal>
    )}
    </>
  );
}
