import { useState, useEffect, useRef } from "react";
import {
  LogOut, LayoutDashboard, ClipboardList, UtensilsCrossed, Tags, QrCode, Settings, BellRing,
  MessageSquareHeart,
} from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Badge   from "../../components/ui/Badge.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import LanguageSwitcher from "../../components/i18n/LanguageSwitcher.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { useStaffCalls } from "../../lib/useStaffCalls.js";
import { useStaffCallAlertSettings } from "../../lib/useStaffCallAlertSettings.js";
import { playAlertSound } from "../../lib/alertSound.js";
import StaffCallAlert from "./StaffCallAlert.jsx";

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
  { key: "feedback",   label: "Feedback",    icon: MessageSquareHeart, active: true },
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
export const ADMIN_ONLY_NAV_KEYS = ["menu", "categories", "tables", "settings", "feedback"];
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
  feedback: "feedback.feedback",
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
  const { settings: staffAlertSettings } = useStaffCallAlertSettings(restaurant.slug);
  /* Which arrival the banner is currently naming; null = no banner. */
  const [alertCallId, setAlertCallId] = useState(null);

  /* ── Phase 59 — new staff-call detection ───────────────────────────────
     Same three-part rule Phase 27 proved on the kitchen board, because the
     failure it prevents is identical: a backlog must never announce itself
     as news.

       seenCallIdsRef — every open-call id this layout has ever observed. An
                        id in here can never alert again, so the 4s poll, a
                        tab refocus and any re-render all replay nothing.
       hasSeededRef   — the FIRST pass after mount only records what is
                        already waiting and returns silently. This is what
                        makes a reload with four calls open produce a badge
                        of 4 and zero sounds (§22).
       open-only      — resolved calls are not in this list, so resolving
                        something can never make a noise (§13), and history
                        is structurally incapable of alerting.

     Settings are read through a ref so that changing the volume does not
     re-run detection and re-evaluate arrivals. */
  const seenCallIdsRef = useRef(new Set());
  const hasSeededRef = useRef(false);
  const alertSettingsRef = useRef(staffAlertSettings);

  useEffect(() => {
    alertSettingsRef.current = staffAlertSettings;
  }, [staffAlertSettings]);

  /* openCalls is rebuilt on every render by useStaffCalls, so depending on
     the array itself would re-run this effect constantly. The id list is the
     only thing detection actually cares about, and it only changes when a
     call is genuinely added or removed. */
  const openCallIdsKey = openCalls.map((c) => c.id).join(",");

  useEffect(() => {
    const openIds = openCallIdsKey ? openCallIdsKey.split(",") : [];

    if (!hasSeededRef.current) {
      openIds.forEach((id) => seenCallIdsRef.current.add(id));
      hasSeededRef.current = true;
      return;
    }

    const arrivedIds = openIds.filter((id) => !seenCallIdsRef.current.has(id));
    if (arrivedIds.length === 0) return;

    // Mark as seen BEFORE anything else, so a throw could never cause a replay.
    arrivedIds.forEach((id) => seenCallIdsRef.current.add(id));

    /* Newest first out of useStaffCalls, so the head of the list is the call
       worth naming. Storing the id (not the object) keeps the banner honest:
       it is re-resolved from live data on every render, so a resolve
       elsewhere updates it rather than leaving a stale table on screen. */
    setAlertCallId(arrivedIds[arrivedIds.length - 1]);

    const { soundEnabled, soundType, volume } = alertSettingsRef.current;
    if (!soundEnabled) return;

    /* One sound per detection cycle rather than one per call. Two guests
       ringing inside the same 4s poll window would otherwise produce
       overlapping tones that just smear into noise; the banner still counts
       both, and separate arrivals in separate cycles each get their own
       short sound. Never loops, never repeats while a call stays open. */
    playAlertSound(soundType, volume);
  }, [openCallIdsKey]);

  /* Re-resolved from live data every render, which is what synchronises the
     banner with a resolve (§13): the moment the call leaves openCalls this
     becomes undefined and the banner unmounts. No resolve sound, because
     detection above only ever looks at arrivals. */
  const alertCall = alertCallId ? openCalls.find((c) => c.id === alertCallId) : null;

  /* Phase 60 — this used to call requestNavigation itself. Now that
     navigateAdmin guards every page change centrally, wrapping here as well
     would ask twice: the outer ask would park a proceed that, when run,
     called onNavigate and asked AGAIN — reopening the dialog the Admin had
     just answered. So this simply navigates, and the one guard in App.jsx
     decides. Behaviour for a dirty draft is unchanged.

     The banner is cleared by the effect below rather than here, so choosing
     "Keep Editing" no longer silently dismisses the alert it came from. */
  function handleViewCalls() {
    onNavigate("staffCalls");
  }

  /* Reaching the Staff Calls page supersedes the banner — the authoritative
     list is now on screen. Covers arriving by any route, including the
     sidebar, so a stale banner can never sit on top of the list it
     duplicates. */
  useEffect(() => {
    if (activeKey === "staffCalls") setAlertCallId(null);
  }, [activeKey]);


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

      {/* Phase 59 — rendered here in the shared chrome, not inside a screen,
          so a call reaches Admin/Cashier wherever they happen to be. Kitchen
          has its own layout and never mounts this. */}
      <StaffCallAlert
        key={alertCall?.id}
        call={alertCall}
        openCount={openCalls.length}
        onView={handleViewCalls}
        onDismiss={() => setAlertCallId(null)}
      />

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </>
  );
}
