import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import Button from "../ui/Button.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import { isSafeImageSrc } from "../../lib/safeImage.js";
import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_ERROR,
  isAssetRef,
  processImageFile,
  saveImageAsset,
  useImageAssetSrc,
} from "../../lib/imageAssets.js";

/**
 * ImageAssetField — Phase 115.0
 *
 * One compact control for "the picture that belongs to this record": a small
 * preview, an upload, a remove, and the hosted-URL field folded away behind
 * a text toggle.
 *
 * ── WHY ONE COMPONENT FOR TWO PLACES ─────────────────────────────────────
 * The restaurant logo and a product image are the same interaction with
 * different limits. Phase 112.2 built the logo one inline in the Settings
 * screen; building a second one inline in the Product editor would have been
 * two copies of the file picker, the busy state, the error mapping, the
 * staged-asset bookkeeping and the URL fallback — and the first divergence
 * would be the one nobody notices.
 *
 * ── THE COMPACTNESS RULE (§2/§19) ────────────────────────────────────────
 * This replaces a single-line text input in the Product editor, so the thing
 * it must not do is cost a block of height. The whole control is ONE ROW —
 * preview, then actions beside it — with a label above, which is the same
 * shape every other field on these forms has. The URL input is not rendered
 * at all until asked for, the hint is optional and off by default, and the
 * error line exists only when there is an error. No dropzone, no card, no
 * second heading, nothing nested.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────
 * It does not save anything to the record. It reports a new value through
 * onChange and the parent's existing Save/Discard decides what becomes real
 * (§13). The IMAGE itself is written to IndexedDB on selection, because that
 * is the only way to have a reference to put in the draft at all, so the
 * parent is told about every asset created through onAssetCreated and
 * releases the ones its own save or discard leaves unreferenced (§14).
 *
 * Props:
 *   label           — the field label
 *   value           — current image field value: "", a URL, or "asset:<id>"
 *   onChange        — (next:string) => void
 *   onAssetCreated  — (ref:string) => void, for the parent's cleanup list
 *   restaurantSlug  — recorded on the stored asset
 *   maxEdge/maxBytes— optimisation limits for this kind of image
 *   idPrefix        — "img" or "logo"
 *   errorCopy       — { [IMAGE_ERROR code]: [key, fallback] }
 *   urlLabel        — label for the collapsed hosted-URL input
 *   hint            — optional one-line hint, shown only when there is no error
 *   previewAlt      — alt text for the preview image
 */
export default function ImageAssetField({
  label,
  value,
  onChange,
  onAssetCreated,
  restaurantSlug,
  maxEdge,
  maxBytes,
  idPrefix = "img",
  errorCopy,
  urlLabel,
  hint = null,
  previewAlt = "",
}) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [imgErr, setImgErr] = useState(false);

  const uploaded = isAssetRef(value);
  /* Always folded to begin with, including for a record that already holds
     a typed URL.

     The first build of this opened the row automatically in that case, on
     the reasoning that the admin should see what is there. Measured in the
     editor it cost 52px of a 93px field — the URL input more than doubled
     the control for every product that had ever been given a URL, which is
     exactly the permanent vertical cost §11 asks to collapse away. The
     image itself is already visible in the preview beside the toggle, and
     the URL is one click away and labelled. */
  const [showUrl, setShowUrl] = useState(false);

  const src = useImageAssetSrc(value);
  const showPreview = isSafeImageSrc(src) && !imgErr;

  async function handleFile(event) {
    const file = event.target.files?.[0];
    /* Cleared straight away so re-picking the SAME file still fires a change
       event; a browser will not re-fire for an unchanged input value. */
    event.target.value = "";
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      /* Validate and optimise first, store second: nothing reaches the
         device until we know it really is a decodable image of a supported
         type. */
      const asset = await processImageFile(file, { maxEdge, maxBytes });
      const ref = await saveImageAsset(asset, restaurantSlug, idPrefix);
      onAssetCreated?.(ref);
      setImgErr(false);
      onChange(ref);
      /* An upload is now the effective source, so a URL row left open from
         earlier would be showing an empty box next to a picture. */
      setShowUrl(false);
    } catch (err) {
      /* The draft is left exactly as it was, so a rejected file cannot
         disturb the image already in place — saved or in progress — and no
         other field on the form is touched (§16). */
      const [key, fallback] =
        errorCopy[err?.message] || errorCopy[IMAGE_ERROR.STORAGE];
      setError(t(key, fallback));
    } finally {
      setBusy(false);
    }
  }

  function handleRemove() {
    setError(null);
    setImgErr(false);
    /* Clears the DRAFT only. The stored image survives until the parent's
       Save or Discard establishes that nothing points at it any more (§15). */
    onChange("");
    setShowUrl(false);
  }

  return (
    <div className="field img-field">
      <span className="field__label">{label}</span>

      <div className="img-field__row">
        {/* Bounded box, contain-fitted on a chequerboard: the image is shown
            at the real proportions it will keep, and a transparent PNG reads
            as transparent rather than as one with a grey background baked
            in. */}
        <div className="img-field__preview">
          {showPreview ? (
            <img
              className="img-field__img"
              src={src}
              alt={previewAlt}
              onError={() => setImgErr(true)}
            />
          ) : (
            <ImagePlus size={17} strokeWidth={1.7} aria-hidden="true" />
          )}
        </div>

        <div className="img-field__actions">
          {/* The native picker is driven by the button beside it so the
              control matches every other button on the form; it stays in the
              DOM and focusable rather than hidden from assistive technology. */}
          <input
            ref={fileRef}
            type="file"
            className="img-field__file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            aria-label={label}
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={ImagePlus}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy
              ? t("common.saving", "Saving…")
              : value
                ? t("admin.imageChange", "Change")
                : t("admin.imageUpload", "Upload image")}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleRemove}>
              {t("admin.imageRemove", "Remove")}
            </Button>
          )}
          {/* The legacy hosted-URL field, folded away. Restrained on purpose:
              uploading is the primary action now, and a permanently visible
              URL input was costing a full field of height on a form that has
              no height to spare. */}
          <button
            type="button"
            className="img-field__urltoggle"
            aria-expanded={showUrl}
            onClick={() => setShowUrl((open) => !open)}
          >
            {urlLabel}
          </button>
        </div>
      </div>

      {showUrl && (
        <div className="img-field__url">
          <input
            className="input"
            type="url"
            inputMode="url"
            aria-label={urlLabel}
            placeholder="https://…"
            /* An uploaded image has no URL to show, so the box is empty —
               and typing one here is how the admin swaps back to a hosted
               image, which replaces the upload in the draft (§11/§12). */
            value={uploaded ? "" : value}
            onChange={(e) => onChange(e.target.value)}
          />
          {uploaded && (
            <span className="field__hint">
              {t("admin.imageUrlReplacesUpload", "Entering a URL replaces the uploaded image.")}
            </span>
          )}
        </div>
      )}

      {error
        ? <span className="field__hint field__hint--error" role="alert">{error}</span>
        : hint
          ? <span className="field__hint">{hint}</span>
          : null}
    </div>
  );
}
