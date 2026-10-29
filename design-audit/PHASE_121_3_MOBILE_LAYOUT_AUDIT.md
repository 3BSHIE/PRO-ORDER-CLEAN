# PRO-ORDER — Mobile Layout Audit (Phase 121.3 §9)

Read-only inspection. **Nothing outside the AI Chat was changed in this phase.**
Every item below is a finding to be scheduled, not work that has been done.

- **Branch / commit audited:** `develop`, working tree at Phase 121.3.
- **Engine:** Chromium (the Claude desktop app's built-in browser), viewport
  emulation only.
- **Not tested, and not claimed:** real iOS Safari, real Android Chrome, any
  physical device, any real on-screen keyboard, any real notch or home
  indicator. Several findings below are *about* those environments and were
  reached by reading the code, not by observing the device.

Emulated combinations actually exercised: **320×568, 360×640, 375×667,
375×812, 390×844, 430×932, 740×360 (landscape), 768×1024, 1024×768,
1280×800**, in **EN and AR**, in **Light and Dark**.

---

## A. How the sweep was run

For every screen, at each width, a probe walked `body *` and reported any
visible element whose box crossed the viewport edge, **excluding** elements
inside a deliberate horizontal scroller (the category strip, the chip row, the
admin nav strip), plus `documentElement.scrollWidth - innerWidth`.

**Result: `scrollWidth - innerWidth === 0` on every screen, at every width, in
both languages.** There is no horizontal overflow anywhere in PRO-ORDER today.
The owner's suspicion of a broad mobile problem is correct, but the problem is
not overflow — it is the three foundation items in §B.

---

## B. Foundation findings (whole app)

### B1 — `viewport-fit=cover` is missing, so every safe-area inset is inert on iOS
**Severity: High.  Scope: outside Phase 121.3.**

`index.html` declares:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

`global.css` contains **nine** rules that pad for the notch and the home
indicator with `env(safe-area-inset-*)` — the Cart FAB, the item sheet's
footer, the cart summary bar, the kitchen bar, the AI composer, the AI
recommendation viewer, the dev switcher.

On iOS Safari, `env(safe-area-inset-*)` resolves to **0** unless the viewport
meta carries `viewport-fit=cover`. Every one of those rules is therefore doing
nothing on exactly the devices it was written for.

- **Reproduce:** open any customer screen on a notched iPhone; the Cart FAB and
  the composer sit at the plain CSS offset, with no extra clearance for the
  home indicator.
- **Root cause:** the meta tag, `index.html:5`.
- **Recommended fix:** add `viewport-fit=cover` — **but not blindly**. Turning
  it on makes the layout viewport extend under the system bars, so every
  full-bleed fixed element (`.topbar`, `.menu-idbar`, `.aichat`, `.item-modal`)
  has to be re-checked for content sliding under the notch in landscape. This
  is a phase of its own, with real-device verification.
- **Why not fixed here:** the brief forbids changing a global mobile foundation
  unless it is necessary for the AI Chat and demonstrably safe for every other
  page. It is neither.

### B2 — Form fields below 16px will zoom the page on iOS focus
**Severity: High.  Scope: outside Phase 121.3.**

iOS Safari auto-zooms when a focused field's computed `font-size` is under
16px, and it does not zoom back out afterwards. Measured in the running app at
320×568:

| Surface | Field | Computed size |
|---|---|---|
| Customer Menu (expanded header) | `.menu-search__input` | **14px** |
| Customer Menu (collapsed bar) | `.menu-search__input` | **13px** |
| Admin / Cashier login | `.input` ×2 | **14px** |
| Admin Menu, Tables | search, `.mm-select` | **13.5px / 13px** |
| Restaurant Settings | ~45 fields: `.input`, `.mm-textarea`, `.mm-select`, `.wh-time`, colour hex | **13–14px** |
| Staff Ordering | `.so-search__input` | **13.5px** |

The one field that is already correct is the AI composer, `.aichat__input`, at
**16px** — it was written that way deliberately and is unaffected.

- **Reproduce:** tap the menu search field on an iPhone; the page scales up and
  stays there.
- **Root cause:** per-component font sizes in `global.css`.
- **Recommended fix:** set `font-size:16px` on every focusable field at mobile
  widths (a `@media (max-width: 767.98px)` block over `input, textarea, select`
  is the smallest safe change) and compensate the visual size with padding
  where the design needs a smaller control. This changes the look of the Admin
  forms, so it needs owner approval.

### B3 — Virtual-keyboard behaviour is undefined (`interactive-widget` unset)
**Severity: Medium.  Scope: outside Phase 121.3 — but it is the one that most
affects the AI Chat.**

The viewport meta sets no `interactive-widget`, so the default
`resizes-visual` applies: on Android Chrome the on-screen keyboard does **not**
shrink the layout viewport, and a `position:fixed` surface keeps its full
height behind the keyboard. The AI Chat panel is `position:fixed`, so its
composer may be covered while the guest types. `interactive-widget=resizes-content`
would fix it, and would simultaneously change every other fixed surface in the
app (the cart bar, the item sheet footer, the kitchen bar).

- **Reproduce:** needs a real Android device. **Not observed — inferred from
  the code.** Stated as suspected, not confirmed.
- **Recommended fix:** evaluate `interactive-widget=resizes-content` together
  with B1 in one viewport-foundation phase, verified on real hardware.

### B4 — `100vh` usage: checked, and not a problem
**Severity: Low (informational).**

Seven `100vh` occurrences. Six are `min-height` on page shells
(`.app`, `.access`, `.kitchen-login`, `.admin-login`, `.access--recovery`),
where mobile Safari's large-viewport `vh` costs at most a little extra scroll.
The two `height: calc(100vh - …)` uses (`.ad-sidebar`, `.so-cart`) are both
inside desktop media queries. The modals already ship the `vh` → `dvh` pair.
**No action recommended.**

---

## C. Screen-by-screen results

`docX` = `documentElement.scrollWidth - innerWidth`. `off` = elements crossing
the viewport edge outside a horizontal scroller.

### Customer

| Screen | Viewports | docX | off | Observation |
|---|---|---|---|---|
| Welcome / Entry | 320×568 | 0 | — | Clean, EN + AR |
| Expanded Menu | 320×568, 390×844 | 0 | — | Clean. See C1 |
| Collapsed Menu | 320×568 scrolled | 0 | — | Fixed identity bar at top 55, 46 tall; no overlap |
| Product Details | 320×568 | 0 | — | Sheet 523px in a 568px viewport, internally scrollable (1152/521), footer reachable |
| Cart | 320×568 | 0 | — | Clean, with and without lines |
| Payment Method | 320×568 | 0 | — | Both methods and Place Order visible without scrolling |
| Order Confirmation | 320×568 | 0 | — | Clean |
| Order Tracking | 320×568 | 0 | — | Clean |
| My Orders | 320×568 | 0 | — | Clean (empty state) |
| Restaurant Info sheet | 320×568 | 0 | — | Clean |
| AI Chat | all ten | 0 | — | Rebuilt this phase; measurements in the phase report |

**C1 — The Customer topbar wraps to two rows below ~375px.**
*Severity: Medium. Scope: outside Phase 121.3 (existing Phase 120.0 behaviour).*
Measured height of `.topbar`: **61px at 375px and above, 109px at 320px, 113px
at 360px** — it wraps because `.topbar__inner` is allowed to wrap under 640px
and the four controls (brand mark, Call Staff, My Orders, EN|AR) no longer fit
on one line. It was invisible before this phase because nothing depended on the
bar's height. It now does: the AI Chat starts at the bar's lower edge, so on a
360px phone — a very common size — the assistant loses 52px of panel height
compared with a 375px phone. The chat adapts correctly (it measures the bar
rather than assuming 61px), but the guest gets less room for no good reason.
**Recommended fix:** on the Customer Menu only, keep the four controls on one
line under 375px — the Phase 120.0 note says the labels were restored because
four controls fit at 320px, and that is true at 61px but is not what the bar
currently does. Needs owner approval; it changes the menu header.

**C2 — Nothing signals that the category strip scrolls.**
*Severity: Low. Scope: outside Phase 121.3.*
`.menu-cats` is a horizontal scroller and at 320px the last category is cut
mid-word with no fade or indicator. The AI Chat's own chip row was given a
trailing mask for exactly this reason this phase; the same treatment would suit
the category strip.

### Operations

| Screen | Viewports | docX | off | Observation |
|---|---|---|---|---|
| Admin login | 320×568 | 0 | — | Clean; fields 14px (B2) |
| Admin Overview | 320×568 | 0 | — | Clean; KPI grid drops to one column under 380px |
| Admin Live Orders | 320×568 | 0 | — | Clean (empty state) |
| Admin Staff Calls | 320×568 | 0 | — | Clean, one open call rendered |
| Admin Menu | 320×568 | 0 | — | Clean |
| Admin Categories | 320×568 | 0 | — | Clean |
| Admin Feedback | 320×568 | 0 | — | Clean (empty state) |
| Admin Tables & Access | 320×568 | 0 | — | Clean |
| Restaurant Settings | 320×568 | 0 | — | Clean; ~45 fields under 16px (B2) |
| Staff Ordering (Direct Order) | 320×568, 390×844 | 0 | — | Clean |
| Cashier (all six screens) | 390×844 | 0 | — | Clean |
| Kitchen board — phone portrait | 320×568 | 0 | — | Three lanes stack as pills; clean |
| Kitchen board — landscape | 740×360 | 0 | — | Lanes side by side, no vertical overflow |
| Kitchen board — desktop | 1280×800 | 0 | — | Clean |

**C3 — The Admin/Cashier mobile nav strip gives no scroll affordance.**
*Severity: Low. Scope: outside Phase 121.3.*
Below the sidebar breakpoint the sidebar becomes a horizontal strip. At 320px
"Staff Calls" is cut mid-word at the right edge with no fade; at 390px its
unread badge is half-cut. Same remedy as C2.

**C4 — The Kitchen board was audited with zero live orders.**
*Severity: n/a — a gap in coverage, stated rather than glossed.*
There were no orders in this install, and creating a backlog of them would mean
writing order data, which this phase forbids. Lane headers, empty states and
the overall frame were checked at three viewports; **order-card density,
wrapping and overflow inside a full lane were not**. They should be re-checked
against a seeded board.

---

## D. Items inspected and found correct

- **Scroll-container ownership / nested scrolling.** One document scroller per
  screen. The only nested scrollers are deliberate and all carry
  `overscroll-behavior` containment: the item sheet body, the AI thread, the AI
  chip row, the recommendation track, the category strip.
- **Body scroll locking.** `useBodyScrollLock` is reference-counted and uses
  the fixed-body technique. Verified live: with the menu at scrollY 900 the
  chat opened (`body { position: fixed }`), the product sheet opened on top of
  it (one lock, not two), and on closing both the page returned to **exactly
  900**.
- **Sticky under the lock.** `.topbar` is `position: sticky; top: 0` inside a
  body that the lock moves to `top: -900px`. Measured: the bar still reports
  `top: 0` and its full height. This is what Phase 121.3 §1 depends on, and it
  was measured rather than assumed — in this engine. Not verified on iOS.
- **Stacking order.** topbar 50, collapsed identity bar 31, dev switcher 55,
  Cart FAB 150, AI Chat 160, product sheet 200. No two surfaces at the same
  level fight; the AI Chat deliberately sits above the FAB and below the sheet.
- **Orientation.** 740×360 and 1024×768 both re-laid out with no overflow; the
  AI Chat re-measures on `orientationchange`.
- **Focus traps.** None. The AI Chat does not trap focus (by design — the
  utility header above it must stay reachable); the product sheet and the
  confirmation dialog return focus to their opener.
- **Navigation restoration.** Leaving the menu with the chat open releases the
  lock (`position: static`), and returning restores the conversation rather
  than replaying the greeting.

---

## E. Summary, by where the work belongs

| # | Finding | Severity | Confirmed? | Inside 121.3? |
|---|---|---|---|---|
| B1 | `viewport-fit=cover` absent; 9 safe-area rules inert on iOS | High | Confirmed in code | No |
| B2 | ~55 form fields under 16px → iOS focus zoom | High | Confirmed by measurement | No |
| B3 | `interactive-widget` unset; keyboard may cover fixed composers | Medium | **Suspected**, not observed | No |
| C1 | Customer topbar wraps to 109–113px below 375px | Medium | Confirmed by measurement | No |
| C2 | Category strip has no scroll affordance | Low | Confirmed | No |
| C3 | Admin/Cashier mobile nav strip has no scroll affordance | Low | Confirmed | No |
| C4 | Kitchen board not audited with live orders | — | Coverage gap | No |
| B4 | `100vh` usage | Low | Checked, benign | No |

**Nothing in this list was changed.** B1, B2 and B3 belong together in one
viewport-foundation phase with real-device verification; C1 is a Customer Menu
header decision for the owner; C2 and C3 are small, safe polish.
