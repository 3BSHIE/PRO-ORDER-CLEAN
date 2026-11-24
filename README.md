# PRO·ORDER

A restaurant ordering and operations platform: guests order from the QR code
on their table, the kitchen works a live ticket board, and staff manage the
menu, orders, payments and settings from one place.

**Frontend only.** Everything persists in the browser — see
[Current limitations](#current-limitations) before reading anything here as
production-ready.

## Run it

```
npm install
npm run dev
```

Then open <http://localhost:5173>.

```
npm run build      # production build into dist/
npm run preview    # serve that build locally
```

## The four interfaces

| | Entry | What it is |
|---|---|---|
| **Customer** | the table's QR code | Welcome, menu, item details, cart, order confirmation, My Orders, live tracking, Customer Assistance ("Need Help?") and the Zaatar AI waiter preview |
| **Admin** | Staff Access sign-in | Dashboard, live orders, staff calls, menu and categories, tables and QR codes, revenue reports, staff ordering, settings |
| **Cashier** | the same Staff Access sign-in | A permission-restricted view of the above; the role is decided by the credentials |
| **Kitchen** | a PIN | The live ticket board and order status controls |

Each is reached through its own entry point. Nothing in the product
navigates between them.

## Routes

```
/                                                      entry guidance — scan the code on your table
/r/:restaurantSlug/table/:qrToken                      customer welcome (QR/NFC entry)
/r/:restaurantSlug/table/:qrToken/menu                 menu
/r/:restaurantSlug/table/:qrToken/cart                 cart
/r/:restaurantSlug/table/:qrToken/orders               my orders
    …/orders/:orderId/confirmation                     order confirmation
    …/orders/:orderId/tracking                         live tracking
/admin/:restaurantSlug                                 staff access → admin / cashier
/kitchen/:restaurantSlug                               kitchen PIN → board
/dev                                                   Developer Hub (development builds only)
anything else                                          "this page isn't available"
```

`/` and unknown routes show a small guidance screen. Neither links to any
operational interface, and neither invents a restaurant or a table.

## Developer Hub

Testing shortcuts live at `/dev`, separately from the product. It carries
links into every surface (through their real entry points), the AI card
preview flag, and the local reset utilities.

**On this machine:** `npm run dev`, then open <http://localhost:5173/dev>.

**From a phone, or behind a tunnel:** there are a few more steps and a real
security boundary to understand first.

→ **[dev-server/README.md](dev-server/README.md)** — phone access, the
one-time token, strict mode, tunnels, and token rotation.

Nothing in the product links to `/dev`, and no developer control appears on
any operational screen.

## Development vs production

`/dev`, the Developer Hub and the access gate exist **only in development
builds**. `import.meta.env.DEV` becomes the literal `false` at build time, so
the route is never registered and the Hub is dropped from the bundle; the
access plugin is `apply: "serve"` and has no build hooks at all.

In a production build, `/dev` is just another unknown address and shows the
same "this page isn't available" screen.

## Current limitations

These are real and worth being precise about:

- **No backend.** All data — menus, orders, carts, sessions, staff calls,
  settings — lives in the browser's `localStorage` / `sessionStorage`.
- **No cross-device sync.** Data is shared between **tabs of one browser on
  one origin** and with nothing else. A guest's order placed on their phone
  does **not** reach a cashier's tablet. Screens poll local storage every few
  seconds, which makes tabs agree; it does not make devices agree.
- **No real authentication.** Staff sign-in and the kitchen PIN are checked
  against local fixtures. They separate roles in the interface; they are not
  security.
- **Wi-Fi passwords and similar values** stored through Admin are plain text
  in the browser, readable by anyone with the device.
- **The AI waiter is a preview.** It is not connected to a model and
  recommends nothing on its own.

Shared, multi-device synchronisation and genuine authentication are backend
work and are not implemented.

## Stack

React 18 · Vite 5 · react-router-dom 6 · plain CSS (one stylesheet,
`src/theme/global.css`) · lucide-react icons. No test runner is configured.
