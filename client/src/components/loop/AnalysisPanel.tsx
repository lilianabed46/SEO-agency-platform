import { useState } from "react";
import type {
  AuditSummary,
  ContentPerformanceSummary,
  KeywordDecision,
  KeywordDecisionValue,
  PageSpeedSummary,
  SearchIntentSummary,
} from "../../types";
import { ANALYSIS_SUB_TABS, type AnalysisSubTabId } from "./tabs";
import { LoopTabs } from "./LoopTabs";
import { TechnicalAuditPanel } from "./TechnicalAuditPanel";
import { SearchIntentPanel } from "./SearchIntentPanel";
import { ContentPerformancePanel } from "./ContentPerformancePanel";
import { KeywordDecisionPanel } from "./KeywordDecisionPanel";

interface AnalysisPanelProps {
  audit: AuditSummary | null;
  auditError: string | null;
  runningAudit: boolean;
  onRunAudit: () => void;
  pageSpeed: PageSpeedSummary | null;
  pageSpeedError: string | null;
  runningPageSpeed: boolean;
  onRunPageSpeed: () => void;

  searchIntent: SearchIntentSummary | null;
  searchIntentError: string | null;
  loadingSearchIntent: boolean;
  onLoadSearchIntent: () => void;

  contentPerformance: ContentPerformanceSummary | null;
  contentPerformanceError: string | null;
  loadingContentPerformance: boolean;
  onLoadContentPerformance: () => void;

  keywordDecisions: Record<string, KeywordDecision>;
  savingKeywordDecision: Record<string, boolean>;
  onSaveKeywordDecision: (page: string, query: string, decision: KeywordDecisionValue, note?: string) => void;
}

/**
 * "2 · Analysis" tab. Owns which sub-tab is showing (pure UI state — the actual
 * fetched data for all sub-tabs stays in WebsiteLoopPanel, per LILIAN_TODAY.md:
 * Search Intent (Module 5) and Content Performance (Module 29) live in here as
 * sub-tabs. S5-3 adds a fourth sub-tab, Keyword Decision, that reuses the Search
 * Intent data already fetched rather than a separate Search Console call.
 */
export function AnalysisPanel(props: AnalysisPanelProps) {
  const [subTab, setSubTab] = useState<AnalysisSubTabId>("technical");

  return (
    <div>
      <LoopTabs tabs={ANALYSIS_SUB_TABS} activeId={subTab} onChange={setSubTab} size="compact" />

      {subTab === "technical" && (
        <TechnicalAuditPanel
          audit={props.audit}
          auditError={props.auditError}
          runningAudit={props.runningAudit}
          onRunAudit={props.onRunAudit}
          pageSpeed={props.pageSpeed}
          pageSpeedError={props.pageSpeedError}
          runningPageSpeed={props.runningPageSpeed}
          onRunPageSpeed={props.onRunPageSpeed}
        />
      )}

      {subTab === "search-intent" && (
        <SearchIntentPanel
          searchIntent={props.searchIntent}
          searchIntentError={props.searchIntentError}
          loadingSearchIntent={props.loadingSearchIntent}
          onLoadSearchIntent={props.onLoadSearchIntent}
        />
      )}

      {subTab === "content-performance" && (
        <ContentPerformancePanel
          contentPerformance={props.contentPerformance}
          contentPerformanceError={props.contentPerformanceError}
          loadingContentPerformance={props.loadingContentPerformance}
          onLoadContentPerformance={props.onLoadContentPerformance}
        />
      )}

      {subTab === "keyword-decision" && (
        <KeywordDecisionPanel
          searchIntent={props.searchIntent}
          searchIntentError={props.searchIntentError}
          loadingSearchIntent={props.loadingSearchIntent}
          onLoadSearchIntent={props.onLoadSearchIntent}
          keywordDecisions={props.keywordDecisions}
          savingKeywordDecision={props.savingKeywordDecision}
          onSaveKeywordDecision={props.onSaveKeywordDecision}
        />
      )}
    </div>
  );
}
