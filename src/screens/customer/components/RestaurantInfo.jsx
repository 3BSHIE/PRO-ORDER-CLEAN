import { useState, useEffect } from "react";
import { Info, Phone, Mail, MapPin, X } from "lucide-react";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { useBodyScrollLock } from "../../../lib/useBodyScrollLock.js";
import RestaurantIdentity from "./RestaurantIdentity.jsx";

/**
 * RestaurantInfo — Phase 81. The one customer-facing surface for the things a
 * restaurant says about itself: description, cover image, phone, email,
 * address.
 *
 * ── WHY ONE SURFACE ──────────────────────────────────────────────────────
 *   These five fields have been editable in Admin Settings for many phases
 *   and visible to a guest in none of them. The obvious fix — scatter them
 *   across the menu header, the cart and tracking — would have put a postal
 *   address above someone's food four times over. They belong together, in
 *   one lightweight place a guest opens when they actually want it (§19).
 *
 * ── WHEN IT EXISTS AT ALL ────────────────────────────────────────────────
 *   The button renders only when at least one of the five fields has a value
 *   (see hasRestaurantInfo). A restaurant that filled none of them gets no
 *   entry point rather than a modal saying "No information available" (§49) —
 *   the name and logo are already in the header, so an Info sheet showing
 *   only those would be a dead end dressed as a feature.
 *
 * ── PLAIN TEXT ONLY ──────────────────────────────────────────────────────
 *   Every value here is restaurant-authored free text rendered as a text
 *   node. No dangerouslySetInnerHTML anywhere, so a description containing
 *   markup is shown, not executed (§43).
 */

/** The five fields that make an Info surface worth opening. */
export function hasRestaurantInfo(settings) {
  if (!settings) return false;
  const filled = (v) => typeof v === "string" && v.trim() !== "";
  return (
    filled(settings.description) ||
    filled(settings.coverImageUrl) ||
    filled(settings.contactPhone) ||
    filled(settings.contactEmail) ||
    filled(settings.contactAddress)
  );
}

/**
 * A phone number reduced to what is safe inside a tel: URL — digits, a
 * leading +, and nothing else. Returns "" when nothing usable survives, in
 * which case the caller shows plain text instead of a link (§44).
 *
 * Deliberately not a validator: the DISPLAYED value is always exactly what
 * the restaurant typed. This only decides whether an action is offered and
 * what goes in the href.
 */
export function toTelHref(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^0-9]/g, "");
  return digits.length >= 4 ? `tel:${plus}${digits}` : "";
}

/**
 * A mailto: href, or "" when the value could not be an address. The check is
 * intentionally shallow — one @, something either side, no whitespace — which
 * is enough to keep a nonsensical string out of a URL without pretending to
 * validate email (§44).
 */
export function toMailtoHref(raw) {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : "";
}

/** Only http(s) images are honoured — never javascript:, data: or blob: (§43). */
export function isSafeImageUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return false;
  try {
    const url = new URL(raw.trim(), window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/* ── The sheet ─────────────────────────────────────────────────────────── */

function RestaurantInfoSheet({ settings, restaurantName, onClose }) {
  const { t } = useLanguage();
  const [coverFailed, setCoverFailed] = useState(false);

  useBodyScrollLock(true);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const description = (settings.description || "").trim();
  const address = (settings.contactAddress || "").trim();
  const phone = (settings.contactPhone || "").trim();
  const email = (settings.contactEmail || "").trim();
  const telHref = toTelHref(phone);
  const mailHref = toMailtoHref(email);
  /* §16 — a malformed or unreachable cover simply is not rendered, so the
     sheet falls back to the identity block above it rather than showing the
     browser's broken-image glyph. */
  const showCover = isSafeImageUrl(settings.coverImageUrl) && !coverFailed;
  const hasContact = !!(phone || email || address);

  return (
    <div
      className="rinfo__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="rinfo"
        role="dialog"
        aria-modal="true"
        aria-label={t("customer.restaurantInfo", "Restaurant info")}
      >
        <div className="rinfo__handle" />
        <button
          type="button"
          className="rinfo__x"
          onClick={onClose}
          aria-label={t("common.close", "Close")}
        >
          <X size={16} strokeWidth={2.4} />
        </button>

        {/* §17 — one image, fixed ratio, object-fit: cover, no carousel and no
            full-screen hero. Loads naturally; the sheet never waits on it. */}
        {showCover && (
          <div className="rinfo__cover">
            <img
              src={settings.coverImageUrl.trim()}
              alt=""
              onError={() => setCoverFailed(true)}
            />
          </div>
        )}

        <div className="rinfo__body">
          {/* §22 — the restaurant leads. PRO·ORDER is not repeated here; the
              footer attribution on the screen behind already carries it. */}
          <RestaurantIdentity
            name={restaurantName}
            logoUrl={settings.logoUrl}
            variant="compact"
          />

          {description && <p className="rinfo__description">{description}</p>}

          {/* §50 — small readable rows, not three CTA cards. Each row is
              withheld entirely when its field is empty (§26), so a restaurant
              with only a phone number gets exactly one row. */}
          {hasContact && (
            <div className="rinfo__contact">
              <h3 className="rinfo__contact-title">{t("customer.contact", "Contact")}</h3>

              {phone && (
                <div className="rinfo__row">
                  <Phone size={14} strokeWidth={2.1} aria-hidden="true" />
                  <span className="rinfo__row-label">{t("customer.phone", "Phone")}</span>
                  {telHref ? (
                    <a className="rinfo__row-value rinfo__row-value--link" href={telHref}>
                      {phone}
                    </a>
                  ) : (
                    <span className="rinfo__row-value">{phone}</span>
                  )}
                </div>
              )}

              {email && (
                <div className="rinfo__row">
                  <Mail size={14} strokeWidth={2.1} aria-hidden="true" />
                  <span className="rinfo__row-label">{t("customer.email", "Email")}</span>
                  {mailHref ? (
                    <a className="rinfo__row-value rinfo__row-value--link" href={mailHref}>
                      {email}
                    </a>
                  ) : (
                    <span className="rinfo__row-value">{email}</span>
                  )}
                </div>
              )}

              {address && (
                <div className="rinfo__row rinfo__row--address">
                  <MapPin size={14} strokeWidth={2.1} aria-hidden="true" />
                  <span className="rinfo__row-label">{t("customer.address", "Address")}</span>
                  {/* §25 — plain readable text for v1. No maps, no geocoding,
                      no new dependency. */}
                  <span className="rinfo__row-value">{address}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── The entry point ───────────────────────────────────────────────────── */

/**
 * A small labelled button that opens the sheet, and the sheet itself. Owns its
 * own open state so a screen needs one import and no extra plumbing (§20).
 *
 * Renders nothing at all when there is nothing to show.
 */
export default function RestaurantInfo({ settings, restaurantName, className = "" }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  if (!hasRestaurantInfo(settings)) return null;

  return (
    <>
      <button
        type="button"
        className={`rinfo-btn ${className}`}
        onClick={() => setOpen(true)}
        aria-label={t("customer.restaurantInfo", "Restaurant info")}
      >
        <Info size={14} strokeWidth={2.2} aria-hidden="true" />
        <span className="rinfo-btn__label">{t("customer.restaurantInfo", "Restaurant info")}</span>
      </button>

      {open && (
        <RestaurantInfoSheet
          settings={settings}
          restaurantName={restaurantName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
