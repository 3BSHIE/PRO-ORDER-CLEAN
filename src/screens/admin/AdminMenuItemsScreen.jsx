import { useState, useMemo, useRef } from "react";
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

/* Phase 48 — per-group field ids, same purpose as PRICE_FIELD_ID above. */
const groupNameFieldId = (groupId) => `mm-group-name-${groupId}`;
const groupMaxFieldId  = (groupId) => `mm-group-max-${groupId}`;

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

    const validOptions = (group.options || []).filter((o) => (o.name || "").trim());
    const limit = parseSelectionLimit(group.maxSelections);
    const groupError = {};

    if (validOptions.length === 0) {
      groupError.options = group.required ? "requiredNeedsOption" : "needsOption";
    }

    if (limit === null) {
      groupError.max = "invalid";
    } else if (validOptions.length > 0 && limit > validOptions.length) {
      /* Only meaningful once options exist — otherwise the empty-group error
         above is the real problem and this would just add noise. */
      groupError.max = "tooHigh";
    }

    if (Object.keys(groupError).length > 0) {
      errors[group.id] = groupError;
      if (!firstInvalidGroupId) firstInvalidGroupId = group.id;
    }
  }

  return { ok: !firstInvalidGroupId, errors, firstInvalidGroupId };
}

export function parseProductPrice(raw) {
  const text = String(raw ?? "").trim();
  /* Plain decimal only: digits, optionally one dot and more digits. Rejects
     "", "abc", "12.5o", "-5", "+5", "1e3", "Infinity", "NaN", ".5" and "5.". */
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const value = Number(text);
  /* isFinite is belt-and-braces after the regex; the > 0 test is the real
     rule, and it is what rejects "0" and "0.00". */
  if (!Number.isFinite(value) || value <= 0) return null;

  return value;
}

/* Phase 56 — per-row field ids for the customization price inputs, so a
   failed save can focus the exact one that is wrong. Composite for options
   because an option id is only unique within its group. */
const optionPriceFieldId = (groupId, optionId) => `mm-option-price-${groupId}-${optionId}`;
const addOnPriceFieldId  = (addOnId) => `mm-addon-price-${addOnId}`;
const optionErrorKey     = (groupId, optionId) => `${groupId}:${optionId}`;

/**
 * Phase 56 — strict parsing for a CHOICE OPTION's extra price.
 *
 * Zero is a real, common answer here, not a failure: 30 of the seeded
 * options are priced 0, and the customer modal renders a price badge only
 * `if (opt.price > 0)`, so a 0 option deliberately shows no surcharge at
 * all. "Rare / Medium / Well done" cost the same, and that is the point.
 * The rule is therefore >= 0, unlike the base price's > 0.
 *
 * Blank is normalised to 0 rather than rejected, because that is already
 * the user-facing meaning today: the row is created with price 0, the input
 * is type="number", and clearing it produced 0 via `parseFloat("") || 0`.
 * Phase 56 keeps that behaviour and drops the mechanism — an explicit
 * "empty means no extra charge" instead of an accident of `|| 0` that
 * happened to turn "abc" and "12.5o" into prices as well.
 *
 * @param {unknown} raw
 * @returns {number|null} a finite Number >= 0, or null if invalid
 */
export function parseChoiceOptionPrice(raw) {
  const text = String(raw ?? "").trim();
  /* The one deliberate difference from the add-on rule below. */
  if (text === "") return 0;

  /* Plain decimal only — same shape as Phase 47, so "-1", "1e3", "Infinity",
     "NaN", "1,5", "2.5x", ".5" and "5." are all rejected outright rather
     than partially salvaged. */
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;

  return value;
}

/**
 * Phase 56 — strict parsing for a PAID ADD-ON's price.
 *
 * Audited against the actual model before choosing the rule: all 19 seeded
 * add-ons are priced above 0, the section is labelled "Paid add-ons" for the
 * manager and "Add extras" for the guest, and the customer modal prints
 * `+{price}` unconditionally — with no `> 0` guard of the kind the options
 * have. A free add-on would therefore render "+ JOD 0.000", which is not a
 * thing the UI was built to say. Free extras belong in a choice group, which
 * already supports them properly.
 *
 * So > 0 is required, and blank is invalid rather than 0: a named add-on
 * with no price is exactly the silent free-item bug this phase exists to
 * stop. No existing data is broken by this, because none of it is free.
 *
 * @param {unknown} raw
 * @returns {number|null} a finite Number > 0, or null if invalid
 */
export function parseAddOnPrice(raw) {
  const text = String(raw ?? "").trim();
  /* No blank exemption here — "" falls through the regex and is rejected. */
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const value = Number(text);
  /* The > 0 test is what rejects "0" and "0.00". */
  if (!Number.isFinite(value) || value <= 0) return null;

  return value;
}

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

  function handleSave(data) {
    if (editingItem?.id) {
      updateMenuItem(restaurant.slug, editingItem.id, data);
    } else {
      createMenuItem(restaurant.slug, data);
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
                <p className="mm-item-row__meta">{categoryName(item.categoryId)} &middot; {fmtPrice(item.price)}</p>
                <div className="mm-item-row__badges">
                  {!item.isAvailable && <Badge tone="canceled">{t("common.outOfStock", "Out of Stock")}</Badge>}
                  {item.isFeatured && <Badge tone="received">{t("common.featured", "Featured")}</Badge>}
                  {item.isPopular && <Badge tone="gold">{t("common.popular", "Popular")}</Badge>}
                </div>
              </div>

              <div className="mm-item-row__actions">
                <button
                  type="button"
                  className="mm-icon-btn"
                  onClick={() => setEditingItem(item)}
                  aria-label={t("admin.editProduct", "Edit Item")}
                >
                  <Pencil size={15} strokeWidth={2.2} />
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
      { id: genChoiceGroupId(), name: "", required: false, maxSelections: 1, options: [] },
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
          ? { ...g, options: [...g.options, { id: genChoiceOptionId(), name: "", price: 0 }] }
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
      const targetId = bad.max
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

    onSave({
      name: name.trim(),
      description: description.trim(),
      /* Already a validated finite Number > 0 — storage shape is unchanged. */
      price: parsedPrice,
      categoryId,
      imageUrl: imageUrl.trim(),
      sortOrder: sortOrder !== "" ? parseInt(sortOrder, 10) : undefined,
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
          maxSelections: parseSelectionLimit(g.maxSelections),
          /* Phase 56: prices become Numbers here for the same reason
             maxSelections does — the row holds the raw string while editing
             so invalid input can be judged, and storage keeps the numeric
             shape the customer modal and Phase 37 expect. Spreading the
             existing option object preserves its id. */
          options: g.options
            .filter((o) => o.name.trim())
            .map((o) => ({ ...o, price: parseChoiceOptionPrice(o.price) })),
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
            label={t("admin.productSortOrder", "Sort order")}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
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
              : null;
          const optionsErrorText =
            gErr.options === "requiredNeedsOption"
              ? t("admin.requiredGroupNeedsOption", "Required groups must have at least one option.")
              : gErr.options === "needsOption"
              ? t("admin.groupNeedsOption", "Add at least one option, or remove this group.")
              : null;

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
            <label className="mm-toggle-row">
              <input
                type="checkbox"
                checked={!!group.required}
                onChange={(e) => {
                  handleUpdateChoiceGroup(group.id, { required: e.target.checked });
                  /* Toggling Required changes which message applies to an
                     empty group, so re-judge it immediately. */
                  revalidateGroup({ ...group, required: e.target.checked });
                }}
              />
              <span>{t("common.required", "Required")}</span>
            </label>

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
        onClose={() => setShowDiscard(false)}
        title={t("admin.discardChangesTitle", "Discard changes?")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowDiscard(false)}>
              {t("admin.keepEditing", "Keep Editing")}
            </Button>
            <Button
              variant="danger"
              onClick={() => { setShowDiscard(false); onClose(); }}
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
