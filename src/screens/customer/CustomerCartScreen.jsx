import { useState, useEffect } from "react";
import { ArrowLeft, ShoppingCart, RotateCcw, X } from "lucide-react";
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
  clearCustomerCart, getCartTotal,
} from "../../lib/customerCart.js";
import { createCustomerOrder } from "../../lib/customerOrders.js";
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

  function handleClearCart() {
    clearCustomerCart();
    setCart([]);
    setToastMessage(t("customer.cartCleared", "Cart cleared"));
    setToastVisible(true);
  }

  function handlePayClick() {
    setPaymentModalOpen(true);
  }

  /* Called when the customer picks a method and taps "Continue in next phase".
     Creates a real mock order from the current cart + totals + payment
     method, clears the cart, and navigates to the confirmation screen. */
  function handlePaymentContinue(paymentPayload) {
    if (cart.length === 0) return; // guard: nothing to order

    const order = createCustomerOrder({
      restaurant: { ...restaurant, serviceChargePercent },
      table,
      qrToken,
      customerName: session.customerName,
      cartItems: cart,
      subtotal,
      serviceCharge,
      total,
      paymentMethod: paymentPayload,
    });

    clearCustomerCart();
    setCart([]);
    setPaymentModalOpen(false);
    onOrderCreated?.(order.orderId);
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
                  onQuantityChange={(q) => handleQuantityChange(line.cartItemId, q)}
                  onRemove={() => handleRemove(line.cartItemId)}
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

            {/* ── Demo clear cart ─────────────────────────────────────── */}
            <div className="cart-demo-foot">
              <button type="button" className="menu-demo-clear" onClick={handleClearCart}>
                <RotateCcw size={12} strokeWidth={2.2} /> {t("common.clearCart", "Clear cart (demo only)")}
              </button>
            </div>
          </>
        )}
      </main>

      {/* ── Sticky bottom payment bar ─────────────────────────────────── */}
      {!isEmpty && (
        <div className="cart-bottom-bar">
          <div className="cart-bottom-bar__inner">
            <div className="cart-bottom-bar__total">
              <span className="cart-bottom-bar__total-label">{t("common.total", "Total")}</span>
              <span className="cart-bottom-bar__total-value">{fmtPrice(total)}</span>
            </div>
            <Button size="lg" full onClick={handlePayClick}>
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
function CartLineCard({ line, restaurantSlug, onQuantityChange, onRemove }) {
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

  return (
    <Card className="cart-line">
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
