/**
 * customerCart — saves the current guest's cart in sessionStorage.
 *
 * Separate storage key from customerSession.js so cart and session can be
 * read/cleared independently, though CustomerMenuScreen clears both together
 * when the guest resets their session (see clearCustomerSession usage).
 *
 * Cart item structure (the "order item payload" future phases will reuse):
 *   {
 *     cartItemId,          // unique per cart line
 *     itemId,               // mockMenu.js item id
 *     categoryId,
 *     name, description, imageUrl,
 *     basePrice,            // item.price, unmodified
 *     unitPrice,            // basePrice + selected choice prices + selected add-on prices
 *     quantity,
 *     lineTotal,            // unitPrice * quantity
 *     selectedRemovals,     // string[] of ingredient names
 *     selectedChoices,      // [{ groupId, groupName, optionId, optionName, price }]
 *     selectedPaidAddOns,   // [{ id, name, price }]
 *     notes,                // string
 *     addedAt,              // ISO timestamp of first add
 *   }
 *
 * To swap storage later (server-side cart, DB-backed order draft):
 *   Replace only the functions below — callers only need get/save/clear/add.
 */

const CART_KEY = "pro_order_customer_cart";

/**
 * Retrieve the current cart as an array of cart items (never null).
 * @returns {Array<object>}
 */
export function getCustomerCart() {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist the full cart array.
 * @param {Array<object>} cart
 */
export function saveCustomerCart(cart) {
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // sessionStorage unavailable — fail silently
  }
}

/**
 * Clear the cart entirely.
 */
export function clearCustomerCart() {
  try {
    sessionStorage.removeItem(CART_KEY);
  } catch {
    // ignore
  }
}

/**
 * Build a signature that uniquely identifies "this exact customization" of an
 * item, so identical re-adds can merge by quantity instead of creating a new
 * line. Order-independent (sorted) so option-selection order never matters.
 */
function customizationSignature({ itemId, selectedRemovals, selectedChoices, selectedPaidAddOns, notes }) {
  const removals = [...selectedRemovals].sort().join("|");
  const choices = [...selectedChoices]
    .map((c) => `${c.groupId}:${c.optionId}`)
    .sort()
    .join("|");
  const addOns = [...selectedPaidAddOns]
    .map((a) => a.id)
    .sort()
    .join("|");
  const trimmedNotes = (notes || "").trim();
  return `${itemId}::${removals}::${choices}::${addOns}::${trimmedNotes}`;
}

let _cartItemSeq = 0;
function generateCartItemId() {
  return `cart_${Date.now()}_${++_cartItemSeq}`;
}

/**
 * Add a cart item, merging into an existing line if the same item was added
 * with the exact same customization (removals + choices + add-ons) and notes.
 *
 * @param {object} newItem — cart item shape minus cartItemId/addedAt (added here)
 * @returns {Array<object>} the updated cart (also persisted to sessionStorage)
 */
export function addCartItem(newItem) {
  const cart = getCustomerCart();
  const newSig = customizationSignature(newItem);

  const existingIndex = cart.findIndex(
    (line) => customizationSignature(line) === newSig
  );

  let nextCart;
  if (existingIndex !== -1) {
    // Merge: bump quantity, recalculate lineTotal, keep original cartItemId/addedAt
    nextCart = cart.map((line, i) => {
      if (i !== existingIndex) return line;
      const quantity = line.quantity + newItem.quantity;
      return {
        ...line,
        quantity,
        lineTotal: parseFloat((line.unitPrice * quantity).toFixed(3)),
      };
    });
  } else {
    // New line
    const cartItem = {
      ...newItem,
      cartItemId: generateCartItemId(),
      addedAt: new Date().toISOString(),
    };
    nextCart = [...cart, cartItem];
  }

  saveCustomerCart(nextCart);
  return nextCart;
}

/**
 * Sum of all cart line totals.
 * @param {Array<object>} cart
 * @returns {number}
 */
export function getCartTotal(cart) {
  return cart.reduce((sum, line) => sum + (line.lineTotal || 0), 0);
}

/**
 * Sum of all cart item quantities (for the FAB count badge).
 * @param {Array<object>} cart
 * @returns {number}
 */
export function getCartItemCount(cart) {
  return cart.reduce((sum, line) => sum + (line.quantity || 0), 0);
}

/**
 * Update a single cart line's quantity and recalculate its lineTotal.
 * Used by the cart page's QuantityStepper on each line.
 * @param {string} cartItemId
 * @param {number} quantity — new quantity (caller is responsible for clamping ≥1)
 * @returns {Array<object>} the updated cart (also persisted)
 */
export function updateCartItemQuantity(cartItemId, quantity) {
  const cart = getCustomerCart();
  const nextCart = cart.map((line) =>
    line.cartItemId === cartItemId
      ? { ...line, quantity, lineTotal: parseFloat((line.unitPrice * quantity).toFixed(3)) }
      : line
  );
  saveCustomerCart(nextCart);
  return nextCart;
}

/**
 * Remove a single cart line entirely.
 * @param {string} cartItemId
 * @returns {Array<object>} the updated cart (also persisted)
 */
export function removeCartItem(cartItemId) {
  const cart = getCustomerCart();
  const nextCart = cart.filter((line) => line.cartItemId !== cartItemId);
  saveCustomerCart(nextCart);
  return nextCart;
}
