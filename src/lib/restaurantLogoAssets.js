import {
  ASSET_PREFIX,
  ACCEPTED_IMAGE_TYPES,
  IMAGE_ERROR,
  isAssetRef,
  saveImageAsset,
  getImageAsset,
  deleteImageAsset,
  peekAssetSrc,
  useImageAssetSrc,
  processImageFile,
} from "./imageAssets.js";

/**
 * restaurantLogoAssets — Phase 112.2, re-based on imageAssets in Phase 115.0.
 *
 * A restaurant's own logo, chosen from the owner's device and kept where a
 * browser can actually keep it.
 *
 * ── WHAT CHANGED IN 115.0, AND WHAT DID NOT ──────────────────────────────
 * Nothing about the logo's behaviour. Phase 115.0 added product-image upload,
 * which needs the same validate → optimise → store → resolve pipeline this
 * file used to own outright, so that pipeline moved to lib/imageAssets.js and
 * this module became the logo-shaped face over it.
 *
 * Every export below is the one that existed before, with the same name and
 * the same contract, so the six screens that render a logo did not have to
 * change and the stored data did not move: the same IndexedDB database, the
 * same object store, the same "asset:<id>" references, the same already
 * uploaded logos.
 *
 * What this file still decides is what makes a LOGO different from a product
 * photograph: how large a file to accept, and how big an edge is worth
 * keeping. A logo is a mark, not a picture — 512px covers every place one is
 * painted, and anything over 6 MB is a photo that was chosen by mistake.
 *
 * ── NOT CROSS-DEVICE ─────────────────────────────────────────────────────
 * This is one browser's storage. A logo uploaded on the till is not on the
 * manager's laptop. See docs/BACKEND-ROADMAP.md.
 */

/** The prefix that marks a settings value as a local asset reference. */
export const LOGO_ASSET_PREFIX = ASSET_PREFIX;

/** Accepted on upload. Deliberately narrow — see processImageFile. */
export const ACCEPTED_LOGO_TYPES = ACCEPTED_IMAGE_TYPES;

/** 6 MB of source file. Anything larger is a photo, not a logo. */
export const MAX_LOGO_BYTES = 6 * 1024 * 1024;

/** Longest edge kept after optimisation. A logo never needs more. */
export const MAX_LOGO_EDGE = 512;

/** Thrown reasons, so the caller can show a translated message per case. */
export const LOGO_ERROR = IMAGE_ERROR;

export function isLogoAssetRef(value) {
  return isAssetRef(value);
}

/**
 * Store a logo and return the reference to put in settings.logoUrl.
 *
 * The "logo" id prefix is what keeps an uploaded logo recognisable as one in
 * the shared store, which matters for any future cleanup that needs to tell
 * a restaurant's mark from its menu photographs.
 */
export function saveLogoAsset(asset, restaurantSlug) {
  return saveImageAsset(asset, restaurantSlug, "logo");
}

/** The stored image for a reference, or null when there is none. */
export function getLogoAsset(ref) {
  return getImageAsset(ref);
}

/** Remove one asset. Used only for an asset this session created and replaced. */
export function deleteLogoAsset(ref) {
  return deleteImageAsset(ref);
}

/** Synchronous answer when one is possible: a URL, or an already-read asset. */
export function peekLogoSrc(ref) {
  return peekAssetSrc(ref);
}

/** React hook: the src to render for a settings logo value. */
export function useRestaurantLogoSrc(ref) {
  return useImageAssetSrc(ref);
}

/** Validate a chosen logo file and return an optimised image ready to store. */
export function processLogoFile(file) {
  return processImageFile(file, {
    maxEdge: MAX_LOGO_EDGE,
    maxBytes: MAX_LOGO_BYTES,
  });
}
