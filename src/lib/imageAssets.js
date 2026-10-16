import { useEffect, useState } from "react";

/**
 * imageAssets — Phase 115.0
 *
 * Images the restaurant chose from their own device, kept where a browser
 * can actually keep them.
 *
 * ── WHERE THIS CAME FROM ─────────────────────────────────────────────────
 * Phase 112.2 built all of this for the restaurant logo, in
 * restaurantLogoAssets.js. Phase 115.0 needs the same thing for product
 * images, and a second copy of "validate, optimise, store in IndexedDB,
 * resolve on render" is exactly how two image pipelines drift apart — one
 * gains a format the other rejects, one caches and the other re-reads, one
 * gets a transparency fix and the other does not.
 *
 * So the machinery moved here, unchanged in behaviour, with the two numbers
 * that genuinely differ between a logo and a photograph — the longest edge
 * kept and the largest file accepted — becoming arguments instead of
 * constants. restaurantLogoAssets.js is now a thin logo-flavoured face over
 * this module and keeps every export it had, so nothing that renders a logo
 * had to change.
 *
 * ── WHAT IS STORED WHERE ─────────────────────────────────────────────────
 *   IndexedDB   the image itself, as a data URL, under an id
 *   the record  only a reference: "asset:<id>", in the field that already
 *               existed (settings.logoUrl, item.imageUrl)
 *
 * Keeping the reference in the field that already exists is what makes this
 * backward compatible: a restaurant that typed an http(s) URL still has that
 * URL, and nothing migrates, rewrites or deletes it.
 *
 * ── WHY A DATA URL AND NOT A BLOB ────────────────────────────────────────
 * A blob: URL is a handle to this page's memory — it dies on refresh. A data
 * URL is the image itself, so it survives a reload and, just as importantly,
 * it is the one representation that works unchanged in html2canvas, print
 * and the PDF export. It also means there are no object URLs to revoke and
 * no lifecycle to get wrong.
 *
 * ── NOT CROSS-DEVICE ─────────────────────────────────────────────────────
 * This is one browser's storage. An image uploaded on the till is not on the
 * manager's laptop, and a guest's phone has never seen it. Real sharing
 * needs server-side object storage — see docs/BACKEND-ROADMAP.md.
 */

const DB_NAME = "pro_order_assets";
const DB_VERSION = 1;
/* One store, still called "logos" because that is what Phase 112.2 created
   and what every already-uploaded logo lives in. Renaming it would mean a
   version bump and a migration to move existing records — real risk to real
   owner data, in exchange for a tidier internal string. Product images are
   written alongside them under their own id prefix. */
const STORE = "logos";

/** The prefix that marks a stored field value as a local asset reference. */
export const ASSET_PREFIX = "asset:";

/** Accepted on upload. Deliberately narrow — see processImageFile. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function isAssetRef(value) {
  return typeof value === "string" && value.startsWith(ASSET_PREFIX);
}

function assetIdFromRef(ref) {
  return isAssetRef(ref) ? ref.slice(ASSET_PREFIX.length) : null;
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
 * Store an image and return the reference to put in the record's image field.
 *
 * @param {{dataUrl:string, type:string, width:number, height:number, bytes:number}} asset
 * @param {string} restaurantSlug — recorded so a future cleanup can tell one
 *   restaurant's assets from another's on a shared device
 * @param {string} [idPrefix] — "logo" or "img", so a stored record says what
 *   kind of thing it is without having to be looked up from the other side
 * @returns {Promise<string>} "asset:<id>"
 */
export async function saveImageAsset(asset, restaurantSlug, idPrefix = "img") {
  const id = `${idPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  memoryCache.set(`${ASSET_PREFIX}${id}`, asset.dataUrl);
  return `${ASSET_PREFIX}${id}`;
}

/** The stored image for a reference, or null when there is none. */
export async function getImageAsset(ref) {
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
       renders its own fallback rather than a broken image. */
    return null;
  }
}

/**
 * Remove one asset.
 *
 * Used ONLY for an asset the current editing session created and then
 * replaced or abandoned. It is never called on an asset that was already
 * saved against a record, because nothing here can prove that no other
 * record points at the same id — two products duplicated from one another
 * legitimately share a reference, and deleting the image out from under the
 * second one would be unrecoverable. Leaving a replaced image behind costs
 * some bytes; deleting a live one costs the owner their picture.
 */
export async function deleteImageAsset(ref) {
  const id = assetIdFromRef(ref);
  if (!id) return;
  try {
    await runTransaction("readwrite", (store) => { store.delete(id); });
    memoryCache.delete(ref);
  } catch {
    /* An image that cannot be deleted is a few hundred kilobytes, not a
       correctness problem. Never let cleanup fail a save. */
  }
}

/* ── Resolution ───────────────────────────────────────────────────────────
   Every surface that paints one of these asks the same thing: given whatever
   is in the image field, what do I put in src? A plain URL answers itself;
   an asset reference needs one IndexedDB read, cached here so a menu with
   twenty product images does not hit the database twenty times per render. */

const memoryCache = new Map();

/** Synchronous answer when one is possible: a URL, or an already-read asset. */
export function peekAssetSrc(ref) {
  if (!ref) return null;
  if (!isAssetRef(ref)) return ref;
  return memoryCache.get(ref) || null;
}

/**
 * React hook: the src to render for a stored image value.
 *
 * Returns the value unchanged for an ordinary URL (so nothing about existing
 * products or restaurants changes), and the stored image for an asset
 * reference. While an asset is being read it returns null, which every
 * caller already treats as "no image" and renders its own fallback for — a
 * blank instant, never a broken image.
 *
 * A reference whose asset has gone (cleared storage, another device, a
 * record restored from a backup) also resolves to null, so it degrades to
 * the same fallback rather than to the browser's torn-page glyph.
 */
export function useImageAssetSrc(ref) {
  const [src, setSrc] = useState(() => peekAssetSrc(ref));

  useEffect(() => {
    if (!ref) { setSrc(null); return undefined; }
    if (!isAssetRef(ref)) { setSrc(ref); return undefined; }

    const cached = memoryCache.get(ref);
    if (cached) { setSrc(cached); return undefined; }

    let cancelled = false;
    setSrc(null);
    getImageAsset(ref).then((dataUrl) => {
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
export const IMAGE_ERROR = {
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
 * imagery through html2canvas and print, and the safe handling is not worth
 * claiming when PNG, JPEG and WebP cover every real logo and every photo a
 * phone takes. The owner is told which formats work rather than being left
 * with a silent failure.
 *
 * ── WHAT OPTIMISATION DOES ───────────────────────────────────────────────
 * Scales the longest edge down to maxEdge and no further — a small image is
 * never upscaled, which would only add bytes and blur. Aspect ratio is
 * preserved exactly, and nothing is cropped: the whole picture is kept and
 * the surfaces that want a square decide that with object-fit, which is
 * reversible, rather than by discarding pixels here, which is not.
 *
 * PNG and WebP sources come out as PNG so transparency survives; a JPEG
 * stays JPEG at high quality because it has no alpha to lose. That pairing
 * is what stops a transparent logo acquiring a black or white background.
 *
 * @param {File} file
 * @param {{maxEdge:number, maxBytes:number, keepBelowBytes?:number}} limits
 * @returns {Promise<{dataUrl:string,type:string,width:number,height:number,bytes:number,sourceWidth:number,sourceHeight:number}>}
 */
export async function processImageFile(file, limits) {
  const { maxEdge, maxBytes, keepBelowBytes = 400 * 1024 } = limits;

  if (!file || !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(IMAGE_ERROR.TYPE);
  }
  if (file.size > maxBytes) {
    throw new Error(IMAGE_ERROR.SIZE);
  }

  const sourceUrl = await readFileAsDataUrl(file).catch(() => {
    throw new Error(IMAGE_ERROR.DECODE);
  });

  /* Decoding is the real validation: a renamed .txt, a truncated download or
     a corrupt file all fail here rather than being stored and rendered as a
     broken image later. */
  const image = await decodeImage(sourceUrl).catch(() => {
    throw new Error(IMAGE_ERROR.DECODE);
  });

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error(IMAGE_ERROR.DECODE);

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  /* Nothing to gain: the file is already small enough, so it is stored as it
     arrived rather than re-encoded (which would cost quality for no reason). */
  if (scale === 1 && file.size <= keepBelowBytes) {
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
  if (!ctx) throw new Error(IMAGE_ERROR.DECODE);
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
