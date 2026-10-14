# PRO·ORDER — Backend roadmap and deferred requirements

Written in Phase 112.0 (Staff Ordering, Direct Orders, Combined Bills) and
updated in Phase 112.1 (contextual combining, cross-table bills).

This file records what the current frontend-only architecture **cannot**
honestly provide, so that nothing in the product pretends otherwise and
nothing on this list is quietly forgotten. Both items below are **approved
future requirements**, not suggestions.

---

## Where the product actually stores things today

Everything PRO·ORDER knows lives in the browser:

| Data | Key | Scope |
|---|---|---|
| Orders | `pro_order_mock_orders` | localStorage — shared between tabs of **one browser** |
| Billing groups (combined bills) | `pro_order_billing_groups:<slug>` | same |
| Staff draft carts | `pro_order_staff_draft:<slug>:<staffId>:<contextId>` | same |
| Customer cart / session | sessionStorage | one tab |

That means: **two devices do not see the same data.** A cashier on a phone
and an admin on a laptop each have their own orders, their own bills and
their own drafts. Nothing in the UI claims otherwise, and nothing should be
added that implies it until the items below are built.

---

## A. Cross-device shared combined bills — DEFERRED

**Status: not implemented. Local to one browser.**

Combined bills are a settlement record. Two members of staff settling from
two devices is the normal case in a restaurant, and it is exactly the case a
browser cannot serve: there is no shared state, no locking, and no authority
to decide which of two conflicting writes is true.

A real implementation needs:

- **Authoritative server-side order records** — the orders a bill references
  must exist somewhere both devices read.
- **Shared billing-group persistence** — groups stored and read server-side,
  not per browser.
- **Role-based authorization on the server** — `staffOrders.create` and
  `bills.manage` are enforced in the UI today (see `src/lib/permissions.js`);
  the server must enforce them again, because a client check is a convenience,
  not a control.
- **Transactional grouping updates** — create / add / remove / separate /
  merge must each apply completely or not at all.
- **Atomic settlement** — marking a bill paid must settle every constituent
  order or none. `settleOrdersAsPaid()` in `src/lib/customerOrders.js` is
  deliberately written as one read → check-all → single write for this
  reason; it is the seam a real transaction replaces.
- **Idempotent payment handling** — a retried settlement must not collect
  twice. Today the guard is a synchronous UI lock plus an
  already-paid check; neither survives two devices.
- **Conflict / version control** — groups need a version or ETag so a stale
  client cannot overwrite a newer bill.
- **Server-side validation** — every eligibility rule in
  `src/lib/billingGroups.js` (unpaid, not canceled, has a table, one open
  group per order) must be re-checked server-side.
- **Real-time or near-real-time synchronisation** — so a bill settled at the
  counter disappears from the floor tablet without a refresh.
- **Auditable state changes** — who grouped, who removed, who settled, when.
  The group already records `createdBy` / `settledBy` / timestamps; the audit
  trail itself belongs on the server.

Until then the UI says so plainly, on every open bill: *"Combined bills are
stored on this device only."*

### A1. Multi-table billing groups (added in Phase 112.1)

A bill may now span more than one table — two parties who arrived together
and sat apart settle together — so the backend model must not assume one
table per group:

- **Groups span tables within one restaurant.** The restaurant is still the
  hard boundary; the table is not.
- **Table lineage lives on the ORDERS, not on the group.** `groupTables()`
  derives the involved tables from the member orders every time, and nothing
  rewrites an order's table. A server model must keep the same shape: an
  order taken at Table 03 stays at Table 03 in every report and on its
  kitchen ticket, whatever it is billed with.
- **Settlement freezes the lineage.** A settled group stores
  `tableSnapshot` so a receipt still names the tables it collected from even
  if a member is canceled afterwards. The server equivalent must be equally
  immutable.
- **Cross-table operations need explicit authorization and an audit record.**
  The client asks the operator to confirm whenever an operation introduces a
  NEW table into a bill (create, add, merge). The server must verify that
  such an operation was authorized rather than trusting the client's
  confirmation, and record who confirmed it.
- **Transaction safety is unchanged but now matters more:** a cross-table
  settlement touches orders that two different staff members may be looking
  at from two different tables.
- **Legacy compatibility:** groups written before 112.1 carry a single
  `tableId`/`tableNumber`. They are read correctly as single-table bills and
  are never rewritten; a migration must preserve that.

---

## B. Live connected devices per table — DEFERRED

**Status: not implemented. No count is shown anywhere.**

The roadmap calls for a small badge on each table button showing how many
devices/sessions are genuinely connected at that table right now.

It is **not** implemented because nothing available in the browser can answer
it truthfully. Old customer sessions, order history and QR scans all describe
the past; presenting any of them as "connected now" would be a number that
looks live and is not.

A truthful count needs:

- Server-side session/device presence records.
- Heartbeats (or an equivalent connectivity signal) from customer devices.
- Expiry handling, so a closed tab stops counting.
- Disconnect detection.
- De-duplication of device/session identities, so one guest refreshing is
  one device.
- Real-time propagation to staff screens.

**The sidebar is already shaped for it.** `StaffOrderingNav.jsx` renders each
table as a `position:relative` square, and `global.css` defines
`.so-tablebtn__badge` — a corner badge at the top inline-end of the button —
which **nothing renders today**. Adding the feature later is markup inside
that button plus a presence source; it is not a redesign of the sidebar.

---

## Smaller deferred notes from Phase 112.0

- **Order ids** are generated from a localStorage counter
  (`pro_order_mock_order_seq`). Two devices will mint the same id. Server-side
  id allocation is required before multi-device use.
- **Draft carts** are per browser as well as per staff member. A cashier who
  starts an order on a tablet cannot finish it on the till.
- **Payment methods** remain the two the product already supports (cash and
  card at the table). No gateway, no split tender, no partial payment of a
  combined bill — by design.
- **Staff orders are created unpaid** (Phase 112.1): taking an order is not
  collecting for it, so no method is recorded until someone settles the
  order or its bill. A server model should treat `paymentMethod: null` on an
  unpaid order as normal rather than as missing data.
- **Refunds do not exist.** Canceling a paid order records the cancellation
  and leaves the settlement intact; the product never claims money was
  returned. Any future refund flow is a new, explicit capability.
