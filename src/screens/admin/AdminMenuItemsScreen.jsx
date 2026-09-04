import { useState, useMemo, useRef, useEffect } from "react";
import { Pencil, Trash2, Plus, X, Search, UtensilsCrossed } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Input   from "../../components/ui/Input.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { useMenuData } from "../../lib/useMenuData.js";
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  genChoiceGroupId,
  genChoiceOptionId,
  genAddOnId,
} from "../../lib/menuData.js";
import { useLanguage } from "../../i18n/useLanguage.js";
/* Phase 66 — the price rules moved to src/lib/menuPricing.js so the storage
   boundary can enforce the identical rules. Behaviour here is unchanged. */
import { parseProductPrice, parseChoiceOptionPrice, parseAddOnPrice } from "../../lib/menuPricing.js";
import { parseSortOrder } from "../../lib/menuSortOrder.js";
import {
  validateGroupConfig,
  parseSelectionBound,
  describeGroupRule,
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
    if (!(group.name || "").trim()) continue; // dropped on save anyway

    /* Phase 80 — the per-group rules moved to lib/choiceRules.js so the
       editor, the customer sheet, the cart and the order gate all judge a
       configuration by one definition. This function keeps its shape and its
       error-code contract; only the source of the codes changed. */
    const groupError = validateGroupConfig(group);

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
    if (!(group.name || "").trim()) continue; // dropped on save anyway
    for (const opt of group.options || []) {
      if (!(opt.name || "").trim()) continue; // dropped on save anyway
      if (parseChoiceOptionPrice(opt.price) === null) {
        optionErrors[optionErrorKey(group.id, opt.id)] = true;
        if (!firstInvalidFieldId) firstInvalidFieldId = optionPriceFieldId(group.id, opt.id);
      }
    }
  }

  for (const addon of paidAddOns || []) {
    if (!(addon.name || "").trim()) continue; // dropped on save anyway
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
  const { t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingItem, setEditingItem] = useState(null); // item object, or {} for "new"
  const [pendingDelete, setPendingDelete] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const categoryName = (categoryId) => categories.find((c) => c.id === categoryId)?.name || "—";

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((i) => categoryFilter === "all" || i.categoryId === categoryFilter)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
      .sort((a, b) => {
        const cd = (categories.findIndex((c) => c.id === a.categoryId)) - (categories.findIndex((c) => c.id === b.categoryId));
        return cd !== 0 ? cd : (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }, [items, categories, searchQuery, categoryFilter]);

  /* Phase 21 architecture review — redundant, defense-in-depth guard.
     App.jsx's AdminRoute already refuses to render this component at all
     for a Cashier session; this second check protects against any future
     code path that might reach it another way. All hooks above still run
     unconditionally (React's rules of hooks), only the returned UI differs. */
  if (session.role !== "admin") {
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
        <p className="ad-header__subtitle">
          {t("admin.manageMenuSubtitle", "Add, edit, and manage your menu items.")}
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
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>
        <Button
          icon={Plus}
          disabled={categories.length === 0}
          onClick={() => setEditingItem({ categoryId: categories[0]?.id })}
        >
          {t("admin.addProduct", "Add Item")}
        </Button>
      </div>

      {filteredItems.length === 0 ? (
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <UtensilsCrossed size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("admin.noProductsYet", "No items yet.")}</h3>
        </div>
      ) : (
        <div className="mm-item-list anim-rise">
          {filteredItems.map((item) => (
            <Card key={item.id} className="mm-item-row">
              <div className="mm-item-row__thumb">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} loading="lazy" />
                ) : (
                  <span className="mm-item-row__emoji">
                    {categories.find((c) => c.id === item.categoryId)?.emoji || "🍽️"}
                  </span>
                )}
              </div>

              <div className="mm-item-row__info">
                <p className="mm-item-row__name">{item.name}</p>
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
              <div className="mm-item-row__actions">
                <button
                  type="button"
                  className="mm-edit-btn"
                  onClick={() => setEditingItem(item)}
                >
                  <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                  <span>{t("common.edit", "Edit")}</span>
                </button>
                <button
                  type="button"
                  className="mm-icon-btn mm-icon-btn--danger"
                  onClick={() => setPendingDelete(item)}
                  aria-label={t("admin.deleteProduct", "Delete Item")}
                >
                  <Trash2 size={15} strokeWidth={2.2} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editingItem && (
        <MenuItemEditorModal
          item={editingItem}
          categories={categories}
          onSave={handleSave}
          onClose={() => setEditingItem(null)}
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

/* ── Add/Edit item form modal — the big one ──────────────────────────────── */
function MenuItemEditorModal({ item, categories, onSave, onClose }) {
  const { t } = useLanguage();
  const isNew = !item.id;

  const [name, setName] = useState(item.name || "");
  const [description, setDescription] = useState(item.description || "");
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
    if (!value || removableIngredients.includes(value)) { setNewIngredient(""); return; }
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
  function handleRemoveChoiceGroup(groupId) {
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
    setChoices(
      choices.map((g) =>
        g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g
      )
    );
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
  });
  const initialSignature = useRef(null);
  if (initialSignature.current === null) initialSignature.current = draftSignature;
  const isDirty = draftSignature !== initialSignature.current;

  const [showDiscard, setShowDiscard] = useState(false);

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

    /* Phase 60 — close first, then navigate, in that order and once only.
       Closing unmounts this modal and unregisters the guard, so the parked
       proceed cannot be re-intercepted on its way out. It also covers the
       case where the destination is the page already showing (clicking
       "Menu" from Menu): nothing would unmount, and without this the editor
       would sit there still holding the draft the Admin just discarded. */
    onClose();
    if (pending) pending();
  }


  function handleSubmit() {
    if (!name.trim()) { setError(t("admin.productNameRequired", "Please enter an item name.")); return; }
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

    onSave({
      name: name.trim(),
      description: description.trim(),
      /* Already a validated finite Number > 0 — storage shape is unchanged. */
      price: parsedPrice,
      categoryId,
      imageUrl: imageUrl.trim(),
      sortOrder: parsedSortOrder,
      isAvailable,
      isFeatured,
      isPopular,
      removableIngredients,
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
        .filter((g) => g.name.trim())
        .map((g) => ({
          ...g,
          /* Phase 80 — both bounds become Numbers here, and the legacy
             `required` flag is dropped rather than written back, so a saved
             product carries exactly one description of its rule. */
          required: undefined,
          minSelections: parseSelectionBound(g.minSelections, { min: 0 }) ?? 0,
          maxSelections: parseSelectionLimit(g.maxSelections),
          /* Phase 56: prices become Numbers here for the same reason
             maxSelections does — the row holds the raw string while editing
             so invalid input can be judged, and storage keeps the numeric
             shape the customer modal and Phase 37 expect. Spreading the
             existing option object preserves its id. */
          options: g.options
            .filter((o) => o.name.trim())
            .map((o) => ({
              ...o,
              price: parseChoiceOptionPrice(o.price),
              /* Persisted with the option it belongs to (§10) — there is no
                 separate availability store to fall out of step with. */
              isAvailable: o.isAvailable !== false,
            })),
        })),
      paidAddOns: paidAddOns
        .filter((a) => a.name.trim())
        .map((a) => ({ ...a, price: parseAddOnPrice(a.price) })),
    });
  }

  return (
    <>
    <Modal
      open
      onClose={handleRequestClose}
      title={isNew ? t("admin.addProduct", "Add Item") : t("admin.editProduct", "Edit Item")}
      footer={
        <>
          <Button variant="ghost" onClick={handleRequestClose}>{t("common.cancel", "Cancel")}</Button>
          <Button onClick={handleSubmit}>{t("common.save", "Save")}</Button>
        </>
      }
    >
      <div className="mm-editor">
        <Input
          label={t("admin.productName", "Item name")}
          value={name}
          error={error}
          onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
          autoFocus
        />

        <label className="field mm-field">
          <span className="field__label">{t("admin.productDescription", "Description")}</span>
          <textarea
            className="mm-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>

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
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mm-row-2">
          <Input
            label={t("admin.productImageUrl", "Image URL")}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
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

        <div className="mm-toggles">
          <label className="mm-toggle-row">
            <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
            <span>{t("admin.available", "Available")}</span>
          </label>
          <label className="mm-toggle-row">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
            <span>{t("common.featured", "Featured")}</span>
          </label>
          <label className="mm-toggle-row">
            <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} />
            <span>{t("common.popular", "Popular")}</span>
          </label>
        </div>

        <div className="mm-divider" />

        {/* ── Removable ingredients ─────────────────────────────────────── */}
        <h4 className="mm-section-title">{t("admin.removableIngredientsLabel", "Removable ingredients")}</h4>
        <div className="mm-tags">
          {removableIngredients.map((ing, idx) => (
            <span className="mm-tag" key={`${ing}-${idx}`}>
              {ing}
              <button type="button" onClick={() => handleRemoveIngredient(idx)} aria-label={t("common.remove", "Remove")}>
                <X size={12} strokeWidth={2.4} />
              </button>
            </span>
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

        <div className="mm-divider" />

        {/* ── Choice groups ──────────────────────────────────────────────── */}
        <h4 className="mm-section-title">{t("admin.choiceGroups", "Choice groups")}</h4>
        {choices.map((group) => {
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
          const revalidateGroup = (patchedGroup) => {
            setGroupErrors((prev) => {
              const { errors } = validateChoiceGroups([patchedGroup]);
              const next = { ...prev };
              if (errors[patchedGroup.id]) next[patchedGroup.id] = errors[patchedGroup.id];
              else delete next[patchedGroup.id];
              return next;
            });
          };

          return (
          <Card key={group.id} className={`mm-group-card ${gErr.max || gErr.options ? "mm-group-card--invalid" : ""}`}>
            <div className="mm-row-2">
              <Input
                id={groupNameFieldId(group.id)}
                label={t("admin.groupName", "Group name")}
                value={group.name}
                error={optionsErrorText}
                aria-invalid={optionsErrorText ? "true" : undefined}
                onChange={(e) => {
                  handleUpdateChoiceGroup(group.id, { name: e.target.value });
                  revalidateGroup({ ...group, name: e.target.value });
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

            <div className="mm-options-list">
              {group.options.map((opt) => {
                const optPriceError = !!optionPriceErrors[optionErrorKey(group.id, opt.id)];
                return (
                <div className="mm-option-row" key={opt.id}>
                  <input
                    className="input"
                    value={opt.name}
                    placeholder={t("admin.optionName", "Option name")}
                    onChange={(e) => {
                      handleUpdateOption(group.id, opt.id, { name: e.target.value });
                      /* Naming a blank option is what turns an empty group
                         valid, so this is the edit that most often clears
                         the error. */
                      revalidateGroup({
                        ...group,
                        options: group.options.map((o) =>
                          o.id === opt.id ? { ...o, name: e.target.value } : o
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
                  {/* §9 — sold out is a state, not a deletion. The option keeps
                      its name, price and id so it can come back tomorrow, and
                      the guest still sees it listed rather than wondering where
                      it went. Text carries the state, colour only reinforces
                      it (§39). */}
                  <button
                    type="button"
                    className={`mm-opt-avail ${
                      opt.isAvailable === false ? "mm-opt-avail--off" : "mm-opt-avail--on"
                    }`}
                    aria-pressed={opt.isAvailable !== false}
                    aria-label={`${opt.name || t("admin.optionName", "Option name")} — ${
                      opt.isAvailable === false
                        ? t("choice.soldOut", "Sold out")
                        : t("admin.available", "Available")
                    }`}
                    onClick={() => {
                      const next = !(opt.isAvailable !== false);
                      handleUpdateOption(group.id, opt.id, { isAvailable: next });
                      /* Marking enough options sold out can make the group's
                         minimum unreachable, which blocks Save — so re-judge
                         immediately rather than at submit. */
                      revalidateGroup({
                        ...group,
                        options: group.options.map((o) =>
                          o.id === opt.id ? { ...o, isAvailable: next } : o
                        ),
                      });
                    }}
                  >
                    {opt.isAvailable === false
                      ? t("choice.soldOut", "Sold out")
                      : t("admin.available", "Available")}
                  </button>
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
        })}
        <Button type="button" variant="outline" size="sm" icon={Plus} onClick={handleAddChoiceGroup}>
          {t("admin.addChoiceGroup", "Add choice group")}
        </Button>

        <div className="mm-divider" />

        {/* ── Paid add-ons ───────────────────────────────────────────────── */}
        <h4 className="mm-section-title">{t("admin.paidAddOns", "Paid add-ons")}</h4>
        <div className="mm-options-list">
          {paidAddOns.map((addon) => {
            const addOnPriceError = !!addOnPriceErrors[addon.id];
            return (
            <div className="mm-option-row" key={addon.id}>
              <input
                className="input"
                value={addon.name}
                placeholder={t("admin.addOnName", "Add-on name")}
                onChange={(e) => handleUpdateAddOn(addon.id, { name: e.target.value })}
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
