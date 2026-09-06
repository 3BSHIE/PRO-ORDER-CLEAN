/**
 * platformContact — PRO·ORDER's own contact details for the customer footer.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  TEMPORARY DEMO VALUES — NOT PRODUCTION COMPANY INFORMATION.         ║
 * ║                                                                      ║
 * ║  Phase 84 added the footer's contact row for VISUAL REVIEW only. The ║
 * ║  owner has not finalised PRO·ORDER's real phone, email or social     ║
 * ║  handle. Nothing below has been verified, and none of it should be   ║
 * ║  published, printed, quoted to a customer, or shipped to production. ║
 * ║                                                                      ║
 * ║  TO REPLACE: edit this file only. It is the single source for these  ║
 * ║  values — no component hardcodes them (§30).                         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ── WHY SOME ENTRIES HAVE NO href ────────────────────────────────────────
 *   The phone is a deliberately unfinished pattern ("7X XXX XXXX"), so a
 *   tel: link built from it would ask the guest's phone to dial a number
 *   containing the letter X. §31 explicitly rules that out, so `href` is null
 *   and the footer renders it as plain text instead of a link.
 *
 *   The email and Instagram values are at least syntactically well-formed, so
 *   they keep real mailto:/https: structures — that is what the footer's link
 *   markup needs to be reviewed against. They still point at a demo address
 *   and a demo handle.
 *
 *   The footer decides link-vs-text purely from `href`, so filling in a real
 *   phone number here turns that row into a working tel: link with no
 *   component change.
 */

/** True while any value above is still a placeholder. Kept explicit so a
 *  future phase can assert on it rather than eyeballing the strings. */
export const PLATFORM_CONTACT_IS_DEMO = true;

/**
 * @type {Array<{
 *   id: string,
 *   icon: "phone"|"mail"|"instagram",
 *   labelKey: string,
 *   labelFallback: string,
 *   value: string,
 *   href: string|null,
 *   external?: boolean,
 * }>}
 */
export const PLATFORM_CONTACT = [
  {
    id: "phone",
    icon: "phone",
    labelKey: "customer.phone",
    labelFallback: "Phone",
    value: "+962 7X XXX XXXX",
    // null on purpose — see the note above. Not dialable while it contains X.
    href: null,
  },
  {
    id: "email",
    icon: "mail",
    labelKey: "customer.email",
    labelFallback: "Email",
    value: "hello@pro-order.com",
    href: "mailto:hello@pro-order.com",
  },
  {
    id: "instagram",
    icon: "instagram",
    labelKey: "common.instagram",
    labelFallback: "Instagram",
    value: "@proorder.jo",
    href: "https://instagram.com/proorder.jo",
    external: true,
  },
];
