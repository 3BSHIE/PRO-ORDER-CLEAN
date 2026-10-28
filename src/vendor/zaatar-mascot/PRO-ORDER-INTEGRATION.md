# PRO-ORDER integration: handoff notes

**Status: documentation only.** Integration into PRO-ORDER is not authorised yet. Nothing in ZAATAR-LAB has accessed, copied from or changed PRO-ORDER, and this package makes no assumptions about PRO-ORDER's code beyond what is written here.

This page is for the future Claude Code session that will work **inside PRO-ORDER**. Read the package [README](README.md) for the API.

## What is being handed over

- The `zaatar-mascot` package: Zaatar's approved artwork, renderer, transitions, the activity contract and the Acknowledging reaction.
- **Not** handed over: the ZAATAR-LAB chat demo, its layout, its mock menu, cart, product card and scripted replies. They were experiments to test Zaatar's behaviour, not designs to ship.

## Requirements for the integration

### Data and responsibility

1. **PRO-ORDER stays the source of truth** for restaurants, menus, products, prices and availability.
2. **The AI chatbot must answer from verified restaurant catalogue data.** It must not invent dishes, prices or ingredients.
3. **The mascot decides nothing.** It doesn't choose recommendations, read messages, or show or change product information. It only receives an activity and the Acknowledging event.
4. **Cart and order ownership don't change.** Zaatar never reads or writes the cart, and an order never depends on him.
5. **Existing PRO-ORDER customer-session isolation must be respected.** The mascot has no state of its own beyond the current pose; it must not store or share anything between customers or sessions.
6. **All existing ordering functionality must keep working** exactly as before, with or without the mascot (including when its images fail to load: hide it and carry on).

### Interface

7. **The final AI chat UI reuses PRO-ORDER's own design tokens and UI components** (buttons, sheets, typography, colours, product cards).
8. **The ZAATAR-LAB chat demo is not the production design.** Don't copy its markup, styles, dialogs or carousel.
9. **Product cards come from PRO-ORDER.** Use the existing product card components; align them with the cane through `onCardVisibleChange` and `getCaneTip()` (README §9).

### Layout

10. **Start from the smallest practical presentation of the original PRO-ORDER product card.** Measure the minimum width at which the real card is still usable in the chat.
11. **Give that width to the character column** (Zaatar plus the card above him), then **maximise the conversation width** with what remains.
12. **Size Zaatar to the character region that results** (README §8). He adapts to any container size.
13. **Don't copy the ZAATAR-LAB 56/44 column split.** It was tuned for the mock card; the real card decides the split.
14. **UI direction follows the interface language, not the conversation language.** Arabic UI is RTL and English UI is LTR, whatever language the customer types in. Zaatar is never mirrored in either.

### Timing

15. **Animations never delay real work.** Show the AI's text and products as they arrive, and update the cart immediately; Zaatar follows. The package has no timers to wait for, and the ZAATAR-LAB demo's artificial "responding" timer must not be copied: the real chatbot's lifecycle ends `assistant_responding`.

## Suggested approach for the PRO-ORDER session

1. **Inspect the real architecture first**: framework and router, bundler, React version, how customer sessions are isolated, where the cart lives, the existing product card components, design tokens, and Arabic/English handling. Don't assume it matches ZAATAR-LAB.
2. **Check compatibility** against README §2: React ≥ 18.2, a bundler that handles `.jsx`, CSS and JSON imports and `new URL(..., import.meta.url)`. If it's Next.js, follow the notes in README §3.
3. **Copy `packages/zaatar-mascot/`** into PRO-ORDER's source tree (README §3 A), or install the packed archive (§3 B). Don't copy the rest of ZAATAR-LAB.
4. **Map the chatbot lifecycle to activities** in one place (README §5):
   - conversation created → `assistant_welcome`;
   - request sent → `assistant_processing`;
   - first answer text → `assistant_responding`;
   - answer complete → `assistant_recommending` if it includes verified products, else `assistant_idle`;
   - an existing conversation reopened → its current activity, never `assistant_welcome` again.
5. **Call `acknowledge()` only after PRO-ORDER's own add-to-cart succeeds**, without changing how the cart works.
6. **Lay out the chat** following requirements 10–14, with PRO-ORDER components.
7. **Verify** with README §16 in both languages, at phone and desktop sizes, with reduced motion on and off, and run PRO-ORDER's existing tests to confirm ordering is unaffected.

## Open questions for the owner at that time

- Which screens show Zaatar (customer menu header, sticky header, chat welcome, conversation), and at what size on the smallest supported phone.
- Whether reduced motion should also be an in-app setting (`reducedMotion` prop) or follow the system only.
- Whether Zaatar appears when the chatbot is unavailable.
