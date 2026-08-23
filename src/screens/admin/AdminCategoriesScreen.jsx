import { useState } from "react";
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus, Tags } from "lucide-react";
import Card    from "../../components/ui/Card.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Input   from "../../components/ui/Input.jsx";
import Modal   from "../../components/ui/Modal.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { useMenuData } from "../../lib/useMenuData.js";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  moveCategory,
} from "../../lib/menuData.js";
import { useLanguage } from "../../i18n/useLanguage.js";

/* ═══════════════════════════════════════════════════════════════════════════
   AdminCategoriesScreen — Phase 21

   Full category CRUD for Admin/Cashier: view, add, edit, delete, reorder
   (up/down, not drag-and-drop — simpler and more robust here), toggle
   active/inactive, and edit the emoji/image URL used as the customer menu's
   category header and card-placeholder fallback.

   Deleting a category is blocked while it still has menu items — the admin
   is asked to move or delete those items first, so the customer-facing
   menu never silently drops products with no visible explanation.

   All writes go through src/lib/menuData.js, which persists to localStorage
   and dispatches "pro-order-menu-change" — any customer screen currently
   open (Menu, Item Details Modal, Cart, Tracking) picks up the edit
   immediately via useMenuData(), no reload needed.
   ═══════════════════════════════════════════════════════════════════════ */

export default function AdminCategoriesScreen({ restaurant, session, onSignOut, onNavigate }) {
  const { categories, items } = useMenuData(restaurant.slug);
  const { t } = useLanguage();

  const [editingCategory, setEditingCategory] = useState(null); // category object, or {} for "new"
  const [pendingDelete, setPendingDelete] = useState(null); // category awaiting delete confirmation
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  /* Phase 21 architecture review — redundant, defense-in-depth guard.
     App.jsx's AdminRoute already refuses to render this component at all
     for a Cashier session; this second check protects against any future
     code path that might reach it another way. All hooks above still run
     unconditionally (React's rules of hooks), only the returned UI differs. */
  if (session.role !== "admin") {
    return (
      <AdminLayout restaurant={restaurant} session={session} onSignOut={onSignOut} activeKey="categories" onNavigate={onNavigate}>
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <Tags size={28} strokeWidth={1.7} />
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

  function itemCountFor(categoryId) {
    return items.filter((i) => i.categoryId === categoryId).length;
  }

  function handleSave(data) {
    if (editingCategory?.id) {
      updateCategory(restaurant.slug, editingCategory.id, data);
      setToastMessage(t("admin.categorySaved", "Category saved"));
    } else {
      createCategory(restaurant.slug, data);
      setToastMessage(t("admin.categorySaved", "Category saved"));
    }
    setToastVisible(true);
    setEditingCategory(null);
  }

  function handleConfirmDelete() {
    const category = pendingDelete;
    setPendingDelete(null);
    if (!category) return;
    const result = deleteCategory(restaurant.slug, category.id);
    if (result.ok) {
      setToastMessage(t("admin.categoryDeleted", "Category deleted"));
    } else {
      setToastMessage(
        t("admin.deleteCategoryHasItemsMsg", "This category still has items. Move or delete them first.")
      );
    }
    setToastVisible(true);
  }

  return (
    <AdminLayout
      restaurant={restaurant}
      session={session}
      onSignOut={onSignOut}
      activeKey="categories"
      onNavigate={onNavigate}
    >
      <header className="ad-header anim-rise">
        <h1 className="ad-header__title">{t("admin.categories", "Categories")}</h1>
        <p className="ad-header__subtitle">
          {t("admin.manageCategoriesSubtitle", "Add, edit, reorder, and manage your menu categories.")}
        </p>
      </header>

      <div className="mm-toolbar anim-rise">
        <Button icon={Plus} onClick={() => setEditingCategory({})}>
          {t("admin.addCategory", "Add Category")}
        </Button>
      </div>

      {categories.length === 0 ? (
        <div className="ad-empty anim-rise">
          <span className="ad-empty__icon">
            <Tags size={28} strokeWidth={1.7} />
          </span>
          <h3 className="ad-empty__title">{t("admin.noCategoriesYet", "No categories yet.")}</h3>
        </div>
      ) : (
        <div className="mm-cat-list anim-rise">
          {categories.map((cat, idx) => (
            <Card key={cat.id} className="mm-cat-row">
              <div className="mm-cat-row__reorder">
                <button
                  type="button"
                  className="mm-reorder-btn"
                  disabled={idx === 0}
                  onClick={() => moveCategory(restaurant.slug, cat.id, -1)}
                  aria-label={t("admin.moveUp", "Move up")}
                >
                  <ChevronUp size={15} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  className="mm-reorder-btn"
                  disabled={idx === categories.length - 1}
                  onClick={() => moveCategory(restaurant.slug, cat.id, 1)}
                  aria-label={t("admin.moveDown", "Move down")}
                >
                  <ChevronDown size={15} strokeWidth={2.4} />
                </button>
              </div>

              <span className="mm-cat-row__emoji">{cat.emoji}</span>

              <div className="mm-cat-row__info">
                <p className="mm-cat-row__name">{cat.name}</p>
                <p className="mm-cat-row__meta">
                  {itemCountFor(cat.id)} {t("orders.items", "Items")}
                </p>
              </div>

              <Badge tone={cat.isActive ? "gold" : "neutral"}>
                {cat.isActive ? t("admin.active", "Active") : t("admin.inactive", "Inactive")}
              </Badge>

              <div className="mm-cat-row__actions">
                <button
                  type="button"
                  className="mm-icon-btn"
                  onClick={() => setEditingCategory(cat)}
                  aria-label={t("admin.editCategory", "Edit Category")}
                >
                  <Pencil size={15} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className="mm-icon-btn mm-icon-btn--danger"
                  onClick={() => setPendingDelete(cat)}
                  aria-label={t("admin.deleteCategory", "Delete Category")}
                >
                  <Trash2 size={15} strokeWidth={2.2} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editingCategory && (
        <CategoryEditorModal
          category={editingCategory}
          onSave={handleSave}
          onClose={() => setEditingCategory(null)}
        />
      )}

      {pendingDelete && (
        <Modal
          open
          onClose={() => setPendingDelete(null)}
          title={t("admin.deleteCategory", "Delete Category")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete}>
                {t("admin.deleteCategory", "Delete Category")}
              </Button>
            </>
          }
        >
          <p className="ad-cancel-modal__msg">
            {itemCountFor(pendingDelete.id) > 0
              ? t(
                  "admin.deleteCategoryHasItemsMsg",
                  "This category still has items. Move or delete them first."
                )
              : t("admin.deleteCategoryConfirmMsg", "This category will be permanently removed.")}
          </p>
        </Modal>
      )}

      <Toast visible={toastVisible} message={toastMessage} onDone={() => setToastVisible(false)} />
    </AdminLayout>
  );
}

/* ── Add/Edit category form modal ────────────────────────────────────────── */
function CategoryEditorModal({ category, onSave, onClose }) {
  const { t } = useLanguage();
  const isNew = !category.id;
  const [name, setName] = useState(category.name || "");
  const [emoji, setEmoji] = useState(category.emoji || "");
  const [imageUrl, setImageUrl] = useState(category.imageUrl || "");
  const [isActive, setIsActive] = useState(category.isActive !== false);
  const [error, setError] = useState(null);

  function handleSubmit() {
    if (!name.trim()) {
      setError(t("admin.categoryNameRequired", "Please enter a category name."));
      return;
    }
    onSave({ name: name.trim(), emoji: emoji.trim(), imageUrl: imageUrl.trim(), isActive });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? t("admin.addCategory", "Add Category") : t("admin.editCategory", "Edit Category")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSubmit}>{t("common.save", "Save")}</Button>
        </>
      }
    >
      <Input
        label={t("admin.categoryName", "Category name")}
        value={name}
        error={error}
        onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
        style={{ marginBottom: 14 }}
        autoFocus
      />
      <Input
        label={t("admin.categoryEmoji", "Emoji")}
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        placeholder="🍽️"
        style={{ marginBottom: 14, maxWidth: 120 }}
      />
      <Input
        label={t("admin.categoryImageUrl", "Image URL")}
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder="https://…"
        style={{ marginBottom: 14 }}
      />
      <label className="mm-toggle-row">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span>{t("admin.active", "Active")}</span>
      </label>
    </Modal>
  );
}
