import { useState } from "react";
import {
  LogOut, LayoutDashboard, ClipboardList, UtensilsCrossed, Tags, QrCode, Settings, BellRing,
} from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import LanguageSwitcher from "../../components/i18n/LanguageSwitcher.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { useStaffCalls } from "../../lib/useStaffCalls.js";

const ROLE_LABEL = { admin: "Admin", cashier: "Cashier" };
/* Translation keys for the role badge, keyed by session.role. */
const ROLE_LABEL_KEY = { admin: "admin.adminRole", cashier: "admin.cashierRole" };

/* Nav items shared by every admin page. "overview" and "liveOrders" are the
   only two real destinations this phase — clicking them calls onNavigate.
   Everything else is a coming-soon placeholder that only shows a toast. */
export const ADMIN_NAV_ITEMS = [
  { key: "overview",   label: "Overview",    icon: LayoutDashboard, active: true },
  { key: "liveOrders", label: "Live Orders", icon: ClipboardList,   active: true },
  { key: "staffCalls", label: "Staff Calls", icon: BellRing,        active: true },
  { key: "menu",       label: "Menu",        icon: UtensilsCrossed, active: true },
  { key: "categories", label: "Categories",  icon: Tags,            active: true },
  { key: "tables",     label: "Tables & QR", icon: QrCode,          active: true },
  { key: "settings",   label: "Settings",    icon: Settings,        active: true },
];
/* Phase 21 architecture review — Menu & Categories management are
   Admin-only; Cashier can view/act on orders (Overview, Live Orders,
   Mark as Paid, Delivered, Cancel) but must never reach the menu editor.
   Exported so App.jsx's route guard can enforce the same rule server-side
   (well, route-side) rather than relying on this nav simply hiding the
   buttons — hiding a button is a UX nicety, not an access control. Phase 22
   added Tables & QR; Phase 23 adds Restaurant Settings to the same list.

   Phase 25 note: "staffCalls" is deliberately NOT in this list. A waiter
   bell is front-of-house work and Cashier is front-of-house staff, so both
   roles get it — unlike the menu/table/settings editors. */
export const ADMIN_ONLY_NAV_KEYS = ["menu", "categories", "tables", "settings"];
/* Translation keys for each nav item's visible label, keyed by item.key.
   "menu" reuses customer.menu since it's the identical word "Menu" already
   translated for the customer-facing back button. */
const NAV_ITEM_KEY = {
  overview: "admin.overview",
  liveOrders: "admin.liveOrders",
  staffCalls: "staff.staffCalls",
  menu: "customer.menu",
  categories: "admin.categories",
  tables: "admin.tablesAndQr",
  settings: "admin.restaurantSettings",
};

/**
 * AdminLayout — shared chrome for every admin/cashier page: topbar (logo,
 * restaurant name, signed-in user, role badge, sign out) plus the nav shell.
 *
 * `activeKey` controls which nav item is highlighted; `onNavigate(key)` is
 * called for the two real destinations ("overview" / "liveOrders") so the
 * parent (AdminRoute in App.jsx) can swap which screen renders — the URL
 * itself stays /admin/:restaurantSlug, this is in-page navigation only.
 * Coming-soon items never call onNavigate; they just show a toast.
 */
export default function AdminLayout({ restaurant, session, onSignOut, activeKey, onNavigate, children }) {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const { t } = useLanguage();
  /* Phase 25 — live count of guests currently waiting for help, shown on the
     Staff Calls nav item. Because this lives in the shared layout, an
     Admin/Cashier sitting on Overview or Live Orders still notices a new
     call without navigating anywhere or refreshing. */
  const { openCalls } = useStaffCalls(restaurant.slug);

  /* Admin-only nav items (Menu, Categories) are simply not rendered for a
     Cashier session — but this is a UX nicety, not the actual access
     control. The real guard lives in App.jsx's AdminRoute, which refuses to
     render AdminMenuItemsScreen/AdminCategoriesScreen at all for a Cashier
     session regardless of how adminPage got set. */
  const visibleNavItems = ADMIN_NAV_ITEMS.filter(
    (item) => session.role === "admin" || !ADMIN_ONLY_NAV_KEYS.includes(item.key)
  );

  function handleNavClick(item) {
    if (ADMIN_ONLY_NAV_KEYS.includes(item.key) && session.role !== "admin") return; // defense in depth
    if (item.active) {
      onNavigate(item.key);
      return;
    }
    setToastMessage(`${t(NAV_ITEM_KEY[item.key], item.label)} — ${t("common.comingSoon", "Coming soon")}`);
    setToastVisible(true);
  }

  return (
    <>
      <Topbar
        left={<Logo variant="icon" size="nav" />}
        right={
          <div className="ad-topbar-right">
            <span className="ad-topbar-rest">{restaurant.name}</span>
            <span className="ad-topbar-user">{session.name}</span>
            <Badge tone="gold">{t(ROLE_LABEL_KEY[session.role], ROLE_LABEL[session.role] || session.role)}</Badge>
            <LanguageSwitcher className="ad-topbar-lang-switcher" />
            <Button variant="outline" size="sm" icon={LogOut} onClick={onSignOut}>
              {t("common.signOut", "Sign out")}
            </Button>
          </div>
        }
      />

      <main className="container container--admin">
        <nav className="ad-nav anim-rise">
          {visibleNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`ad-nav__item ${activeKey === item.key ? "ad-nav__item--active" : ""}`}
              onClick={() => handleNavClick(item)}
            >
              <item.icon size={15} strokeWidth={2} />
              {t(NAV_ITEM_KEY[item.key], item.label)}
              {item.key === "staffCalls" && openCalls.length > 0 && (
                <span className="ad-nav__count">{openCalls.length}</span>
              )}
              {!item.active && <span className="ad-nav__soon">{t("admin.soon", "Soon")}</span>}
            </button>
          ))}
        </nav>

        {children}
      </main>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </>
  );
}
