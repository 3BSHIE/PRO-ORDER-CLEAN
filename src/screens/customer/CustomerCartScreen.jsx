import { useState, useEffect, useRef, useMemo } from "react";
import { ArrowLeft, ShoppingCart, X, AlertTriangle } from "lucide-react";
import Topbar  from "../../components/layout/Topbar.jsx";
import Logo    from "../../components/brand/Logo.jsx";
import Button  from "../../components/ui/Button.jsx";
import Card    from "../../components/ui/Card.jsx";
import Toast   from "../../components/ui/Toast.jsx";
import QuantityStepper from "../../components/ui/QuantityStepper.jsx";
import PaymentMethodModal from "./components/PaymentMethodModal.jsx";
import { resolveTableAccess } from "../../lib/tableData.js";
import InvalidAccessView from "./components/InvalidAccessView.jsx";
import { getCustomerSession } from "../../lib/customerSession.js";
import {
  getCustomerCart, updateCartItemQuantity, removeCartItem,
  clearCustomerCart, getCartTotal, applyCurrentPricing,
} from "../../lib/customerCart.js";
import { getMenuItems, getCategories } from "../../lib/menuData.js";
import { validateCart, CART_ISSUE } from "../../lib/cartValidation.js";
import { createCustomerOrder, getOrderById } from "../../lib/customerOrders.js";
import { getEstimatedPrepMinutes } from "../../lib/prepTimeData.js";
import { useMenuData } from "../../lib/useMenuData.js";
import { useSettingsData } from "../../lib/useSettingsData.js";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";

/* ═══════════════════════════════════════════════════════════════════════════
   CustomerCartScreen — Phase 10

   Guards (unchanged since Phase 8):
     • QR token must be valid → else InvalidView
     • Customer session must exist → else redirect to onboarding

   Reads/writes the SAME cart that CustomerMenuScreen and the FAB use
   (src/lib/customerCart.js, sessionStorage-backed), so quantity edits and
   removals here are reflected everywhere else immediately.

   What's new in Phase 10:
     • Selecting a payment method and tapping "Continue in next phase" now
       creates a REAL mock order via src/lib/customerOrders.js (localStorage-
       backed), clears the cart, and navigates to the order confirmation
       route — no more placeholder toast for this step.

   NOT built yet: order tracking timeline, My Orders page,
   admin dashboard, kitchen board, backend.
   ═══════════════════════════════════════════════════════════════════════ */

export default function CustomerCartScreen({
  restaurantSlug,
  qrToken,
  onHome,
  onBackToMenu,
  onBackToAccess,
  onOrderCreated,
}) {
  const result  = resolveTableAccess(restaurantSlug, qrToken);
  const session = getCustomerSession();
  const { t } = useLanguage();

  const hasValidSession =
    result.ok &&
    session &&
    session.qrToken        === qrToken &&
    session.restaurantSlug === restaurantSlug &&
    !!session.customerName;

  useEffect(() => {
    if (result.ok && !hasValidSession) onBackToAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Gate 1: invalid QR */
  if (!result.ok) {
    return (
      <>
        <Topbar
          left={<Logo variant="icon" size="nav" />}
          right={<span className="badge badge--canceled">{t("common.qrAccess", "QR access")}</span>}
        />
        <main className="container">
          <InvalidAccessView reason={result.reason} onHome={onHome} />
        </main>
      </>
    );
  }

  /* Gate 2: redirect in progress */
  if (!hasValidSession) return null;

  return (
    <CartShell
      restaurant={result.restaurant}
      table={result.table}
      session={session}
      qrToken={qrToken}
      onBackToMenu={onBackToMenu}
      onOrderCreated={onOrderCreated}
    />
  );
}

/* ── Cart shell ──────────────────────────────────────────────────────────── */
function CartShell({ restaurant, table, session, qrToken, onBackToMenu, onOrderCreated }) {
  const [cart, setCart] = useState(() => getCustomerCart());
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const { t } = useLanguage();
  const { settings } = useSettingsData(restaurant.slug);

  /* Phase 34 — synchronous lock around order creation. Held for the life of
     this screen instance once an order succeeds, so taps landing during the
     navigation frame cannot re-enter. Released only on failure, so a guest is
     never locked out of retrying. */
  const createLock = useRef(false);

  /* Phase 37 — the cart is reconciled against the live menu. useMenuData
     already re-reads on the menu-change event and on window focus, so an
     Admin edit reaches an open cart with no extra machinery. The tick below
     only exists for category SCHEDULES, which change with the clock rather
     than with any event — same 30s cadence the menu screen uses. */
  const { items: liveItems, categories: liveCategories } = useMenuData(restaurant.slug);
  const [scheduleTick, setScheduleTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setScheduleTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const validation = useMemo(
    () =>
      validateCart(cart, {
        items: liveItems,
        categories: liveCategories,
        timeZone: settings.timeZone,
        now: new Date(scheduleTick),
      }),
    // scheduleTick is an intentional dependency — it is what re-evaluates a
    // scheduled category whose window closes while the cart sits open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, liveItems, liveCategories, settings.timeZone, scheduleTick]
  );

  const isEmpty = cart.length === 0;
  const subtotal = getCartTotal(cart);
  /* Phase 23 — a restaurant can override its service charge % in Settings;
     null/unset means "use the platform default" (restaurant.serviceChargePercent). */
  const serviceChargePercent = settings.serviceChargePercent ?? restaurant.serviceChargePercent ?? 0;
  const serviceCharge = parseFloat((subtotal * serviceChargePercent / 100).toFixed(3));
  const total = parseFloat((subtotal + serviceCharge).toFixed(3));

  function handleQuantityChange(cartItemId, nextQty) {
    const updated = updateCartItemQuantity(cartItemId, nextQty);
    setCart(updated);
  }

  function handleRemove(cartItemId) {
    const updated = removeCartItem(cartItemId);
    setCart(updated);
    setToastMessage(t("customer.itemRemoved", "Item removed"));
    setToastVisible(true);
  }

  /* Phase 33 — the "Clear cart (demo only)" footer button was removed from
     this screen (customer-reachable destructive action). clearCustomerCart
     is still imported and used below by the real checkout flow, which empties
     the cart once an order has actually been created. */

  /* Phase 37 — the ONLY path that reprices a line, and it runs solely from
     the guest tapping "Update Price". Nothing reprices silently. */
  function handleAcceptPrice(cartItemId) {
    const result = validation.byLine[cartItemId];
    if (!result || result.currentUnitPrice === null) return;

    setCart(
      applyCurrentPricing(cartItemId, {
        basePrice: result.currentBasePrice,
        unitPrice: result.currentUnitPrice,
        selectedChoices: result.currentChoices,
        selectedPaidAddOns: result.currentAddOns,
      })
    );
    setToastMessage(t("cart.priceUpdated", "Price updated"));
    setToastVisible(true);
  }

  function handlePayClick() {
    /* Cheap guard so the sheet cannot even be opened over a stale cart; the
       authoritative check still runs at the mutation itself. */
    if (!validation.canCheckout) {
      setToastMessage(t("cart.reviewChanges", "Please review the changes in your cart before continuing."));
      setToastVisible(true);
      return;
    }
    setPaymentModalOpen(true);
  }

  /* Called when the customer picks a method and taps Place order. Creates the
     order from the current cart + totals + payment method, clears the cart,
     and navigates to the confirmation screen.

     Phase 34 — this is the REAL final mutation point, so the authoritative
     lock lives here rather than only on the button that happens to call it.
     `cart.length === 0` was never sufficient: `cart` comes from the render
     closure, so two clicks in the same tick both read the same non-empty
     array and both passed. The ref below flips synchronously inside the first
     call, so the second returns before reaching createCustomerOrder.

     Returns {ok:boolean} so the payment sheet knows whether to release its
     own lock and let the guest retry. */
  function handlePaymentContinue(paymentPayload) {
    if (createLock.current) return { ok: false };
    if (cart.length === 0) return { ok: false };

    createLock.current = true;

    /* ── Phase 37: authoritative pre-order revalidation ──────────────────
       Deliberately re-reads the menu from storage rather than trusting the
       hook's state or the memo above. Both could be seconds stale, and this
       is exactly the window that matters: the guest opens the payment sheet,
       an admin reprices or 86s the dish, the guest taps Place order. Reading
       fresh here means even a tab that has sat open for an hour cannot push a
       stale order through.

       On failure nothing is created and NOTHING is cleared — the lock is
       released, the sheet is closed, and the cart is left exactly as it was
       so the guest can resolve the issue and retry. */
    const freshValidation = validateCart(cart, {
      items: getMenuItems(restaurant.slug),
      categories: getCategories(restaurant.slug),
      timeZone: settings.timeZone,
      now: new Date(),
    });

    if (!freshValidation.canCheckout) {
      createLock.current = false;
      setPaymentModalOpen(false);
      setScheduleTick(Date.now()); // force the on-screen cart to re-reconcile
      setToastMessage(t("cart.reviewChanges", "Please review the changes in your cart before continuing."));
      setToastVisible(true);
      /* handled:true tells the payment sheet this was dealt with here, so it
         does not also raise its own generic error. */
      return { ok: false, handled: true };
    }

    let order;
    try {
      order = createCustomerOrder({
        restaurant: { ...restaurant, serviceChargePercent },
        table,
        qrToken,
        customerName: session.customerName,
        cartItems: cart,
        subtotal,
        serviceCharge,
        total,
        paymentMethod: paymentPayload,
        /* Phase 26 — read the estimate exactly once, here, at the instant the
           order is created, so it can be frozen onto the order. Deliberately
           NOT read from a hook/state higher up: that could hold a value from
           seconds earlier, and this number is a promise made to the guest. */
        estimatedPrepMinutes: getEstimatedPrepMinutes(restaurant.slug),
      });
    } catch {
      order = null;
    }

    /* Confirm the order is genuinely retrievable before touching the cart.
       saveCustomerOrders() swallows storage errors by design, so a full or
       unavailable localStorage would otherwise hand back a perfectly-formed
       order object that was never persisted — and we would clear the cart for
       an order that does not exist, stranding the guest on a "not found"
       confirmation with nothing to re-submit. Reading it back is the only
       honest test of "actually created". */
    const persisted = order?.orderId ? getOrderById(order.orderId) : null;

    /* Nothing was created — release the lock, leave the cart completely
       untouched, and let the guest try again. */
    if (!persisted) {
      createLock.current = false;
      return { ok: false };
    }

    /* Only now, once an order provably exists, is it safe to empty the cart. */
    clearCustomerCart();
    setCart([]);
    setPaymentModalOpen(false);
    onOrderCreated?.(order.orderId);
    return { ok: true };
  }

  return (
    <>
      <Topbar
        left={
          <button type="button" className="cart-back-btn" onClick={onBackToMenu}>
            <ArrowLeft size={16} strokeWidth={2.2} /> {t("customer.menu", "Menu")}
          </button>
        }
        right={<Logo variant="icon" size="nav" />}
      />

      <main className={`container ${!isEmpty ? "container--with-cart-bar" : ""}`}>
        <header className="cart-header anim-rise">
          <p className="cart-header__rest">{settings.name.trim() || restaurant.name}</p>
          <h1 className="cart-header__title">{t("orders.yourOrder", "Your order")}</h1>
          <p className="cart-header__meta">
            {t("customer.yourTable", "Table")} #{table.tableNumber} &middot; {session.customerName}
          </p>
        </header>

        {isEmpty ? (
          <EmptyCartView onBackToMenu={onBackToMenu} />
        ) : (
          <>
            {/* ── Line items ─────────────────────────────────────────── */}
            <div className="cart-lines anim-rise" style={{ animationDelay: "80ms" }}>
              {cart.map((line) => (
                <CartLineCard
                  key={line.cartItemId}
                  line={line}
                  restaurantSlug={restaurant.slug}
                  validation={validation.byLine[line.cartItemId]}
                  onQuantityChange={(q) => handleQuantityChange(line.cartItemId, q)}
                  onRemove={() => handleRemove(line.cartItemId)}
                  onAcceptPrice={() => handleAcceptPrice(line.cartItemId)}
                />
              ))}
            </div>

            {/* ── Order summary ──────────────────────────────────────── */}
            <Card className="cart-summary anim-rise" style={{ animationDelay: "140ms" }}>
              <h3 className="cart-summary__title">{t("orders.orderSummary", "Order summary")}</h3>
              <div className="cart-summary__row">
                <span>{t("common.subtotal", "Subtotal")}</span>
                <span>{fmtPrice(subtotal)}</span>
              </div>
              <div className="cart-summary__row">
                <span>{t("common.serviceCharge", "Service charge")} ({serviceChargePercent}%)</span>
                <span>{fmtPrice(serviceCharge)}</span>
              </div>
              <div className="cart-summary__divider" />
              <div className="cart-summary__row cart-summary__row--total">
                <span>{t("common.total", "Total")}</span>
                <span>{fmtPrice(total)}</span>
              </div>
            </Card>

          </>
        )}
      </main>

      {/* ── Sticky bottom payment bar ─────────────────────────────────── */}
      {!isEmpty && (
        <div className="cart-bottom-bar">
          <div className="cart-bottom-bar__inner">
            {/* Phase 37 — checkout is blocked while any line disagrees with
                the live menu, and the reason is stated rather than leaving a
                disabled button with no explanation. */}
            {validation.needsReview && (
              <p className="cart-bottom-bar__notice" role="status">
                <AlertTriangle size={13} strokeWidth={2.3} aria-hidden="true" />
                {t("cart.reviewChanges", "Please review the changes in your cart before continuing.")}
              </p>
            )}
            <div className="cart-bottom-bar__total">
              <span className="cart-bottom-bar__total-label">{t("common.total", "Total")}</span>
              <span className="cart-bottom-bar__total-value">{fmtPrice(total)}</span>
            </div>
            <Button size="lg" full onClick={handlePayClick} disabled={!validation.canCheckout}>
              {t("customer.continueToPayment", "Continue to payment")}
            </Button>
          </div>
        </div>
      )}

      <PaymentMethodModal
        open={paymentModalOpen}
        total={total}
        restaurantSlug={restaurant.slug}
        onClose={() => setPaymentModalOpen(false)}
        onContinue={handlePaymentContinue}
      />

      <Toast
        visible={toastVisible}
        message={toastMessage}
        onDone={() => setToastVisible(false)}
      />
    </>
  );
}

/* ── Cart line card ──────────────────────────────────────────────────────── */
/* Phase 37 — inline state for a line the live menu no longer agrees with.
   Blocking issues offer Remove; a price change offers Update Price with the
   old and new figures shown side by side, so the guest always sees exactly
   what they are accepting. */
function CartLineIssue({ result, onRemove, onAcceptPrice }) {
  const { t } = useLanguage();
  if (!result || result.issues.length === 0) return null;

  const has = (code) => result.issues.includes(code);

  if (result.blocking) {
    const message = has(CART_ISSUE.CATEGORY_SCHEDULED)
      ? t("cart.notAvailableAtThisTime", "Not available at this time")
      : has(CART_ISSUE.OPTION_MISSING)
      ? t("cart.optionsUnavailable", "Some selected options are no longer available")
      : t("cart.currentlyUnavailable", "Currently unavailable");

    return (
      <div className="cart-issue cart-issue--blocking" role="status">
        <span className="cart-issue__msg">
          <AlertTriangle size={14} strokeWidth={2.3} aria-hidden="true" />
          {message}
        </span>
        <Button variant="danger" size="sm" onClick={onRemove}>
          {t("common.remove", "Remove")}
        </Button>
      </div>
    );
  }

  /* Price-only change — resolvable in place. */
  return (
    <div className="cart-issue cart-issue--price" role="status">
      <span className="cart-issue__msg">
        <AlertTriangle size={14} strokeWidth={2.3} aria-hidden="true" />
        {t("cart.priceChanged", "Price changed")}
      </span>
      <span className="cart-issue__prices">
        <span className="cart-issue__old">
          {t("cart.previousPrice", "Previous")}: {fmtPrice(result.previousUnitPrice)}
        </span>
        <span className="cart-issue__new">
          {t("cart.currentPrice", "Now")}: {fmtPrice(result.currentUnitPrice)}
        </span>
      </span>
      <Button size="sm" onClick={onAcceptPrice}>
        {t("cart.updatePrice", "Update Price")}
      </Button>
    </div>
  );
}

function CartLineCard({ line, restaurantSlug, validation, onQuantityChange, onRemove, onAcceptPrice }) {
  const [imgErr, setImgErr] = useState(false);
  const { categories } = useMenuData(restaurantSlug);
  const category = categories.find((c) => c.id === line.categoryId);
  const emoji = category?.emoji || "🍽️";
  const useImg = !!line.imageUrl && !imgErr;
  const { t } = useLanguage();

  const hasRemovals = line.selectedRemovals?.length > 0;
  const hasChoices  = line.selectedChoices?.length > 0;
  const hasAddOns   = line.selectedPaidAddOns?.length > 0;
  const hasNotes    = !!line.notes?.trim();

  /* Group choices by groupName for a clean "Group: Option, Option" summary */
  const choicesByGroup = {};
  if (hasChoices) {
    for (const c of line.selectedChoices) {
      if (!choicesByGroup[c.groupName]) choicesByGroup[c.groupName] = [];
      choicesByGroup[c.groupName].push(c.optionName);
    }
  }

  const hasIssue = !!validation && validation.issues.length > 0;

  return (
    <Card className={`cart-line ${hasIssue ? "cart-line--flagged" : ""}`}>
      <div className="cart-line__top">
        <div className="cart-line__img-wrap">
          {useImg ? (
            <img
              className="cart-line__img"
              src={line.imageUrl}
              alt={line.name}
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="cart-line__emoji-wrap">
              <span className="cart-line__emoji">{emoji}</span>
            </div>
          )}
        </div>

        <div className="cart-line__info">
          <div className="cart-line__head">
            <p className="cart-line__name">{line.name}</p>
            <button
              type="button"
              className="cart-line__remove"
              onClick={onRemove}
              aria-label={`${t("common.remove", "Remove")} ${line.name}`}
            >
              <X size={15} strokeWidth={2.2} />
            </button>
          </div>

          {(hasRemovals || hasChoices || hasAddOns || hasNotes) && (
            <div className="cart-line__custom">
              {hasRemovals && (
                <p className="cart-line__custom-row">
                  <span className="cart-line__custom-label">{t("customer.noPrefix", "No")}:</span>{" "}
                  {line.selectedRemovals.join(", ")}
                </p>
              )}
              {Object.entries(choicesByGroup).map(([groupName, options]) => (
                <p className="cart-line__custom-row" key={groupName}>
                  <span className="cart-line__custom-label">{groupName}:</span>{" "}
                  {options.join(", ")}
                </p>
              ))}
              {hasAddOns && (
                <p className="cart-line__custom-row">
                  <span className="cart-line__custom-label">{t("common.extrasLabel", "Extras")}:</span>{" "}
                  {line.selectedPaidAddOns.map((a) => a.name).join(", ")}
                </p>
              )}
              {hasNotes && (
                <p className="cart-line__custom-row cart-line__custom-row--note">
                  <span className="cart-line__custom-label">{t("common.noteLabel", "Note")}:</span> {line.notes}
                </p>
              )}
            </div>
          )}

          <div className="cart-line__price-row">
            <span className="cart-line__unit-price">{fmtPrice(line.unitPrice)} {t("common.each", "each")}</span>
            <span className="cart-line__line-total">{fmtPrice(line.lineTotal)}</span>
          </div>
        </div>
      </div>

      <div className="cart-line__bottom">
        <QuantityStepper
          value={line.quantity}
          onChange={onQuantityChange}
          min={1}
          max={20}
        />
      </div>

      <CartLineIssue result={validation} onRemove={onRemove} onAcceptPrice={onAcceptPrice} />
    </Card>
  );
}

/* ── Empty cart state ────────────────────────────────────────────────────── */
function EmptyCartView({ onBackToMenu }) {
  const { t } = useLanguage();
  return (
    <div className="cart-empty anim-rise">
      <span className="cart-empty__icon">
        <ShoppingCart size={30} strokeWidth={1.7} />
      </span>
      <h2 className="cart-empty__title">{t("customer.yourCartEmpty", "Your cart is empty.")}</h2>
      <p className="cart-empty__sub">
        Browse the menu and add a few things you'd like to order.
      </p>
      <Button size="lg" icon={ArrowLeft} onClick={onBackToMenu}>
        {t("common.backToMenu", "Back to menu")}
      </Button>
    </div>
  );
}

/* ── Invalid QR view ─────────────────────────────────────────────────────── */
