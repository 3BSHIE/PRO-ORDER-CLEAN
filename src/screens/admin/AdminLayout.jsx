import { useState, useEffect, useRef } from "react";
import {
  LogOut, LayoutDashboard, ClipboardList, UtensilsCrossed, Tags, QrCode, Settings, BellRing,
  MessageSquareHeart,
} from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
/* Phase 91.1 §10 — the theme-aware static mark, NOT Logo.
   Logo renders an <img> of pro-order-icon.png, whose gold is baked into the
   pixels, so a restaurant on green had a gold PRO·ORDER glyph sitting in its
   Admin header. BrandMarkStatic is the approved static component: the same
   authoritative artwork, used as a CSS mask and filled with --brand-mark,
   which buildRestaurantThemeVars already derives from the restaurant's
   Primary and which RestaurantTheme already puts in scope for Admin. */
import BrandMarkStatic from "../../components/brand/BrandMarkStatic.jsx";
import RestaurantIdentity from "../customer/components/RestaurantIdentity.jsx";
import Button  from "../../components/ui/Button.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import LanguageSwitcher from "../../components/i18n/LanguageSwitcher.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { canViewPage } from "../../lib/permissions.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { useStaffCalls } from "../../lib/useStaffCalls.js";
import { useStaffCallAlertSettings } from "../../lib/useStaffCallAlertSettings.js";
import { playAlertSound } from "../../lib/alertSound.js";
import StaffCallAlert from "./StaffCallAlert.jsx";
import ErrorBoundary from "../../components/system/ErrorBoundary.jsx";

/* Phase 91.2 §7 — ROLE_LABEL / ROLE_LABEL_KEY are gone along with the badge
   they fed.

   VERIFIED BEFORE DELETING, because §7 warns specifically against removing
   the signed-in user's identity by mistake. The header rendered TWO role-ish
   strings: session.name, and a badge derived from session.role. In
   mockStaff.js those resolve to "Restaurant Admin" + "Admin" for the admin
   and "Cashier Staff" + "Cashier" for the cashier — so in BOTH roles the
   badge is the derived duplicate and session.name is the real identity
   field. The badge is what goes; the name stays. */

/* Phase 100.0 §10 — the header names the ROLE where it used to name the
   restaurant, because the restaurant now lives at the top of the sidebar and
   saying it twice was the redundancy the brief calls out.

   This reads session.role purely to LABEL it. It is not an access decision,
   so it is not a hardcoded role check of the kind §25 forbids — there is no
   permission helper for "what is my own role called", and every real
   authorization on this screen still goes through canViewPage. An unknown
   role falls back to the Admin wording rather than rendering an empty slot. */
const ROLE_LABEL = {
  admin:   ["admin.adminRole", "Admin"],
  cashier: ["admin.cashierRole", "Cashier"],
};

/* Phase 100.0 §12 — a small contextual icon per nav destination already
   exists on each item below; these are the KPI icons and live on the
   dashboard, not here. */

/* Nav items shared by every admin page. "overview" and "liveOrders" are the
   only two real destinations this phase — clicking them calls onNavigate.
   Everything else is a coming-soon placeholder that only shows a toast. */
export const ADMIN_NAV_ITEMS = [
  { key: "overview",   label: "Overview",    icon: LayoutDashboard, active: true },
  { key: "liveOrders", label: "Live Orders", icon: ClipboardList,   active: true },
  { key: "staffCalls", label: "Staff Calls", icon: BellRing,        active: true },
  { key: "menu",       label: "Menu",        icon: UtensilsCrossed, active: true },
  { key: "categories", label: "Categories",  icon: Tags,            active: true },
  /* Phase 91 §22 — Feedback and Tables & QR were the other way round. The
     approved order puts Tables & QR immediately before Settings: both are
     setup surfaces a manager visits rarely and together, while Feedback is
     something they read alongside the operational pages above it. */
  { key: "feedback",   label: "Feedback",    icon: MessageSquareHeart, active: true },
  { key: "tables",     label: "Tables & Access", icon: QrCode,      active: true },
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
/* Phase 95.1 — this list is gone. Authorization moved to src/lib/permissions.js,
   where each page names the CAPABILITY it needs (PAGE_PERMISSION) instead of
   naming the roles it excludes. The nav filter below, App.jsx's route guard
   and adminPageState's restore check all read that one map, so they still
   cannot disagree — which was the whole point of the old constant.

   The behavioural change this phase makes: Menu and Categories are no longer
   Admin-only. Cashier reaches both with availability-only permissions, which
   a deny-list of page keys could not express. */
/* Translation keys for each nav item's visible label, keyed by item.key.
   "menu" reuses customer.menu since it's the identical word "Menu" already
   translated for the customer-facing back button. */
const NAV_ITEM_KEY = {
  overview: "admin.overview",
  liveOrders: "admin.liveOrders",
  staffCalls: "staff.staffCalls",
  menu: "customer.menu",
  categories: "admin.categories",
  tables: "admin.tablesAndAccess",
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
  /* §12 — the restaurant's live logo and name, from the same source every
     other surface reads, so an Admin always knows which venue they are
     managing and a renamed restaurant updates here too. */
  const { settings } = useSettingsData(restaurant.slug);
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


  /* Layer 1 of three (see permissions.js). A page the session cannot open is
     not rendered at all — never as a disabled item, which would advertise a
     door that does not open. This is a UX nicety, not the actual access
     control: the real guard lives in App.jsx's AdminRoute, which refuses to
     render the screen regardless of how adminPage got set. */
  const visibleNavItems = ADMIN_NAV_ITEMS.filter((item) => canViewPage(session, item.key));

  const [roleKey, roleFallback] = ROLE_LABEL[session.role] || ROLE_LABEL.admin;
  const roleLabel = t(roleKey, roleFallback);

  function handleNavClick(item) {
    if (!canViewPage(session, item.key)) return; // defense in depth
    if (item.active) {
      onNavigate(item.key);
      return;
    }
    setToastMessage(`${t(NAV_ITEM_KEY[item.key], item.label)} — ${t("common.comingSoon", "Coming soon")}`);
    setToastVisible(true);
  }

  return (
    <>
      {/* Phase 91.1 §9 — three zones instead of "a logo, then everything
          crammed on the right":

            identity   PRO·ORDER mark + the restaurant being managed
            context    which page you are on (§13) — previously the header
                       said nothing about this and the sidebar's active pill
                       was the only clue
            utilities  who you are signed in as, language, sign out

          The header is NOT a second navigation bar (§17): no links, no page
          switching, nothing that duplicates the sidebar. */}
      <Topbar
        /* §2 — opts this ONE header out of the shared 1000px .container cap.
           The bar spans the window now, so its three zones sit ~20px from the
           window edges instead of 160px in from them. */
        className="topbar--admin"
        left={
          <div className="ad-topbar-identity">
            {/* §11 — the system's anchor, deliberately small. PRO·ORDER is the
                thing doing the managing; the venue being managed is now named
                at the top of the sidebar instead of here (§10). */}
            <BrandMarkStatic size={20} className="ad-topbar-mark" />
            <span className="ad-topbar-divider" aria-hidden="true" />
            {/* §10 — the role, in the slot the restaurant name used to hold.
                Slightly more present than the old derived badge but still a
                label on the chrome, not a headline: no pill, no fill, no
                border. */}
            <span className="ad-topbar-role">{roleLabel}</span>
          </div>
        }
        /* §10 — the centre zone is gone. It named the current page, which the
           sidebar's active item now states far more clearly and in a place the
           eye is already going. Leaving both meant the chrome said the page
           name twice. Topbar renders nothing for an omitted `center`, so the
           bar keeps its height and its other thirteen consumers are untouched. */
        right={
          <div className="ad-topbar-right">
            <span className="ad-topbar-user">{session.name}</span>
            {/* §5 — the SAME compact control the Customer header uses, not a
                third style invented for Admin: the component and its styles
                already exist, so this is a variant switch and nothing more.
                The filled gold pill it replaces was the loudest thing in the
                bar, which is backwards for a control nobody touches twice a
                shift. Switching logic, persistence and RTL are the component's
                own and are untouched (§6). */}
            <LanguageSwitcher variant="compact" className="ad-topbar-lang-switcher" />
            <Button variant="outline" size="sm" icon={LogOut} onClick={onSignOut}>
              {t("common.signOut", "Sign out")}
            </Button>
          </div>
        }
      />

      {/* ── Phase 100.0 §3 — the desktop shell ────────────────────────────
          ONE shell for Admin and Cashier (§25). There is no second sidebar
          component and no role branch anywhere in it: the item list is the
          same canViewPage filter it has always been, so Cashier gets the same
          furniture with fewer doors in it.

          The <main> keeps BOTH `container` and `container--admin`, unchanged,
          because the print isolation and the Admin modal rules key off
          `.container--admin > *` and moving the class would silently break QR
          printing. The sidebar is its SIBLING, so nothing about what counts as
          a direct child of the content container changes. */}
      <div className="ad-shell">
        <aside className="ad-sidebar">
          {/* §5 — the venue being managed, from the same live settings source
              the header used to read, so a rename still lands here with no
              extra plumbing. Nothing is invented: RestaurantIdentity renders
              the logo only when one exists and is a safe URL, and falls back
              to a name-only treatment otherwise. No avatar, no subtitle, no
              version string. */}
          <div className="ad-sidebar__identity">
            <RestaurantIdentity
              name={settings.name?.trim() || restaurant.name}
              logoUrl={settings.logoUrl}
              variant="compact"
            />
          </div>

          <nav className="ad-sidebar__nav" aria-label={t("admin.overview", "Overview")}>
            {visibleNavItems.map((item) => {
              const isActive = activeKey === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`ad-sidebar__item ${isActive ? "ad-sidebar__item--active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => handleNavClick(item)}
                >
                  {/* §3 — the active indicator. A rail on the INLINE-START
                      edge, so RTL mirrors it with no second rule. It scales
                      rather than appearing, which is what makes the change
                      read as movement without moving the row itself. */}
                  <span className="ad-sidebar__rail" aria-hidden="true" />
                  <item.icon className="ad-sidebar__icon" size={16} strokeWidth={1.9} />
                  <span className="ad-sidebar__label">
                    {t(NAV_ITEM_KEY[item.key], item.label)}
                  </span>
                  {item.key === "staffCalls" && openCalls.length > 0 && (
                    <span className="ad-nav__count">{openCalls.length}</span>
                  )}
                  {!item.active && <span className="ad-nav__soon">{t("admin.soon", "Soon")}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

      <main className="container container--admin ad-shell__main">

        {/* Phase 65 — the boundary sits HERE, not around the screen, because
            every Admin screen renders its own AdminLayout: the chrome is a
            child of the screen, not its parent. Wrapping only the content
            area means a failed Live Orders still leaves the topbar, the nav,
            the staff-call badge and Sign out usable, so the operator can
            navigate out instead of reloading.

            resetKey is the active page: moving to another Admin page clears
            a previous failure automatically (§13), so one broken screen can
            never trap someone. */}
        <ErrorBoundary label={`admin:${activeKey}`} resetKey={activeKey}>
          {children}
        </ErrorBoundary>
      </main>
      </div>

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
