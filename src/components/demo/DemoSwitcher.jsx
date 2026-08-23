import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wrench, X } from "lucide-react";
import { clearCustomerSession } from "../../lib/customerSession.js";
import { clearKitchenSession } from "../../lib/kitchenSession.js";
import { clearAdminSession } from "../../lib/adminSession.js";
import { clearCustomerCart } from "../../lib/customerCart.js";
import { clearCustomerOrders } from "../../lib/customerOrders.js";

/**
 * DemoSwitcher — DEVELOPMENT/DEMO TESTING TOOL ONLY.
 *
 * This is not a product feature. It exists purely so a developer can jump
 * between customer and kitchen surfaces while manually testing, without
 * losing localStorage/sessionStorage state (orders, cart, sessions) the way
 * leaving the preview or reloading sometimes does.
 *
 * ⚠️ THIS MUST BE DISABLED OR REMOVED BEFORE PRODUCTION. ⚠️
 * Toggle via SHOW_DEMO_TOOLS below — swap to `import.meta.env.DEV` for an
 * automatic "only in dev builds" gate, or delete this component and its
 * mount point in App.jsx entirely for a production build.
 *
 * Navigation links here NEVER touch storage — only the explicitly-labeled
 * "Danger zone" buttons do, and each requires a confirmation click.
 */

const SHOW_DEMO_TOOLS = true; // ← set to false (or use import.meta.env.DEV) before production

const NAV_LINKS = [
  { label: "Home",              to: "/" },
  { label: "Customer Table 1",  to: "/r/lumiere/table/table-1-token" },
  { label: "Customer Menu",     to: "/r/lumiere/table/table-1-token/menu" },
  { label: "Customer My Orders",to: "/r/lumiere/table/table-1-token/orders" },
  { label: "Kitchen",           to: "/kitchen/lumiere" },
  { label: "Admin",             to: "/admin/lumiere" },
];

const CLEAR_ACTIONS = [
  { label: "Clear customer session", run: clearCustomerSession },
  { label: "Clear kitchen session",  run: clearKitchenSession },
  { label: "Clear admin session",    run: clearAdminSession },
  { label: "Clear cart",             run: clearCustomerCart },
  { label: "Clear mock orders",      run: clearCustomerOrders },
];

export default function DemoSwitcher() {
  const [open, setOpen] = useState(false);
  const [confirmingIndex, setConfirmingIndex] = useState(null);
  const navigate = useNavigate();

  if (!SHOW_DEMO_TOOLS) return null;

  function handleNav(to) {
    navigate(to); // plain client-side navigation — no storage is touched
    setOpen(false);
  }

  function handleClearClick(index, run) {
    if (confirmingIndex !== index) {
      // First click just arms the confirmation; nothing destructive happens yet.
      setConfirmingIndex(index);
      return;
    }
    run();
    setConfirmingIndex(null);
    window.location.reload(); // simplest way to reflect the cleared state everywhere
  }

  return (
    <div className="demo-switcher">
      {open && (
        <div className="demo-switcher__panel">
          <div className="demo-switcher__panel-head">
            <span className="demo-switcher__panel-title">Demo tools</span>
            <button
              type="button"
              className="demo-switcher__close"
              onClick={() => setOpen(false)}
              aria-label="Close demo tools"
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>

          <p className="demo-switcher__hint">
            Local testing navigation. Does not clear any saved data.
          </p>

          <div className="demo-switcher__group">
            {NAV_LINKS.map((link) => (
              <button
                key={link.to}
                type="button"
                className="demo-switcher__link"
                onClick={() => handleNav(link.to)}
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="demo-switcher__danger">
            <p className="demo-switcher__danger-title">Danger zone</p>
            {CLEAR_ACTIONS.map((action, i) => (
              <button
                key={action.label}
                type="button"
                className={`demo-switcher__danger-btn ${
                  confirmingIndex === i ? "demo-switcher__danger-btn--confirm" : ""
                }`}
                onClick={() => handleClearClick(i, action.run)}
              >
                {confirmingIndex === i ? "Click again to confirm" : action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="demo-switcher__fab"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle demo tools"
        title="Demo tools (dev only)"
      >
        <Wrench size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}
