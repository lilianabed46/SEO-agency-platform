import type { AuditSummary, Diagnosis } from "../../types";
import { CRIMSON, MUTED } from "./format";
import { DemoBadge } from "./design/DemoBadge";
import { DiagnosisEvidence } from "./DiagnosisEvidence";
import { ProgressBar } from "./ProgressBar";
import { t } from "../../i18n";

interface DiagnosisPanelProps {
  audit: AuditSummary | null;
  diagnoses: Diagnosis[];
  diagnosisError: string | null;
  staleReason: string | null;
  runningDiagnosis: boolean;
  onRunDiagnosis: () => void;
}

/** "3 · Diagnosis — root causes" tab. */
export function DiagnosisPanel({
  audit,
  diagnoses,
  diagnosisError,
  staleReason,
  runningDiagnosis,
  onRunDiagnosis,
}: DiagnosisPanelProps) {
  return (
    <div>
      <button onClick={onRunDiagnosis} disabled={runningDiagnosis || !audit}>
        {runningDiagnosis ? t("diagnosis.running") : t("diagnosis.diagnose")}
      </button>
      {!audit && <span style={{ color: MUTED, marginInlineStart: 8 }}>{t("diagnosis.runAuditFirst")}</span>}
      {runningDiagnosis && <ProgressBar label={t("diagnosis.running")} />}
      {diagnosisError && <p style={{ color: CRIMSON }}>{diagnosisError}</p>}
      {staleReason && <p style={{ color: "#b45309" }}>{t("diagnosis.staleNotice")(staleReason)}</p>}

      {diagnoses.map((diagnosis) => (
        <div key={diagnosis.id} style={{ border: "1px solid #ddd", padding: 12, marginTop: 12 }}>
          <h3 style={{ margin: "0 0 6px" }}>
            {diagnosis.problem}
            {diagnosis.is_demo_seed === 1 && <DemoBadge />}
          </h3>
          <p style={{ margin: "0 0 8px", color: MUTED }}>
            {t("diagnosis.recommended")}: {diagnosis.recommended_action}
          </p>
          <DiagnosisEvidence diagnosis={diagnosis} />
        </div>
      ))}
    </div>
  );
}
