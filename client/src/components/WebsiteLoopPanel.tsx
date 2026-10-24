import { useEffect, useState } from "react";
import { api } from "../api/client";
import type {
  ActionWithResult,
  AuditSummary,
  Comparison,
  Diagnosis,
  LearningResponse,
  PageSpeedSummary,
  SearchIntentSummary,
  ContentPerformanceSummary,
  ContentDraft,
  ContentDraftEdit,
  ReviewDecision,
  KeywordDecision,
  KeywordDecisionValue,
} from "../types";
import type { LoopTabId } from "./loop/tabs";
import { defaultPivotDate } from "./loop/format";
import { AnalysisPanel } from "./loop/AnalysisPanel";
import { DiagnosisPanel } from "./loop/DiagnosisPanel";
import { DecisionPanel } from "./loop/DecisionPanel";
import { ActionPanel } from "./loop/ActionPanel";
import type { ReviewResult } from "./loop/ContentReviewPanel";
import { MeasurementPanel } from "./loop/MeasurementPanel";
import { LearningPanel } from "./loop/LearningPanel";
import { ExportPanel } from "./loop/ExportPanel";

/**
 * Steps 2-8 of the loop (Analysis -> Diagnosis -> Decision -> Action ->
 * Measurement -> Learning -> Export). Step 1 (Data) lives in WebsiteDetailPage,
 * which also owns the tab nav and passes down which of these tabs is active.
 *
 * Phase 1 restructuring (LILIAN_TODAY.md): this file used to render every
 * section's JSX directly (1175 lines). It's now the single owner of all the
 * loop's fetched state — every section below is a presentational component
 * under components/loop/*.tsx that only shows when its tab is active, so
 * switching tabs never re-fetches or loses data. Alerts (Module 36) moved out
 * entirely into the self-contained <AlertsBadge/> that WebsiteDetailPage renders
 * as a persistent badge, so it no longer lives here.
 */
export function WebsiteLoopPanel({ websiteId, activeTab }: { websiteId: string; activeTab: Exclude<LoopTabId, "data"> }) {
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [runningAudit, setRunningAudit] = useState(false);

  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [runningDiagnosis, setRunningDiagnosis] = useState(false);

  const [actions, setActions] = useState<ActionWithResult[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [contentDrafts, setContentDrafts] = useState<Record<string, ContentDraft>>({});
  const [contentLoading, setContentLoading] = useState<Record<string, boolean>>({});
  const [contentErrors, setContentErrors] = useState<Record<string, string | undefined>>({});
  const [expandedContent, setExpandedContent] = useState<Set<string>>(new Set());

  // Phase 2: one bundled "review before publish" result per action — coverage +
  // content quality + pre-publish gate, replacing the old separate coverage/QA/gate
  // state below.
  const [reviewResults, setReviewResults] = useState<Record<string, ReviewResult>>({});
  const [reviewLoading, setReviewLoading] = useState<Record<string, boolean>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string | undefined>>({});

  const [pivotDate, setPivotDate] = useState(defaultPivotDate);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);

  const [learning, setLearning] = useState<LearningResponse | null>(null);
  const [learningScope, setLearningScope] = useState<"website" | "all">("website");

  const [pageSpeed, setPageSpeed] = useState<PageSpeedSummary | null>(null);
  const [pageSpeedError, setPageSpeedError] = useState<string | null>(null);
  const [runningPageSpeed, setRunningPageSpeed] = useState(false);

  const [searchIntent, setSearchIntent] = useState<SearchIntentSummary | null>(null);
  const [searchIntentError, setSearchIntentError] = useState<string | null>(null);
  const [loadingSearchIntent, setLoadingSearchIntent] = useState(false);

  const [contentPerformance, setContentPerformance] = useState<ContentPerformanceSummary | null>(null);
  const [contentPerformanceError, setContentPerformanceError] = useState<string | null>(null);
  const [loadingContentPerformance, setLoadingContentPerformance] = useState(false);

  // S9-5 / S4-2: dismissing a diagnosis/opportunity from the Decision screen.
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // S10-2: a measurement failure belongs on the action's own row, not a tab-wide
  // error the user has to go find.
  const [measureErrors, setMeasureErrors] = useState<Record<string, string | undefined>>({});

  // S7-1: saving an in-place edit to a draft.
  const [savingContentId, setSavingContentId] = useState<string | null>(null);
  // S8-3: the human approve/reject decision after the gate's verdict.
  const [reviewingDecisionId, setReviewingDecisionId] = useState<string | null>(null);

  // S5-3: one decision per (page, query) — reuses the Search Intent fetch above
  // instead of hitting Search Console again.
  const [keywordDecisions, setKeywordDecisions] = useState<Record<string, KeywordDecision>>({});
  const [savingKeywordDecision, setSavingKeywordDecision] = useState<Record<string, boolean>>({});

  function refreshActions() {
    api.listActions(websiteId).then(setActions).catch(() => {});
  }

  function refreshLearning(scope: "website" | "all") {
    api.getLearning(websiteId, scope).then(setLearning).catch(() => {});
  }

  useEffect(() => {
    // A 404 here just means "not run yet" — that is the normal first state, not an error.
    api.getAudit(websiteId).then(setAudit).catch(() => {});
    api.getPageSpeed(websiteId).then(setPageSpeed).catch(() => {});
    api.listDiagnoses(websiteId).then(setDiagnoses).catch(() => {});
    refreshActions();
    refreshLearning(learningScope);
    api
      .getKeywordDecisions(websiteId)
      .then((rows) => {
        const byKey: Record<string, KeywordDecision> = {};
        for (const row of rows) byKey[`${row.page}|${row.query}`] = row;
        setKeywordDecisions(byKey);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId]);

  async function handleRunAudit() {
    setRunningAudit(true);
    setAuditError(null);
    try {
      setAudit(await api.runAudit(websiteId));
    } catch (err) {
      setAuditError((err as Error).message);
    } finally {
      setRunningAudit(false);
    }
  }

  async function handleRunPageSpeed() {
    setRunningPageSpeed(true);
    setPageSpeedError(null);
    try {
      const summary = await api.runPageSpeed(websiteId);
      setPageSpeed(summary);
      // Performance findings are folded into the same audit, so refresh the score.
      if (summary.folded_into_audit) api.getAudit(websiteId).then(setAudit).catch(() => {});
    } catch (err) {
      setPageSpeedError((err as Error).message);
    } finally {
      setRunningPageSpeed(false);
    }
  }

  async function handleLoadSearchIntent() {
    setLoadingSearchIntent(true);
    setSearchIntentError(null);
    try {
      setSearchIntent(await api.getSearchIntent(websiteId));
    } catch (err) {
      setSearchIntentError((err as Error).message);
    } finally {
      setLoadingSearchIntent(false);
    }
  }

  async function handleLoadContentPerformance() {
    setLoadingContentPerformance(true);
    setContentPerformanceError(null);
    try {
      setContentPerformance(await api.getContentPerformance(websiteId));
    } catch (err) {
      setContentPerformanceError((err as Error).message);
    } finally {
      setLoadingContentPerformance(false);
    }
  }

  async function handleRunDiagnosis() {
    setRunningDiagnosis(true);
    setDiagnosisError(null);
    setStaleReason(null);
    try {
      const response = await api.runDiagnosis(websiteId);
      setDiagnoses(response.diagnoses);
      if (response.stale) setStaleReason(response.reason ?? "the model call failed");
    } catch (err) {
      setDiagnosisError((err as Error).message);
    } finally {
      setRunningDiagnosis(false);
    }
  }

  async function handleApprove(diagnosisId: string) {
    setApprovingId(diagnosisId);
    try {
      await api.approveAction(websiteId, diagnosisId);
      refreshActions();
      refreshLearning(learningScope);
    } catch (err) {
      setDiagnosisError((err as Error).message);
    } finally {
      setApprovingId(null);
    }
  }

  // S9-5 / S4-2: dismiss (or undo dismissing) a diagnosis from the Decision screen —
  // independent of approve, and stored with a reason as the human-review record.
  async function handleDismiss(diagnosisId: string, reason: string) {
    setDismissingId(diagnosisId);
    try {
      const updated = await api.dismissDiagnosis(websiteId, diagnosisId, reason);
      setDiagnoses((prev) => prev.map((d) => (d.id === diagnosisId ? updated : d)));
    } catch (err) {
      setDiagnosisError((err as Error).message);
    } finally {
      setDismissingId(null);
    }
  }

  async function handleUndismiss(diagnosisId: string) {
    setDismissingId(diagnosisId);
    try {
      const updated = await api.undismissDiagnosis(websiteId, diagnosisId);
      setDiagnoses((prev) => prev.map((d) => (d.id === diagnosisId ? updated : d)));
    } catch (err) {
      setDiagnosisError((err as Error).message);
    } finally {
      setDismissingId(null);
    }
  }

  async function handleToggleContent(actionId: string) {
    if (expandedContent.has(actionId)) {
      setExpandedContent((prev) => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
      return;
    }
    if (contentDrafts[actionId]) {
      setExpandedContent((prev) => new Set(prev).add(actionId));
      return;
    }

    setContentLoading((prev) => ({ ...prev, [actionId]: true }));
    setContentErrors((prev) => ({ ...prev, [actionId]: undefined }));
    try {
      // Prefer a stored draft over generating a new one on every click.
      const draft = await api.getContent(websiteId, actionId);
      setContentDrafts((prev) => ({ ...prev, [actionId]: draft }));
      setExpandedContent((prev) => new Set(prev).add(actionId));
    } catch {
      await handleGenerateContent(actionId);
    } finally {
      setContentLoading((prev) => ({ ...prev, [actionId]: false }));
    }
  }

  /** Drops a stale review verdict — after an edit or a regenerate, the last PASS/FAIL
   *  scored text that's no longer what's saved, so showing it would be misleading
   *  (S7-1: "تُعاد التغطية والجودة على النص المحرَّر لا المولَّد"). */
  function clearReviewResult(actionId: string) {
    setReviewResults((prev) => {
      if (!(actionId in prev)) return prev;
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  }

  async function handleGenerateContent(actionId: string) {
    setContentLoading((prev) => ({ ...prev, [actionId]: true }));
    setContentErrors((prev) => ({ ...prev, [actionId]: undefined }));
    clearReviewResult(actionId);
    try {
      const { draft, stale, reason } = await api.generateContent(websiteId, actionId);
      setContentDrafts((prev) => ({ ...prev, [actionId]: draft }));
      if (stale) {
        setContentErrors((prev) => ({ ...prev, [actionId]: `Showing a previous draft — regeneration failed: ${reason}` }));
      }
      setExpandedContent((prev) => new Set(prev).add(actionId));
    } catch (err) {
      setContentErrors((prev) => ({ ...prev, [actionId]: (err as Error).message }));
      // Expand on error too — an error stored but never shown is silent to the user.
      setExpandedContent((prev) => new Set(prev).add(actionId));
    } finally {
      setContentLoading((prev) => ({ ...prev, [actionId]: false }));
    }
  }

  // draftOverride: handleSaveContent calls this right after saving, before the
  // contentDrafts state update from that save has landed — passing the just-returned
  // draft here avoids scoring the pre-edit text that's still in the closure.
  async function handleReview(actionId: string, draftOverride?: ContentDraft) {
    const draft = draftOverride ?? contentDrafts[actionId];
    if (!draft) return; // the "Review before publish" button only appears once a draft exists

    setReviewLoading((prev) => ({ ...prev, [actionId]: true }));
    setReviewErrors((prev) => ({ ...prev, [actionId]: undefined }));
    try {
      // Content quality now runs against the draft's own body + primary keyword —
      // nothing pasted by hand — and the gate folds in that same quality score.
      const [coverage, quality] = await Promise.all([
        api.getContentCoverage(websiteId, actionId),
        api.checkContentQuality(websiteId, draft.body_markdown, draft.primary_keyword),
      ]);
      const gate = await api.getPreFlightGate(websiteId, quality.score);
      setReviewResults((prev) => ({ ...prev, [actionId]: { coverage, quality, gate } }));
    } catch (err) {
      setReviewErrors((prev) => ({ ...prev, [actionId]: (err as Error).message }));
    } finally {
      setReviewLoading((prev) => ({ ...prev, [actionId]: false }));
    }
  }

  async function handleMeasure() {
    setMeasuring(true);
    setComparisonError(null);
    try {
      setComparison(await api.measure(websiteId, pivotDate));
    } catch (err) {
      setComparisonError((err as Error).message);
    } finally {
      setMeasuring(false);
    }
  }

  async function handleMeasureAction(actionId: string) {
    setMeasureErrors((prev) => ({ ...prev, [actionId]: undefined }));
    try {
      const { comparison: result } = await api.measureAction(websiteId, actionId, pivotDate);
      setComparison({ ...result, after_window_complete: true });
      refreshActions();
      refreshLearning(learningScope);
    } catch (err) {
      // S10-2: the error belongs on this action's own row — a tab-wide state the user
      // isn't looking at (they're on the Action tab, not Measurement) was a silent failure.
      setMeasureErrors((prev) => ({ ...prev, [actionId]: (err as Error).message }));
    }
  }

  // S7-1: save an in-place edit without touching model/id/timestamps. Returns whether
  // it succeeded so the editor only leaves edit mode on an actual save, not a failed one.
  async function handleSaveContent(actionId: string, edit: ContentDraftEdit): Promise<boolean> {
    setSavingContentId(actionId);
    const hadReview = actionId in reviewResults;
    try {
      const draft = await api.updateContent(websiteId, actionId, edit);
      setContentDrafts((prev) => ({ ...prev, [actionId]: draft }));
      // S7-1: the coverage/quality/gate check must reflect the edited text, not
      // whatever was scored before this save. If a review had already run, re-run it
      // now against the saved edit; if none had run yet, there's nothing stale to fix
      // — the specialist will trigger the first one whenever they're ready.
      clearReviewResult(actionId);
      if (hadReview) await handleReview(actionId, draft);
      return true;
    } catch (err) {
      setContentErrors((prev) => ({ ...prev, [actionId]: (err as Error).message }));
      return false;
    } finally {
      setSavingContentId(null);
    }
  }

  // S8-3: human approve/reject after the gate's PASS/FAIL — content is never "ready"
  // before this.
  async function handleReviewDecision(actionId: string, decision: ReviewDecision, reason?: string) {
    setReviewingDecisionId(actionId);
    try {
      const draft = await api.reviewContent(websiteId, actionId, decision, reason);
      setContentDrafts((prev) => ({ ...prev, [actionId]: draft }));
    } catch (err) {
      setContentErrors((prev) => ({ ...prev, [actionId]: (err as Error).message }));
    } finally {
      setReviewingDecisionId(null);
    }
  }

  // S5-3: one decision per (page, query) pair, with an optional reason ("السبب" in
  // the acceptance criteria) carried alongside it.
  async function handleSaveKeywordDecision(page: string, query: string, decision: KeywordDecisionValue, note?: string) {
    const key = `${page}|${query}`;
    setSavingKeywordDecision((prev) => ({ ...prev, [key]: true }));
    try {
      const row = await api.saveKeywordDecision(websiteId, page, query, decision, note);
      setKeywordDecisions((prev) => ({ ...prev, [key]: row }));
    } catch {
      // Best-effort — the row just keeps its previous (or empty) decision on failure.
    } finally {
      setSavingKeywordDecision((prev) => ({ ...prev, [key]: false }));
    }
  }

  function handleScopeChange(scope: "website" | "all") {
    setLearningScope(scope);
    refreshLearning(scope);
  }

  const approvedDiagnosisIds = new Set(actions.map((action) => action.diagnosis_id).filter((id): id is string => id !== null));

  switch (activeTab) {
    case "analysis":
      return (
        <AnalysisPanel
          audit={audit}
          auditError={auditError}
          runningAudit={runningAudit}
          onRunAudit={handleRunAudit}
          pageSpeed={pageSpeed}
          pageSpeedError={pageSpeedError}
          runningPageSpeed={runningPageSpeed}
          onRunPageSpeed={handleRunPageSpeed}
          searchIntent={searchIntent}
          searchIntentError={searchIntentError}
          loadingSearchIntent={loadingSearchIntent}
          onLoadSearchIntent={handleLoadSearchIntent}
          contentPerformance={contentPerformance}
          contentPerformanceError={contentPerformanceError}
          loadingContentPerformance={loadingContentPerformance}
          onLoadContentPerformance={handleLoadContentPerformance}
          keywordDecisions={keywordDecisions}
          savingKeywordDecision={savingKeywordDecision}
          onSaveKeywordDecision={handleSaveKeywordDecision}
        />
      );
    case "diagnosis":
      return (
        <DiagnosisPanel
          audit={audit}
          diagnoses={diagnoses}
          diagnosisError={diagnosisError}
          staleReason={staleReason}
          runningDiagnosis={runningDiagnosis}
          onRunDiagnosis={handleRunDiagnosis}
        />
      );
    case "decision":
      return (
        <DecisionPanel
          diagnoses={diagnoses}
          approvedDiagnosisIds={approvedDiagnosisIds}
          approvingId={approvingId}
          onApprove={handleApprove}
          dismissingId={dismissingId}
          onDismiss={handleDismiss}
          onUndismiss={handleUndismiss}
        />
      );
    case "action":
      return (
        <ActionPanel
          actions={actions}
          onMeasureAction={handleMeasureAction}
          measureErrors={measureErrors}
          contentLoading={contentLoading}
          contentErrors={contentErrors}
          contentDrafts={contentDrafts}
          expandedContent={expandedContent}
          onToggleContent={handleToggleContent}
          onGenerateContent={handleGenerateContent}
          reviewResults={reviewResults}
          reviewLoading={reviewLoading}
          reviewErrors={reviewErrors}
          onReview={handleReview}
          savingContentId={savingContentId}
          onSaveContent={handleSaveContent}
          reviewingDecisionId={reviewingDecisionId}
          onReviewDecision={handleReviewDecision}
        />
      );
    case "measurement":
      return (
        <MeasurementPanel
          pivotDate={pivotDate}
          onPivotDateChange={setPivotDate}
          comparison={comparison}
          comparisonError={comparisonError}
          measuring={measuring}
          onMeasure={handleMeasure}
        />
      );
    case "learning":
      return <LearningPanel learning={learning} learningScope={learningScope} onScopeChange={handleScopeChange} />;
    case "export":
      return <ExportPanel websiteId={websiteId} />;
  }
}
