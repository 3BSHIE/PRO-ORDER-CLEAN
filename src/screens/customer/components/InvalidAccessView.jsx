import { TriangleAlert, ArrowLeft } from "lucide-react";
import Button from "../../../components/ui/Button.jsx";
import { ACCESS_REASON_KEY, ACCESS_REASON_FALLBACK } from "../../../lib/tableData.js";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * InvalidAccessView — Phase 24 production polish.
 *
 * Shown whenever resolveTableAccess() fails (bad restaurant slug, unknown
 * QR token, or an inactive table) — identical markup was previously
 * copy-pasted as a local `InvalidView` function into all 6 customer
 * screens (Access, Menu, Cart, Confirmation, Tracking, My Orders). Every
 * copy was byte-for-byte the same, so this is the one shared version they
 * all render now; behavior is completely unchanged.
 *
 * @param {"restaurant"|"token"|"inactive"} reason
 * @param {() => void} onHome
 */
export default function InvalidAccessView({ reason, onHome }) {
  const { t } = useLanguage();
  return (
    <div className="access anim-rise">
      <span className="access__mark access__mark--error">
        <TriangleAlert size={34} strokeWidth={1.8} />
      </span>
      <h1 className="access__table">{t("common.invalidTableAccess", "Invalid table access")}</h1>
      <p className="access__msg">
        {t("common.invalidTableAccessMsg", "Please scan the QR code placed on your table to open the menu.")}
      </p>
      {ACCESS_REASON_KEY[reason] && (
        <p className="access__reason">{t(ACCESS_REASON_KEY[reason], ACCESS_REASON_FALLBACK[reason])}</p>
      )}
      <Button variant="outline" icon={ArrowLeft} onClick={onHome}>
        {t("common.backHome", "Back to home")}
      </Button>
    </div>
  );
}
