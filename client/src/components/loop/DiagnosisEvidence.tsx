import type { Diagnosis } from "../../types";
import { MUTED, pct } from "./format";
import { t } from "../../i18n";

interface DiagnosisEvidenceProps {
  diagnosis: Diagnosis;
}

/**
 * S4-2 step 1: evidence + reason display extracted out of DiagnosisPanel so the same
 * markup renders both there (Diagnosis tab, full list) and inline inside an expanded
 * Decision/Opportunities row (S4-2's "بلا تنقّل إلى تبويب آخر" requirement) — one
 * component, not two copies that can drift.
 */
export function DiagnosisEvidence({ diagnosis }: DiagnosisEvidenceProps) {
  return (
    <div>
      {diagnosis.evidence.length > 0 && (
        <>
          <p style={{ margin: "8px 0 4px", fontWeight: 600 }}>{t("diagnosis.evidence")}</p>
          <ul style={{ margin: "0 0 8px" }}>
            {diagnosis.evidence.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </>
      )}
      <p style={{ margin: "0 0 4px" }}>
        <b>{t("diagnosis.rootCause")}:</b> {diagnosis.root_cause}
      </p>
      <p style={{ margin: "0 0 8px", color: MUTED, fontSize: 13 }}>
        <b>{t("diagnosis.priorityFactors")}:</b> {t("diagnosis.severity")} {diagnosis.severity} ·{" "}
        {t("diagnosis.impact")} {diagnosis.business_impact} · {t("diagnosis.effort")} {diagnosis.effort} ·{" "}
        {t("diagnosis.confidence")} {pct(diagnosis.confidence)}
      </p>
      {diagnosis.model && (
        <p style={{ margin: 0, color: MUTED, fontSize: 12 }}>
          <b>{t("diagnosis.sources")}:</b> {diagnosis.model}
        </p>
      )}
    </div>
  );
}
