import { Fragment, useState } from "react";
import type { Diagnosis } from "../../types";
import { diagnosisKind } from "../../types";
import { MUTED } from "./format";
import { DemoBadge } from "./design/DemoBadge";
import { DiagnosisEvidence } from "./DiagnosisEvidence";
import { Ltr } from "../Ltr";
import { t } from "../../i18n";

interface DecisionPanelProps {
  diagnoses: Diagnosis[];
  approvedDiagnosisIds: Set<string>;
  approvingId: string | null;
  onApprove: (diagnosisId: string) => void;
  dismissingId: string | null;
  onDismiss: (diagnosisId: string, reason: string) => void;
  onUndismiss: (diagnosisId: string) => void;
}

type TypeFilter = "all" | "fix" | "opportunity";
type SortMode = "priority" | "impact";

const SEVERITY_GROUPS: { id: string; test: (d: Diagnosis) => boolean }[] = [
  { id: "critical", test: (d) => d.severity >= 5 },
  { id: "high", test: (d) => d.severity === 4 },
  { id: "medium", test: (d) => d.severity === 3 },
  { id: "low", test: (d) => d.severity <= 2 },
];

/**
 * S4-2's best-effort page/query signal — diagnoses have no stored page_url column
 * (that's S4-1's job, tracked separately, not owned by this task). Rather than show
 * nothing, scan the evidence bullets and the problem text for a URL or an absolute
 * path, which most audit-derived evidence already contains. Returns null (rendered
 * as "—") when no such signal exists, never a made-up value.
 */
function pageSignal(diagnosis: Diagnosis): string | null {
  const haystack = [diagnosis.problem, ...diagnosis.evidence].join(" ");
  const urlMatch = haystack.match(/https?:\/\/\S+/);
  if (urlMatch) return urlMatch[0].replace(/[.,;)\]]+$/, "");
  const pathMatch = haystack.match(/(?<=\s|^)\/[a-zA-Z0-9][\w\-/.]*/);
  if (pathMatch) return pathMatch[0].replace(/[.,;)\]]+$/, "");
  return null;
}

/** "4 · Decision" tab, reshaped into an opportunities screen (S4-2): each row is a
 *  recommendation with evidence and a reason, expandable in place — no separate tab —
 *  plus dismiss-with-reason (S9-5) so a wrong diagnosis doesn't just sit there with no
 *  way out besides approving it. */
export function DecisionPanel({
  diagnoses,
  approvedDiagnosisIds,
  approvingId,
  onApprove,
  dismissingId,
  onDismiss,
  onUndismiss,
}: DecisionPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortMode>("priority");
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissDraftId, setDismissDraftId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  if (diagnoses.length === 0) {
    return <p style={{ color: MUTED }}>{t("decision.empty")}</p>;
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startDismiss(id: string) {
    setDismissDraftId(id);
    setDismissReason("");
  }

  function confirmDismiss(id: string) {
    if (!dismissReason.trim()) return;
    onDismiss(id, dismissReason.trim());
    setDismissDraftId(null);
    setDismissReason("");
  }

  const dismissedCount = diagnoses.filter((d) => d.dismissed === 1).length;
  const pool = diagnoses.filter((d) => (showDismissed ? true : d.dismissed !== 1));
  const filtered = pool.filter((d) => typeFilter === "all" || diagnosisKind(d.action_type) === typeFilter);
  const sorted = [...filtered].sort((a, b) =>
    sortBy === "priority" ? b.priority_score - a.priority_score : b.business_impact - a.business_impact
  );

  const groups = SEVERITY_GROUPS.map((group) => ({ ...group, rows: sorted.filter((d) => group.test(d)) })).filter(
    (group) => group.rows.length > 0
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
          <option value="all">{t("decision.filterAll")}</option>
          <option value="fix">{t("decision.filterFix")}</option>
          <option value="opportunity">{t("decision.filterOpportunity")}</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortMode)}>
          <option value="priority">{t("decision.sortPriority")}</option>
          <option value="impact">{t("decision.sortImpact")}</option>
        </select>
        {dismissedCount > 0 && (
          <button type="button" className="btn-secondary" onClick={() => setShowDismissed((v) => !v)}>
            {showDismissed ? t("decision.hideDismissed") : t("decision.dismissedCount")(dismissedCount)}
          </button>
        )}
      </div>

      {groups.map((group) => (
        <div key={group.id} style={{ marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 6px" }}>
            {t(`decision.severityGroups.${group.id}` as any)}{" "}
            <span style={{ color: MUTED, fontWeight: 400, fontSize: 13 }}>({group.rows.length})</span>
          </h3>
          <table>
            <thead>
              <tr>
                <th>{t("decision.colPriority")}</th>
                <th>{t("decision.colType")}</th>
                <th>{t("decision.colPage")}</th>
                <th>{t("decision.colAction")}</th>
                <th>{t("decision.colImpact")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((diagnosis) => {
                const kind = diagnosisKind(diagnosis.action_type);
                const signal = pageSignal(diagnosis);
                const isExpanded = expanded.has(diagnosis.id);
                const isDismissed = diagnosis.dismissed === 1;
                return (
                  <Fragment key={diagnosis.id}>
                    <tr style={isDismissed ? { opacity: 0.55 } : undefined}>
                      <td>
                        <b>{diagnosis.priority_score}</b>
                      </td>
                      <td>{kind === "opportunity" ? t("decision.typeOpportunity") : t("decision.typeFix")}</td>
                      <td>{signal ? <Ltr>{signal}</Ltr> : t("decision.noPageSignal")}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => toggle(diagnosis.id)}
                          style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", textAlign: "start" }}
                        >
                          {diagnosis.recommended_action}
                          {diagnosis.is_demo_seed === 1 && <DemoBadge />}
                        </button>
                      </td>
                      <td>{diagnosis.business_impact}</td>
                      <td>
                        {isDismissed ? (
                          <span>
                            <span style={{ color: MUTED, fontSize: 12 }}>{t("decision.dismissed")}</span>{" "}
                            <button onClick={() => onUndismiss(diagnosis.id)} disabled={dismissingId === diagnosis.id}>
                              {t("decision.undismiss")}
                            </button>
                          </span>
                        ) : approvedDiagnosisIds.has(diagnosis.id) ? (
                          <span style={{ color: MUTED }}>{t("decision.approved")}</span>
                        ) : (
                          <span style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => onApprove(diagnosis.id)} disabled={approvingId === diagnosis.id}>
                              {approvingId === diagnosis.id ? t("decision.approving") : t("decision.approve")}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => startDismiss(diagnosis.id)}
                              disabled={dismissingId === diagnosis.id}
                            >
                              {t("decision.dismiss")}
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                    {dismissDraftId === diagnosis.id && (
                      <tr>
                        <td colSpan={6} style={{ background: "#faf7f0" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
                            <span style={{ fontSize: 13 }}>{t("decision.dismissReasonPrompt")}:</span>
                            <input
                              autoFocus
                              value={dismissReason}
                              onChange={(e) => setDismissReason(e.target.value)}
                              placeholder={t("decision.dismissPlaceholder")}
                              style={{ flex: 1 }}
                            />
                            <button
                              onClick={() => confirmDismiss(diagnosis.id)}
                              disabled={!dismissReason.trim() || dismissingId === diagnosis.id}
                            >
                              {dismissingId === diagnosis.id ? t("decision.dismissing") : t("decision.dismissConfirm")}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => setDismissDraftId(null)}>
                              {t("common.cancel")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ background: "#faf7f0" }}>
                          <div style={{ padding: 8 }}>
                            <DiagnosisEvidence diagnosis={diagnosis} />
                            {isDismissed && diagnosis.dismissed_reason && (
                              <p style={{ margin: "8px 0 0", color: "#9e2f22", fontSize: 13 }}>
                                <b>{t("decision.dismissedReasonLabel")}</b> {diagnosis.dismissed_reason}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
