import { useState, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { X, Check, AlertCircle } from "lucide-react";
import QuantityStepper from "../../../components/ui/QuantityStepper.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { fmtPrice } from "../../../lib/format.js";

/**
 * ItemDetailsModal — Phase 7.
 *
 * Fully data-driven customization on top of the base modal:
 *   - Removable ingredients (multi-select pills, no price impact)
 *   - Choice groups (radio when maxSelections===1, checkbox otherwise;
 *     required groups are validated before the primary button proceeds)
 *   - Paid add-ons (multi-select rows, each adds its price per unit)
 *
 * Everything rendered here comes from item.removableIngredients / item.choices /
 * item.paidAddOns — no option label, price, or required/maxSelections rule is
 * hardcoded. This is what lets a future Admin Product Management screen edit
 * these fields and have the customer modal reflect changes automatically.
 *
 * The primary button ("Add to cart") now passes a fully-resolved selections
 * payload (names + prices captured at add-time) to the parent, which builds
 * the real cart item and saves it via src/lib/customerCart.js. This modal
 * itself still holds no cart state — it only resolves and hands off.
 *
 * Unavailable items are still read-only: no customization, no quantity, no
 * notes — just the Out of Stock note and a Close button (unchanged).
 *
 * Props:
 *   item              — menu item object (mockMenu.js shape) or null
 *   category          — the item's category object (for emoji fallback), or null
 *   open              — boolean, controls visibility
 *   onClose           — () => void
 *   onPlaceholderAdd  — (item, quantity, notes, selections) => void — primary button.
 *                       selections = { selectedRemovals, selectedChoices, selectedPaidAddOns }
 */
export default function ItemDetailsModal({
  item,
  category,
  open,
  onClose,
  onPlaceholderAdd,
}) {
  const [quantity,   setQuantity]   = useState(1);
  const [notes,      setNotes]      = useState("");
  const [imgErr,     setImgErr]     = useState(false);

  /* removedIds: Set of removableIngredients strings the guest wants left out */
  const [removedIds, setRemovedIds] = useState(() => new Set());
  /* choiceSelections: { [choiceGroupId]: string[] of selected option ids } */
  const [choiceSelections, setChoiceSelections] = useState({});
  /* addOnIds: Set of selected paidAddOns ids */
  const [addOnIds,   setAddOnIds]   = useState(() => new Set());
  /* choiceErrors: { [choiceGroupId]: true } for required groups missing a selection */
  const [choiceErrors, setChoiceErrors] = useState({});
  const { t } = useLanguage();

  /* Phase 35 — the modal element itself is the scroll container
     (.item-modal has overflow-y:auto), and each required group registers its
     section here so a failed validation can bring the right one into view. */
  const modalRef = useRef(null);
  const groupRefs = useRef({});

  /* Reset all local state whenever a different item is opened */
  useEffect(() => {
    if (open) {
      setQuantity(1);
      setNotes("");
      setImgErr(false);
      setRemovedIds(new Set());
      setChoiceSelections({});
      setAddOnIds(new Set());
      setChoiceErrors({});
    }
  }, [open, item?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* ── Price math (must run before any early return — hooks rule) ──────── */
  const choices    = item?.choices || [];
  const paidAddOns = item?.paidAddOns || [];

  const addOnsTotal = useMemo(() => {
    return paidAddOns
      .filter((a) => addOnIds.has(a.id))
      .reduce((sum, a) => sum + (a.price || 0), 0);
  }, [paidAddOns, addOnIds]);

  const choicesTotal = useMemo(() => {
    let sum = 0;
    for (const group of choices) {
      const selected = choiceSelections[group.id] || [];
      for (const optId of selected) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt?.price) sum += opt.price;
      }
    }
    return sum;
  }, [choices, choiceSelections]);

  const unitPrice  = (item?.price || 0) + addOnsTotal + choicesTotal;
  const total      = unitPrice * quantity;
  const extrasUnit = addOnsTotal + choicesTotal;

  if (!open || !item) return null;

  const available = item.isAvailable;
  const useImg    = !!item.imageUrl && !imgErr;
  const emoji     = category?.emoji || "🍽️";

  /* ── Handlers ──────────────────────────────────────────────────────────── */
  function toggleRemoved(ingredient) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.has(ingredient) ? next.delete(ingredient) : next.add(ingredient);
      return next;
    });
  }

  function selectSingle(groupId, optionId) {
    setChoiceSelections((prev) => ({ ...prev, [groupId]: [optionId] }));
    setChoiceErrors((prev) => ({ ...prev, [groupId]: false }));
  }

  function toggleMulti(groupId, optionId, maxSelections) {
    setChoiceSelections((prev) => {
      const current = prev[groupId] || [];
      let next;
      if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId);
      } else {
        if (current.length >= maxSelections) return prev; // cap reached
        next = [...current, optionId];
      }
      return { ...prev, [groupId]: next };
    });
    setChoiceErrors((prev) => ({ ...prev, [groupId]: false }));
  }

  function toggleAddOn(id) {
    setAddOnIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /* Validates every required group (so all invalid ones get marked), but also
     reports the FIRST one in display order — that is the only one the guest
     is sent to. `choices` is already in menu order, so "first" means the one
     highest up the modal. */
  function validateRequired() {
    const errors = {};
    let firstInvalidId = null;
    for (const group of choices) {
      if (group.required && (choiceSelections[group.id] || []).length === 0) {
        errors[group.id] = true;
        if (!firstInvalidId) firstInvalidId = group.id;
      }
    }
    setChoiceErrors(errors);
    return { ok: !firstInvalidId, firstInvalidId };
  }

  /* Distance kept between the top of the scroll area and the group being
     revealed, so it never sits flush against the edge (or under the close
     button when we happen to land near the top of the sheet). */
  const SCROLL_MARGIN = 64;

  /**
   * Phase 35 — bring a failed required group into view and move focus to it.
   *
   * Scrolls the MODAL's own scroll container by adjusting its scrollTop
   * directly, rather than calling element.scrollIntoView(): scrollIntoView
   * walks up and scrolls every scrollable ancestor, which would also move the
   * page behind the sheet. This touches nothing but the sheet.
   *
   * Runs synchronously, immediately after flushSync has committed the error
   * to the DOM (see handleAddClick). Measuring settled layout directly is
   * more dependable than deferring with requestAnimationFrame: rAF does not
   * fire at all while a tab is hidden, which would leave a returning customer
   * looking at an unscrolled sheet. Showing the error also shifts layout
   * above the viewport, and .item-modal sets overflow-anchor:none so the
   * browser's scroll-anchoring correction cannot fight the scroll we issue.
   *
   * focus() uses preventScroll so the browser does not add its own scroll on
   * top of ours.
   */
  function revealInvalidGroup(groupId) {
    const el = groupRefs.current[groupId];
    if (!el) return;

    const scroller = modalRef.current;
    if (scroller) {
      const scrollerRect = scroller.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const fullyVisible =
        elRect.top >= scrollerRect.top + SCROLL_MARGIN &&
        elRect.bottom <= scrollerRect.bottom;

      /* Only scroll when it is actually out of view — jumping the sheet when
         the group is already on screen would be disorienting. */
      if (!fullyVisible) {
        const target =
          scroller.scrollTop + (elRect.top - scrollerRect.top) - SCROLL_MARGIN;
        const top = Math.max(0, target);

        /* Smooth only when it will actually run and is wanted. A smooth
           scroll is driven by the rendering loop, so it does nothing while
           the document is hidden — and it is unwelcome under reduced-motion.
           In either case scroll instantly, because the guest seeing the
           problem matters more than the animation. */
        const prefersReducedMotion =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const canAnimate = document.visibilityState === "visible" && !prefersReducedMotion;

        scroller.scrollTo({ top, behavior: canAnimate ? "smooth" : "auto" });
      }
    }

    el.focus({ preventScroll: true });
  }

  function handleAddClick() {
    /* flushSync forces the error state to commit before the next line runs,
       so revealInvalidGroup measures a DOM that already contains the error
       paragraph. Without it React would batch the update and we would measure
       stale layout, scrolling to slightly the wrong place. */
    let result;
    flushSync(() => {
      result = validateRequired();
    });

    if (!result.ok) {
      revealInvalidGroup(result.firstInvalidId);
      return;
    }

    /* Resolve full structured payload — this is what makes the cart item
       reusable later as the order-item payload for kitchen/admin/tracking.
       Names and prices are captured now so future menu edits never change
       what a customer already ordered. */
    const selectedRemovals = Array.from(removedIds);

    const selectedChoices = [];
    for (const group of choices) {
      const selected = choiceSelections[group.id] || [];
      for (const optId of selected) {
        const opt = group.options.find((o) => o.id === optId);
        if (!opt) continue;
        selectedChoices.push({
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          optionName: opt.name,
          price: opt.price || 0,
        });
      }
    }

    const selectedPaidAddOns = paidAddOns
      .filter((a) => addOnIds.has(a.id))
      .map((a) => ({ id: a.id, name: a.name, price: a.price || 0 }));

    onPlaceholderAdd?.(item, quantity, notes, {
      selectedRemovals,
      selectedChoices,
      selectedPaidAddOns,
    });
  }

  return (
    <div
      className="item-modal__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="item-modal" role="dialog" aria-modal="true" aria-label={item.name} ref={modalRef}>
        <div className="item-modal__handle" />

        <button
          type="button"
          className="item-modal__x"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} strokeWidth={2.4} />
        </button>

        {/* ── Image ─────────────────────────────────────────────────────── */}
        <div className="item-modal__img-wrap">
          {useImg ? (
            <img
              className="item-modal__img"
              src={item.imageUrl}
              alt={item.name}
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="item-modal__emoji-wrap">
              <span className="item-modal__emoji">{emoji}</span>
            </div>
          )}
          {!available && (
            <span className="item-modal__oos-badge">{t("common.outOfStock", "Out of Stock")}</span>
          )}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="item-modal__body">
          {(item.isPopular || item.isFeatured) && (
            <div className="item-modal__badges">
              {item.isPopular && <span className="badge badge--gold">{t("customer.popular", "Popular")}</span>}
              {item.isFeatured && <span className="badge badge--received">{t("customer.featured", "Featured")}</span>}
            </div>
          )}

          <h2 className="item-modal__name">{item.name}</h2>
          <p className="item-modal__desc">{item.description}</p>
          <div className="item-modal__price">{fmtPrice(item.price)}</div>

          {!available ? (
            <div className="item-modal__oos-note">
              {t("customer.itemUnavailableMsg", "This item is currently unavailable. Check back later or ask your server for today's options.")}
            </div>
          ) : (
            <>
              {/* ── Removable ingredients ─────────────────────────────── */}
              {item.removableIngredients?.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="cust-section">
                    <h3 className="cust-section__title">{t("customer.removeIngredients", "Remove ingredients")}</h3>
                    <p className="cust-section__hint">
                      {t("customer.removeIngredientsHint", "Tell the kitchen what to leave out.")}
                    </p>
                    <div className="cust-pills">
                      {item.removableIngredients.map((ing) => {
                        const active = removedIds.has(ing);
                        return (
                          <button
                            key={ing}
                            type="button"
                            className={`cust-pill ${active ? "cust-pill--active" : ""}`}
                            onClick={() => toggleRemoved(ing)}
                          >
                            {active && <Check size={12} strokeWidth={3} />}
                            {t("customer.noPrefix", "No")} {ing}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* ── Choice groups ─────────────────────────────────────── */}
              {choices.map((group) => {
                const isSingle  = group.maxSelections === 1;
                const selected  = choiceSelections[group.id] || [];
                const hasError  = !!choiceErrors[group.id];
                const titleId   = `cust-${group.id}-title`;
                const errorId   = `cust-${group.id}-error`;
                return (
                  <div key={group.id}>
                    <div className="divider" />
                    {/* Phase 35 — the focus/scroll target for a failed
                        required group. role="group" + aria-labelledby means a
                        screen reader announces the group's name when focus
                        lands here, and aria-describedby adds the reason. */}
                    <div
                      className={`cust-section ${hasError ? "cust-section--invalid" : ""}`}
                      ref={(el) => { groupRefs.current[group.id] = el; }}
                      tabIndex={-1}
                      role="group"
                      aria-labelledby={titleId}
                      aria-invalid={hasError || undefined}
                      aria-describedby={hasError ? errorId : undefined}
                    >
                      <div className="cust-section__head">
                        <h3 className="cust-section__title" id={titleId}>{group.name}</h3>
                        {group.required ? (
                          <span className="badge badge--gold cust-req-badge">{t("common.required", "Required")}</span>
                        ) : (
                          <span className="cust-section__optional">{t("common.optional", "Optional")}</span>
                        )}
                      </div>
                      {!isSingle && (
                        <p className="cust-section__hint">
                          {t("customer.chooseUpTo", "Choose up to")} {group.maxSelections}.
                        </p>
                      )}
                      <div className="cust-options">
                        {group.options.map((opt) => {
                          const isChecked = selected.includes(opt.id);
                          const capped =
                            !isSingle &&
                            !isChecked &&
                            selected.length >= group.maxSelections;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={capped}
                              /* Selection state announced, not conveyed by the
                                 visual mark alone. */
                              aria-pressed={isChecked}
                              className={`cust-option ${isChecked ? "cust-option--active" : ""} ${
                                isSingle ? "cust-option--radio" : "cust-option--checkbox"
                              }`}
                              onClick={() =>
                                isSingle
                                  ? selectSingle(group.id, opt.id)
                                  : toggleMulti(group.id, opt.id, group.maxSelections)
                              }
                            >
                              <span className="cust-option__mark" aria-hidden="true" />
                              <span className="cust-option__name">{opt.name}</span>
                              {opt.price > 0 && (
                                <span className="cust-option__price">
                                  +{fmtPrice(opt.price)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {hasError && (
                        <p className="cust-section__error" id={errorId} role="alert">
                          <AlertCircle size={13} strokeWidth={2.4} aria-hidden="true" />
                          {t("customer.selectOptionRequired", "Please select an option for")} {group.name.toLowerCase()}.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ── Paid add-ons ──────────────────────────────────────── */}
              {paidAddOns.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="cust-section">
                    <h3 className="cust-section__title">{t("customer.addExtras", "Add extras")}</h3>
                    <div className="cust-addons">
                      {paidAddOns.map((addOn) => {
                        const isChecked = addOnIds.has(addOn.id);
                        return (
                          <button
                            key={addOn.id}
                            type="button"
                            className={`cust-addon ${isChecked ? "cust-addon--active" : ""}`}
                            onClick={() => toggleAddOn(addOn.id)}
                          >
                            <span className="cust-addon__mark" aria-hidden="true" />
                            <span className="cust-addon__name">{addOn.name}</span>
                            <span className="cust-addon__price">
                              +{fmtPrice(addOn.price)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <div className="divider" />

              {/* Quantity */}
              <div className="item-modal__row">
                <span className="item-modal__row-label">{t("common.quantity", "Quantity")}</span>
                <QuantityStepper value={quantity} onChange={setQuantity} min={1} max={20} />
              </div>

              {/* Special instructions */}
              <label className="field item-modal__notes">
                <span className="field__label">{t("customer.specialNotes", "Special notes")}</span>
                <textarea
                  className="item-modal__textarea"
                  placeholder="e.g. no onions, extra sauce…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </label>

              <div className="divider" />

              {/* Price breakdown + total */}
              <div className="item-modal__breakdown">
                <div className="item-modal__breakdown-row">
                  <span>{t("customer.basePrice", "Base price")}</span>
                  <span>{fmtPrice(item.price)}</span>
                </div>
                {extrasUnit > 0 && (
                  <div className="item-modal__breakdown-row">
                    <span>{t("customer.extrasPerItem", "Extras (per item)")}</span>
                    <span>+{fmtPrice(extrasUnit)}</span>
                  </div>
                )}
                <div className="item-modal__breakdown-row">
                  <span>{t("common.quantity", "Quantity")}</span>
                  <span>× {quantity}</span>
                </div>
              </div>
              <div className="item-modal__total-row">
                <span className="item-modal__total-label">{t("common.total", "Total")}</span>
                <span className="item-modal__total-value">{fmtPrice(total)}</span>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="item-modal__actions">
            {available ? (
              <button
                type="button"
                className="btn btn--primary btn--lg btn--full"
                onClick={handleAddClick}
              >
                {t("customer.addToCart", "Add to cart")}
              </button>
            ) : (
              <button type="button" className="btn btn--outline btn--lg btn--full" onClick={onClose}>
                {t("common.close", "Close")}
              </button>
            )}
            {available && (
              <button
                type="button"
                className="btn btn--ghost btn--md btn--full"
                onClick={onClose}
              >
                {t("common.cancel", "Cancel")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
