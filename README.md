# PRO·ORDER — Phase 1 (Routing + Table QR access)

Premium restaurant QR ordering SaaS — rebuild in progress.

This phase adds route-based navigation and the table-specific QR access gate.
Scanning a valid, active table token opens a table welcome; an unknown or
inactive token is turned away. No menu, cart, orders, admin or kitchen logic
exists yet — by design.

## Run

    npm install
    npm run dev

Then open http://localhost:5173

## Routes

    /                                     Demo home
    /kitchen                              Kitchen placeholder
    /admin                                Admin placeholder
    /r/:restaurantSlug/table/:qrToken     Customer QR access gate

Valid demo links:

    /r/lumiere/table/table-1-token        Welcome to Table #1
    /r/lumiere/table/table-2-token        Welcome to Table #2

Invalid demo links:

    /r/lumiere/table/broken-token         Unknown token  -> Invalid access
    /r/lumiere/table/table-4-token        Inactive table -> Invalid access
    /r/nope/table/table-1-token           Unknown slug   -> Invalid access

## Structure

    src/
      main.jsx
      App.jsx                              Router + route wrappers
      theme/global.css
      components/
        ui/    Button, Card, Badge, Input, Modal, Tabs
        brand/Wordmark.jsx
        layout/Topbar.jsx
      screens/
        HomeScreen.jsx                     3 cards + QR access test panel
        PlaceholderScreen.jsx              Kitchen / Admin placeholders
        customer/
          CustomerAccessScreen.jsx         QR validation + welcome / error
      data/
        surfaces.js
        mockRestaurant.js                  Restaurant + tables + validation

## ⚠️ Demo tools

`src/components/demo/DemoSwitcher.jsx` adds a small floating "wrench" button
(bottom-right) with quick links between customer and kitchen surfaces plus
optional destructive "clear storage" actions, for local manual testing only.

**Demo tools are for local testing only and must be disabled before production.**

To disable: set `SHOW_DEMO_TOOLS = false` at the top of `DemoSwitcher.jsx`
(or swap it for `import.meta.env.DEV`), or remove the `<DemoSwitcher />`
mount in `App.jsx` and delete the component entirely.
