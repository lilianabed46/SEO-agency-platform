export type SiteType = "store" | "services" | "blog";

export interface Client {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
  website_count?: number;
}

export interface Website {
  id: string;
  client_id: string;
  url: string;
  site_type: SiteType;
  country: string;
  language: string;
  goal: string | null;
  // Onboarding context — fed to the diagnosis prompt so business_impact is scored
  // against this site rather than in the abstract.
  niche: string | null;
  target_audience: string | null;
  cms: string | null;
  created_at: string;
}

export interface ClientProfile extends Client {
  websites: Website[];
}

export interface GoogleStatus {
  connected: boolean;
  google_account_email: string | null;
  connected_at: string | null;
}

export interface GscSiteEntry {
  siteUrl: string;
  permissionLevel?: string | null;
}

export interface Ga4PropertyEntry {
  propertyId: string;
  displayName: string | null;
  accountName: string | null;
}

export interface GoogleProperties {
  gscSites: GscSiteEntry[];
  ga4Properties: Ga4PropertyEntry[];
}

export interface WebsiteGoogleProperties {
  website_id: string;
  gsc_site_url: string | null;
  ga4_property_id: string | null;
  updated_at: string | null;
}

export interface SearchAnalyticsRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleSummary {
  siteUrl: string;
  startDate: string;
  endDate: string;
  rows: SearchAnalyticsRow[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
}

export interface Ga4ReportRow {
  date: string;
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
  engagementRate: number;
}

export interface Ga4Summary {
  propertyId: string;
  startDate: string;
  endDate: string;
  rows: Ga4ReportRow[];
  totals: { activeUsers: number; sessions: number; screenPageViews: number; engagementRate: number };
}

export interface WebsiteGoogleData {
  searchConsole: SearchConsoleSummary | null;
  ga4: Ga4Summary | null;
}

export type CrawlStatus = "running" | "completed" | "failed";

export interface Crawl {
  id: string;
  website_id: string;
  status: CrawlStatus;
  started_at: string;
  finished_at: string | null;
  pages_crawled: number;
  broken_links_count: number;
  error: string | null;
}

export interface CrawlPage {
  id: string;
  crawl_id: string;
  url: string;
  status_code: number | null;
  title: string | null;
  meta_description: string | null;
  meta_robots: string | null;
  h1: string | null;
  h1_count: number;
  h2_count: number;
  h3_count: number;
  images_count: number;
  images_missing_alt: number;
  hreflang_count: number;
  /** JSON-encoded string[] of JSON-LD @type values found on the page. */
  schema_types: string | null;
  html_lang: string | null;
  canonical_url: string | null;
  redirect_url: string | null;
  content_type: string | null;
  word_count: number | null;
  response_time_ms: number | null;
  is_broken: number;
  discovered_from: string | null;
  crawled_at: string;
}

export interface CrawlLink {
  id: string;
  crawl_id: string;
  source_url: string;
  target_url: string;
  anchor_text: string | null;
  is_internal: number;
  status_code: number | null;
  is_broken: number;
  checked_at: string;
}

export interface CrawlDetail extends Crawl {
  pages: CrawlPage[];
  links: CrawlLink[];
}

// ---------------------------------------------------------------------------
// The loop: Analysis -> Diagnosis -> Decision -> Action -> Measurement -> Learning
// Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export type AuditCategory = "meta" | "content" | "indexing" | "links" | "performance" | "opportunity";

export interface AuditIssue {
  id: string;
  website_id: string;
  crawl_id: string;
  rule_code: string;
  category: AuditCategory;
  severity: number;
  page_url: string | null;
  detail: string | null;
  created_at: string;
}

export interface AuditSummary {
  crawl_id: string;
  score: number;
  pages_analysed: number;
  issues_by_category: Record<AuditCategory, number>;
  issues: AuditIssue[];
}

export type ActionType =
  | "fix_technical"
  | "improve_title"
  | "improve_meta"
  | "add_internal_links"
  | "refresh_content"
  | "create_content"
  | "improve_schema"
  | "improve_performance";

export interface Diagnosis {
  id: string;
  website_id: string;
  crawl_id: string | null;
  problem: string;
  evidence: string[];
  root_cause: string;
  severity: number;
  business_impact: number;
  effort: number;
  confidence: number;
  priority_score: number;
  action_type: ActionType;
  recommended_action: string;
  model: string | null;
  is_demo_seed: number;
  created_at: string;
  /** S4-2/S9-5 */
  dismissed: number;
  dismissed_reason: string | null;
}

/** S4-2: derived client-side — "opportunity" (create_content) vs "fix" (everything else). */
export type OpportunityKind = "fix" | "opportunity";

export function diagnosisKind(actionType: ActionType): OpportunityKind {
  return actionType === "create_content" ? "opportunity" : "fix";
}

export interface DiagnoseResponse {
  stale: boolean;
  reason?: string;
  diagnoses: Diagnosis[];
}

export interface ActionResult {
  id: string;
  action_id: string;
  after_metrics: string | null;
  delta_clicks: number | null;
  delta_impressions: number | null;
  delta_ctr: number | null;
  delta_position: number | null;
  success: number | null;
  measured_at: string;
}

export interface ActionWithResult {
  id: string;
  website_id: string;
  diagnosis_id: string | null;
  action_type: ActionType;
  title: string;
  status: "approved" | "done" | "dismissed";
  before_metrics: string | null;
  approved_at: string;
  is_demo_seed: number;
  result: ActionResult | null;
}

export interface ComparisonTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface ComparisonPeriod {
  start: string;
  end: string;
  totals: ComparisonTotals;
}

export interface Comparison {
  pivot_date: string;
  window_days: number;
  before: ComparisonPeriod;
  after: ComparisonPeriod;
  delta_clicks: number;
  delta_impressions: number;
  delta_ctr: number;
  delta_position: number;
  success: boolean;
  after_window_complete: boolean;
}

export interface LearningRow {
  action_type: ActionType;
  tried: number;
  measured: number;
  succeeded: number;
  success_rate: number | null;
  avg_delta_clicks: number | null;
}

export interface LearningResponse {
  scope: "website" | "all";
  includes_demo_data: boolean;
  rows: LearningRow[];
}

// ---------------------------------------------------------------------------
// S5-3 — Keyword + page decision. Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export type KeywordDecisionValue = "target_new" | "improve_existing" | "ignore";

export interface KeywordDecision {
  id: string;
  website_id: string;
  page: string;
  query: string;
  decision: KeywordDecisionValue;
  note: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// X-3 — multi-site overview. Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export interface OverviewRow {
  website_id: string;
  client_id: string;
  client_name: string;
  url: string;
  audit_score: number | null;
  critical_alert_count: number;
  last_crawl_at: string | null;
  last_crawl_status: CrawlStatus | null;
  open_action_count: number;
}

export type PageSpeedStrategy = "mobile" | "desktop";

export interface CoreWebVitals {
  lcp_ms: number | null;
  /** Field-only — Lighthouse has no lab equivalent, so lab data always has null here. */
  inp_ms: number | null;
  cls: number | null;
  fcp_ms: number | null;
  ttfb_ms: number | null;
}

export interface PageSpeedSummary {
  url: string;
  strategy: PageSpeedStrategy;
  performance_score: number | null;
  lab: CoreWebVitals;
  /** null when CrUX has no real-user sample for this URL or origin. */
  field: CoreWebVitals | null;
  field_source: "url" | "origin" | null;
  fetched_at: string;
  folded_into_audit?: boolean;
  from_cache?: boolean;
}

// ---------------------------------------------------------------------------
// Module 5 — Search Intent Engine. Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export type SearchIntent = "transactional" | "commercial" | "local" | "navigational" | "informational";
export type IntentTag = "comparison" | "review" | "how_to" | "guide";

export interface QueryIntent {
  query: string;
  impressions: number;
  clicks: number;
  primary_intent: SearchIntent;
  tags: IntentTag[];
}

export interface PageIntentSummary {
  page: string;
  dominant_intent: SearchIntent | null;
  intent_mix: Record<SearchIntent, number>;
  total_impressions: number;
  top_queries: QueryIntent[];
}

export interface SearchIntentSummary {
  siteUrl: string;
  startDate: string;
  endDate: string;
  overall_mix: Record<SearchIntent, number>;
  queries: QueryIntent[];
  pages: PageIntentSummary[];
}

// ---------------------------------------------------------------------------
// Module 29 — Content Performance Engine. Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export type ContentPerformanceStatus = "performing" | "underperforming" | "decaying" | "insufficient_data";

export interface PagePerformance {
  page: string;
  status: ContentPerformanceStatus;
  current_clicks: number;
  previous_clicks: number;
  delta_clicks: number;
  current_impressions: number;
  current_ctr: number;
  current_position: number;
  expected_ctr: number | null;
  reason: string;
}

export interface ContentPerformanceSummary {
  siteUrl: string;
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  counts: Record<ContentPerformanceStatus, number>;
  pages: PagePerformance[];
}

// ---------------------------------------------------------------------------
// Module 36 — Alert Engine. Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export type AlertType =
  | "ranking_drop"
  | "traffic_drop"
  | "ctr_anomaly"
  | "indexing_error"
  | "robots_changed"
  | "sitemap_changed"
  | "new_broken_links"
  | "new_critical_issue";

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  detail: string;
}

export interface AlertSummary {
  website_id: string;
  generated_at: string;
  alerts: Alert[];
}

// ---------------------------------------------------------------------------
// Module 20 — Content Quality QA. Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export interface ContentQualityFinding {
  rule_code: string;
  severity: number;
  detail: string;
}

export interface ContentQualityResult {
  score: number;
  word_count: number;
  sentence_count: number;
  findings: ContentQualityFinding[];
}

// ---------------------------------------------------------------------------
// Module 26 — Pre-Publish SEO Gate. Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export interface GateSubscore {
  name: string;
  score: number | null;
  weight: number;
}

export interface GateResult {
  pass: boolean;
  overall_score: number;
  critical_issue_count: number;
  subscores: GateSubscore[];
  excluded_checks: string[];
}

// ---------------------------------------------------------------------------
// Stage 7 (minimum viable) — Content Brief / Title / Outline / Draft
// Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export interface OutlineItem {
  level: "h1" | "h2" | "h3";
  text: string;
}

export interface ContentDraft {
  id: string;
  action_id: string;
  website_id: string;
  primary_keyword: string;
  secondary_keywords: string[];
  content_type: SearchIntent;
  seo_title: string;
  meta_description: string;
  url_slug: string;
  outline: OutlineItem[];
  body_markdown: string;
  model: string | null;
  is_demo_seed: number;
  created_at: string;
  /** S8-3 */
  review_status: "pending" | "approved" | "rejected";
  review_reason: string | null;
  reviewed_at: string | null;
  /** S7-1 */
  is_edited: number;
  edited_at: string | null;
  version: number;
}

export interface ContentDraftResponse {
  stale: boolean;
  reason?: string;
  draft: ContentDraft;
}

/** S7-1 — fields a human can edit in place. */
export interface ContentDraftEdit {
  primary_keyword?: string;
  secondary_keywords?: string[];
  seo_title?: string;
  meta_description?: string;
  url_slug?: string;
  outline?: OutlineItem[];
  body_markdown?: string;
}

export type ReviewDecision = "approved" | "rejected";

// ---------------------------------------------------------------------------
// Module 16 — Real-Time Content Intelligence. Mirrors server/src/types/index.ts
// ---------------------------------------------------------------------------

export interface CoverageFinding {
  rule_code: string;
  severity: number;
  detail: string;
}

export interface ContentCoverageResult {
  primary_keyword_found: boolean;
  primary_keyword_count: number;
  primary_keyword_in_heading: boolean;
  secondary_keywords_total: number;
  secondary_keywords_covered: number;
  secondary_keywords_missing: string[];
  outline_headings_total: number;
  outline_headings_matched: number;
  outline_headings_missing: string[];
  declared_intent: SearchIntent;
  intent_signal_present: boolean;
  score: number;
  findings: CoverageFinding[];
}
