import { useState, useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, ChefHat, LayoutDashboard, ExternalLink, ArrowUpRight } from "lucide-react";
import { clearCustomerSession } from "../../lib/customerSession.js";
import { clearKitchenSession } from "../../lib/kitchenSession.js";
import { clearAdminSession } from "../../lib/adminSession.js";
import { clearCustomerCart } from "../../lib/customerCart.js";
import { clearCustomerOrders } from "../../lib/customerOrders.js";
import { DEV_FLAG_AI_RECS, readFlag, writeFlag, subscribeFlags } from "../../lib/devFlags.js";

/**
 * DevHubScreen — Phase 125.0. The developer's own front door.
 *
 * It replaces two things at once: the old Phase 24 landing page, which put
 * "Customer Demo / Kitchen Demo / Admin Demo" in front of every visitor, and
 * the floating wrench, which put developer controls on top of every
 * operational screen. Both existed because there was nowhere else for them.
 * This is that somewhere else.
 *
 * ── IT IS NOT A HOME PAGE ────────────────────────────────────────────────
 * Nothing in the product links here. It is reachable by typing /dev, and
 * only then if the dev server agrees (see dev-server/devAccess.js). A guest,
 * a cashier and a cook can never arrive here by using the application.
 *
 * ── TWO GUARDS, DOING DIFFERENT JOBS ─────────────────────────────────────
 * 1. `import.meta.env.DEV` folds to the literal `false` in a production
 *    build, so App.jsx never registers the route and this module is dropped
 *    from the bundle. That handles "not in production".
 * 2. The server check below handles "not for whoever happens to be on this
 *    network". The hub renders nothing until the dev server confirms the
 *    request is authorised — a client-side route test could not do this,
 *    because a visitor who already has the bundle can reach any client
 *    route they like.
 *
 * The second guard is why this screen has a loading state at all.
 */

/* Every surface goes through its REAL entry point. Nothing here bypasses a
   PIN, a password or a QR token — a developer shortcut that skipped the
   front door would be testing a product that does not exist. */
const SURFACES = [
  {
    key: "customer",
    icon: QrCode,
    title: "Customer",
    note: "Guest ordering. Opens a valid table QR — the same link the printed code carries.",
    links: [
      { label: "Table 1 · QR entry", to: "/r/lumiere/table/table-1-token" },
      { label: "Table 2 · QR entry", to: "/r/lumiere/table/table-2-token" },
      { label: "Menu", to: "/r/lumiere/table/table-1-token/menu" },
      { label: "My Orders", to: "/r/lumiere/table/table-1-token/orders" },
      { label: "Invalid QR (recovery state)", to: "/r/lumiere/table/broken-token" },
    ],
  },
  {
    key: "staff",
    icon: LayoutDashboard,
    title: "Admin & Cashier",
    /* One door, deliberately. Admin and Cashier share Staff Access and are
       told apart by the credentials used, so offering a separate "Cashier"
       route would be inventing one that the product does not have. */
    note: "Shared Staff Access. Which surface you get is decided by the credentials you sign in with — sign out to swap roles.",
    links: [{ label: "Staff Access · sign in", to: "/admin/lumiere" }],
  },
  {
    key: "kitchen",
    icon: ChefHat,
    title: "Kitchen",
    note: "PIN entry, then the live board. The normal kitchen session flow.",
    links: [{ label: "Kitchen · PIN entry", to: "/kitchen/lumiere" }],
  },
];

const CLEAR_ACTIONS = [
  { label: "Clear customer session", run: clearCustomerSession },
  { label: "Clear kitchen session", run: clearKitchenSession },
  { label: "Clear staff session", run: clearAdminSession },
  { label: "Clear cart", run: clearCustomerCart },
  { label: "Clear mock orders", run: clearCustomerOrders },
];

const NEW_TAB_KEY = "pro_order_dev_newtab";

export default function DevHubScreen() {
  const navigate = useNavigate();
  const [access, setAccess] = useState("checking");
  const [confirming, setConfirming] = useState(null);
  /* Remembered per browser, so the preference survives the reloads that
     clearing data triggers. sessionStorage, not localStorage: it is a
     testing preference, not product state. */
  const [newTab, setNewTab] = useState(() => {
    try {
      return sessionStorage.getItem(NEW_TAB_KEY) === "1";
    } catch {
      return false;
    }
  });

  const aiRecs = useSyncExternalStore(
    subscribeFlags,
    () => readFlag(DEV_FLAG_AI_RECS),
    () => false,
  );

  /* The server is the authority. A 200 here means the dev server matched
     the loopback address or the cookie it set; anything else means this
     visitor does not get the tools, and the hub renders the same nothing
     an unknown route would. */
  useEffect(() => {
    let alive = true;
    fetch("/__dev-access", { credentials: "same-origin" })
      .then((r) => {
        if (alive) setAccess(r.ok ? "granted" : "denied");
      })
      .catch(() => {
        if (alive) setAccess("denied");
      });
    return () => {
      alive = false;
    };
  }, []);

  function setTabPref(value) {
    setNewTab(value);
    try {
      sessionStorage.setItem(NEW_TAB_KEY, value ? "1" : "0");
    } catch {
      /* Private mode: the preference just will not persist. */
    }
  }

  function open(to) {
    if (!newTab) {
      navigate(to);
      return;
    }
    /* A blocked popup returns null (or a window that never loads). Falling
       back to same-tab navigation means the button always does something,
       which matters on the phone browsers that block this by default. */
    const win = window.open(to, "_blank", "noopener");
    if (!win) navigate(to);
  }

  function handleClear(index, run) {
    if (confirming !== index) {
      setConfirming(index);
      return;
    }
    run();
    setConfirming(null);
    window.location.reload();
  }

  if (access === "checking") {
    return <div className="devhub devhub--pending" aria-busy="true" />;
  }
  if (access === "denied") {
    /* Matches what an unauthorised request to /dev gets from the server, so
       a visitor who reached this client route by typing it learns nothing
       the 404 did not already tell them. */
    return (
      <main className="devhub devhub--denied" dir="ltr">
        <h1 className="devhub__denied-title">Not found</h1>
      </main>
    );
  }

  return (
    /* dir="ltr": this console is written in English only and is not part
       of the product, so mirroring it when the APP language is Arabic would
       flip a layout whose content never flips. The product surfaces it links
       to keep following the app language, exactly as before. */
    <main className="devhub" dir="ltr">
      <header className="devhub__head">
        <div>
          <p className="devhub__eyebrow">PRO·ORDER</p>
          <h1 className="devhub__title">Developer testing</h1>
        </div>
        <label className="devhub__tabpref">
          <input
            type="checkbox"
            checked={newTab}
            onChange={(e) => setTabPref(e.target.checked)}
          />
          <span>Open in a new tab</span>
        </label>
      </header>

      <p className="devhub__lede">
        Every link below goes through the surface&rsquo;s real entry point — QR token,
        staff sign-in, kitchen PIN. Navigating never clears stored data.
      </p>

      <div className="devhub__grid">
        {SURFACES.map((surface) => {
          const Icon = surface.icon;
          return (
            <section className="devhub__card" key={surface.key}>
              <h2 className="devhub__card-title">
                <Icon size={16} strokeWidth={2.1} aria-hidden="true" />
                {surface.title}
              </h2>
              <p className="devhub__card-note">{surface.note}</p>
              <div className="devhub__links">
                {surface.links.map((link) => (
                  <button
                    key={link.to}
                    type="button"
                    className="devhub__link"
                    onClick={() => open(link.to)}
                  >
                    <span>{link.label}</span>
                    {newTab ? (
                      <ExternalLink size={13} aria-hidden="true" />
                    ) : (
                      <ArrowUpRight size={13} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        <section className="devhub__card">
          <h2 className="devhub__card-title">Preview flags</h2>
          <p className="devhub__card-note">
            Layout aids. They change what the development build draws, never what it
            stores or recommends.
          </p>
          <div className="devhub__links">
            <button
              type="button"
              className={`devhub__link ${aiRecs ? "devhub__link--on" : ""}`}
              aria-pressed={aiRecs}
              onClick={() => writeFlag(DEV_FLAG_AI_RECS, !aiRecs)}
            >
              <span>AI card preview (layout)</span>
              <span className="devhub__flag">{aiRecs ? "ON" : "OFF"}</span>
            </button>
          </div>
        </section>

        <section className="devhub__card devhub__card--danger">
          <h2 className="devhub__card-title">Danger zone</h2>
          <p className="devhub__card-note">
            Each button clears one thing in THIS browser, and asks twice. Nothing here
            touches another device, and nothing runs by navigating.
          </p>
          <div className="devhub__links">
            {CLEAR_ACTIONS.map((action, i) => (
              <button
                key={action.label}
                type="button"
                className={`devhub__link devhub__link--danger ${
                  confirming === i ? "devhub__link--confirm" : ""
                }`}
                onClick={() => handleClear(i, action.run)}
              >
                <span>{confirming === i ? "Click again to confirm" : action.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <p className="devhub__foot">
        Development only. This page is not part of the product and nothing in the
        product links to it.
      </p>
    </main>
  );
}
