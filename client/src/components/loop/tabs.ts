// Phase 1 (LILIAN_TODAY.md, المرحلة ١): the 8 top-level loop tabs, in loop order.
// "Data" is rendered by WebsiteDetailPage itself (it owns that state); the other 7
// are rendered by WebsiteLoopPanel. Both sides import this one list so the tab set
// and its order can never drift apart. Labels come from i18n.ts (X-1).

import { t } from "../../i18n";

export type LoopTabId =
  | "data"
  | "analysis"
  | "diagnosis"
  | "decision"
  | "action"
  | "measurement"
  | "learning"
  | "export";

export const LOOP_TABS: { id: LoopTabId; label: string }[] = [
  { id: "data", label: t("tabs.data") },
  { id: "analysis", label: t("tabs.analysis") },
  { id: "diagnosis", label: t("tabs.diagnosis") },
  { id: "decision", label: t("tabs.decision") },
  { id: "action", label: t("tabs.action") },
  { id: "measurement", label: t("tabs.measurement") },
  { id: "learning", label: t("tabs.learning") },
  { id: "export", label: t("tabs.export") },
];

export type AnalysisSubTabId = "technical" | "search-intent" | "content-performance" | "keyword-decision";

export const ANALYSIS_SUB_TABS: { id: AnalysisSubTabId; label: string }[] = [
  { id: "technical", label: t("tabs.technical") },
  { id: "search-intent", label: t("tabs.searchIntent") },
  { id: "content-performance", label: t("tabs.contentPerformance") },
  { id: "keyword-decision", label: t("tabs.keywordDecision") },
];
