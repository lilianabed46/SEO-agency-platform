import type { AuditSummary, PageSpeedSummary } from "../../types";
import { AUDIT_CATEGORY_LABELS, CRIMSON, MUTED, VITAL_LABELS, severityColor } from "./format";
import { ScoreBadge } from "./design/ScoreBadge";
import { SeverityChip } from "./design/SeverityChip";
import { VitalGauge } from "./VitalGauge";
import { ProgressBar } from "./ProgressBar";
import { Ltr } from "../Ltr";
import { t } from "../../i18n";

interface TechnicalAuditPanelProps {
  audit: AuditSummary | null;
  auditError: string | null;
  runningAudit: boolean;
  onRunAudit: () => void;
  pageSpeed: PageSpeedSummary | null;
  pageSpeedError: string | null;
  runningPageSpeed: boolean;
  onRunPageSpeed: () => void;
}

/** Analysis sub-tab: technical audit (rule-based issues) + Core Web Vitals. Was "2 · Analysis — technical audit". */
export function TechnicalAuditPanel({
  audit,
  auditError,
  runningAudit,
  onRunAudit,
  pageSpeed,
  pageSpeedError,
  runningPageSpeed,
  onRunPageSpeed,
}: TechnicalAuditPanelProps) {
  return (
    <div>
      <button onClick={onRunAudit} disabled={runningAudit}>
        {runningAudit ? t("technicalAudit.running") : t("technicalAudit.runAudit")}
      </button>{" "}
      <button onClick={onRunPageSpeed} disabled={runningPageSpeed}>
        {runningPageSpeed ? t("technicalAudit.measuring") : t("technicalAudit.measureVitals")}
      </button>
      {runningAudit && <ProgressBar label={t("technicalAudit.runningAuditLabel")} />}
      {runningPageSpeed && <ProgressBar label={t("technicalAudit.measuringVitalsLabel")} />}
      {auditError && <p style={{ color: CRIMSON }}>{auditError}</p>}
      {pageSpeedError && <p style={{ color: CRIMSON }}>{pageSpeedError}</p>}

      {pageSpeed && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 4px" }}>
            {t("technicalAudit.performanceScore")}:{" "}
            {pageSpeed.performance_score === null ? (
              <b>—/100</b>
            ) : (
              <ScoreBadge score={pageSpeed.performance_score} size="large" />
            )}{" "}
            <span style={{ color: MUTED, fontSize: 12 }}>
              {t(`technicalAudit.strategyLabels.${pageSpeed.strategy}` as any)} · {t("technicalAudit.measured")}{" "}
              <Ltr>{pageSpeed.fetched_at.slice(0, 16).replace("T", " ")}</Ltr>
              {pageSpeed.from_cache && ` · ${t("technicalAudit.stored")}`}
            </span>
          </p>
          <table>
            <thead>
              <tr>
                <th>{t("technicalAudit.colVital")}</th>
                <th>{t("technicalAudit.colField")}</th>
                <th>{t("technicalAudit.colLab")}</th>
              </tr>
            </thead>
            <tbody>
              {VITAL_LABELS.map(([key, label]) => (
                <tr key={key}>
                  <td>
                    <Ltr>{label}</Ltr>
                  </td>
                  <td>
                    <VitalGauge vitalKey={key} value={pageSpeed.field?.[key] ?? null} />
                  </td>
                  <td>
                    <VitalGauge vitalKey={key} value={pageSpeed.lab[key]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: MUTED, fontSize: 13, marginTop: 6 }}>
            {pageSpeed.field ? t("technicalAudit.fieldNote")(pageSpeed.field_source === "origin" ? t("technicalAudit.fieldSampled") : "") : t("technicalAudit.noFieldNote")}
            {t("technicalAudit.inpNote")}
          </p>
        </div>
      )}

      {audit && (
        <div style={{ marginTop: 12 }}>
          <p>
            {t("technicalAudit.score")}: <ScoreBadge score={audit.score} size="large" /> · {audit.pages_analysed}{" "}
            {t("technicalAudit.pagesAnalysed")} · {audit.issues.length} {t("technicalAudit.issuesCount")}
          </p>
          <p style={{ color: MUTED }}>
            {Object.entries(audit.issues_by_category)
              .filter(([, count]) => count > 0)
              .map(([category, count]) => `${AUDIT_CATEGORY_LABELS[category] ?? category}: ${count}`)
              .join(" · ") || t("technicalAudit.noIssues")}
          </p>
          {audit.issues.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>{t("technicalAudit.colRule")}</th>
                  <th>{t("technicalAudit.colSeverity")}</th>
                  <th>{t("technicalAudit.colPage")}</th>
                  <th>{t("technicalAudit.colDetail")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.issues.map((issue) => (
                  <tr key={issue.id} style={{ color: severityColor(issue.severity) }}>
                    <td>
                      <Ltr>{issue.rule_code}</Ltr>
                    </td>
                    <td>
                      <SeverityChip severity={issue.severity} />
                    </td>
                    <td>{issue.page_url ? <Ltr>{issue.page_url}</Ltr> : t("technicalAudit.siteWide")}</td>
                    <td>{issue.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
