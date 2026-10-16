# PRO·ORDER — Backend roadmap and deferred requirements

Written in Phase 112.0 (Staff Ordering, Direct Orders, Combined Bills),
updated in Phase 112.1 (contextual combining, cross-table bills) and in
Phase 112.2 (restaurant logo upload and storage).

This file records what the current frontend-only architecture **cannot**
honestly provide, so that nothing in the product pretends otherwise and
nothing on this list is quietly forgotten. Every item below is an **approved
future requirement**, not a suggestion.

---

## Where the product actually stores things today

Everything PRO·ORDER knows lives in the browser:

| Data | Key | Scope |
|---|---|---|
| Orders | `pro_order_mock_orders` | localStorage — shared between tabs of **one browser** |
| Billing groups (combined bills) | `pro_order_billing_groups:<slug>` | same |
| Staff draft carts | `pro_order_staff_draft:<slug>:<staffId>:<contextId>` | same |
| Customer cart / session | sessionStorage | one tab |
| Uploaded restaurant logo (the image) | IndexedDB `pro_order_assets` → store `logos` | one browser |
| Which image is the logo (the reference) | `asset:<id>` in `settings.logoUrl` | one browser |

That means: **two devices do not see the same data.** A cashier on a phone
and an admin on a laptop each have their own orders, their own bills, their
own drafts — and their own uploaded logo. Nothing in the UI claims
otherwise, and nothing should be added that implies it until the items below
are built.

An uploaded logo is stored **locally only**. Uploading it on the office
laptop does not put it on the manager's phone, on the kitchen display, or on
any guest's device; those surfaces show the restaurant's name alone until
the same browser holds the image, or until item C below is built. This is
not synchronisation and must never be described as such.

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

## C. Server-side image upload and storage — DEFERRED (added in Phase 112.2)

**Status: local to one browser. No upload, no server, no sharing.**

Phase 112.2 lets a restaurant choose its logo from its own device instead of
having to host the file somewhere and paste a URL. What it does **not** do is
move that file anywhere. The image is validated and optimised in the browser,
written to this browser's IndexedDB asset store, and referenced from
`settings.logoUrl` as `asset:<id>`. A typed `http(s)` URL is still stored
and rendered exactly as before, and is never converted or migrated.

**What that costs today, stated plainly:**

- The logo appears **only in the browser that uploaded it.** Every other
  device — a second admin, the kitchen display, a guest's phone — shows the
  restaurant's name alone, because `asset:<id>` resolves to nothing there.
  That is a missing image, not a sync delay.
- Clearing site data removes the image. The reference survives in settings
  and resolves to nothing, so the surfaces fall back to name-only rather
  than showing a broken image.
- A printed QR stand or an exported PDF carries the logo only when it is
  produced on the browser that holds it.
- Storage is a browser quota, not a budget. A refused write is reported to
  the operator as a failure and the previously saved logo is left in place;
  the product never reports a save that did not happen.

A real implementation needs:

- **An upload endpoint with authorization.** Only a session holding
  `settings.manage` (see `src/lib/permissions.js`) may replace a
  restaurant's logo, and the server must enforce that rather than trusting
  the client, exactly as item A requires for bills.
- **Server-side validation, not client-side validation repeated.** The
  browser already refuses anything that is not a decodable PNG / JPEG /
  WebP within the size limit (`processLogoFile()` in
  `src/lib/restaurantLogoAssets.js`). The server must re-derive the real
  type from the bytes, cap the size and the dimensions, and refuse SVG and
  any other scriptable format — `isSafeImageSrc()` deliberately rejects
  `image/svg+xml` for the same reason and that decision must hold on the
  server too.
- **Server-side optimisation and derivative sizes.** The client currently
  produces one optimised raster bounded to 512px on its longest edge, keeps
  transparency, preserves the aspect ratio and **never upscales** — a 60px
  logo stays 60px. A server should keep those three rules and may add
  responsive derivatives (sidebar, header, print) so the 16mm QR-stand logo
  is not the same payload as the 24px topbar one.
- **Stable, opaque asset references.** `settings.logoUrl` already holds a
  reference rather than image bytes, which is the shape a server-backed
  store wants: the field becomes a server asset id or URL and every
  rendering surface — all of which now go through `<RestaurantLogo>` — keeps
  working without change.
- **Cross-device availability.** The image must be fetchable by every device
  that renders the restaurant: staff, kitchen, customer, and the print and
  PDF paths. This is the item that makes a logo uploaded in the office
  appear on the floor, and nothing before it does.
- **Replacement and deletion.** Replacing a logo must leave exactly one
  image in force and release the one it replaced; deleting the logo must
  clear the reference and release the bytes. The client does this only for
  assets it created in the same visit and only once a save or a discard has
  established which image is in force — a server needs the same
  "reference first, bytes second" ordering, so a half-finished upload never
  removes a logo that is still in use.
- **Caching and invalidation.** A content-addressed or versioned URL, so a
  replaced logo is not served from a cache after the change.
- **Backward compatibility.** Existing `http(s)` logo URLs must keep working
  untouched. There is no migration, and a destructive one must not be
  introduced: a restaurant that pasted a URL in 2025 should still see that
  URL in the field.
- **The same treatment for the other images.** Cover images and product
  images are still URL-only and were deliberately left alone by Phase 112.2.
  They are the obvious next users of this endpoint, and they are a separate,
  explicit piece of work — a cover image is a photograph with crop and focal
  behaviour of its own, not a logo.

**Not in scope and not implied:** this item is about the restaurant's own
logo (and later its cover and product images). The PRO·ORDER brand mark is a
shipped application asset, is not uploadable, and is not affected by any of
the above.

---

## D. Special Category uniqueness — DEFERRED (added in Phase 113.0)

**Status: enforced in the client only. Local to one browser.**

Phase 113.0 lets an Admin designate ONE category as the Special Category. The
rule is enforced inside a single write: `withSingleSpecial()` in
`src/lib/menuData.js` applies it to the whole category list before it is
saved, so storage never holds two designations, not even for the instant
between clearing the old one and setting the new one. The Admin confirmation
dialog parks the save until it is confirmed, so a cancelled replacement
writes nothing at all.

That is the right shape for a server to adopt, and it is still only a client.
Two Admins on two devices can each designate a different category and neither
will see the other. The designation does not synchronise.

A real implementation needs:

- **Server-side uniqueness.** A partial unique index (one special category
  per restaurant) or an equivalent constraint, enforced by the database
  rather than by the client that happens to write last.
- **Transactional replacement.** Clearing the previous designation and
  setting the new one must be one transaction, exactly as the single write
  is today.
- **Authorization.** Only a session holding `categories.edit` may change it;
  Cashier holds `categories.toggleAvailability` alone and must not gain this.
- **Conflict reporting.** When two Admins race, the loser should be told that
  the designation moved rather than silently overwriting it.
- **Legacy compatibility.** Categories written before this phase carry no
  `isSpecial` key and are read as ordinary. A server model must keep that
  reading rather than back-filling `false` across existing menus.

The designation is presentation only: it changes the category's position in
the customer strip and its chip styling, and nothing about products, prices,
availability or ordering. A backend does not need to reason about it beyond
storing it and keeping it unique.

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
