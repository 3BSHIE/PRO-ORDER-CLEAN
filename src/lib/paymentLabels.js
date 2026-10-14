/**
 * paymentLabels — Phase 112.1 acceptance fix
 *
 * One way to turn a stored payment method into text a person reads.
 *
 * ── WHY IT IS A MODULE ──────────────────────────────────────────────────
 * Every order and every settled bill freezes the method it was collected
 * with: an id, plus the English label that existed at that moment. The id is
 * the record; the label is a snapshot, and a snapshot must never be the thing
 * an Arabic reader is shown. Live Orders already resolved the id through the
 * translation table and kept the frozen label only as a fallback. The paid
 * Combined Bill card did not, so it printed "Cash at the table" inside an
 * otherwise Arabic sentence.
 *
 * Both now call this. The stored record is untouched — nothing here writes.
 */

/** Method id → translation key. Ids are stable; labels are not. */
export const METHOD_LABEL_KEY = {
  cash_at_table: "payment.cashAtTable",
  card_at_table: "payment.cardAtTable",
  online_payment: "payment.onlinePayment",
};

/**
 * @param {(key:string, fallback:string)=>string} t — the caller's translator
 * @param {{id?:string, label?:string}|null} paymentMethod — as stored
 * @returns {string} the method in the reader's language, the frozen label if
 *   the id is unknown (a legacy or future method), or an em dash if there is
 *   no method at all — which is normal for a staff order that is not settled.
 */
export function resolveMethodLabel(t, paymentMethod) {
  const id = paymentMethod?.id;
  const frozen = paymentMethod?.label;
  if (id && METHOD_LABEL_KEY[id]) return t(METHOD_LABEL_KEY[id], frozen || id);
  return frozen || id || "—";
}
