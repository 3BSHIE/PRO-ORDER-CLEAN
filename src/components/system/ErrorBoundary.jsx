import { Component } from "react";
import { AlertTriangle, RotateCcw, RefreshCw, ArrowLeft } from "lucide-react";
import Button from "../ui/Button.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";

/**
 * ErrorBoundary — Phase 65. A second, independent robustness layer beneath
 * Phase 64's translation guard.
 *
 * Phase 64 fixed one specific crash. This catches the ones nobody has met
 * yet — which matters most once a backend starts supplying records this
 * frontend has never seen: a null field, a legacy shape, an enum that gained
 * a member. Before this, any such error unmounted the whole React tree and
 * left a blank white page with no way back except a manual reload.
 *
 * WHAT IT CATCHES — React render-phase failures only:
 *   - rendering of this boundary's descendants
 *   - descendant constructors and lifecycle methods
 *
 * WHAT IT DOES NOT CATCH — stated plainly, because assuming otherwise is
 * how people build false confidence:
 *   - event handlers (a throw inside onClick)
 *   - async work: promises, await, fetch callbacks
 *   - timers (setTimeout / setInterval)
 *   - errors thrown by the boundary component itself
 *   - server-side rendering
 * Those still surface as ordinary uncaught errors. This is a net under the
 * render tree, not a general exception handler.
 *
 * Recovery never touches business data. A render failure and the records
 * being rendered are separate concerns, and "fixing" the screen by deleting
 * the row that broke it would turn a display bug into data loss.
 */

/* Rendered as a function component so the fallback can use the language hook
   and stay correct if the operator switches language while it is on screen —
   a class cannot call hooks. */
/**
 * Phase 74 §47 — the customer menu URL, derived from the address bar alone.
 *
 * Deliberately NOT a data read. The fallback renders while something in the
 * tree has already thrown, so anything it touches must be incapable of
 * throwing a second time: no storage, no order lookup, no settings. A regex
 * over location.pathname is inert, and the whole thing is wrapped anyway.
 *
 * Returns null when the pattern does not match — an Admin or Kitchen route,
 * or a customer route shape we do not recognise — and the escape button is
 * simply not offered rather than pointing somewhere wrong.
 */
function safeMenuHref() {
  try {
    const m = window.location.pathname.match(/^\/r\/([^/]+)\/table\/([^/]+)/);
    return m ? `/r/${m[1]}/table/${m[2]}/menu` : null;
  } catch {
    return null;
  }
}

function ErrorFallback({ onRetry }) {
  const { t } = useLanguage();
  /* Computed once per render, cheap, and guarded above. */
  const menuHref = safeMenuHref();

  return (
    /* role="status" rather than "alert": the surrounding content has already
       visibly vanished, so this is not competing for attention, and a polite
       region will not re-interrupt a screen-reader user each time a retry
       fails on the same bad data.
    
       Phase 74 §46 — same recovery geometry as the other states (rounded
       square mark, title, helper, actions), in a restrained red because this
       one IS a genuine application fault, unlike a mis-scanned QR. */
    <div className="eb-fallback" role="status">
      <span className="eb-fallback__icon" aria-hidden="true">
        <AlertTriangle size={26} strokeWidth={1.8} />
      </span>
      <h2 className="eb-fallback__title">
        {t("common.somethingWentWrong", "Something went wrong")}
      </h2>
      <p className="eb-fallback__msg">
        {t("common.couldNotDisplaySection", "We couldn't display this section.")}
      </p>
      <div className="eb-fallback__actions">
        <Button icon={RotateCcw} onClick={onRetry}>
          {t("common.tryAgain", "Try Again")}
        </Button>
        <Button variant="outline" icon={RefreshCw} onClick={() => window.location.reload()}>
          {t("common.reload", "Reload")}
        </Button>
        {/* §47 — an actual way out. Both other actions re-attempt the same
            broken data; without this a guest could be stranded on a screen
            that fails identically every time. A plain assignment rather than
            the router, because the router context is exactly the kind of
            thing that may be unavailable in here. */}
        {menuHref && (
          <Button
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => { window.location.href = menuHref; }}
          >
            {t("common.backToMenu", "Back to menu")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    /* Guards against a render loop logging the same failure endlessly. */
    this.lastLoggedSignature = null;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    /* Never swallow the error silently — but never leak it to the UI either.
       Detail stays in the console, where a developer can reach it and a
       guest or cashier cannot. React logs the error itself as well; this
       adds the component stack, which is the part that actually locates the
       failure. */
    try {
      if (!import.meta.env?.DEV) return;
      const signature = `${error?.name}:${error?.message}`;
      if (signature === this.lastLoggedSignature) return;
      this.lastLoggedSignature = signature;
      console.error(
        `[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ""}] render failed:`,
        error,
        info?.componentStack ? `\nComponent stack:${info.componentStack}` : ""
      );
    } catch {
      /* Logging must never become the second failure. */
    }
  }

  componentDidUpdate(prevProps) {
    /* Phase 65 §13 — a boundary must not trap the operator on one broken
       page forever. When the surface it guards changes (a different Admin
       page, a different route), the previous failure is no longer relevant,
       so the error clears and the new subtree gets a clean render. */
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.lastLoggedSignature = null;
      this.setState({ error: null });
    }
  }

  handleRetry = () => {
    /* Re-attempt the same subtree. If the underlying data is still bad this
       will fail again immediately, which is correct: the alternative is
       mutating business data to force a success. */
    this.lastLoggedSignature = null;
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) return <ErrorFallback onRetry={this.handleRetry} />;
    return this.props.children;
  }
}
