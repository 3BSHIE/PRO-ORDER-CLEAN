# zaatar-mascot

Zaatar, the animated AI menu mascot, as a portable React source package: the approved artwork, the renderer, the approved choreography, the activity contract and the one-shot Acknowledging reaction.

```jsx
import { ZaatarMascot } from 'zaatar-mascot';

<div style={{ width: 240, height: 420 }}>
  <ZaatarMascot ref={mascot} activity="assistant_processing" />
</div>

mascot.current.acknowledge(); // after a successful Add to Cart
```

The host app says **what the assistant is doing**; the package decides how Zaatar shows it. The host never touches poses, image layers or timings, and Zaatar never sees message text, products or the cart.

Built and approved in ZAATAR-LAB (approved baseline `a53d679`, packaged in Stage 5.0). Read [PRO-ORDER-INTEGRATION.md](PRO-ORDER-INTEGRATION.md) before integrating into PRO-ORDER.

---

## Contents

1. [What's inside](#1-whats-inside)
2. [Requirements](#2-requirements)
3. [Installing](#3-installing)
4. [Rendering Zaatar](#4-rendering-zaatar)
5. [Activities](#5-activities)
6. [Acknowledging](#6-acknowledging)
7. [Interruptions](#7-interruptions)
8. [Size and position](#8-size-and-position)
9. [Product cards](#9-product-cards)
10. [Reduced motion](#10-reduced-motion)
11. [RTL and LTR](#11-rtl-and-ltr)
12. [Performance](#12-performance)
13. [API reference](#13-api-reference)
14. [Known visual limitations](#14-known-visual-limitations)
15. [Common mistakes](#15-common-mistakes)
16. [Verifying an integration](#16-verifying-an-integration)

---

## 1. What's inside

```
zaatar-mascot/
  package.json                 name, entry point, peer dependency (React)
  README.md                    this guide
  PACKAGE-MANIFEST.md          every file: purpose, required or not, dependencies
  PRO-ORDER-INTEGRATION.md     handoff requirements for the PRO-ORDER integration
  assets/                      13 approved WebP layers (generated, transparent)
  src/
    index.js                   public entry point: import only from here
    ZaatarMascot.jsx/.css      the component a host uses
    activities.js              activity → pose, event → reaction, priority rule
    usePrefersReducedMotion.js
    animation/                 choreography.js (approved timings), useDirector.js (state machine),
                               useReaction.js (one-shot reactions)
    character/                 ZaatarCharacter.jsx/.css (renderer), rig.js (geometry),
                               manifest.json and assetUrls.js (generated)
```

| Layer | Files | Role |
|---|---|---|
| A. Assets | `assets/*.webp` | The approved artwork, cut into body, tail and cane layers on one shared canvas |
| B. Rendering | `character/ZaatarCharacter.*`, `rig.js` | Draws all poses stacked, exposes the parts the director animates |
| C. State | `animation/useDirector.js` | Which pose is showing; runs one transition at a time, latest request wins |
| D. Choreography | `animation/choreography.js` | The approved timing and keyframes of every transition |
| E. Reactions | `animation/useReaction.js` | Acknowledging: play once, return to what is current |
| F. Public interface | `index.js`, `ZaatarMascot.jsx`, `activities.js` | Activities in, events out |
| G. Configuration and styling | `manifest.json`, `assetUrls.js`, `*.css` | Canvas geometry, layer URLs, loops |
| H. Documentation | the three `.md` files | |

Not included on purpose: the ZAATAR-LAB product card, chat demo, mock menu, cart, conversation scripts, Play Sequence and lab controls. The source artwork and the asset pipeline (`tools/prepare_assets.py`) stay in ZAATAR-LAB; they're needed only to regenerate the layers.

## 2. Requirements

| | Version | Notes |
|---|---|---|
| `react` | ≥ 18.2 | Tested with 18.3.1 and 19.3.1, including StrictMode. Peer dependency: the host's own React is used. |
| `react-dom` | same as `react` | Not imported by the package; the host already has it. |
| A bundler that handles `.jsx`, CSS imports, JSON imports and `new URL('./file', import.meta.url)` | | Tested: **Vite 8.3** (dev and production build). webpack 5 supports the same features but was not tested. |
| Browser | Chrome/Edge 105+, Safari 16+, Firefox 110+ | Uses the Web Animations API, CSS container query units and `aspect-ratio`. |

No other runtime dependencies, no network calls, no services.

## 3. Installing

Pick one. All three were tested in a fresh React 18 + Vite app outside ZAATAR-LAB.

**A. Copy the folder (recommended).** Copy `packages/zaatar-mascot/` into the host's source tree, for example `src/vendor/zaatar-mascot/`, and import its entry point:

```js
import { ZaatarMascot } from './vendor/zaatar-mascot/src/index.js';
```

The host compiles it like its own code. Nothing outside the folder is referenced.

**B. Install the packed archive.** In ZAATAR-LAB run `npm run package:mascot`; it writes `release/zaatar-mascot-1.0.0.tgz`. In the host:

```bash
npm install ./zaatar-mascot-1.0.0.tgz
```
```js
import { ZaatarMascot } from 'zaatar-mascot';
```

With Vite no extra configuration was needed. Frameworks that don't compile JSX inside `node_modules` (for example Next.js without `transpilePackages: ['zaatar-mascot']`) need that setting; option A avoids it.

**C. Serve the images yourself.** If the host's bundler can't resolve `new URL(..., import.meta.url)`, or the images should come from a CDN, copy `assets/*.webp` to a public folder and pass its URL:

```jsx
<ZaatarMascot assetBaseUrl="/zaatar" activity={activity} />
```

The bundler may still emit its own copy of the images (about 1.1 MB in the build output); browsers then download only the `assetBaseUrl` ones.

**Server rendering:** the component renders on the server without errors in principle (no `window` access during render), but SSR was not tested. In the Next.js App Router, render it from a Client Component (`'use client'`). In the Next.js Pages Router, global CSS can only be imported from `_app`; move the two CSS imports there.

## 4. Rendering Zaatar

```jsx
import { useRef, useState } from 'react';
import { ZaatarMascot } from 'zaatar-mascot';

function AssistantPanel() {
  const mascot = useRef(null);
  const [activity, setActivity] = useState('assistant_welcome');

  return (
    <div className="assistant-character">  {/* the host sizes this box */}
      <ZaatarMascot ref={mascot} activity={activity} />
    </div>
  );
}
```

- **Keep one instance mounted** for the whole conversation and move or resize its container. A remount starts him over from Idle (and replays the greeting if the activity is `assistant_welcome`).
- He mounts in **Idle** and moves to the requested activity as soon as all 13 layers are decoded (`onReady`). If the first activity is `assistant_welcome`, the approved greeting plays.
- The outer element is `aria-hidden="true"`: Zaatar is decorative. Announce the assistant's state in the chat itself.
- `data-pose` (`welcome`, `idle`, …), `data-status` (`loading`, `ready`, `error`) are set on the outer element for tests and styling.
- **On `onError`** (a layer failed to load) hide the mascot; the conversation must work without him.

## 5. Activities

| `activity` | When the host sends it | Zaatar | Persists |
|---|---|---|---|
| `assistant_welcome` | a new conversation, before the first message | Welcome | yes |
| `assistant_processing` | the request was sent; waiting for the answer | Thinking | yes |
| `assistant_responding` | the answer is arriving or being shown | Responding | yes |
| `assistant_recommending` | recommended dishes are on screen | Suggesting | yes |
| `assistant_idle` | waiting for the customer | Idle | yes |

Every pose holds until the activity changes; there are **no timers** in the package. Unknown values fall back to Idle.

```jsx
// Driven by the real chatbot lifecycle:
onSend      → setActivity('assistant_processing')
onFirstText → setActivity('assistant_responding')
onComplete  → setActivity(reply.products.length ? 'assistant_recommending' : 'assistant_idle')
```

- Send the activity the moment the event happens. Never delay text, products or ordering to let an animation finish.
- The package never decides an activity. Which dishes to recommend, and whether there are any, is the host's business.
- Reopening an existing conversation: keep its current activity (usually `assistant_idle`). Don't send `assistant_welcome` again.

The table lives in `src/activities.js` (`ZAATAR_POSE_FOR_ACTIVITY`).

## 6. Acknowledging

A short one-shot reaction, not an activity. Trigger it after a customer action **succeeds**:

```js
async function addToCart(item) {
  const ok = await cart.add(item);       // the host's own cart: unchanged, never waits for Zaatar
  if (ok) mascot.current?.acknowledge();
}
```

- `acknowledge()` returns `true` if the reaction started, `false` if it was skipped.
- **Plays once:** about 0.9 s from Idle, 1.0 s from Suggesting (750 ms hold plus the approved moves in and out).
- **Returns to the activity that is current when it ends,** not the one current when it started. If the recommendation is still on screen, that's Suggesting again.
- **Skipped** while the activity is `assistant_welcome` or `assistant_processing`: greeting and working on a reply take priority (`REACTION_BLOCKED_DURING`). The cart action itself is unaffected.
- **No stacking:** calls while it plays are ignored, so ten quick adds give one reaction.
- **The card stays up:** if it interrupts Suggesting, `onCardVisibleChange` stays `true` throughout.

Only use it for success. Don't call it for opening details, browsing, opening the cart, failed actions or ordinary messages. The event name for this in the contract is `cart_item_added` (`ZAATAR_REACTION_FOR_EVENT`).

## 7. Interruptions

Send activities as often as they change; don't debounce them or wait for `onSettled`.

- **A transition that has started always finishes** (about 0.6–0.8 s; cutting it halfway would show two poses at once). Then Zaatar goes **straight to the latest activity**. Activities sent in between are dropped, never queued.
- **A newer activity cancels Acknowledging.** For example, a new message during the reaction goes directly to Thinking; the old pose is not restored.
- `onPoseChange(pose)` fires at each pose change (the cut). `onSettled(pose)` fires when he has arrived and nothing else is pending. Use them for tests or analytics, not to gate the conversation.

## 8. Size and position

The host decides the size and place of the outer element; Zaatar fits inside it with his proportions kept and **his feet on its bottom edge**.

```css
.assistant-character { width: 100%; height: 360px; }              /* definite height */
.menu-header-mascot  { height: 96px; aspect-ratio: 0.539; }       /* or width/height + aspect-ratio */
```

- The container needs a **definite height** (or width plus `aspect-ratio`). With `height: auto` he renders at zero height: the component uses CSS size containment so it never pushes the host's layout around.
- `align="center" | "start" | "end"` places him horizontally when the container is wider than he is. `start`/`end` follow the host's text direction.
- His canvas is **0.539 wide per 1 tall** (`aspectRatio`). It includes **headroom for the raised cane**: in every pose except Suggesting the top 23.4–23.6% is empty (`figureTop`). Nothing is ever clipped, but in a short header he looks smaller than the box. If he never suggests in that context, you can let the transparent headroom overlap the content above:

  ```jsx
  import { figureTop } from 'zaatar-mascot';
  const visible = 64; // px of figure you want
  const height = visible / (1 - figureTop.idle);
  <div style={{ height, marginTop: visible - height }}><ZaatarMascot activity="assistant_idle" /></div>
  ```
- **Don't scale him beyond the artwork:** the canvas is 1548 px tall, so he stays sharp up to about 1548 device pixels (774 CSS px on a 2× screen).
- Don't put him inside an `overflow: hidden` element smaller than his box, and don't apply your own `transform: scale()` to him (use the container size).

The four future contexts (menu header, compact sticky header, full-screen welcome, split-screen conversation) are all just container sizes; the ZAATAR-LAB `#package` page shows each.

## 9. Product cards

Zaatar knows nothing about products. In Suggesting he raises his cane; the host renders its **own** card component above the cane tip. The package gives two things:

1. **When:** `onCardVisibleChange(visible)`: `true` once the cane is up (about 360 ms after the pose change), `false` the moment he starts lowering it. The cane starts moving 170 ms later, so give your card an exit transition of about 150–200 ms.
2. **Where:** `ref.current.getCaneTip()`: the viewport position `{ x, y }` of the raised cane's tip, or `null` before layout.

```jsx
const [cardVisible, setCardVisible] = useState(false);
const [anchor, setAnchor] = useState(null);

const place = () => {
  const tip = mascot.current?.getCaneTip();
  const column = columnRef.current.getBoundingClientRect();
  if (tip) setAnchor({ x: tip.x - column.left, bottom: column.bottom - tip.y + 12 }); // 12 px gap
};

<div ref={columnRef} className="character-column">          {/* position: relative */}
  <div className="mascot-box">                              {/* bottom part of the column */}
    <ZaatarMascot ref={mascot} activity={activity}
      onCardVisibleChange={(v) => { setCardVisible(v); if (v) place(); }} />
  </div>
  {anchor && (
    <HostProductCard visible={cardVisible && recommendationOnScreen}
      style={{ position: 'absolute', left: anchor.x, bottom: anchor.bottom, transform: 'translateX(-50%)' }} />
  )}
</div>
```

- **Leave room above the mascot's container** for the card: the cane tip sits at the very top of his canvas (1.6% from the top). The card goes above the box, not over him.
- Recompute the anchor when the column resizes (a `ResizeObserver` on the column).
- If you lay out the box yourself, the tip is at `caneTip` (`{ x: 0.910, y: 0.016 }`, fractions of the box).
- The card's content, size, price, carousel and "Add" button stay entirely in the host.

## 10. Reduced motion

By default the component follows the operating system's `prefers-reduced-motion`. When it is on:

- no body movement, no cane swing: the old pose fades out (140 ms), the new one fades in (140 ms);
- breathing and tail loops stop;
- `onCardVisibleChange` timing shortens (card about 120 ms after the pose, hidden 150 ms before it changes);
- Acknowledging still plays once, as a fade in and back.

`reducedMotion={true}` forces this mode (for example from an in-app setting). `reducedMotion={false}` forces full transitions, but the CSS loops still stop when the operating system asks for reduced motion.

## 11. RTL and LTR

- The artwork is **never mirrored**. The character box is pinned to `direction: ltr` internally, and nothing in the package reads the page direction or language.
- Only the placement follows the host: `align="start"`/`"end"` are logical, and the host decides which side of the screen the character column sits on.
- Activities don't depend on language: an Arabic answer and an English answer both send `assistant_responding`.
- **Don't** apply `transform: scaleX(-1)` or flip the container for RTL. The light, the cane hand and the tail would all be wrong.

## 12. Performance

- **Download:** 13 WebP layers, 1.15 MB in total, fetched once and cached by the browser; several instances share the download.
- **Memory:** about 20 MB of decoded bitmaps per instance. All poses stay decoded so a pose change never waits for a download or decode.
- **Startup:** Zaatar waits for every layer to decode before he starts (`onReady`), so the first pose change can't flicker. On a slow connection he stays in Idle until then.
- **Animation:** transforms and opacity only (Web Animations API and CSS), which browsers run on the compositor. No canvas, no per-frame JavaScript, no re-renders during a transition.
- **Idle cost:** two slow CSS loops (4.8 s breathing, 7.5 s tail flick).
- Don't mount many copies on one screen; one per visible context is enough.

## 13. API reference

### `<ZaatarMascot>`

| Prop | Type | Default | |
|---|---|---|---|
| `activity` | one of `ACTIVITIES` | `'assistant_idle'` | What the assistant is doing (§5) |
| `reducedMotion` | `boolean` | system preference | §10 |
| `align` | `'center' \| 'start' \| 'end'` | `'center'` | Horizontal placement inside the container |
| `assetBaseUrl` | `string` | bundled URLs | Load layers from `${assetBaseUrl}/${file}` (§3 C) |
| `className`, `style` | | | Applied to the outer element |
| `onReady()` | | | All layers decoded; transitions can run |
| `onError(error)` | | | A layer failed to load; hide the mascot |
| `onPoseChange(pose)` | | | A new pose is showing (also `'idle'` once ready) |
| `onSettled(pose)` | | | Movement finished, nothing pending |
| `onCardVisibleChange(visible)` | | | Show or hide the host's product card (§9) |

**Ref handle**

| Method | Returns | |
|---|---|---|
| `acknowledge()` | `boolean` | Play Acknowledging once (§6) |
| `getCaneTip()` | `{ x, y } \| null` | Viewport position of the raised cane tip (§9) |

### Other exports

| Export | |
|---|---|
| `ACTIVITIES` | `['assistant_welcome', 'assistant_processing', 'assistant_responding', 'assistant_recommending', 'assistant_idle']` |
| `ZAATAR_POSE_FOR_ACTIVITY` | activity → pose table |
| `ZAATAR_REACTION_FOR_EVENT` | `{ cart_item_added: 'acknowledging' }` |
| `REACTION_BLOCKED_DURING` | activities during which `acknowledge()` is skipped |
| `POSES`, `REACTIONS` | the five persistent poses; `['acknowledging']` |
| `aspectRatio`, `caneTip`, `ground`, `figureTop` | canvas geometry, as fractions |

**Building blocks** (for a host that positions the character itself, as the ZAATAR-LAB lab and chat do; most hosts don't need them):

| Export | |
|---|---|
| `ZaatarCharacter` | The renderer. Needs a parent sized to `aspectRatio`; ref exposes `{ motion, poses, cane }`. Props: `assetBaseUrl`, `onReady`, `onError`. |
| `useDirector(rigRef, { ready, reducedMotion, timeScale })` | `{ pose, target, busy, cardVisible, goTo(pose), reset() }`, plus the lab-only `playSequence(steps)`. |
| `useReaction(director, { pose, holdMs })` | `{ play(getReturnPose), active, cardHeld }`. |
| `usePrefersReducedMotion()` | `boolean` |

With the building blocks the host must apply the rules `ZaatarMascot` applies for it: map activities with `ZAATAR_POSE_FOR_ACTIVITY`, play reactions only through `useReaction`, respect `REACTION_BLOCKED_DURING`, and show the card while `director.cardVisible || reaction.cardHeld`.

## 14. Known visual limitations

These were reviewed and accepted with the artwork:

- **Small differences between pose illustrations** (hair curls, facial marks, proportions) are visible at the cuts. They are accepted; don't try to correct them.
- **Suggesting and Welcome hold the cane in the other hand and curl the tail the other way.** Changes to or from them swap sides at the cut. Idle, Thinking, Responding and Acknowledging match each other.
- **From Suggesting, Acknowledging lowers the cane and the return raises it again** with the approved presenting move.
- **The Acknowledging artwork has two small yellow emphasis strokes** beside the thumb, as supplied.
- **Headroom:** the canvas reserves space above his head for the cane, so he looks smaller in very short containers (§8).
- **Tested in desktop Chromium** at phone, tablet and desktop sizes; not on physical devices, Safari or Firefox.

## 15. Common mistakes

| Mistake | Instead |
|---|---|
| Container with `height: auto` (Zaatar invisible) | Give it a height, or width plus `aspect-ratio` |
| Mirroring him for RTL | Never flip; move the container |
| Deciding the activity from message text, or the mascot choosing products | The chatbot lifecycle sets the activity; the host owns products |
| Waiting for an animation before showing text, products or updating the cart | Update everything at once; Zaatar follows |
| Calling `acknowledge()` before the cart call succeeds, or on failure | Call it after success only |
| Using `assistant_welcome` when reopening a conversation | Restore the current activity, usually `assistant_idle` |
| Remounting `<ZaatarMascot>` when the layout changes | Keep one instance and resize or move its container |
| Using the lab's product card or the chat demo as the production UI | Use the host's own components; see PRO-ORDER-INTEGRATION.md |
| `overflow: hidden` on a container smaller than his box, or a CSS `scale()` on him | Size the container; let the package fit him |
| Copying only `src/` | Copy the whole folder: `assets/` is required |
| Showing the product card by your own timer | Use `onCardVisibleChange` so the card meets the raised cane |

## 16. Verifying an integration

Open the screen with Zaatar and check each behaviour:

| # | Do | Expect |
|---|---|---|
| 1 | New conversation | Welcome, holding (no timer) |
| 2 | Send a message | Thinking until the answer arrives |
| 3 | Answer arrives | Responding while it is presented |
| 4 | Answer with dishes | Suggesting: cane up, then your card appears above the tip |
| 5 | Answer without dishes / waiting | Idle |
| 6 | Add a dish to the cart successfully | Cart updates at once; Acknowledging plays once (~1 s) and he returns to Suggesting (card stays) or Idle |

Then the edge cases:

- Add five times quickly: five items, one reaction.
- Send a message during Acknowledging: straight to Thinking.
- Add during Welcome or Thinking: the item is added, no reaction.
- Turn on the system's reduce-motion setting: poses fade, no movement, no breathing.
- Arabic and English UI: Zaatar faces the same way; nothing is mirrored.
- Every container size you use: the cane, ears, feet and tail are fully visible.
- No console errors, and all 13 `.webp` requests succeed.

ZAATAR-LAB's `#package` page is a reference host for all of the above.
