import { useState, useMemo } from "react";
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

  function handleSubmit() {
    if (!name.trim()) { setError(t("admin.productNameRequired", "Please enter an item name.")); return; }
    if (!categoryId) { setError(t("admin.productCategoryRequired", "Please choose a category.")); return; }

    onSave({
      name: name.trim(),
      description: description.trim(),
      price: parseFloat(price) || 0,
      categoryId,
      imageUrl: imageUrl.trim(),
      sortOrder: sortOrder !== "" ? parseInt(sortOrder, 10) : undefined,
      isAvailable,
      isFeatured,
      isPopular,
      removableIngredients,
      // Drop any choice group left with an empty name, or an option left with
      // an empty name — a half-filled row shouldn't silently save as blank.
      choices: choices
        .filter((g) => g.name.trim())
        .map((g) => ({ ...g, options: g.options.filter((o) => o.name.trim()) })),
      paidAddOns: paidAddOns.filter((a) => a.name.trim()),
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t("admin.addProduct", "Add Item") : t("admin.editProduct", "Edit Item")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
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
            label={t("admin.productPrice", "Price")}
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
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
        {choices.map((group) => (
          <Card key={group.id} className="mm-group-card">
            <div className="mm-row-2">
              <Input
                label={t("admin.groupName", "Group name")}
                value={group.name}
                onChange={(e) => handleUpdateChoiceGroup(group.id, { name: e.target.value })}
              />
              <Input
                label={t("admin.maxSelections", "Max selections")}
                type="number"
                min="1"
                value={group.maxSelections}
                onChange={(e) => handleUpdateChoiceGroup(group.id, { maxSelections: parseInt(e.target.value, 10) || 1 })}
              />
            </div>
            <label className="mm-toggle-row">
              <input
                type="checkbox"
                checked={!!group.required}
                onChange={(e) => handleUpdateChoiceGroup(group.id, { required: e.target.checked })}
              />
              <span>{t("common.required", "Required")}</span>
            </label>

            <div className="mm-options-list">
              {group.options.map((opt) => (
                <div className="mm-option-row" key={opt.id}>
                  <input
                    className="input"
                    value={opt.name}
                    placeholder={t("admin.optionName", "Option name")}
                    onChange={(e) => handleUpdateOption(group.id, opt.id, { name: e.target.value })}
                  />
                  <input
                    className="input mm-option-row__price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={opt.price}
                    onChange={(e) => handleUpdateOption(group.id, opt.id, { price: parseFloat(e.target.value) || 0 })}
                  />
                  <button
                    type="button"
                    className="mm-icon-btn mm-icon-btn--danger"
                    onClick={() => handleRemoveOption(group.id, opt.id)}
                    aria-label={t("common.remove", "Remove")}
                  >
                    <X size={14} strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mm-group-card__actions">
              <Button type="button" variant="outline" size="sm" onClick={() => handleAddOption(group.id)}>
                {t("admin.addOption", "Add option")}
              </Button>
              <Button type="button" variant="danger" size="sm" onClick={() => handleRemoveChoiceGroup(group.id)}>
                {t("admin.removeGroup", "Remove group")}
              </Button>
            </div>
          </Card>
        ))}
        <Button type="button" variant="outline" size="sm" icon={Plus} onClick={handleAddChoiceGroup}>
          {t("admin.addChoiceGroup", "Add choice group")}
        </Button>

        <div className="mm-divider" />

        {/* ── Paid add-ons ───────────────────────────────────────────────── */}
        <h4 className="mm-section-title">{t("admin.paidAddOns", "Paid add-ons")}</h4>
        <div className="mm-options-list">
          {paidAddOns.map((addon) => (
            <div className="mm-option-row" key={addon.id}>
              <input
                className="input"
                value={addon.name}
                placeholder={t("admin.addOnName", "Add-on name")}
                onChange={(e) => handleUpdateAddOn(addon.id, { name: e.target.value })}
              />
              <input
                className="input mm-option-row__price"
                type="number"
                step="0.01"
                min="0"
                value={addon.price}
                onChange={(e) => handleUpdateAddOn(addon.id, { price: parseFloat(e.target.value) || 0 })}
              />
              <button
                type="button"
                className="mm-icon-btn mm-icon-btn--danger"
                onClick={() => handleRemoveAddOn(addon.id)}
                aria-label={t("common.remove", "Remove")}
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" icon={Plus} onClick={handleAddAddOn}>
          {t("admin.addAddOn", "Add add-on")}
        </Button>
      </div>
    </Modal>
  );
}
