import { useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation } from "react-router-dom";
import "./theme/global.css";
import EntryScreen                       from "./screens/EntryScreen.jsx";
import DevHubScreen                      from "./screens/dev/DevHubScreen.jsx";
import CustomerAccessScreen              from "./screens/customer/CustomerAccessScreen.jsx";
import CustomerMenuScreen                from "./screens/customer/CustomerMenuScreen.jsx";
import CustomerCartScreen                from "./screens/customer/CustomerCartScreen.jsx";
import CustomerOrderConfirmationScreen   from "./screens/customer/CustomerOrderConfirmationScreen.jsx";
import CustomerOrderTrackingScreen       from "./screens/customer/CustomerOrderTrackingScreen.jsx";
import CustomerOrdersScreen              from "./screens/customer/CustomerOrdersScreen.jsx";
import KitchenLoginScreen, { KitchenInvalidRestaurantView } from "./screens/kitchen/KitchenLoginScreen.jsx";
import KitchenBoardScreen                from "./screens/kitchen/KitchenBoardScreen.jsx";
import AdminLoginScreen, { AdminInvalidRestaurantView } from "./screens/admin/AdminLoginScreen.jsx";
import AdminDashboardScreen               from "./screens/admin/AdminDashboardScreen.jsx";
import AdminLiveOrdersScreen              from "./screens/admin/AdminLiveOrdersScreen.jsx";
import AdminStaffCallsScreen              from "./screens/admin/AdminStaffCallsScreen.jsx";
import AdminCategoriesScreen              from "./screens/admin/AdminCategoriesScreen.jsx";
import AdminMenuItemsScreen               from "./screens/admin/AdminMenuItemsScreen.jsx";
import AdminTablesScreen                  from "./screens/admin/AdminTablesScreen.jsx";
import AdminRevenueReportScreen from "./screens/admin/AdminRevenueReportScreen.jsx";
import StaffOrderingScreen                from "./screens/admin/StaffOrderingScreen.jsx";
import AdminSettingsScreen                from "./screens/admin/AdminSettingsScreen.jsx";
import AdminFeedbackScreen                from "./screens/admin/AdminFeedbackScreen.jsx";
import { canViewPage }                    from "./lib/permissions.js";
import { readAdminPage, writeAdminPage, clearAdminPage } from "./lib/adminPageState.js";
import { requestNavigation } from "./lib/navigationGuard.js";
import { getAdminSession, clearAdminSession } from "./lib/adminSession.js";
import { findRestaurantBySlug }          from "./data/mockRestaurant.js";
import { getKitchenSession, clearKitchenSession } from "./lib/kitchenSession.js";
import ErrorBoundary                     from "./components/system/ErrorBoundary.jsx";
import CustomerTheme                     from "./components/theme/CustomerTheme.jsx";
import RestaurantTheme                   from "./components/theme/RestaurantTheme.jsx";

/* Phase 31 — every customer route is wrapped in <CustomerTheme>, and no
   Admin or Kitchen route is. That placement is the access control for the
   restaurant theme: operational screens cannot inherit a restaurant's colours
   or fonts because they are never inside the scope element. */
function CustomerAccessRoute() {
  const { restaurantSlug, qrToken } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerTheme restaurantSlug={restaurantSlug}>
      <CustomerAccessScreen
        restaurantSlug={restaurantSlug}
        qrToken={qrToken}
        onEnterMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
      />
    </CustomerTheme>
  );
}

function CustomerMenuRoute() {
  const { restaurantSlug, qrToken } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerTheme restaurantSlug={restaurantSlug}>
      <CustomerMenuScreen
        restaurantSlug={restaurantSlug}
        qrToken={qrToken}
        onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
        onViewCart={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/cart`)}
        onViewOrders={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/orders`)}
      />
    </CustomerTheme>
  );
}

function CustomerCartRoute() {
  const { restaurantSlug, qrToken } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerTheme restaurantSlug={restaurantSlug}>
      <CustomerCartScreen
        restaurantSlug={restaurantSlug}
        qrToken={qrToken}
        onBackToMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
        onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
        onOrderCreated={(orderId) =>
          navigate(`/r/${restaurantSlug}/table/${qrToken}/orders/${orderId}/confirmation`)
        }
      />
    </CustomerTheme>
  );
}

function CustomerOrdersRoute() {
  const { restaurantSlug, qrToken } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerTheme restaurantSlug={restaurantSlug}>
      <CustomerOrdersScreen
        restaurantSlug={restaurantSlug}
        qrToken={qrToken}
        onBackToMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
        onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
        onTrackOrder={(orderId) =>
          navigate(`/r/${restaurantSlug}/table/${qrToken}/orders/${orderId}/tracking`)
        }
      />
    </CustomerTheme>
  );
}

function CustomerOrderConfirmationRoute() {
  const { restaurantSlug, qrToken, orderId } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerTheme restaurantSlug={restaurantSlug}>
      <CustomerOrderConfirmationScreen
        restaurantSlug={restaurantSlug}
        qrToken={qrToken}
        orderId={orderId}
        onBackToMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
        onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
        onViewTracking={() =>
          navigate(`/r/${restaurantSlug}/table/${qrToken}/orders/${orderId}/tracking`)
        }
      />
    </CustomerTheme>
  );
}

function CustomerOrderTrackingRoute() {
  const { restaurantSlug, qrToken, orderId } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerTheme restaurantSlug={restaurantSlug}>
      <CustomerOrderTrackingScreen
        restaurantSlug={restaurantSlug}
        qrToken={qrToken}
        orderId={orderId}
        onBackToMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
        onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
      />
    </CustomerTheme>
  );
}

function KitchenRoute() {
  const { restaurantSlug } = useParams();
  const navigate = useNavigate();
  /* Bumped after login/logout to force this component to re-read
     sessionStorage, since writing to it doesn't trigger a re-render on its own. */
  const [sessionTick, setSessionTick] = useState(0);

  const restaurant = findRestaurantBySlug(restaurantSlug);
  if (!restaurant) {
    return <KitchenInvalidRestaurantView />;
  }

  const session = getKitchenSession();
  const hasValidSession =
    session && session.restaurantSlug === restaurantSlug && session.role === "kitchen";

  if (!hasValidSession) {
    return (
      <KitchenLoginScreen
        restaurantSlug={restaurantSlug}
        onLoggedIn={() => setSessionTick((t) => t + 1)}
      />
    );
  }

  return (
    /* Phase 65 — the Kitchen board renders its own Topbar, so unlike Admin
       there is no chrome to preserve separately; this guards the whole
       surface. A malformed order must never leave a kitchen staring at a
       blank screen mid-service. */
    <ErrorBoundary label="kitchen" resetKey={restaurantSlug}>
      <KitchenBoardScreen
        restaurant={restaurant}
        session={session}
        onSignOut={() => {
          clearKitchenSession();
          setSessionTick((t) => t + 1);
        }}
      />
    </ErrorBoundary>
  );
}

/* Phase 83.1, Finding #4 — the restaurant's colours reach the operational
   products too, so one venue has one identity rather than a themed Customer
   and a permanently gold Admin/Kitchen.

   Wrapped at the ROUTE rather than inside each component on purpose: both
   routes below have many early returns (invalid restaurant, login, and in
   Admin's case one per page), and wrapping each would mean the theme applying
   to some states and not others. One wrapper here covers every branch,
   including the login screens — which already show the restaurant's name and
   should look like that restaurant.

   These carry colours only; typography and the customer language rule stay
   where they were (see RestaurantTheme). */
function ThemedAdminRoute() {
  const { restaurantSlug } = useParams();
  return (
    <RestaurantTheme restaurantSlug={restaurantSlug} scope="admin">
      <AdminRoute />
    </RestaurantTheme>
  );
}

function ThemedKitchenRoute() {
  const { restaurantSlug } = useParams();
  return (
    <RestaurantTheme restaurantSlug={restaurantSlug} scope="kitchen">
      <KitchenRoute />
    </RestaurantTheme>
  );
}

function AdminRoute() {
  const { restaurantSlug } = useParams();
  const navigate = useNavigate();
  /* Bumped after login/logout to force this component to re-read
     sessionStorage, since writing to it doesn't trigger a re-render on its own. */
  const [sessionTick, setSessionTick] = useState(0);
  /* Which admin page is showing — the URL stays /admin/:restaurantSlug for
     both; this is in-page navigation via AdminLayout's nav shell. */
  /* Phase 62 — restored from sessionStorage so a refresh returns to the page
     the operator was on. The initializer reads the session directly because
     `session` below is derived later in this same render; readAdminPage
     validates the stored value against the CURRENT role, so a Cashier can
     never resume an Admin-only page and an unknown key falls back to
     Overview. Computing it here does not render it — the session check
     further down still decides whether any admin page renders at all. */
  const [adminPage, setAdminPage] = useState(() =>
    readAdminPage(restaurantSlug, getAdminSession()?.role)
  );
  /* Phase 53 — a filter the Dashboard can hand to Live Orders when a status
     card is used as a shortcut. Kept here rather than inside Live Orders
     because the screen unmounts when the admin page changes, so the intent
     has to survive the switch. */
  const [liveOrdersFilter, setLiveOrdersFilter] = useState(null);
  /* Phase 111.1 — the Revenue Report's frozen snapshot. Held here for the
     same reason the Live Orders filter is: the dashboard unmounts when the
     admin page changes, so what it captured has to outlive it. */
  const [reportSnapshot, setReportSnapshot] = useState(null);
  /* Phase 112.0 — which table (or the direct context) Staff Ordering is
     working in. Held here for the same reason as the two above: the sidebar
     that chose it is re-created when the page changes. */
  const [staffContext, setStaffContext] = useState(null);

  /* Every admin screen and the sidebar navigate through this. The second
     argument is optional: plain navigation (a nav click, the drill-down's
     "View in Live Orders") passes nothing and CLEARS any previous filter, so
     a shortcut used earlier can never silently narrow a later visit. */
  /* Phase 60 — every in-app Admin page change goes through here, so this is
     the one place that has to ask permission. Wrapping the body (rather than
     each of the ~12 call sites) means the sidebar, the Phase 53 dashboard
     shortcuts, the Phase 30 drill-down, the "Back to Overview" buttons and
     the Phase 59 alert are all covered by construction — including any
     future caller, which cannot forget to ask.

     The page and options arguments are captured in the closure, so a
     deferred navigation resumes with the exact destination AND filter that
     was originally requested: discarding a draft after clicking the
     Preparing card still lands on Live Orders filtered to Preparing. */
  function navigateAdmin(page, options) {
    requestNavigation(() => {
      setLiveOrdersFilter(options?.ordersFilter ?? null);
      /* Phase 111.1 - carried the same way the Live Orders filter is, and
         cleared on every other navigation so a stale snapshot can never be
         shown under a later period. */
      setReportSnapshot(options?.report ?? null);
      setStaffContext(options?.staffContext ?? null);
      setAdminPage(page);
      /* Phase 62 — inside the guard's success path on purpose. A destination
         the Phase 60 dialog is still holding has not been visited, so
         persisting it here would let "Keep Editing" be remembered as a move.
         The Live Orders filter is deliberately NOT persisted: this phase
         restores a page, not a moment. */
      writeAdminPage(restaurantSlug, session?.role, page);
    });
  }

  const restaurant = findRestaurantBySlug(restaurantSlug);
  if (!restaurant) {
    return <AdminInvalidRestaurantView />;
  }

  const session = getAdminSession();
  const hasValidSession =
    session &&
    session.restaurantSlug === restaurantSlug &&
    (session.role === "admin" || session.role === "cashier");

  if (!hasValidSession) {
    return (
      <AdminLoginScreen
        restaurantSlug={restaurantSlug}
        onLoggedIn={() => setSessionTick((t) => t + 1)}
      />
    );
  }

  /* Phase 60 — signing out unmounts the whole admin tree, so it discards a
     dirty draft exactly like a page change does. It is not routed through
     navigateAdmin, so it needs the same ask. This covers the in-app button
     only; closing the tab remains unprotected and is out of scope. */
  const handleSignOut = () => {
    requestNavigation(() => {
      /* Phase 62 — cleared only once the guard has allowed the sign-out, and
         before the session goes, since the key is scoped by that role. The
         next login therefore starts at Overview rather than resuming the
         previous operator screen. Choosing "Keep Editing" never reaches
         here, so the remembered page survives a refused sign-out. */
      clearAdminPage(restaurantSlug, session?.role);
      clearAdminSession();
      setSessionTick((t) => t + 1);
    });
  };

  /* Layer 2 of three — THE guard. This is the one that actually decides what
     renders: a session can never reach a screen it lacks the permission for,
     regardless of how adminPage got set (stale state, a hand-edited
     sessionStorage value, a future code path). It silently falls back to
     Overview, which every admin-shell role can see.

     Phase 95.1 — the question changed from "is this page Admin-only?" to
     "does this session hold the page's permission?", so Cashier can now be
     granted Menu and Categories without the guard needing to know why. The
     permission map is shared with the nav filter and with adminPageState, so
     all three still move together. */
  const isAuthorizedForPage = canViewPage(session, adminPage);

  if (adminPage === "liveOrders" && isAuthorizedForPage) {
    return (
      <AdminLiveOrdersScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
        initialFilter={liveOrdersFilter}
      />
    );
  }

  /* Phase 25 — Staff Calls (Digital Waiter Bell) is intentionally NOT part
     of isAdminOnlyPage above: both Admin and Cashier answer the waiter bell,
     the same way both already handle Delivered/Cancel/Mark as Paid. Kitchen
     can never reach it — this whole route requires an admin/cashier session. */
  if (adminPage === "staffCalls" && isAuthorizedForPage) {
    return (
      <AdminStaffCallsScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
      />
    );
  }

  if (adminPage === "menu" && isAuthorizedForPage) {
    return (
      <AdminMenuItemsScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
      />
    );
  }

  if (adminPage === "categories" && isAuthorizedForPage) {
    return (
      <AdminCategoriesScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
      />
    );
  }

  if (adminPage === "tables" && isAuthorizedForPage) {
    return (
      <AdminTablesScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
      />
    );
  }

  if (adminPage === "feedback" && isAuthorizedForPage) {
    return (
      <AdminFeedbackScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
      />
    );
  }

  if (adminPage === "staffOrdering" && isAuthorizedForPage) {
    return (
      <StaffOrderingScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
        context={staffContext}
      />
    );
  }

  if (adminPage === "revenueReport" && isAuthorizedForPage) {
    return (
      <AdminRevenueReportScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
        report={reportSnapshot}
      />
    );
  }

  if (adminPage === "settings" && isAuthorizedForPage) {
    return (
      <AdminSettingsScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={navigateAdmin}
      />
    );
  }

  return (
    <AdminDashboardScreen
      restaurant={restaurant}
      session={session}
      onSignOut={handleSignOut}
      onNavigate={navigateAdmin}
    />
  );
}

/* Phase 65 — the last line of defence, under every route. The three surface
   boundaries (Admin content, CustomerTheme, Kitchen) handle the common case
   and preserve more context; this one exists for the case they cannot cover:
   a screen that throws BEFORE it renders its own layout, or a failure in a
   login / invalid-access view that sits outside all three.

   It must be inside BrowserRouter to read the location, which is what lets a
   route change clear a previous failure instead of stranding the user. */
function RoutedErrorBoundary({ children }) {
  const location = useLocation();
  return (
    <ErrorBoundary label="app" resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <div className="app">
      <BrowserRouter>
        {/* Phase 125.0 — the floating wrench that used to be mounted here,
            over every operational screen, is gone. Its navigation and its
            reset utilities moved to /dev, so a development build now shows
            the real interface with nothing on top of it. */}
        <RoutedErrorBoundary>
        <Routes>
          {/* "/" is where someone lands with no table and no context: a
              bookmark, a typed address, a stale link. It gets the smallest
              honest answer — scan the code on your table — and links to
              nothing operational. */}
          <Route path="/"                                                          element={<EntryScreen />} />
          {/* ── Phase 125.0 — the Developer Hub, development builds only ──
              import.meta.env.DEV is replaced by the literal `false` when
              Vite builds for production, so this branch folds away, the
              route is never registered and the module is tree-shaken out of
              the bundle — the same mechanism that kept the old DemoSwitcher
              out of production, verified by grepping dist/.

              That is the FIRST of the hub's two guards, and the only one
              that can live in the bundle. The second is in the dev server,
              because "this is a development build" and "you are allowed to
              use this" are different questions and only a server can answer
              the second one. See dev-server/devAccess.js. */}
          {import.meta.env.DEV && (
            <Route path="/dev" element={<DevHubScreen />} />
          )}
          <Route path="/kitchen/:restaurantSlug"                                  element={<ThemedKitchenRoute />} />
          <Route path="/admin/:restaurantSlug"                                    element={<ThemedAdminRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken"                        element={<CustomerAccessRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/menu"                   element={<CustomerMenuRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/cart"                   element={<CustomerCartRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/orders"                 element={<CustomerOrdersRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/orders/:orderId/confirmation" element={<CustomerOrderConfirmationRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/orders/:orderId/tracking"     element={<CustomerOrderTrackingRoute />} />
          {/* Rendered, not redirected. A redirect to "/" would have made
              every mistyped address indistinguishable from the front door,
              and with "/" now being a real screen rather than a menu of
              surfaces, a redirect loop is one bad route definition away.
              This keeps the address the visitor typed and tells them it is
              not one of ours. */}
          <Route path="*"                                                          element={<EntryScreen variant="notFound" />} />
        </Routes>
        </RoutedErrorBoundary>
      </BrowserRouter>
    </div>
  );
}
