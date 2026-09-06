import { Phone, Mail, Instagram } from "lucide-react";
import Logo from "../../../components/brand/Logo.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { PLATFORM_CONTACT } from "../../../data/platformContact.js";

/**
 * CustomerFooter — Phase 45, extended in Phase 84 (Unit 2, §28–§34).
 *
 * PRO·ORDER's entire presence in the customer experience, in one place.
 *
 * Before Phase 45 the platform mark sat in every customer topbar at 40px and
 * opened the Welcome screen at 100px, while the restaurant got an 11px
 * uppercase eyebrow — the guest was shown the software more prominently than
 * the restaurant they were sitting in. That is inverted here: the topbars
 * carry the restaurant, and PRO·ORDER appears once per screen, at the end of
 * the content, as provider attribution.
 *
 * ── OWNERSHIP, WHICH IS THE WHOLE REASON THIS IS SEPARATE ────────────────
 *   This footer is PRO·ORDER's. The restaurant's own description, cover,
 *   phone, email and address live in Restaurant Info and never appear here
 *   (§39). Two different parties, two different surfaces — mixing them would
 *   make it impossible to tell whose phone number a guest is looking at.
 *
 * ── STILL DELIBERATELY QUIET ─────────────────────────────────────────────
 *   Muted text, 16px mark, small icons, no card, no accent colour. Phase 45's
 *   reasoning holds: attribution should read as a credit line, not as
 *   something to click, and it stays out of the restaurant's theme colours so
 *   the restaurant's identity keeps them (§32).
 *
 *   Not sticky, and rendered inside the normal content flow, so it can never
 *   sit over the cart bar, the cart FAB or a safe-area inset (§34).
 *
 * @param {boolean} [showContact] — render PRO·ORDER's contact channels.
 *
 *   Off by default on purpose. This component already appears on Cart,
 *   Confirmation, My Orders and Tracking, and Unit 2 only reviewed the Menu.
 *   Defaulting to false means those four screens keep exactly the footer they
 *   had, and each later unit can opt in when its own review says so (§35) —
 *   rather than this phase silently changing four screens nobody looked at.
 */
export default function CustomerFooter({ showContact = false }) {
  const { t } = useLanguage();

  return (
    <footer className="cust-footer">
      <div className="cust-footer__mark">
        <Logo variant="icon" size="nav" className="cust-footer__logo" />
        <span className="cust-footer__powered">
          {t("common.poweredBy", "Powered by")} <strong>PRO·ORDER</strong>
        </span>
      </div>
      <p className="cust-footer__tagline">
        {t("common.platformTagline", "Digital ordering technology for restaurants")}
      </p>

      {showContact && (
        /* One restrained row that wraps to two lines on small phones (§33).
           Values come from data/platformContact.js and are TEMPORARY DEMO
           PLACEHOLDERS — see the banner in that file. */
        <ul className="cust-footer__contact">
          {PLATFORM_CONTACT.map((entry) => (
            <li key={entry.id} className="cust-footer__contact-item">
              <ContactRow entry={entry} t={t} />
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}

const ICONS = { phone: Phone, mail: Mail, instagram: Instagram };

/**
 * One channel. Renders as a link when the entry carries an href and as plain
 * text when it does not — which is how the placeholder phone number avoids
 * becoming a tel: link full of X characters (§31).
 */
function ContactRow({ entry, t }) {
  const Icon = ICONS[entry.icon] ?? Mail;
  const label = t(entry.labelKey, entry.labelFallback);

  const body = (
    <>
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      {/* A phone number, an address and a handle are all bare Latin tokens:
          they must keep their own direction inside Arabic copy, exactly as
          prices and order ids already do (§44). */}
      <span className="cust-footer__contact-value">{entry.value}</span>
    </>
  );

  if (!entry.href) {
    /* The icon is decorative and the value is not self-describing, so the
       channel name has to reach assistive tech some other way (§43). */
    return (
      <span className="cust-footer__contact-text" aria-label={`${label}: ${entry.value}`}>
        {body}
      </span>
    );
  }

  return (
    <a
      className="cust-footer__contact-link"
      href={entry.href}
      aria-label={`${label}: ${entry.value}`}
      {...(entry.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {body}
    </a>
  );
}
