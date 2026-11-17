import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Check,
  Wifi,
  Copy,
  CheckCheck,
  HelpCircle,
  /* Phase 123.1 §6 — the SERVICE bell (the one on a hotel desk), which is
     what Admin already uses for a Staff Request in its own list. Not
     BellRing, which is a notification. Same icon, same library, so the two
     sides of the product name the same thing with the same mark. */
  ConciergeBell,
} from "lucide-react";
import Modal from "../../../components/ui/Modal.jsx";
import Button from "../../../components/ui/Button.jsx";
import { useLanguage } from "../../../i18n/useLanguage.js";
import { useAssistanceServices } from "../../../lib/useAssistanceServices.js";
import {
  SERVICE_TYPE,
  OTHER_SERVICE_ID,
  OTHER_DETAILS_MAX,
  serviceName,
  serviceAnswer,
} from "../../../lib/assistanceData.js";
import { createAssistanceRequest } from "../../../lib/staffCallData.js";

/**
 * AssistanceSheet — Phase 123.0. "How can we help you?"
 *
 * A bottom sheet on a phone and a centered dialog on a desktop, which is
 * what the shared Modal already is, so this adds no second shell.
 *
 * ── TWO KINDS OF ROW, AND WHY THEY LOOK DIFFERENT ─────────────────────────
 * An Instant Answer is a question with an answer already written: tapping it
 * opens the answer underneath, in place, and nothing is sent anywhere. A
 * Staff Request is something a person has to do: tapping it selects it, and
 * the button that sends them appears once at least one is chosen.
 *
 * The two must never be confusable, because one of them makes somebody walk
 * across a restaurant. So they are distinguished three times over — a
 * chevron against a selection mark, a different icon, and the fact that an
 * answer row cannot enter the count. An Instant Answer carries no checkbox
 * at all; there is nothing to select.
 *
 * ── ONE REQUEST, NOT SEVERAL ──────────────────────────────────────────────
 * Everything selected travels as a single staff call. A guest who wants
 * napkins and the table cleared has one need and should cause one visit, not
 * two rows on a cashier's screen and two trips.
 *
 * ── NO NATIVE CHECKBOXES ──────────────────────────────────────────────────
 * The visible mark is drawn by the stylesheet, but the control under it is a
 * real `<input type="checkbox">` kept visually hidden. That is what keeps the
 * row operable by keyboard and announced correctly, without the browser's
 * default box appearing in a premium sheet.
 *
 * ── WHAT IT DOES NOT CLAIM ────────────────────────────────────────────────
 * Submitting writes to this browser's localStorage. On a phone that is the
 * guest's own device, and a cashier standing at a different one does not
 * receive it — nothing here pretends otherwise. The confirmation says the
 * request was sent, which is true of the record; the delivery across devices
 * is a backend's job and does not exist yet.
 */
export default function AssistanceSheet({
  open,
  anchorRef,
  onClose,
  restaurantSlug,
  tableId,
  tableNumber,
  customerName,
  onNotify,
}) {
  const { t, language } = useLanguage();
  const { customerServices } = useAssistanceServices(restaurantSlug);

  /* A LIST, not one id. Phase 123.0 kept a single open answer, so opening
     the opening hours shut the Wi-Fi password a guest was halfway through
     typing into their phone. These are independent questions and §10 asks
     that they behave like it. */
  const [expandedIds, setExpandedIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [otherDetails, setOtherDetails] = useState("");
  const [otherError, setOtherError] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const detailsRef = useRef(null);
  const copyTimer = useRef(null);

  /* The portal's host, resolved after mount rather than read during render.
     createPortal throws outright if its container is not an element, and
     document.body is genuinely absent for a moment while a document is being
     replaced — a navigation that lands mid-render crashed this component into
     the error boundary once, which is a whole screen lost for a help sheet.
     Resolving it in an effect means the first render simply has no host and
     renders nothing, which is what a closed sheet does anyway.

     ── Phase 123.1 §12 — and it must be the THEME element ──────────────────
     Portalling to <body> alone put the sheet outside .customer-theme, which
     is the element CustomerTheme writes the restaurant's colours onto.
     Measured: overriding --gold on that wrapper changed the whole menu and
     changed nothing in the sheet, so a restaurant that had chosen blue got
     a sheet in PRO-ORDER's default gold. Hosting it in the theme element
     instead fixes that at the root rather than by naming colours twice.

     The anchor is the entry button, which is always inside the theme, so
     this asks "my own theme scope" rather than hunting the document for a
     class name. Body remains the fallback, because a sheet in the wrong
     colour is still far better than no sheet. */
  const [host, setHost] = useState(null);
  useEffect(() => {
    const anchor = anchorRef?.current;
    setHost(anchor?.closest(".restaurant-theme") || document.body);
  }, [anchorRef]);

  /* A fresh sheet every time it opens. A guest who closed it without sending
     did not mean to keep a half-made request waiting for their next tap. */
  useEffect(() => {
    if (open) return;
    setExpandedIds([]);
    setSelectedIds([]);
    setOtherDetails("");
    setOtherError(false);
    setSent(false);
    setCopied(false);
  }, [open]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const selected = customerServices.filter((s) => selectedIds.includes(s.id));
  const otherSelected = selectedIds.includes(OTHER_SERVICE_ID);
  const count = selected.length;

  function toggleSelect(service) {
    setOtherError(false);
    setSelectedIds((prev) =>
      prev.includes(service.id) ? prev.filter((id) => id !== service.id) : [...prev, service.id]
    );
  }

  function toggleExpand(service) {
    setExpandedIds((prev) =>
      prev.includes(service.id) ? prev.filter((id) => id !== service.id) : [...prev, service.id]
    );
  }

  async function copyPassword(password) {
    /* The value goes to the clipboard and nowhere else — it is never logged,
       never put in a URL and never attached to the request record. */
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard refused (permission, insecure context). The password is
         on screen already, so there is nothing to recover from and nothing
         worth interrupting the guest about. */
    }
  }

  function submit() {
    if (count === 0) return;

    const details = otherDetails.trim();
    if (otherSelected && !details) {
      setOtherError(true);
      detailsRef.current?.focus();
      return;
    }

    const result = createAssistanceRequest(restaurantSlug, {
      tableId,
      tableNumber,
      customerName,
      services: selected.map((s) => ({
        serviceId: s.id,
        /* The whole localized name, so staff read it in THEIR language and
           a later rename cannot rewrite what was asked. */
        name: s.name,
        type: s.type,
        details: s.id === OTHER_SERVICE_ID ? details : undefined,
      })),
    });

    /* A refused duplicate is still a request the guest made and a record
       that exists, so they are told it was sent rather than shown an error
       for pressing twice. */
    setSent(true);
    onNotify?.(
      result.ok
        ? t("assist.requestSent", "Your request has been sent.")
        : t("assist.alreadySending", "That request has just been sent.")
    );
  }

  /* No selection, no button. An action that cannot do anything should not be
     sitting there greyed out, inviting a guest to wonder what they missed. */
  const footer =
    !sent && count > 0 ? (
      <Button full onClick={submit}>
        {t("assist.sendRequestCount", "Send Request ({n})").replace("{n}", String(count))}
      </Button>
    ) : null;

  /* ── Why this is a portal ────────────────────────────────────────────────
     The entry lives in the sticky customer topbar, and that bar carries a
     backdrop-filter. A filter makes its element the containing block for
     everything `position: fixed` inside it, so the sheet's overlay inherited
     the bar's 60px height and the dialog hung 512px above the screen —
     measured, not guessed. Rendering into <body> puts the overlay back
     against the viewport, where a full-screen overlay belongs, and keeps the
     component usable from any placement without each caller having to know
     this. */
  if (!host) return null;

  return createPortal(
    <Modal
      open={open}
      onClose={onClose}
      title={
        sent
          ? t("assist.requestSentTitle", "Request sent")
          : t("assist.sheetTitle", "How can we help you?")
      }
      className="asheet"
      footer={footer}
    >
      {sent ? (
        <div className="asheet__done">
          <span className="asheet__done-mark" aria-hidden="true">
            <Check size={26} strokeWidth={2.6} />
          </span>
          <p className="asheet__done-title">
            {t("assist.requestSent", "Your request has been sent.")}
          </p>
          <p className="asheet__done-body">
            {t("assist.requestSentBody", "Someone will be with you shortly.")}
          </p>
          <Button variant="outline" full onClick={onClose}>
            {t("common.close", "Close")}
          </Button>
        </div>
      ) : (
        <>
          <p className="asheet__hint">
            {t("assist.sheetHint", "Tap an answer to read it, or choose what you need from us.")}
          </p>

          <ul className="asheet__list">
            {customerServices.map((service) => {
              const name = serviceName(service, language);
              if (service.type === SERVICE_TYPE.INSTANT) {
                const expanded = expandedIds.includes(service.id);
                const isWifi = service.kind === "wifi";
                return (
                  <li key={service.id} className="asheet__item">
                    <button
                      type="button"
                      className={`asheet__row asheet__row--answer ${expanded ? "is-open" : ""}`}
                      aria-expanded={expanded}
                      onClick={() => toggleExpand(service)}
                    >
                      {/* §8 — a bare icon. It used to sit in a 30px outlined
                          box, which gave every row a second rectangle inside
                          the first and made a seven-row list read as seven
                          cards. The chevron is what says this row opens. */}
                      {isWifi ? (
                        <Wifi className="asheet__icon" size={18} strokeWidth={2} aria-hidden="true" />
                      ) : (
                        <HelpCircle className="asheet__icon" size={18} strokeWidth={2} aria-hidden="true" />
                      )}
                      <span className="asheet__name">{name}</span>
                      <ChevronDown className="asheet__chev" size={16} aria-hidden="true" />
                    </button>

                    {expanded && (
                      <div className="asheet__answer">
                        {isWifi ? (
                          <dl className="asheet__wifi">
                            <div className="asheet__wifi-row">
                              <dt>{t("assist.wifiNetwork", "Network")}</dt>
                              <dd>{service.wifiNetwork}</dd>
                            </div>
                            <div className="asheet__wifi-row">
                              <dt>{t("assist.wifiPassword", "Password")}</dt>
                              <dd className="asheet__wifi-pass">
                                <code>{service.wifiPassword}</code>
                                <button
                                  type="button"
                                  className="asheet__copy"
                                  onClick={() => copyPassword(service.wifiPassword)}
                                >
                                  {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
                                  {copied
                                    ? t("assist.copied", "Copied")
                                    : t("assist.copyPassword", "Copy password")}
                                </button>
                              </dd>
                            </div>
                          </dl>
                        ) : (
                          <p className="asheet__answer-text">{serviceAnswer(service, language)}</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              }

              const checked = selectedIds.includes(service.id);
              const isOther = service.id === OTHER_SERVICE_ID;
              return (
                <li key={service.id} className="asheet__item">
                  <label className={`asheet__row asheet__row--pick ${checked ? "is-on" : ""}`}>
                    <input
                      type="checkbox"
                      className="asheet__input"
                      checked={checked}
                      onChange={() => toggleSelect(service)}
                      /* The visible name sits in a sibling span, and the
                         name computed from the wrapping label came out as
                         the input's value — "on" — which tells a screen
                         reader nothing about what is being selected. */
                      aria-label={name}
                    />
                    {/* §6/§7 — the service bell leads the row, and it stays
                        put whether the row is selected or not. The empty
                        checkbox square that used to sit here said "this is a
                        form"; a bell says what the row is for. */}
                    <ConciergeBell
                      className="asheet__icon"
                      size={18}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <span className="asheet__name">{name}</span>
                    {/* The acknowledgement, not a control. It is always
                        mounted and fades in, so selecting a row cannot shift
                        its own label sideways by 16px. The real checkbox is
                        the visually-hidden input above, which is what a
                        screen reader reads and what the keyboard operates. */}
                    <Check
                      className="asheet__tick"
                      size={15}
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  </label>

                  {/* Only the permanent row asks for words, and only once it
                      is chosen — a textarea sitting open under an unselected
                      row is an invitation to type something nobody will
                      read. */}
                  {isOther && checked && (
                    <div className="asheet__details">
                      <label className="asheet__details-label" htmlFor="asheet-other">
                        {t("assist.otherDetailsLabel", "Tell us what you need")}
                      </label>
                      <textarea
                        id="asheet-other"
                        ref={detailsRef}
                        className={`input asheet__textarea ${otherError ? "input--error" : ""}`}
                        rows={2}
                        maxLength={OTHER_DETAILS_MAX}
                        value={otherDetails}
                        placeholder={t(
                          "assist.otherDetailsPlaceholder",
                          "A high chair, a straw, help with the menu…"
                        )}
                        onChange={(e) => {
                          setOtherDetails(e.target.value);
                          if (otherError) setOtherError(false);
                        }}
                        aria-invalid={otherError || undefined}
                      />
                      {otherError && (
                        <span className="field__hint field__hint--error">
                          {t("assist.otherDetailsRequired", "Please tell us what you need.")}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>,
    host
  );
}
