import { useEffect, useState } from "react";

/**
 * restaurantLogoAssets — Phase 112.2
 *
 * A restaurant's own logo, chosen from the owner's device and kept where a
 * browser can actually keep it.
 *
 * ── WHY NOT localStorage ─────────────────────────────────────────────────
 * Settings live in localStorage, which is a few megabytes for the WHOLE
 * origin and is read and rewritten on every settings save. Putting an image
 * in there risks a quota error that would take the restaurant's name, hours
 * and theme down with it. IndexedDB is the browser's store for binary-ish
 * data, is far larger, and fails independently of the settings record.
 *
 * ── WHAT IS STORED WHERE ─────────────────────────────────────────────────
 *   IndexedDB   the image itself, as a data URL, under an id
 *   settings    only a reference: "asset:<id>" in the existing logoUrl field
 *
 * Keeping the reference in the field that already exists is what makes this
 * backward compatible: a restaurant that typed an http(s) URL still has that
 * URL, and nothing migrates, rewrites or deletes it.
 *
 * ── WHY A DATA URL AND NOT A BLOB ────────────────────────────────────────
 * A blob: URL is a handle to this page's memory — it dies on refresh, and the
 * brief rightly forbids persisting one. A data URL is the image itself, so it
 * survives a reload and, just as importantly, it is the one representation
 * that works unchanged in html2canvas, print and the PDF export.
 *
 * ── NOT CROSS-DEVICE ─────────────────────────────────────────────────────
 * This is one browser's storage. A logo uploaded on the till is not on the
 * manager's laptop. Real sharing needs server-side object storage — see
 * docs/BACKEND-ROADMAP.md.
 */

const DB_NAME = "pro_order_assets";
const DB_VERSION = 1;
const STORE = "logos";

/** The prefix that marks a settings value as a local asset reference. */
export const LOGO_ASSET_PREFIX = "asset:";

/** Accepted on upload. Deliberately narrow — see processLogoFile. */
export const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** 6 MB of source file. Anything larger is a photo, not a logo. */
export const MAX_LOGO_BYTES = 6 * 1024 * 1024;

/** Longest edge kept after optimisation. A logo never needs more. */
export const MAX_LOGO_EDGE = 512;

export function isLogoAssetRef(value) {
  return typeof value === "string" && value.startsWith(LOGO_ASSET_PREFIX);
}

function assetIdFromRef(ref) {
  return isLogoAssetRef(ref) ? ref.slice(LOGO_ASSET_PREFIX.length) : null;
}

/* ── IndexedDB plumbing ───────────────────────────────────────────────────
   Deliberately tiny: one store, keyed by id. Every call opens, does its one
   thing and closes, because a long-lived connection would block the upgrade
   path of a future version for no benefit at this size. */

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb-unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb-open-failed"));
  });
}

function runTransaction(mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        try {
          result = work(store);
        } catch (error) {
          tx.abort();
          db.close();
          reject(error);
          return;
        }
        tx.oncomplete = () => { db.close(); resolve(result && result.__value !== undefined ? result.__value : result); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error("indexeddb-tx-failed")); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error("indexeddb-tx-aborted")); };
      })
  );
}

/**
 * Store an image and return the reference to put in settings.logoUrl.
 *
 * @param {{dataUrl:string, type:string, width:number, height:number, bytes:number}} asset
 * @param {string} restaurantSlug — recorded so a future cleanup can tell one
 *   restaurant's assets from another's on a shared device
 * @returns {Promise<string>} "asset:<id>"
 */
export async function saveLogoAsset(asset, restaurantSlug) {
  const id = `logo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    restaurantSlug: restaurantSlug || null,
    dataUrl: asset.dataUrl,
    type: asset.type,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    createdAt: new Date().toISOString(),
  };
  await runTransaction("readwrite", (store) => { store.put(record); });
  memoryCache.set(`${LOGO_ASSET_PREFIX}${id}`, asset.dataUrl);
  return `${LOGO_ASSET_PREFIX}${id}`;
}

/** The stored image for a reference, or null when there is none. */
export async function getLogoAsset(ref) {
  const id = assetIdFromRef(ref);
  if (!id) return null;
  try {
    const db = await openDb();
    const dataUrl = await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result?.dataUrl || null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); resolve(null); };
    });
    return dataUrl;
  } catch {
    /* No IndexedDB, a blocked database, or a private window: the caller
       renders its name-only fallback rather than a broken image. */
    return null;
  }
}

/** Remove one asset. Used only for an asset this session created and replaced. */
export async function deleteLogoAsset(ref) {
  const id = assetIdFromRef(ref);
  if (!id) return;
  try {
    await runTransaction("readwrite", (store) => { store.delete(id); });
    memoryCache.delete(ref);
  } catch {
    /* A logo that cannot be deleted is a few hundred kilobytes, not a
       correctness problem. Never let cleanup fail a save. */
  }
}

/* ── Resolution ───────────────────────────────────────────────────────────
   Every surface that paints a logo asks for the same thing: given whatever is
   in settings.logoUrl, what do I put in src? A plain URL answers itself; an
   asset reference needs one IndexedDB read, cached here so a screen with
   several logos (or a re-render) does not hit the database again. */

const memoryCache = new Map();

/** Synchronous answer when one is possible: a URL, or an already-read asset. */
export function peekLogoSrc(ref) {
  if (!ref) return null;
  if (!isLogoAssetRef(ref)) return ref;
  return memoryCache.get(ref) || null;
}

/**
 * React hook: the src to render for a settings logo value.
 *
 * Returns the value unchanged for an ordinary URL (so nothing about existing
 * restaurants changes), and the stored image for an asset reference. While an
 * asset is being read it returns null, which every caller already treats as
 * "no logo" and renders its name-only fallback for — a blank instant, never a
 * broken image.
 */
export function useRestaurantLogoSrc(ref) {
  const [src, setSrc] = useState(() => peekLogoSrc(ref));

  useEffect(() => {
    if (!ref) { setSrc(null); return undefined; }
    if (!isLogoAssetRef(ref)) { setSrc(ref); return undefined; }

    const cached = memoryCache.get(ref);
    if (cached) { setSrc(cached); return undefined; }

    let cancelled = false;
    setSrc(null);
    getLogoAsset(ref).then((dataUrl) => {
      if (cancelled) return;
      if (dataUrl) memoryCache.set(ref, dataUrl);
      setSrc(dataUrl || null);
    });
    return () => { cancelled = true; };
  }, [ref]);

  return src;
}

/* ── Validation and optimisation ──────────────────────────────────────── */

/** Thrown reasons, so the caller can show a translated message per case. */
export const LOGO_ERROR = {
  TYPE: "unsupported-type",
  SIZE: "too-large",
  DECODE: "not-an-image",
  STORAGE: "storage-failed",
};

/**
 * Validate a chosen file and return an optimised image ready to store.
 *
 * ── WHY SVG IS REFUSED ───────────────────────────────────────────────────
 * An SVG is a document that can carry script. Rendering restaurant-supplied
 * SVG through an <img> is safer than inlining it, but this product also puts
 * the logo through html2canvas and print, and the safe handling is not worth
 * claiming when PNG, JPEG and WebP cover every real logo. The owner is told
 * which formats work rather than being left with a silent failure.
 *
 * ── WHAT OPTIMISATION DOES ───────────────────────────────────────────────
 * Scales the longest edge down to MAX_LOGO_EDGE and no further — a small logo
 * is never upscaled, which would only add bytes and blur. Aspect ratio is
 * preserved exactly. PNG and WebP sources come out as PNG so transparency
 * survives; a JPEG stays JPEG at high quality because it has no alpha to
 * lose.
 *
 * @param {File} file
 * @returns {Promise<{dataUrl:string,type:string,width:number,height:number,bytes:number,sourceWidth:number,sourceHeight:number}>}
 */
export async function processLogoFile(file) {
  if (!file || !ACCEPTED_LOGO_TYPES.includes(file.type)) {
    throw new Error(LOGO_ERROR.TYPE);
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error(LOGO_ERROR.SIZE);
  }

  const sourceUrl = await readFileAsDataUrl(file).catch(() => {
    throw new Error(LOGO_ERROR.DECODE);
  });

  /* Decoding is the real validation: a renamed .txt, a truncated download or
     a corrupt file all fail here rather than being stored and rendered as a
     broken image later. */
  const image = await decodeImage(sourceUrl).catch(() => {
    throw new Error(LOGO_ERROR.DECODE);
  });

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error(LOGO_ERROR.DECODE);

  const scale = Math.min(1, MAX_LOGO_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  /* Nothing to gain: the file is already small enough, so it is stored as it
     arrived rather than re-encoded (which would cost quality for no reason). */
  if (scale === 1 && file.size <= 400 * 1024) {
    return {
      dataUrl: sourceUrl,
      type: file.type,
      width,
      height,
      bytes: Math.round(sourceUrl.length * 0.75),
      sourceWidth,
      sourceHeight,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(LOGO_ERROR.DECODE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  /* JPEG has no alpha, so a JPEG source stays JPEG; everything else becomes
     PNG, which keeps a transparent background transparent. */
  const outType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = canvas.toDataURL(outType, outType === "image/jpeg" ? 0.92 : undefined);

  return {
    dataUrl,
    type: outType,
    width,
    height,
    bytes: Math.round(dataUrl.length * 0.75),
    sourceWidth,
    sourceHeight,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

function decodeImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode-failed"));
    image.src = src;
  });
}
