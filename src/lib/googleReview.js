/**
 * googleReview — Phase 117.0. One optional link per restaurant, and the rule
 * for whether it is safe to put in front of a guest.
 *
 * ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────
 * It is a URL the restaurant pastes in Settings, and a button on the
 * feedback thank-you state that opens it. There is no Google API, no OAuth,
 * no account connection, nothing read back from Google. PRO·ORDER never
 * learns whether a review was written, and must never claim otherwise.
 *
 * ── WHY THE HOSTNAME RULE IS EXACT ───────────────────────────────────────
 * This value is typed by one person and clicked by every guest who leaves
 * feedback, which makes it the most trusted-looking outbound link in the
 * product: the button says "Google", so the guest does not read the URL.
 * "Contains the word google" is therefore not a test —
 *
 *     https://google.com.evil-example.com/review
 *
 * contains it, and is a host someone else controls. Every check below
 * compares the PARSED hostname against an exact name or an anchored
 * pattern, so a Google-looking label anywhere else in the string cannot
 * satisfy it.
 *
 * ── AND WHY IT IS NOT STRICTER ───────────────────────────────────────────
 * The path and query are deliberately NOT validated. Google has issued
 * review links in several shapes over the years — /maps/place/…,
 * search.google.com/local/writereview?placeid=…, a g.page/…/review short
 * link, a maps.app.goo.gl redirect — and a pattern tight enough to describe
 * today's would reject a restaurant's perfectly good link tomorrow. The
 * host is the security question; the path is Google's business.
 *
 * A link that parses is not a link that has been shown to point at the right
 * restaurant. Nothing here can establish that, and nothing should say it has.
 */

/** Hosts that are exactly themselves. */
const EXACT_HOSTS = new Set([
  "g.page",             // Google Business Profile short link
  "maps.app.goo.gl",    // Maps share/redirect link
  "goo.gl",             // legacy Google short link
]);

/**
 * Google's own domains, including the country variants a local business is
 * routinely given: google.jo, google.co.uk, google.com.au, google.com.co.
 *
 * Anchored at both ends, which is the whole point: whatever follows
 * "google." must be the WHOLE remainder of the hostname, so
 * "google.com.evil-example.com" cannot match.
 *
 * The second-level part is an explicit short list rather than "any two
 * letters", because the looser form would also accept google.<anything>.<xx>
 * for registries that may not reserve the google label. Between them these
 * four cover the country domains Google actually publishes.
 */
const GOOGLE_DOMAIN =
  /^(?:www\.|maps\.|search\.|business\.)?google\.(?:[a-z]{2,3}|(?:com|co|org|net)\.[a-z]{2})$/;

/**
 * Parse a pasted value into a URL, tolerating a missing scheme.
 *
 * Admins paste "g.page/my-cafe/review" as often as they paste the full
 * thing, and refusing that would be pedantry. The scheme is only assumed
 * when the value has NO scheme at all — a value that already declares one
 * keeps it and is then judged on its merits, so "javascript:…" is parsed as
 * javascript: and rejected below rather than being quietly rewritten into
 * something that looks safe.
 */
function parseUrl(raw) {
  const value = String(raw ?? "").trim();
  if (value === "") return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

/**
 * Is this a link we are willing to send a guest to?
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isValidGoogleReviewUrl(raw) {
  const url = parseUrl(raw);
  if (!url) return false;
  /* https only. http would be downgraded-in-transit, and every other scheme
     — javascript:, data:, file:, vbscript: — is refused here by not being
     this one, rather than by a blocklist that has to anticipate them. */
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || GOOGLE_DOMAIN.test(host);
}

/**
 * The value to store, or "" when there is nothing usable.
 *
 * Returns the PARSED, re-serialised URL rather than the raw text, so what
 * gets saved is what a browser will actually navigate to — the same string
 * the validator judged, with a scheme present even if the admin omitted one.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeGoogleReviewUrl(raw) {
  const url = parseUrl(raw);
  if (!url || !isValidGoogleReviewUrl(raw)) return "";
  return url.toString();
}

/**
 * The link to actually render for a restaurant, or "" for none.
 *
 * Re-validated on READ rather than trusted from storage. Settings refuses to
 * save an unsafe value, but localStorage is editable by anyone sitting at
 * the device, and this is the function standing between that and an anchor
 * the guest will click. Unconfigured and unsafe deliberately give the same
 * answer: the button is simply not rendered.
 *
 * @param {object} settings
 * @returns {string}
 */
export function resolveGoogleReviewUrl(settings) {
  const stored = settings?.googleReviewUrl;
  return isValidGoogleReviewUrl(stored) ? String(stored).trim() : "";
}
