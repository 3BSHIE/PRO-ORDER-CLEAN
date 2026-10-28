# Package manifest: zaatar-mascot 1.0.0

Every file in the package, so nothing is missed when it is copied into another app. Packaged in ZAATAR-LAB Stage 5.0 from the approved baseline `a53d679`.

**Rule of thumb:** copy the whole `zaatar-mascot/` folder. Everything marked *required* must be present; the app imports only `src/index.js`.

## Runtime source

| Path | Purpose | Required | Depends on |
|---|---|---|---|
| `src/index.js` | Public entry point: the only file a host imports | Yes | everything below |
| `src/ZaatarMascot.jsx` | The host-facing component: activity in, events and `acknowledge()` out | Yes | `react`, `activities.js`, `animation/useDirector.js`, `animation/useReaction.js`, `character/ZaatarCharacter.jsx`, `character/rig.js`, `usePrefersReducedMotion.js`, `ZaatarMascot.css` |
| `src/ZaatarMascot.css` | Fits the canvas into the host's container; alignment; reduced-motion override | Yes | |
| `src/activities.js` | Activity → pose, event → reaction, reaction priority | Yes | |
| `src/usePrefersReducedMotion.js` | Follows the system reduce-motion setting | Yes | `react` |
| `src/animation/useDirector.js` | Pose state machine: one transition at a time, latest request wins | Yes | `react`, `choreography.js` |
| `src/animation/choreography.js` | Approved timings and keyframes of every transition, reduced-motion fade | Yes | |
| `src/animation/useReaction.js` | One-shot reaction (Acknowledging): play once, return to what is current | Yes | `react` |
| `src/character/ZaatarCharacter.jsx` | Renderer: all poses stacked, decodes every layer before `onReady` | Yes | `react`, `rig.js`, `ZaatarCharacter.css` |
| `src/character/ZaatarCharacter.css` | Layer positioning, contact shadow, breathing and tail loops | Yes | |
| `src/character/rig.js` | Canvas geometry (aspect ratio, ground, cane tip, figure tops) and layer placement | Yes | `manifest.json`, `assetUrls.js` |
| `src/character/manifest.json` | **Generated.** Canvas size, ground point, each layer's box and pivot, cane-tip anchor, source checksums | Yes | |
| `src/character/assetUrls.js` | **Generated.** One bundler-resolved URL per layer | Yes | `assets/*.webp` |

## Assets (all required)

Generated from the approved source artwork by `tools/prepare_assets.py` in ZAATAR-LAB. Transparent WebP, shared canvas 835 × 1548 px, ground point (433, 1505). Byte-identical to the approved Stage 4.1 layers.

| File | Bytes | sha256 (first 12) | Role |
|---|---|---|---|
| `assets/idle-base.webp` | 193 174 | `2872b5af4a3a` | Idle body |
| `assets/idle-tail.webp` | 7 282 | `dc5451df6632` | Idle tail (rotates) |
| `assets/welcome-base.webp` | 181 702 | `22a58dcc2207` | Welcome body |
| `assets/welcome-tail.webp` | 10 652 | `ab9ee5cf14c6` | Welcome tail |
| `assets/thinking-base.webp` | 185 812 | `3e86983c184c` | Thinking body |
| `assets/thinking-tail.webp` | 7 786 | `29c20fdad7d4` | Thinking tail |
| `assets/responding-base.webp` | 184 292 | `3a0033efb89e` | Responding body |
| `assets/responding-tail.webp` | 8 626 | `4e5872be3686` | Responding tail |
| `assets/suggesting-base.webp` | 152 862 | `f56935f629bb` | Suggesting body |
| `assets/suggesting-cane.webp` | 13 550 | `18a65a6818fc` | Raised cane (swings and nods) |
| `assets/suggesting-tail.webp` | 7 616 | `2b8fca8fc0c5` | Suggesting tail |
| `assets/acknowledging-base.webp` | 186 420 | `8584b22a599e` | Acknowledging body |
| `assets/acknowledging-tail.webp` | 9 334 | `01bbdff04688` | Acknowledging tail |
| | **1 149 108** | | 13 files |

Check after copying (from inside the package folder):

```bash
ls assets/*.webp | wc -l           # 13
sha256sum assets/*.webp | cut -c1-12
```

## Package metadata and documentation

| Path | Purpose | Required |
|---|---|---|
| `package.json` | Name `zaatar-mascot`, entry point, `react` peer dependency, files to pack | Required for options B (archive) and package-name imports; optional when importing `src/index.js` by path |
| `README.md` | Integration guide | No (keep it with the copy) |
| `PACKAGE-MANIFEST.md` | This inventory | No |
| `PRO-ORDER-INTEGRATION.md` | Handoff requirements for PRO-ORDER | No (read before integrating) |

## External dependencies

| Dependency | Kind | Version |
|---|---|---|
| `react` | peer | ≥ 18.2 (tested 18.3.1, 19.3.1) |
| `react-dom` | host's own | matches `react` |
| Bundler | build | must handle `.jsx`, CSS and JSON imports, `new URL(..., import.meta.url)` (tested: Vite 8.3) |

No other packages. No network requests besides the 13 images. No services, keys or AI providers.

## Deliberately not in the package

They stay in ZAATAR-LAB and must **not** be required by a host:

| ZAATAR-LAB path | What it is |
|---|---|
| `src/components/ProductCard.*`, `src/data/mockProduct.js` | The lab's mock product card |
| `src/components/Stage.*`, `Controls.*`, `src/App.*`, `src/labSequence.js` | Animation lab: stage, pose buttons, Play Sequence, Slow Motion, Reset |
| `src/chat/*` | Experimental chat demo: scripted engine, mock menu and cart, dialogs, carousel, its 56/44 layout and placement logic, its presentation timers |
| `src/harness/*` | The Stage 5 test page (`#package`) |
| `assets/source/*`, `tools/prepare_assets.py` | Original artwork and the asset pipeline; needed only to regenerate the layers |

## Reproducing the package

From the ZAATAR-LAB root:

```bash
npm run assets           # optional: regenerate assets/, manifest.json, assetUrls.js from the sources
npm run package:mascot   # writes release/zaatar-mascot-1.0.0.tgz (30 files, about 1.2 MB)
```

Or copy the folder `packages/zaatar-mascot/` as it is. Neither includes `node_modules`, build output, screenshots or demo data.
