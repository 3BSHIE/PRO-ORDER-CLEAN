import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  HelpCircle,
  ConciergeBell,
  Wifi,
  Lock,
} from "lucide-react";
import Card from "../../components/ui/Card.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Modal from "../../components/ui/Modal.jsx";
import LocalizedField from "../../components/ui/LocalizedField.jsx";
import { useLanguage } from "../../i18n/useLanguage.js";
import {
  SERVICE_TYPE,
  NAME_MAX,
  ANSWER_MAX,
  WIFI_FIELD_MAX,
  otherService,
  serviceName,
  isInstantConfigured,
  addAssistanceService,
  updateAssistanceService,
  deleteAssistanceService,
  moveAssistanceService,
  validateAssistanceService,
} from "../../lib/assistanceData.js";

/**
 * AssistanceServicesCard — Phase 123.0. The Admin side of "Need Help?".
 *
 * ── ONE LIST, TWO KINDS ───────────────────────────────────────────────────
 * Instant Answers and Staff Requests are configured in the same ordered
 * list, because that order IS the order the guest sees and splitting them
 * into two lists would take that control away. The kind is stated per row —
 * an icon and a word — rather than by grouping.
 *
 * ── WHY THIS CARD SAVES IMMEDIATELY ───────────────────────────────────────
 * Every other card on this screen feeds the page's draft and commits through
 * one Save, and Phase 96.2 was right that two adjacent cards committing
 * differently is the worst outcome. This card is deliberately not one of
 * them, and it is built not to look like one: no inline fields, no values to
 * leave half-typed. Rows are a list with Edit and Delete, and the editing
 * happens inside a dialog with its own Save — the same shape as the Products
 * screen, which is the workflow this actually is.
 *
 * Folding CRUD into a page draft would mean a reorder is an unsaved change, a
 * delete can be abandoned, and an Add has to survive a Discard. The hint
 * under the title says plainly that changes save immediately, so nothing
 * here is a surprise.
 *
 * ── THE PERMANENT ROW ─────────────────────────────────────────────────────
 * "Other Request" is rendered last with no controls at all. It cannot be
 * edited, disabled, deleted, reordered or converted, and the reason is on
 * screen rather than enforced silently: a guest must always have a way to
 * ask for something nobody thought of.
 *
 * Props:
 *   restaurantSlug — which restaurant's services to manage
 *   services       — the live list from useAssistanceServices (configurable
 *                    rows only; Other is appended here for display)
 *   onToast        — (message) => void, for the confirmations
 */
export default function AssistanceServicesCard({ restaurantSlug, services, onToast }) {
  const { t, language } = useLanguage();

  /* `draft === null` means the dialog is closed. An id of null inside the
     draft means Add rather than Edit — one dialog, because the fields are
     identical and a separate Add form would drift from the Edit one. */
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  const other = otherService();

  function openAdd() {
    setErrors({});
    setDraft({ id: null, type: SERVICE_TYPE.REQUEST, enabled: true, name: {}, answer: {} });
  }

  function openEdit(service) {
    setErrors({});
    setDraft({
      id: service.id,
      kind: service.kind,
      type: service.type,
      enabled: service.enabled,
      name: service.name || {},
      answer: service.answer || {},
      wifiNetwork: service.wifiNetwork || "",
      wifiPassword: service.wifiPassword || "",
    });
  }

  function save() {
    const result = validateAssistanceService(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (draft.id) updateAssistanceService(restaurantSlug, draft.id, draft);
    else addAssistanceService(restaurantSlug, draft);
    setDraft(null);
    setErrors({});
    onToast?.(t("assist.savedToast", "Assistance updated"));
  }

  function remove(service) {
    deleteAssistanceService(restaurantSlug, service.id);
    setConfirmDelete(null);
    onToast?.(t("assist.deletedToast", "Service deleted"));
  }

  function toggle(service) {
    updateAssistanceService(restaurantSlug, service.id, { enabled: !service.enabled });
  }

  const isWifi = draft?.kind === "wifi";
  const isInstant = draft?.type === SERVICE_TYPE.INSTANT;

  return (
    <Card className="ad-settings__section">
      {/* The group heading above already says "Customer Assistance", so the
          card carries no heading of its own rather than printing it twice
          (the §39 rule the rest of this screen follows). */}
      <div className="asv-head">
        <p className="ad-settings__hint asv-head__hint">
          {t(
            "assist.adminHint",
            "What guests can ask for from the Need Help menu. Changes save immediately."
          )}
        </p>
        <Button variant="outline" size="sm" icon={Plus} onClick={openAdd}>
          {t("assist.addService", "Add Service")}
        </Button>
      </div>

      {services.length === 0 && (
        <p className="asv-empty">
          {t(
            "assist.emptyList",
            "No assistance services yet. Guests can still send an Other Request."
          )}
        </p>
      )}

      <ul className="asv-list">
        {services.map((service, index) => {
          const instant = service.type === SERVICE_TYPE.INSTANT;
          const needsSetup = instant && !isInstantConfigured(service);
          const Icon = service.kind === "wifi" ? Wifi : instant ? HelpCircle : ConciergeBell;
          return (
            <li
              key={service.id}
              className={`asv-row ${service.enabled ? "" : "asv-row--off"}`}
            >
              {/* Reorder with two buttons rather than a drag handle: a drag
                  target is unreachable by keyboard and awkward on the phone
                  a manager actually has in the restaurant. */}
              <div className="asv-row__order">
                <button
                  type="button"
                  className="asv-iconbtn"
                  onClick={() => moveAssistanceService(restaurantSlug, service.id, -1)}
                  disabled={index === 0}
                  aria-label={t("assist.moveUp", "Move up")}
                  title={t("assist.moveUp", "Move up")}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="asv-iconbtn"
                  onClick={() => moveAssistanceService(restaurantSlug, service.id, 1)}
                  disabled={index === services.length - 1}
                  aria-label={t("assist.moveDown", "Move down")}
                  title={t("assist.moveDown", "Move down")}
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <span className={`asv-row__kind asv-row__kind--${instant ? "instant" : "request"}`}>
                <Icon size={15} strokeWidth={2.1} />
              </span>

              <div className="asv-row__main">
                <span className="asv-row__name">{serviceName(service, language)}</span>
                <span className="asv-row__meta">
                  {instant
                    ? t("assist.typeInstant", "Instant Answer")
                    : t("assist.typeRequest", "Staff Request")}
                  {!service.enabled && (
                    <em className="asv-flag">{t("assist.disabledBadge", "Hidden")}</em>
                  )}
                  {needsSetup && (
                    <em className="asv-flag asv-flag--warn">
                      {t("assist.needsSetupBadge", "Needs setup")}
                    </em>
                  )}
                </span>
              </div>

              <div className="asv-row__actions">
                <label className="asv-switch" title={t("assist.enabledLabel", "Available to guests")}>
                  <input
                    type="checkbox"
                    checked={service.enabled}
                    onChange={() => toggle(service)}
                    aria-label={`${t("assist.enabledLabel", "Available to guests")} — ${serviceName(service, language)}`}
                  />
                </label>
                <button
                  type="button"
                  className="asv-iconbtn"
                  onClick={() => openEdit(service)}
                  aria-label={`${t("assist.editService", "Edit Service")} — ${serviceName(service, language)}`}
                  title={t("assist.editService", "Edit Service")}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="asv-iconbtn asv-iconbtn--danger"
                  onClick={() => setConfirmDelete(service)}
                  aria-label={`${t("assist.deleteConfirm", "Delete service")} — ${serviceName(service, language)}`}
                  title={t("assist.deleteConfirm", "Delete service")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          );
        })}

        {/* The permanent row. Shown here, with no controls, because a manager
            needs to KNOW it is offered to guests — leaving it out of this
            list would make the Admin order look like the guest's order while
            quietly differing from it. */}
        <li className="asv-row asv-row--locked">
          <div className="asv-row__order" aria-hidden="true">
            <Lock size={13} />
          </div>
          <span className="asv-row__kind asv-row__kind--request">
            <ConciergeBell size={15} strokeWidth={2.1} />
          </span>
          <div className="asv-row__main">
            <span className="asv-row__name">{serviceName(other, language)}</span>
            <span className="asv-row__meta">
              {t("assist.typeRequest", "Staff Request")}
              <em className="asv-flag asv-flag--on">{t("assist.permanentBadge", "Always on")}</em>
            </span>
          </div>
        </li>
      </ul>

      <p className="ad-settings__hint asv-foot">
        {t(
          "assist.permanentHint",
          "Always offered to guests, always last. It cannot be renamed, disabled or removed."
        )}
      </p>

      {/* ── Add / Edit ──────────────────────────────────────────────────── */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={
          draft?.id
            ? t("assist.editService", "Edit Service")
            : t("assist.newService", "New Service")
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={save}>{t("common.save", "Save")}</Button>
          </>
        }
      >
        {draft && (
          <div className="asv-form">
            <LocalizedField
              label={t("assist.serviceName", "Service name")}
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
              error={errors.name ? t("assist.nameRequired", "Add a name in at least one language.") : null}
              required
              maxLength={NAME_MAX}
            />

            {/* The Wi-Fi default is a fixed kind: it answers from two named
                fields instead of free text, so its response type is not a
                choice. Offering one would let a manager turn the password
                answer into something that summons a waiter. */}
            {!isWifi && (
              <fieldset className="field mm-field ap-fieldset">
                <legend className="field__label">
                  {t("assist.responseType", "Response type")}
                </legend>
                <div className="asv-types">
                  <TypeOption
                    id="asv-type-request"
                    checked={!isInstant}
                    onSelect={() => setDraft({ ...draft, type: SERVICE_TYPE.REQUEST })}
                    icon={ConciergeBell}
                    label={t("assist.typeRequest", "Staff Request")}
                    hint={t(
                      "assist.typeRequestHint",
                      "The guest selects it and your team gets one request."
                    )}
                  />
                  <TypeOption
                    id="asv-type-instant"
                    checked={isInstant}
                    onSelect={() => setDraft({ ...draft, type: SERVICE_TYPE.INSTANT })}
                    icon={HelpCircle}
                    label={t("assist.typeInstant", "Instant Answer")}
                    hint={t(
                      "assist.typeInstantHint",
                      "The guest reads it on the spot. Never reaches your team."
                    )}
                  />
                </div>
              </fieldset>
            )}

            {isInstant && !isWifi && (
              <LocalizedField
                label={t("assist.answer", "Answer")}
                value={draft.answer}
                onChange={(answer) => setDraft({ ...draft, answer })}
                error={
                  errors.answer
                    ? t("assist.answerRequired", "Add the answer in at least one language.")
                    : null
                }
                required
                multiline
                rows={3}
                maxLength={ANSWER_MAX}
              />
            )}

            {isWifi && (
              <>
                <div className="st-divider" role="presentation" />
                <h4 className="asv-subtitle">{t("assist.wifiDetails", "Wi-Fi details")}</h4>
                <Input
                  label={t("assist.networkName", "Network name")}
                  value={draft.wifiNetwork}
                  maxLength={WIFI_FIELD_MAX}
                  onChange={(e) => setDraft({ ...draft, wifiNetwork: e.target.value })}
                />
                {/* A visible field on purpose. This is the credential the
                    restaurant hands to every guest who asks, and a manager
                    typing it needs to see that it is right. It is masked
                    nowhere else either, because nothing about storing it in
                    this browser would be made safer by hiding it here. */}
                <Input
                  label={t("assist.password", "Password")}
                  value={draft.wifiPassword}
                  maxLength={WIFI_FIELD_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setDraft({ ...draft, wifiPassword: e.target.value })}
                  hint={t(
                    "assist.wifiHint",
                    "Shown to any guest who opens this answer. Use your guest network, not a private one."
                  )}
                />
              </>
            )}

          </div>
        )}
      </Modal>

      {/* ── Delete confirmation ─────────────────────────────────────────── */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={t("assist.deleteTitle", "Delete this service?")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button variant="danger" onClick={() => remove(confirmDelete)}>
              {t("assist.deleteConfirm", "Delete service")}
            </Button>
          </>
        }
      >
        {/* Says what happens to history, because the honest answer is
            "nothing": a request already sent keeps the words it was sent
            with. A manager hesitating over this button is usually asking
            exactly that. */}
        <p className="asv-confirm">
          {t(
            "assist.deleteBody",
            "Guests will no longer see “{name}”. Requests already sent keep their original wording."
          ).replace("{name}", serviceName(confirmDelete, language))}
        </p>
      </Modal>
    </Card>
  );
}

/**
 * One response-type choice: a real radio, with its consequence written out.
 *
 * The accessible name is set explicitly. The visible label holds two spans
 * and the name computed from them came out as the input's value — "on" —
 * which tells a screen-reader user nothing about which choice this is.
 */
function TypeOption({ id, checked, onSelect, icon: Icon, label, hint }) {
  return (
    <div className="asv-type">
      <input
        type="radio"
        id={id}
        name="asv-type"
        className="ap-choice__input"
        checked={checked}
        onChange={onSelect}
        aria-label={`${label} — ${hint}`}
      />
      <label className="asv-type__label" htmlFor={id}>
        <Icon size={15} strokeWidth={2.1} />
        <span className="asv-type__name">{label}</span>
        <span className="asv-type__hint">{hint}</span>
      </label>
    </div>
  );
}
