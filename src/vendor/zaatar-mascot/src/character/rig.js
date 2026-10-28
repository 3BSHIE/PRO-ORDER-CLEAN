// Turns the generated asset manifest (canvas pixels) into the percentages and
// fractions the browser needs. Regenerate the manifest with `npm run assets`
// (in ZAATAR-LAB; see tools/prepare_assets.py).
import assetUrls from './assetUrls.js';
import manifest from './manifest.json';

const { width: W, height: H } = manifest.canvas;
const pct = (value, total) => `${(value / total) * 100}%`;

/** Persistent poses: each holds until something else is requested. */
export const POSES = ['welcome', 'idle', 'thinking', 'suggesting', 'responding'];

/** One-shot reactions: shown briefly, then the persistent pose returns (useReaction). */
export const REACTIONS = ['acknowledging'];

/** Every pose the character renders. */
export const RENDERED_POSES = [...POSES, ...REACTIONS];

/** Width / height of the shared character canvas. */
export const aspectRatio = W / H;

/** Where the feet meet the ground, as a CSS transform-origin. */
export const groundOrigin = `${pct(manifest.ground.x, W)} ${pct(manifest.ground.y, H)}`;

export const ground = { x: manifest.ground.x / W, y: manifest.ground.y / H };

/** Tip of the raised cane in the Suggesting pose, as fractions of the canvas. */
const tip = manifest.poses.suggesting.anchors.caneTip;
export const caneTip = { x: tip.x / W, y: tip.y / H };

/** Top of each pose's figure (top of the hair, or the cane tip), as a fraction of the canvas height. */
export const figureTop = Object.fromEntries(
  RENDERED_POSES.map((pose) => [pose, Math.min(...manifest.poses[pose].layers.map((layer) => layer.y)) / H]),
);

/**
 * A layer's URL. By default the bundler resolves it (assetUrls.js); with
 * baseUrl the layer is loaded from `${baseUrl}/${file}` instead, for hosts
 * that serve the assets/ folder themselves.
 */
export const assetUrl = (file, baseUrl) => (baseUrl ? `${baseUrl.replace(/\/$/, '')}/${file}` : assetUrls[file]);

export function layersFor(pose, baseUrl) {
  return manifest.poses[pose].layers.map((layer) => ({
    id: layer.id,
    src: assetUrl(layer.src, baseUrl),
    style: {
      left: pct(layer.x, W),
      top: pct(layer.y, H),
      width: pct(layer.width, W),
      height: pct(layer.height, H),
      transformOrigin: layer.pivot
        ? `${pct(layer.pivot.x - layer.x, layer.width)} ${pct(layer.pivot.y - layer.y, layer.height)}`
        : undefined,
    },
  }));
}
