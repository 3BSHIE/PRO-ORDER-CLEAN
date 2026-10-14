import { useState } from "react";
import { ChevronDown, Layers, Check, Scissors, Merge, Plus, X, Ban } from "lucide-react";
import Badge from "../../components/ui/Badge.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { fmtPrice } from "../../lib/format.js";
import { formatDateTime } from "../../i18n/dateFormat.js";
import { formatTableNumber, isStaffOrder } from "../../lib/staffOrdering.js";
import { resolveMethodLabel } from "../../lib/paymentLabels.js";
import { BILL_STATUS, groupOrders, groupTotal } from "../../lib/billingGroups.js";

/* ═══════════════════════════════════════════════════════════════════════════
   CombinedBillCard — Phase 112.0

   One bill, open or settled, as a single expandable card in the Live Orders
   list.

   ── WHAT THE CARD IS AND IS NOT ──────────────────────────────────────────
   It is a way of settling several orders at once. It is not an order, has no
   order id of its own, and contributes nothing to any count. Everything it
   shows about an unpaid bill is read from its member orders at render time —
   there is no second copy of a total here to drift from theirs.

   Expanding it lists those orders with their own ids, their own kitchen
   stages and their own line items, because grouping is a billing convenience
   and must never be a way of losing an order.

   ── SETTLED BILLS ────────────────────────────────────────────────────────
   Read-only, and deliberately so: the amount, the method, the moment and the
   membership are the record of money that changed hands. A member canceled
   afterwards is shown as canceled beside the settlement that still stands —
   a cancellation is not a refund, and this product does not invent one.
   ═══════════════════════════════════════════════════════════════════════ */

const STATUS_TONE = {
  received: "info",
  preparing: "warning",
  ready: "success",
  delivered: "neutral",
  canceled: "danger",
};

export default function CombinedBillCard({
  group,
  orders,
  /* Phase 112.1 — derived by the screen from the member orders, so a bill
     that spans two tables says so rather than borrowing one table's name. */
  tables = [],
  expanded,
  onToggle,
  /* An open bill is a drop target for an eligible order card. */
  dropActive = false,
  onDragOverCard,
  onDragLeaveCard,
  onDropCard,
  /* Every action is optional: a settled bill is handed none of them, which
     is what makes it read-only by construction rather than by a flag. */
  onAddOrder,
  onRemoveOrder,
  /* Phase 112.1 — the screen's own cancellation, offered on member rows so an
     order inside a bill is as cancelable as one in the list. The card decides
     nothing: it asks canCancelOrder() and calls onCancelOrder(). */
  canCancelOrder,
  onCancelOrder,
  onSeparate,
  onMerge,
  onSettle,
  addableOrders = [],
  mergeTargets = [],
  busy = false,
}) {
  const { t, language } = useLanguage();
  const [picking, setPicking] = useState(null); // "add" | "merge" | null

  const members = groupOrders(group, orders);
  const settled = group.status === BILL_STATUS.SETTLED;
  const total = groupTotal(group, orders);
  const multiTable = tables.length > 1;
  const tableLabel = tables.length === 0
    ? `${t("customer.yourTable", "Table")} ${formatTableNumber(group.tableNumber)}`
    : `${multiTable ? t("bill.tablesWord", "Tables") : t("customer.yourTable", "Table")} ${
        tables.map((tb) => formatTableNumber(tb.number)).join(" + ")
      }`;

  return (
    <article
      className={`ad-bill${settled ? " ad-bill--settled" : ""}${
        dropActive ? " ad-bill--drop" : ""
      }`}
      onDragOver={onDragOverCard ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "link"; onDragOverCard(); } : undefined}
      onDragLeave={onDragLeaveCard ? () => onDragLeaveCard() : undefined}
      onDrop={onDragOverCard ? (e) => { e.preventDefault(); onDropCard?.(); } : undefined}
    >
      <button
        type="button"
        className="ad-bill__head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="ad-bill__title">
          <Layers size={15} strokeWidth={2} aria-hidden="true" />
          {tableLabel}
          <span className="ad-bill__tag">
            {settled
              ? t("bill.paidCombinedBill", "Paid Combined Bill")
              : t("bill.combinedBill", "Combined Bill")}
          </span>
        </span>
        {/* The member ids, on the face of the card: a grouped order is still
            findable by the number printed on its receipt. */}
        <span className="ad-bill__ids">{group.orderIds.join(" · ")}</span>
        <span className="ad-bill__total">{fmtPrice(total)}</span>
        <ChevronDown
          className={`ad-bill__chev${expanded ? " ad-bill__chev--open" : ""}`}
          size={16}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="ad-bill__body">
          <div className="ad-bill__meta">
            <span>
              {t("bill.orders", "Orders")}: {group.orderIds.length}
            </span>
            {settled && (
              <>
                <span>
                  {t("payment.paymentMethod", "Payment method")}:{" "}
                  {resolveMethodLabel(t, group.paymentMethod)}
                </span>
                <span>
                  {t("bill.settledOn", "Paid on")}:{" "}
                  {formatDateTime(group.settledAt, language)}
                </span>
                {group.settledBy?.name && (
                  <span>
                    {t("bill.settledBy", "Settled by")}: {group.settledBy.name}
                  </span>
                )}
              </>
            )}
          </div>

          <ul className="ad-bill__members">
            {members.map((order) => (
              <li className="ad-bill__member" key={order.orderId}>
                <div className="ad-bill__member-head">
                  <span className="ad-bill__member-id">{order.orderId}</span>
                  {/* The order's OWN table, always — a bill never moves an
                      order to another table, and this is where that shows. */}
                  <span className="ad-bill__member-table">
                    {order.tableId
                      ? `${t("customer.yourTable", "Table")} ${formatTableNumber(order.tableNumber)}`
                      : t("staffOrder.directOrder", "Direct Order")}
                  </span>
                  <Badge tone={STATUS_TONE[order.status] || "neutral"}>
                    {t(`status.${order.status}`, order.status)}
                  </Badge>
                  {isStaffOrder(order) && (
                    <span className="ad-src">{t("staffOrder.staffBadge", "Staff")}</span>
                  )}
                  <span className="ad-bill__member-total">{fmtPrice(order.total)}</span>
                  {!settled && onRemoveOrder && (
                    <button
                      type="button"
                      className="so-line__btn so-line__btn--danger"
                      disabled={busy}
                      onClick={() => onRemoveOrder(order.orderId)}
                    >
                      <X size={12} strokeWidth={2.2} aria-hidden="true" />
                      {t("bill.removeFromBill", "Remove from bill")}
                    </button>
                  )}
                  {/* Rendered only when the order itself is cancelable, so a
                      delivered or already-canceled member shows nothing. */}
                  {onCancelOrder && canCancelOrder?.(order) && (
                    <button
                      type="button"
                      className="so-line__btn so-line__btn--danger"
                      disabled={busy}
                      onClick={() => onCancelOrder(order)}
                    >
                      <Ban size={12} strokeWidth={2.2} aria-hidden="true" />
                      {t("admin.cancelOrder", "Cancel Order")}
                    </button>
                  )}
                </div>
                <p className="ad-bill__member-lines">
                  {order.items.map((line) => `${line.quantity}× ${line.name}`).join(" · ")}
                </p>
                {/* A member canceled after the bill was settled. The money
                    stays recorded; the order's own state is told plainly. */}
                {settled && order.status === "canceled" && (
                  <p className="ad-bill__member-note">
                    {t("bill.canceledAfterPayment", "Canceled after payment")}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {settled ? (
            <p className="ad-bill__note">
              {t("bill.readOnly", "Settled bills are read-only.")}{" "}
              {members.some((o) => o.status === "canceled") &&
                t("bill.notRefund", "Canceling an order does not refund it. The settlement record is kept as it was.")}
            </p>
          ) : (
            <>
              {picking === "add" && (
                <div className="ad-bill__picker">
                  {addableOrders.length === 0 ? (
                    <p className="ad-bill__note">
                      {t("bill.selectHint", "Select two or more unpaid orders from the same table.")}
                    </p>
                  ) : (
                    addableOrders.map((order) => (
                      <button
                        type="button"
                        key={order.orderId}
                        className="so-line__btn"
                        disabled={busy}
                        onClick={() => { onAddOrder(order.orderId); setPicking(null); }}
                      >
                        <Plus size={12} strokeWidth={2.2} aria-hidden="true" />
                        {order.orderId} · {fmtPrice(order.total)}
                      </button>
                    ))
                  )}
                </div>
              )}

              {picking === "merge" && (
                <div className="ad-bill__picker">
                  {mergeTargets.length === 0 ? (
                    <p className="ad-bill__note">
                      {t("bill.needsTwo", "A combined bill needs at least two orders.")}
                    </p>
                  ) : (
                    mergeTargets.map((other) => (
                      <button
                        type="button"
                        key={other.id}
                        className="so-line__btn"
                        disabled={busy}
                        onClick={() => { onMerge(other.id); setPicking(null); }}
                      >
                        <Merge size={12} strokeWidth={2.2} aria-hidden="true" />
                        {other.orderIds.join(" · ")}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Said where a bill actually lives, once per bill, rather
                  than as a banner over the whole page: these groups are in
                  this browser and nowhere else (docs/BACKEND-ROADMAP.md). */}
              <p className="ad-bill__note">
                {t("bill.localOnly", "Combined bills are stored on this device only.")}
              </p>

              <div className="ad-bill__actions">
                <button
                  type="button"
                  className="so-line__btn"
                  disabled={busy}
                  onClick={() => setPicking(picking === "add" ? null : "add")}
                >
                  <Plus size={12} strokeWidth={2.2} aria-hidden="true" />
                  {t("bill.addOrder", "Add order")}
                </button>
                <button
                  type="button"
                  className="so-line__btn"
                  disabled={busy || mergeTargets.length === 0}
                  onClick={() => setPicking(picking === "merge" ? null : "merge")}
                >
                  <Merge size={12} strokeWidth={2.2} aria-hidden="true" />
                  {t("bill.merge", "Merge with another bill")}
                </button>
                <button
                  type="button"
                  className="so-line__btn"
                  disabled={busy}
                  onClick={onSeparate}
                >
                  <Scissors size={12} strokeWidth={2.2} aria-hidden="true" />
                  {t("bill.separate", "Separate bill")}
                </button>
                <button
                  type="button"
                  className="so-line__btn so-line__btn--pay"
                  disabled={busy}
                  onClick={onSettle}
                >
                  <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                  {t("bill.markPaid", "Mark bill as paid")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
