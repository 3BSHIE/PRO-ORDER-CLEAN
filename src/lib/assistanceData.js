/**
 * assistanceData — Phase 123.0. What a restaurant offers when a guest taps
 * "Need Help?", and nothing else.
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────
 * A restaurant-scoped, ordered list of ASSISTANCE SERVICES. Each one is
 * either something the guest can be told immediately (the Wi-Fi password,
 * the opening hours) or something a person has to come and do (more
 * cutlery, clear the table). Those are the only two kinds, and the
 * difference is the whole model:
 *
 *   INSTANT  — the answer is in the configuration. Tapping it expands the
 *              answer in place. It never reaches a member of staff and it
 *              is never selectable.
 *   REQUEST  — tapping it selects it. Several selected services travel
 *              together as ONE staff call (see staffCallData.js).
 *
 * ── MERCHANT TEXT IS LOCALIZED CONTENT, NOT COPY ─────────────────────────
 * Service names and answers are written by the restaurant, so they go
 * through localizedContent.js exactly as product names do — `{ en, ar }`,
 * resolved with getLocalizedText, one language sufficient and the other
 * falling back to it. They are deliberately NOT i18n keys: nothing in this
 * product translates a merchant's own words for them.
 *
 * ── RESTAURANT ISOLATION AND PERSISTENCE ─────────────────────────────────
 * Exactly the pattern menuData.js / tableData.js / settingsData.js use:
 * every function takes `restaurantSlug` first and reads a key scoped to it
 * alone, and every write dispatches one change event so open tabs re-read.
 *
 * It is a SEPARATE key rather than a field inside settings because the
 * management UI is CRUD — add, delete, reorder — and folding that into the
 * settings record would make every reorder a full settings save and put it
 * through the Save/Discard draft the rest of that screen uses. Menu items
 * are stored this way for the same reason.
 *
 * ── WHAT IT HONESTLY IS NOT ──────────────────────────────────────────────
 * localStorage. It is shared between TABS of one browser on one origin and
 * it is shared with nothing else. A manager editing services on their phone
 * does not change what a guest's phone shows. The Wi-Fi password stored
 * here is readable by anyone with the device — it is a GUEST network
 * credential meant to be handed out, and it must not be mistaken for a
 * secret store. Both facts are the backend's to fix, not this file's to
 * pretend about.
 */

import {
  CONTENT_LANGUAGES,
  getLocalizedText,
  hasLocalizedText,
} from "./localizedContent.js";

const SERVICES_KEY_PREFIX = "pro_order_assistance_services";

export const ASSISTANCE_CHANGE_EVENT = "pro-order-assistance-change";

/** The only two response types there are. Stable keys, never displayed. */
export const SERVICE_TYPE = { INSTANT: "instant", REQUEST: "request" };

/**
 * The permanent one. It is always present, always last, always a staff
 * request, and the only service that carries a free-text detail field.
 *
 * It is not stored: it is appended on read and skipped on write, so there is
 * no record for an administrator to delete, no migration that could lose it,
 * and no restaurant whose list can be empty.
 */
export const OTHER_SERVICE_ID = "svc_other";

/* Longer than any sensible service name or answer, short enough that a
   paste accident cannot fill storage. Enforced on write, not on read, so an
   older record is never truncated behind the owner's back. */
export const NAME_MAX = 60;
export const ANSWER_MAX = 600;
export const WIFI_FIELD_MAX = 120;
export const OTHER_DETAILS_MAX = 300;

function servicesKey(restaurantSlug) {
  return `${SERVICES_KEY_PREFIX}:${restaurantSlug}`;
}

function genId() {
  return `svc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function notifyChange(restaurantSlug) {
  try {
    window.dispatchEvent(
      new CustomEvent(ASSISTANCE_CHANGE_EVENT, { detail: { restaurantSlug } })
    );
  } catch {
    /* no window (test runner): the write still happened. */
  }
}

/**
 * Everything an administrator types ends up inside the customer UI as TEXT,
 * never as markup — React escapes it on render. This is the second line:
 * angle brackets and control characters are removed at the boundary so a
 * stored value can never contain something that only looks safe because of
 * where it happens to be rendered today.
 */
export function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

/** The same, for a `{ en, ar }` localized value. A legacy string is accepted. */
function cleanLocalized(value, max) {
  const out = {};
  for (const code of CONTENT_LANGUAGES) {
    const raw =
      typeof value === "string"
        ? code === "en"
          ? value
          : ""
        : value && typeof value === "object"
          ? value[code]
          : "";
    const text = cleanText(raw, max);
    if (text) out[code] = text;
  }
  return out;
}

/* ── The defaults ───────────────────────────────────────────────────────
   Templates, not fixtures. They are written once, the first time a
   restaurant's list is read, and after that they are ordinary services: the
   administrator may rename, retype, disable, reorder or delete any of them
   and nothing here puts them back.

   Wi-Fi ships DISABLED and with empty credentials on purpose. A default
   network name would be fake data on a real restaurant's screen, and an
   unconfigured credential must never publish itself. */
const DEFAULT_SERVICES = [
  {
    id: "svc_wifi",
    kind: "wifi",
    type: SERVICE_TYPE.INSTANT,
    enabled: false,
    name: { en: "Wi-Fi Password", ar: "كلمة شبكة الواي فاي" },
    wifiNetwork: "",
    wifiPassword: "",
  },
  {
    id: "svc_cutlery",
    type: SERVICE_TYPE.REQUEST,
    enabled: true,
    name: { en: "Extra Cutlery", ar: "أدوات مائدة إضافية" },
  },
  {
    id: "svc_napkins",
    type: SERVICE_TYPE.REQUEST,
    enabled: true,
    name: { en: "Extra Napkins", ar: "مناديل إضافية" },
  },
  {
    id: "svc_clean_table",
    type: SERVICE_TYPE.REQUEST,
    enabled: true,
    name: { en: "Clean My Table", ar: "تنظيف الطاولة" },
  },
  {
    id: "svc_speak_staff",
    type: SERVICE_TYPE.REQUEST,
    enabled: true,
    name: { en: "Speak to Staff", ar: "التحدث مع الموظفين" },
  },
];

/** The permanent Other row, built rather than stored. */
export function otherService() {
  return {
    id: OTHER_SERVICE_ID,
    type: SERVICE_TYPE.REQUEST,
    enabled: true,
    permanent: true,
    needsDetails: true,
    name: { en: "Other Request", ar: "طلب آخر" },
  };
}

/**
 * Normalise one stored record. An unreadable type falls back to a staff
 * request: a service whose configuration cannot be understood should ask for
 * a person, not silently show the guest an empty answer.
 */
function normalize(raw, index) {
  const type = raw?.type === SERVICE_TYPE.INSTANT ? SERVICE_TYPE.INSTANT : SERVICE_TYPE.REQUEST;
  const service = {
    id: String(raw?.id || genId()),
    type,
    enabled: raw?.enabled !== false,
    order: Number.isFinite(raw?.order) ? raw.order : index,
    name: cleanLocalized(raw?.name, NAME_MAX),
  };
  if (raw?.kind === "wifi") service.kind = "wifi";
  if (type === SERVICE_TYPE.INSTANT) {
    service.answer = cleanLocalized(raw?.answer, ANSWER_MAX);
    if (service.kind === "wifi") {
      service.wifiNetwork = cleanText(raw?.wifiNetwork, WIFI_FIELD_MAX);
      service.wifiPassword = cleanText(raw?.wifiPassword, WIFI_FIELD_MAX);
    }
  }
  return service;
}

function readRaw(restaurantSlug) {
  try {
    const raw = localStorage.getItem(servicesKey(restaurantSlug));
    if (raw === null) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

function write(restaurantSlug, list) {
  const clamped = list
    /* Other is never persisted — it is appended on read. Writing it would
       create a record an administrator could then delete. */
    .filter((s) => s.id !== OTHER_SERVICE_ID)
    .map((s, i) => ({ ...normalize(s, i), order: i }));
  try {
    localStorage.setItem(servicesKey(restaurantSlug), JSON.stringify(clamped));
  } catch {
    /* storage unavailable — matches every other store in this app. */
  }
  notifyChange(restaurantSlug);
  return clamped;
}

/**
 * This restaurant's CONFIGURABLE services, in display order.
 *
 * Seeds the defaults exactly once: the absence of the key is what means
 * "never configured", so a restaurant that deletes every service keeps an
 * empty list rather than having the defaults reappear on the next render.
 * That distinction is why `readRaw` returns null rather than [].
 *
 * Other is NOT included here — this is the list an administrator manages.
 */
export function getAssistanceServices(restaurantSlug) {
  const stored = readRaw(restaurantSlug);
  if (stored === null) {
    return write(restaurantSlug, DEFAULT_SERVICES);
  }
  return stored.map(normalize).sort((a, b) => a.order - b.order);
}

/**
 * An Instant Answer is only shown when it has something to say.
 *
 * Wi-Fi answers itself from its two fields and needs both; every other
 * instant service needs an answer in at least one language. An enabled but
 * unconfigured service is hidden from the guest rather than expanding into
 * nothing — and stays visible to the administrator, which is where the
 * problem can actually be fixed.
 */
export function isInstantConfigured(service) {
  if (!service || service.type !== SERVICE_TYPE.INSTANT) return true;
  if (service.kind === "wifi") {
    return Boolean(service.wifiNetwork && service.wifiPassword);
  }
  return hasLocalizedText(service.answer);
}

/**
 * What the GUEST sees: enabled services, configured instant answers only,
 * in the administrator's order, with the permanent Other appended last.
 *
 * Other is appended unconditionally — a restaurant with no services, or one
 * that has disabled all of them, still lets a guest ask for something.
 */
export function getCustomerServices(restaurantSlug) {
  const list = getAssistanceServices(restaurantSlug)
    .filter((s) => s.enabled)
    .filter((s) => s.type !== SERVICE_TYPE.INSTANT || isInstantConfigured(s));
  return [...list, otherService()];
}

/** Add one service to the end of the list. */
export function addAssistanceService(restaurantSlug, data) {
  const list = getAssistanceServices(restaurantSlug);
  const service = normalize({ ...data, id: genId() }, list.length);
  write(restaurantSlug, [...list, service]);
  return service;
}

/**
 * Patch one service.
 *
 * The id is never patchable: renaming a service must not change what a
 * historical staff call points at, and Other has no record to patch.
 */
export function updateAssistanceService(restaurantSlug, id, patch) {
  if (id === OTHER_SERVICE_ID) return null;
  const list = getAssistanceServices(restaurantSlug);
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const merged = normalize({ ...list[idx], ...patch, id: list[idx].id }, idx);
  write(restaurantSlug, list.map((s, i) => (i === idx ? merged : s)));
  return merged;
}

/** Remove one service. Other cannot be removed because it is not stored. */
export function deleteAssistanceService(restaurantSlug, id) {
  if (id === OTHER_SERVICE_ID) return false;
  const list = getAssistanceServices(restaurantSlug);
  if (!list.some((s) => s.id === id)) return false;
  write(restaurantSlug, list.filter((s) => s.id !== id));
  return true;
}

/**
 * Move one service one place up or down. Index buttons rather than a
 * drag-and-drop library: keyboard-operable for free, and the same shape of
 * control the rest of Admin already uses.
 */
export function moveAssistanceService(restaurantSlug, id, delta) {
  if (id === OTHER_SERVICE_ID) return false;
  const list = getAssistanceServices(restaurantSlug);
  const from = list.findIndex((s) => s.id === id);
  if (from === -1) return false;
  const to = from + delta;
  if (to < 0 || to >= list.length) return false;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  write(restaurantSlug, next);
  return true;
}

/**
 * Validate what the Add/Edit form is about to save.
 *
 * "At least one language" for both the name and the answer, which is this
 * app's established rule for merchant text (see localizedContent.js) rather
 * than a stricter one invented here — which would make this the only form in
 * Admin that refuses a half-translated entry.
 *
 * @returns {{ok:true} | {ok:false, errors:Record<string,string>}}
 */
export function validateAssistanceService(draft) {
  const errors = {};
  if (!hasLocalizedText(cleanLocalized(draft?.name, NAME_MAX))) errors.name = "required";
  if (draft?.type === SERVICE_TYPE.INSTANT && draft?.kind !== "wifi") {
    if (!hasLocalizedText(cleanLocalized(draft?.answer, ANSWER_MAX))) errors.answer = "required";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

/** The text a guest sees for a service, in their language, with a fallback. */
export function serviceName(service, language) {
  return getLocalizedText(service?.name, language);
}

/** The answer an Instant service shows, in the guest's language. */
export function serviceAnswer(service, language) {
  return getLocalizedText(service?.answer, language);
}
