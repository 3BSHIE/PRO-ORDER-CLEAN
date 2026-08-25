/**
 * customerIdentity — Phase 38.
 *
 * One place that decides "is this the same guest?" so My Orders, Tracking and
 * Feedback can never disagree about who owns an order.
 *
 * The problem this solves: before this phase, ownership compared the entered
 * name with `===`. A guest who lost their tab session, re-scanned the same
 * valid table QR and typed "omar" instead of "Omar" was treated as a different
 * person — My Orders went empty and the feedback form vanished, even though
 * their order was sitting in storage.
 *
 * What this is NOT: authentication. See the same-name limitation at the bottom
 * of this file. Real identity belongs to the backend/customer-account
 * architecture later; this only removes *harmless formatting* as a reason to
 * lose your own order history.
 */

/**
 * Fold a human-entered name into a stable comparison key.
 *
 *   normalizeCustomerName(" Omar ")      → "omar"
 *   normalizeCustomerName("OMAR")        → "omar"
 *   normalizeCustomerName("Omar   Ali")  → "omar ali"
 *   normalizeCustomerName(" محمد ")      → "محمد"
 *   normalizeCustomerName("محمد   أحمد") → "محمد أحمد"
 *
 * Deliberately conservative — it only undoes differences that carry no
 * meaning:
 *
 *   • NFC, not NFKC. NFC composes canonically-equivalent sequences, so a name
 *     typed with a combining mark matches the same name typed precomposed
 *     ("José" either way). NFKC additionally does *compatibility* folding,
 *     which merges characters that genuinely look and mean different things —
 *     exactly the over-reach this phase warns against.
 *   • No diacritic stripping. Arabic tashkeel and the alef family (ا / أ / إ /
 *     آ) are left completely alone: folding them would merge names that are
 *     genuinely different people.
 *   • toLowerCase(), not toLocaleLowerCase(). The key must be deterministic
 *     regardless of which UI language the guest happens to be using; a
 *     locale-sensitive fold would make the same name normalize differently in
 *     English and Arabic. Arabic is caseless, so this step is a no-op there.
 *
 * `\s` in JavaScript already covers non-breaking space, the en/em quad range
 * and the ideographic space, so a name pasted from another app collapses the
 * same way one typed by hand does.
 *
 * @param {string} raw — the name exactly as the guest entered it
 * @returns {string} the comparison key, or "" for anything unusable
 */
export function normalizeCustomerName(raw) {
  if (typeof raw !== "string") return "";

  let name = raw;
  try {
    name = name.normalize("NFC");
  } catch {
    /* Engine without String.prototype.normalize — every other step below
       still applies, so matching degrades to "case + whitespace insensitive"
       rather than breaking. */
  }

  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The identity key for a session or an order snapshot.
 *
 * Legacy compatibility lives here and nowhere else: records created before
 * this phase have no `customerIdentityKey`, so the key is derived from their
 * stored `customerName` at read time. Nothing is written back — historical
 * orders are never rewritten just to carry a new field.
 *
 * Re-normalizing an already-stored key is intentional. It is idempotent, and
 * it means a key that was hand-edited in devtools or written by a future
 * variation of the fold still compares against a freshly derived one.
 *
 * @param {{customerName?:string, customerIdentityKey?:string}|null} record
 * @returns {string} "" when there is no usable name
 */
export function getIdentityKey(record) {
  if (!record) return "";
  return normalizeCustomerName(record.customerIdentityKey || record.customerName);
}

/**
 * Does this order belong to the guest holding this session?
 *
 * Name alone is never enough. The full table context is still required, in
 * exactly the combination the app already used before this phase:
 *
 *   restaurantSlug + qrToken + tableNumber + normalized identity
 *
 * so "Omar" at Table 7 still cannot see "Omar" at Table 3, and a regenerated
 * table token still detaches old orders precisely as it did before. The only
 * thing this phase loosened is the *name* comparison.
 *
 * An empty identity key never matches, so a malformed record with no name
 * cannot collide with another one.
 *
 * @param {object|null} order   — a stored order snapshot
 * @param {object|null} session — the current customer session
 * @returns {boolean}
 */
export function orderBelongsToSession(order, session) {
  if (!order || !session) return false;

  if (order.restaurantSlug !== session.restaurantSlug) return false;
  if (order.qrToken !== session.qrToken) return false;
  if (order.tableNumber !== session.tableNumber) return false;

  const orderKey = getIdentityKey(order);
  return orderKey !== "" && orderKey === getIdentityKey(session);
}

/* ── Known limitation ─────────────────────────────────────────────────────
   Two different guests seated at the same table who enter the same name are
   indistinguishable, and always were — table context plus a self-declared
   name is the whole identity model in a pre-backend product. This phase does
   not narrow that, and deliberately does not invent a local pseudo-auth
   (device fingerprints, secret codes) to paper over it: that would add real
   complexity and a false sense of security without actually authenticating
   anyone. Strong identity arrives with the backend. */
