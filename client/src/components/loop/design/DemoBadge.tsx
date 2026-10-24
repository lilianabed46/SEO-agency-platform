import { t } from "../../../i18n";
import "../design-system.css";

/** Shared "demo data" marker — replaces the three near-identical inline spans that used
 * to live separately in Diagnosis, Decision/Action and the content draft view. */
export function DemoBadge() {
  return <span className="demo-badge">{t("common.demoData")}</span>;
}
