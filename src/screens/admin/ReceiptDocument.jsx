import { fmtPrice } from "../../lib/format.js";
import { RECEIPT_KIND } from "../../lib/receiptModel.js";
import { useRestaurantLogoSrc } from "../../lib/restaurantLogoAssets.js";
import { isSafeImageSrc } from "../../lib/safeImage.js";

/**
 * ReceiptDocument — Phase 118.0. A conventional restaurant bill or payment
 * receipt, drawn to print.
 *
 * ── WHY ITS WORDS DO NOT COME FROM t() ───────────────────────────────────
 * Every other surface in the product speaks the language the STAFF chose.
 * This one speaks the language the RESTAURANT chose for its customers
 * (§32), and the two are deliberately independent: a cashier working in
 * English in Amman still hands out Arabic receipts. So the labels live here
 * as EN/AR pairs selected by settings.receiptLanguage, rather than in the
 * UI dictionary, where they would silently follow the wrong language.
 *
 * ── WHY IT LOOKS LIKE A RECEIPT AND NOT LIKE PRO·ORDER ───────────────────
 * No cards, no accent colour, no rounded surfaces, no brand furniture. A
 * centred header, hairline rules, one money column and a monospaced-digit
 * total — the shape anyone who has held a restaurant bill already knows
 * (§6). It is black on white because that is all a thermal head can do, and
 * because ink coverage is paper cost.
 *
 * ── IT RENDERS OFF-SCREEN ────────────────────────────────────────────────
 * Mounted inside Live Orders but hidden on screen; @media print reveals it
 * and hides the application. That is the technique the table stand and the
 * revenue report already use, and it is what keeps printing from needing a
 * popup, an iframe, a route, or anything that could lose the cashier's
 * place on the page (§27).
 */

/* Document labels. [en, ar] — the only place receipt wording is defined. */
const L = {
  bill:        ["Bill", "فاتورة حساب"],
  receipt:     ["Payment Receipt", "إيصال دفع"],
  combined:    ["Combined Bill", "فاتورة مجمّعة"],
  order:       ["Order", "طلب"],
  table:       ["Table", "طاولة"],
  tables:      ["Tables", "طاولات"],
  directOrder: ["Direct Order", "طلب مباشر"],
  date:        ["Date", "التاريخ"],
  subtotal:    ["Subtotal", "المجموع"],
  service:     ["Service", "الخدمة"],
  total:       ["Total", "الإجمالي"],
  amountDue:   ["Amount Due", "المبلغ المطلوب"],
  paidAmount:  ["Paid", "المدفوع"],
  method:      ["Method", "طريقة الدفع"],
  paidAt:      ["Paid at", "وقت الدفع"],
  paidStamp:   ["PAID", "مدفوعة"],
  cash:        ["Cash", "نقدًا"],
  card:        ["Card", "بطاقة"],
  canceled:    ["Canceled after payment", "أُلغي بعد الدفع"],
  reprint:     ["Reprint", "نسخة"],
  thanks:      ["Thank you", "شكرًا لزيارتكم"],
};

/* A label in the configured receipt language. Bilingual stacks the two
   rather than joining them with a slash: on 58mm paper a joined pair wraps
   mid-phrase and reads worse than two short lines (§33). */
function label(key, lang) {
  const [en, ar] = L[key];
  if (lang === "ar") return ar;
  if (lang === "en") return en;
  return `${en} · ${ar}`;
}

function BiLabel({ k, lang }) {
  const [en, ar] = L[k];
  if (lang === "ar") return <>{ar}</>;
  if (lang === "en") return <>{en}</>;
  return (
    <>
      {en}
      <span className="rcpt__alt"> {ar}</span>
    </>
  );
}

function methodLabel(payment, lang) {
  const id = (payment?.methodId || "").toLowerCase();
  if (id.includes("cash")) return label("cash", lang);
  if (id.includes("card")) return label("card", lang);
  /* Never invent one. A settlement without a recorded method prints the
     label it was stored with, or nothing at all. */
  return payment?.methodLabel || "—";
}

function formatStamp(iso, lang) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  /* en-GB for an unambiguous day/month order; Arabic receipts use Arabic
     month names with Western digits, which is what Jordanian receipts
     overwhelmingly print. */
  const locale = lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
  return d.toLocaleString(locale, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/* The venue mark. Resolved through the shared hook so an uploaded logo
   works exactly as it does everywhere else, and anything unresolvable
   simply renders nothing rather than a broken-image glyph (§7). */
function VenueLogo({ logoUrl }) {
  const src = useRestaurantLogoSrc(logoUrl);
  if (!isSafeImageSrc(src)) return null;
  return <img className="rcpt__logo" src={src} alt="" />;
}

function Money({ value }) {
  return <span className="rcpt__money">{fmtPrice(value)}</span>;
}

function Section({ section, lang, showHeading }) {
  return (
    <div className="rcpt__section">
      {showHeading && (
        <div className="rcpt__section-head">
          <span>
            {label("order", lang)} {section.ref}
          </span>
          <span>
            {section.isDirect
              ? label("directOrder", lang)
              : `${label("table", lang)} ${section.tableNumber}`}
          </span>
        </div>
      )}
      {section.lines.map((line) => (
        <div className="rcpt__line" key={line.key}>
          <div className="rcpt__line-main">
            <span className="rcpt__qty">{line.quantity}×</span>
            <span className="rcpt__name">{line.name}</span>
            {/* The one figure in the money column, and already inclusive of
                every modifier below it — see receiptModel. */}
            <Money value={line.lineTotal} />
          </div>
          {line.mods.length > 0 && (
            <div className="rcpt__mods">
              {line.mods.map((mod, i) => (
                <span className="rcpt__mod" key={i}>
                  {mod.removed ? "− " : "+ "}
                  {mod.label}
                  {mod.price ? ` ${mod.price.toFixed(3)}` : ""}
                </span>
              ))}
            </div>
          )}
          {line.notes && <div className="rcpt__note">“{line.notes}”</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.doc — a model from receiptModel.js
 * @param {string} props.lang — "en" | "ar" | "bilingual"
 */
export default function ReceiptDocument({ doc, lang }) {
  if (!doc) return null;

  const isReceipt = doc.kind === RECEIPT_KIND.RECEIPT;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const title = doc.combined && !isReceipt ? "combined" : isReceipt ? "receipt" : "bill";
  const orderedAt = formatStamp(doc.orderedAt, lang);
  const paidAt = formatStamp(doc.payment?.paidAt, lang);
  const printedAt = formatStamp(doc.printedAt, lang);

  return (
    <div className="rcpt" dir={dir} lang={lang === "ar" ? "ar" : "en"}>
      <header className="rcpt__head">
        <VenueLogo logoUrl={doc.venue.logoUrl} />
        {/* Blank when the restaurant has no name. Nothing is substituted. */}
        {doc.venue.name && <h1 className="rcpt__venue">{doc.venue.name}</h1>}
        {doc.venue.phone && <p className="rcpt__contact">{doc.venue.phone}</p>}
        {doc.venue.address && <p className="rcpt__contact">{doc.venue.address}</p>}
      </header>

      <hr className="rcpt__rule" />

      <p className="rcpt__kind">
        <BiLabel k={title} lang={lang} />
      </p>

      <dl className="rcpt__meta">
        {doc.docRef && (
          <div className="rcpt__meta-row">
            <dt>{label("order", lang)}</dt>
            <dd>{doc.docRef}</dd>
          </div>
        )}
        {!doc.combined && (
          <div className="rcpt__meta-row">
            <dt>{doc.isDirect ? "" : label("table", lang)}</dt>
            <dd>{doc.isDirect ? label("directOrder", lang) : doc.tableNumber}</dd>
          </div>
        )}
        {doc.combined && doc.tables.length > 0 && (
          <div className="rcpt__meta-row">
            <dt>{doc.tables.length > 1 ? label("tables", lang) : label("table", lang)}</dt>
            <dd>{doc.tables.join(", ")}</dd>
          </div>
        )}
        {orderedAt && (
          <div className="rcpt__meta-row">
            <dt>{label("date", lang)}</dt>
            <dd>{orderedAt}</dd>
          </div>
        )}
      </dl>

      <hr className="rcpt__rule" />

      {/* Members keep their own headings so a cross-table bill says where
          each part came from; a single order needs none. */}
      {doc.sections.map((section) => (
        <Section key={section.ref} section={section} lang={lang} showHeading={doc.combined} />
      ))}

      <hr className="rcpt__rule" />

      <div className="rcpt__totals">
        {/* Only shown when the order genuinely carries the split. A combined
            bill has none to show and repeating its total three times would
            be the padding §7 warns against. */}
        {doc.money.subtotal !== null && doc.money.subtotal !== doc.money.total && (
          <>
            <div className="rcpt__total-row">
              <span>{label("subtotal", lang)}</span>
              <Money value={doc.money.subtotal} />
            </div>
            {doc.money.serviceCharge > 0 && (
              <div className="rcpt__total-row">
                <span>
                  {label("service", lang)}
                  {doc.money.serviceChargePercent ? ` ${doc.money.serviceChargePercent}%` : ""}
                </span>
                <Money value={doc.money.serviceCharge} />
              </div>
            )}
          </>
        )}
        <div className="rcpt__total-row rcpt__total-row--grand">
          <span>
            <BiLabel k={isReceipt ? "paidAmount" : "amountDue"} lang={lang} />
          </span>
          <Money value={doc.money.total} />
        </div>
      </div>

      {isReceipt && doc.payment && (
        <>
          <hr className="rcpt__rule" />
          <div className="rcpt__pay">
            <p className="rcpt__stamp">{label("paidStamp", lang)}</p>
            <div className="rcpt__meta-row">
              <dt>{label("method", lang)}</dt>
              <dd>{methodLabel(doc.payment, lang)}</dd>
            </div>
            {/* The ORIGINAL settlement time, never the time of this print.
                A reprint an hour later still says when the money changed
                hands (§5/§35). */}
            {paidAt && (
              <div className="rcpt__meta-row">
                <dt>{label("paidAt", lang)}</dt>
                <dd>{paidAt}</dd>
              </div>
            )}
          </div>
        </>
      )}

      {/* Stated, not acted on: the amount above is the one that was settled,
          and a cancellation afterwards is not a refund (§18). */}
      {doc.canceledAfterPayment && (
        <p className="rcpt__flag">{label("canceled", lang)}</p>
      )}

      <hr className="rcpt__rule" />

      <footer className="rcpt__foot">
        <p className="rcpt__thanks">{label("thanks", lang)}</p>
        {/* The print time, named as such, so it can never be mistaken for
            the payment time on a reprinted receipt. */}
        {printedAt && <p className="rcpt__printed">{printedAt}</p>}
      </footer>
    </div>
  );
}
