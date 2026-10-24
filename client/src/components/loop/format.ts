import type {
  AlertSeverity,
  ContentDraft,
  ContentPerformanceStatus,
  PageSpeedSummary,
  SearchIntent,
} from "../../types";
import { t } from "../../i18n";

// Shared constants + formatting helpers used across the loop/* panel components.
// Pulled out of the old monolithic WebsiteLoopPanel.tsx so every section file can
// import from one place instead of redefining these.

export const CRIMSON = "crimson";
export const MUTED = "#666";

export const OUTLINE_INDENT: Record<ContentDraft["outline"][number]["level"], number> = { h1: 0, h2: 16, h3: 32 };

export const ALERT_SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: "#9e2f22",
  warning: "#b45309",
  info: "#596373",
};

export const PERFORMANCE_LABELS: Record<ContentPerformanceStatus, string> = {
  performing: t("contentPerformance.statuses.performing"),
  underperforming: t("contentPerformance.statuses.underperforming"),
  decaying: t("contentPerformance.statuses.decaying"),
  insufficient_data: t("contentPerformance.statuses.insufficient_data"),
};

export const PERFORMANCE_COLORS: Record<ContentPerformanceStatus, string> = {
  performing: "#186b45",
  underperforming: "#b45309",
  decaying: "#9e2f22",
  insufficient_data: "#7c8798",
};

export const INTENT_LABELS: Record<SearchIntent, string> = {
  transactional: "تجاري تحويلي",
  commercial: "تجاري",
  local: "محلي",
  navigational: "تنقّلي",
  informational: "معلوماتي",
};

export const INTENT_COLORS: Record<SearchIntent, string> = {
  transactional: "#186b45",
  commercial: "#8c5a06",
  local: "#17458c",
  navigational: "#6b3fa0",
  informational: "#596373",
};

/** Google's published Core Web Vitals bands, used only to colour the readout. */
export const VITAL_BANDS: Record<string, { good: number; poor: number }> = {
  lcp_ms: { good: 2500, poor: 4000 },
  inp_ms: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  ttfb_ms: { good: 800, poor: 1800 },
};

export const VITAL_LABELS: [keyof PageSpeedSummary["lab"], string][] = [
  ["lcp_ms", t("vitals.lcp_ms")],
  ["inp_ms", t("vitals.inp_ms")],
  ["cls", t("vitals.cls")],
  ["fcp_ms", t("vitals.fcp_ms")],
  ["ttfb_ms", t("vitals.ttfb_ms")],
];

export const AUDIT_CATEGORY_LABELS: Record<string, string> = {
  meta: "الوسوم التعريفية",
  content: "المحتوى",
  indexing: "الفهرسة",
  links: "الروابط",
  performance: "الأداء",
  opportunity: "الفرص",
};

export function severityColor(severity: number): string | undefined {
  if (severity >= 5) return CRIMSON;
  if (severity >= 4) return "#b45309";
  return undefined;
}

/** Shared score colour bands used by <ScoreBadge/> and, before that existed, by every
 * inline score ternary (audit, PageSpeed, content QA, coverage, pre-publish gate). */
export function scoreColor(score: number): string {
  if (score >= 80) return "#186b45";
  if (score >= 50) return "#b45309";
  return CRIMSON;
}

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function signed(value: number, digits = 0): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function vitalColor(key: string, value: number | null): string | undefined {
  const band = VITAL_BANDS[key];
  if (!band || value === null) return undefined;
  if (value > band.poor) return CRIMSON;
  if (value > band.good) return "#b45309";
  return "#186b45";
}

export function formatVital(key: string, value: number | null): string {
  if (value === null) return "—";
  return key === "cls" ? value.toFixed(3) : `${Math.round(value)}ms`;
}

/** A pivot far enough back that its 28-day "after" window has already elapsed. */
export function defaultPivotDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 45);
  return date.toISOString().slice(0, 10);
}
