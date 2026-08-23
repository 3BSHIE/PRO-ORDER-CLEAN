import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import "./theme/global.css";
import HomeScreen                        from "./screens/HomeScreen.jsx";
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
import AdminCategoriesScreen              from "./screens/admin/AdminCategoriesScreen.jsx";
import AdminMenuItemsScreen               from "./screens/admin/AdminMenuItemsScreen.jsx";
import AdminTablesScreen                  from "./screens/admin/AdminTablesScreen.jsx";
import AdminSettingsScreen                from "./screens/admin/AdminSettingsScreen.jsx";
import { getAdminSession, clearAdminSession } from "./lib/adminSession.js";
import { findRestaurantBySlug }          from "./data/mockRestaurant.js";
import { getKitchenSession, clearKitchenSession } from "./lib/kitchenSession.js";
import DemoSwitcher                      from "./components/demo/DemoSwitcher.jsx";

function HomeRoute() {
  const navigate = useNavigate();
  return <HomeScreen onNavigate={(to) => navigate(to)} />;
}

function CustomerAccessRoute() {
  const { restaurantSlug, qrToken } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerAccessScreen
      restaurantSlug={restaurantSlug}
      qrToken={qrToken}
      onHome={() => navigate("/")}
      onEnterMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
    />
  );
}

function CustomerMenuRoute() {
  const { restaurantSlug, qrToken } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerMenuScreen
      restaurantSlug={restaurantSlug}
      qrToken={qrToken}
      onHome={() => navigate("/")}
      onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
      onViewCart={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/cart`)}
      onViewOrders={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/orders`)}
    />
  );
}

function CustomerCartRoute() {
  const { restaurantSlug, qrToken } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerCartScreen
      restaurantSlug={restaurantSlug}
      qrToken={qrToken}
      onHome={() => navigate("/")}
      onBackToMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
      onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
      onOrderCreated={(orderId) =>
        navigate(`/r/${restaurantSlug}/table/${qrToken}/orders/${orderId}/confirmation`)
      }
    />
  );
}

function CustomerOrdersRoute() {
  const { restaurantSlug, qrToken } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerOrdersScreen
      restaurantSlug={restaurantSlug}
      qrToken={qrToken}
      onHome={() => navigate("/")}
      onBackToMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
      onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
      onTrackOrder={(orderId) =>
        navigate(`/r/${restaurantSlug}/table/${qrToken}/orders/${orderId}/tracking`)
      }
    />
  );
}

function CustomerOrderConfirmationRoute() {
  const { restaurantSlug, qrToken, orderId } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerOrderConfirmationScreen
      restaurantSlug={restaurantSlug}
      qrToken={qrToken}
      orderId={orderId}
      onHome={() => navigate("/")}
      onBackToMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
      onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
      onViewTracking={() =>
        navigate(`/r/${restaurantSlug}/table/${qrToken}/orders/${orderId}/tracking`)
      }
    />
  );
}

function CustomerOrderTrackingRoute() {
  const { restaurantSlug, qrToken, orderId } = useParams();
  const navigate = useNavigate();
  return (
    <CustomerOrderTrackingScreen
      restaurantSlug={restaurantSlug}
      qrToken={qrToken}
      orderId={orderId}
      onHome={() => navigate("/")}
      onBackToMenu={() => navigate(`/r/${restaurantSlug}/table/${qrToken}/menu`)}
      onBackToAccess={() => navigate(`/r/${restaurantSlug}/table/${qrToken}`)}
    />
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
    return <KitchenInvalidRestaurantView onHome={() => navigate("/")} />;
  }

  const session = getKitchenSession();
  const hasValidSession =
    session && session.restaurantSlug === restaurantSlug && session.role === "kitchen";

  if (!hasValidSession) {
    return (
      <KitchenLoginScreen
        restaurantSlug={restaurantSlug}
        onHome={() => navigate("/")}
        onLoggedIn={() => setSessionTick((t) => t + 1)}
      />
    );
  }

  return (
    <KitchenBoardScreen
      restaurant={restaurant}
      session={session}
      onSignOut={() => {
        clearKitchenSession();
        setSessionTick((t) => t + 1);
      }}
      onHome={() => navigate("/")}
    />
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
  const [adminPage, setAdminPage] = useState("overview");

  const restaurant = findRestaurantBySlug(restaurantSlug);
  if (!restaurant) {
    return <AdminInvalidRestaurantView onHome={() => navigate("/")} />;
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
        onHome={() => navigate("/")}
        onLoggedIn={() => setSessionTick((t) => t + 1)}
      />
    );
  }

  const handleSignOut = () => {
    clearAdminSession();
    setSessionTick((t) => t + 1);
  };

  /* Phase 21 architecture review — Menu Management and Categories
     Management are Admin-only. This is the real access-control guard (not
     just a hidden nav button): a Cashier session can never reach
     AdminMenuItemsScreen/AdminCategoriesScreen through this route,
     regardless of how adminPage got set (stale state, direct navigation,
     etc.) — it silently falls back to the Dashboard, which Cashier is
     allowed to see. AdminLayout also hides the Menu/Categories nav buttons
     for Cashier, and each screen has its own redundant role check too, but
     this is the one that actually decides what renders. */
  const isAdminOnlyPage = adminPage === "menu" || adminPage === "categories" || adminPage === "tables" || adminPage === "settings";
  const isAuthorizedForPage = !isAdminOnlyPage || session.role === "admin";

  if (adminPage === "liveOrders") {
    return (
      <AdminLiveOrdersScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={setAdminPage}
      />
    );
  }

  if (adminPage === "menu" && isAuthorizedForPage) {
    return (
      <AdminMenuItemsScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={setAdminPage}
      />
    );
  }

  if (adminPage === "categories" && isAuthorizedForPage) {
    return (
      <AdminCategoriesScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={setAdminPage}
      />
    );
  }

  if (adminPage === "tables" && isAuthorizedForPage) {
    return (
      <AdminTablesScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={setAdminPage}
      />
    );
  }

  if (adminPage === "settings" && isAuthorizedForPage) {
    return (
      <AdminSettingsScreen
        restaurant={restaurant}
        session={session}
        onSignOut={handleSignOut}
        onNavigate={setAdminPage}
      />
    );
  }

  return (
    <AdminDashboardScreen
      restaurant={restaurant}
      session={session}
      onSignOut={handleSignOut}
      onNavigate={setAdminPage}
    />
  );
}

export default function App() {
  return (
    <div className="app">
      <BrowserRouter>
        {/* Demo-only dev tool — see src/components/demo/DemoSwitcher.jsx.
            Must be disabled/removed before production. */}
        <DemoSwitcher />
        <Routes>
          <Route path="/"                                                          element={<HomeRoute />} />
          <Route path="/kitchen/:restaurantSlug"                                  element={<KitchenRoute />} />
          <Route path="/admin/:restaurantSlug"                                    element={<AdminRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken"                        element={<CustomerAccessRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/menu"                   element={<CustomerMenuRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/cart"                   element={<CustomerCartRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/orders"                 element={<CustomerOrdersRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/orders/:orderId/confirmation" element={<CustomerOrderConfirmationRoute />} />
          <Route path="/r/:restaurantSlug/table/:qrToken/orders/:orderId/tracking"     element={<CustomerOrderTrackingRoute />} />
          <Route path="*"                                                          element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
