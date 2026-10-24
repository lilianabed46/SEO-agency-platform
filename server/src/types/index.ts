export type SiteType = "store" | "services" | "blog";

export interface Client {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface Website {
  id: string;
  client_id: string;
  url: string;
  site_type: SiteType;
  country: string;
  language: string;
  goal: string | null;
  // Onboarding context. Not decoration: these feed the diagnosis prompt, which is
  // what lets the model score business_impact against this site rather than in general.
  niche: string | null;
  target_audience: string | null;
  cms: string | null;
  created_at: string;
}

// Internal row shape — includes encrypted columns. Never send this straight to res.json().
export interface GoogleConnectionRow {
  id: string;
  google_account_email: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expiry: string;
  scope: string;
  connected_at: string;
  updated_at: string;
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
  robots_status: number | null;
  robots_content: string | null;
  /** JSON-encoded string[] of Sitemap: lines declared in robots.txt. */
  robots_sitemaps: string | null;
  sitemap_url: string | null;
  sitemap_status: number | null;
  sitemap_url_count: number;
}

export interface CrawlSitemapUrl {
  id: string;
  crawl_id: string;
  url: string;
  lastmod: string | null;
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

export interface SearchAnalyticsRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsTotals {
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
  totals: SearchAnalyticsTotals;
}

export interface Ga4ReportRow {
  date: string;
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
  engagementRate: number;
}

export interface Ga4ReportTotals {
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
  totals: Ga4ReportTotals;
}

export interface WebsiteGoogleData {
  searchConsole: SearchConsoleSummary | null;
  ga4: Ga4Summary | null;
}

// ---------------------------------------------------------------------------
// Stage 3-7 loop: Analysis -> Diagnosis -> Decision -> Action -> Measurement
// ---------------------------------------------------------------------------

export type MetricSource = "gsc" | "ga4" | "psi";

export interface MetricSnapshot {
  id: string;
  website_id: string;
  source: MetricSource;
  metric_key: string;
  metric_value: number;
  period_start: string;
  period_end: string;
  captured_at: string;
}

export type AuditCategory = "meta" | "content" | "indexing" | "links" | "performance" | "opportunity";

/** One (page, query) pair from Search Console — the grain everything else is built from. */
export interface PageQueryRow {
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PageAnalyticsRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  /** Impression-weighted, because a flat mean over queries overstates rare terms. */
  position: number;
  query_count: number;
}

export interface SearchConsolePageSummary {
  siteUrl: string;
  startDate: string;
  endDate: string;
  rows: PageQueryRow[];
  pages: PageAnalyticsRow[];
}

// ---------------------------------------------------------------------------
// Module 5 — Search Intent Engine
// ---------------------------------------------------------------------------

/**
 * Mutually exclusive — every query gets exactly one. "Pillar"/"Supporting Content"
 * from the original brief describe site architecture (topic clusters), not a single
 * query's intent, and topic clustering is out of scope (see CONTRIBUTING.md), so
 * they are not modelled here.
 */
export type SearchIntent = "transactional" | "commercial" | "local" | "navigational" | "informational";

/** Not exclusive with each other or with the primary intent — describe content format. */
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
  /** Impressions per intent among this page's queries — the mix, not just the winner. */
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
// Module 29 — Content Performance Engine
// ---------------------------------------------------------------------------

/**
 * "insufficient_data" is a fourth, practical bucket alongside the brief's three
 * (Performing / Underperforming / Decaying): below the impression floor, a page's
 * clicks bounce around by chance, and classifying it either way would be a guess
 * dressed up as a finding.
 */
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
  /** Set only when status is "underperforming" — what CTR this position typically earns. */
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
// Module 36 — Alert Engine
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
// Module 20 — Content Quality QA
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
// Module 26 — Pre-Publish SEO Gate
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
  /** Checks the original brief lists that this gate cannot run — SERP-dependent or
   *  explicitly out of scope per CONTRIBUTING.md — stated rather than silently skipped. */
  excluded_checks: string[];
}

export type PageSpeedStrategy = "mobile" | "desktop";

export interface CoreWebVitals {
  lcp_ms: number | null;
  /** Field-only. Lighthouse has no lab equivalent, so this is null in lab data. */
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
  /** null when CrUX has no sample for this URL or its origin — common on small sites. */
  field: CoreWebVitals | null;
  field_source: "url" | "origin" | null;
  fetched_at: string;
}

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

/** What audit/rules.ts produces, before the route stamps ids and timestamps on it. */
export interface AuditFinding {
  rule_code: string;
  category: AuditCategory;
  severity: number;
  page_url: string | null;
  detail: string;
}

export interface AuditSummary {
  crawl_id: string;
  score: number;
  pages_analysed: number;
  issues_by_category: Record<AuditCategory, number>;
  issues: AuditIssue[];
}

/** Closed list — the Learning query groups on this, so free-text would fragment it. */
export type ActionType =
  | "fix_technical"
  | "improve_title"
  | "improve_meta"
  | "add_internal_links"
  | "refresh_content"
  | "create_content"
  | "improve_schema"
  | "improve_performance";

export const ACTION_TYPES: ActionType[] = [
  "fix_technical",
  "improve_title",
  "improve_meta",
  "add_internal_links",
  "refresh_content",
  "create_content",
  "improve_schema",
  "improve_performance",
];

/** Row shape — evidence is a JSON-encoded string[] in the db. */
export interface DiagnosisRow {
  id: string;
  website_id: string;
  crawl_id: string | null;
  problem: string;
  evidence: string;
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
  /** S4-2/S9-5: dismissed from the Decision/Opportunities screen without ever becoming
   *  an action. Independent of ActionStatus's 'dismissed', which only applies post-approval. */
  dismissed: number;
  dismissed_reason: string | null;
}

/** API shape — evidence parsed back into an array. */
export interface Diagnosis extends Omit<DiagnosisRow, "evidence"> {
  evidence: string[];
}

/** S4-2: derived, not stored — "opportunity" (create_content) vs "fix" (everything else). */
export type OpportunityKind = "fix" | "opportunity";

export function diagnosisKind(actionType: ActionType): OpportunityKind {
  return actionType === "create_content" ? "opportunity" : "fix";
}

/** Exactly what the model must return, before we compute priority_score ourselves. */
export interface DiagnosisDraft {
  problem: string;
  evidence: string[];
  root_cause: string;
  severity: number;
  business_impact: number;
  effort: number;
  confidence: number;
  action_type: ActionType;
  recommended_action: string;
}

export type ActionStatus = "approved" | "done" | "dismissed";

export interface ActionRow {
  id: string;
  website_id: string;
  diagnosis_id: string | null;
  action_type: ActionType;
  title: string;
  status: ActionStatus;
  before_metrics: string | null;
  approved_at: string;
  is_demo_seed: number;
}

export interface MetricsSnapshotJson {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  period_start: string;
  period_end: string;
}

export interface ActionResultRow {
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

// ---------------------------------------------------------------------------
// Stage 7 (minimum viable) — Content Brief / Title / Outline / AI Writing
// ---------------------------------------------------------------------------

export interface OutlineItem {
  level: "h1" | "h2" | "h3";
  text: string;
}

/** Exactly what the model must return. content_type mirrors module 5's primary
 *  intent categories so the brief stays consistent with how the site's own queries
 *  are classified, rather than inventing a second vocabulary. */
export interface ContentDraftInput {
  primary_keyword: string;
  secondary_keywords: string[];
  content_type: SearchIntent;
  seo_title: string;
  meta_description: string;
  url_slug: string;
  outline: OutlineItem[];
  body_markdown: string;
}

export interface ContentDraftRow {
  id: string;
  action_id: string;
  website_id: string;
  primary_keyword: string;
  secondary_keywords: string; // JSON string[]
  content_type: SearchIntent;
  seo_title: string;
  meta_description: string;
  url_slug: string;
  outline: string; // JSON OutlineItem[]
  body_markdown: string;
  model: string | null;
  is_demo_seed: number;
  created_at: string;
  /** S8-3: human review after the pre-publish gate's PASS/FAIL verdict — content is
   *  never "ready" before this is 'approved'. S7-1: is_edited/edited_at track that a
   *  human changed the draft's own text, so a later "Regenerate" can warn before it
   *  overwrites that edit. */
  review_status: "pending" | "approved" | "rejected";
  review_reason: string | null;
  reviewed_at: string | null;
  is_edited: number;
  edited_at: string | null;
  /** S7-1 — bumped on every edit; the pre-bump snapshot is kept in
   *  content_draft_versions, never overwritten in place. */
  version: number;
}

/** S7-1 — a prior snapshot of a draft's editable fields, kept so a Save never loses
 *  the version it replaced (a generation still fully replaces the row via DELETE+
 *  INSERT, since it starts a new content_type/keyword brief — this history is only
 *  for in-place edits). Feeds the publish log a later stage (S9-4) will read. */
export interface ContentDraftVersionRow {
  id: string;
  draft_id: string;
  action_id: string;
  version: number;
  primary_keyword: string;
  secondary_keywords: string; // JSON string[]
  seo_title: string;
  meta_description: string;
  url_slug: string;
  outline: string; // JSON OutlineItem[]
  body_markdown: string;
  saved_at: string;
}

export interface ContentDraft extends Omit<ContentDraftRow, "secondary_keywords" | "outline"> {
  secondary_keywords: string[];
  outline: OutlineItem[];
}

/** S7-1 — fields a human can edit in place. Everything else (ids, model, timestamps) stays server-owned. */
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
// Module 16 — Real-Time Content Intelligence (coverage, not writing quality —
// that's module 20). Checks a generated draft against its own brief: does the
// body actually cover the keywords and outline it was supposed to.
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
  /** Low confidence by design — a keyword-pattern heuristic over the body, not
   *  semantic understanding. See contentCoverageService.ts for the caveat. */
  intent_signal_present: boolean;
  score: number;
  findings: CoverageFinding[];
}

export interface ContentDraftResponse {
  stale: boolean;
  reason?: string;
  draft: ContentDraft;
}

export interface LearningRow {
  action_type: ActionType;
  tried: number;
  measured: number;
  succeeded: number;
  success_rate: number | null;
  avg_delta_clicks: number | null;
}

// ---------------------------------------------------------------------------
// S5-3 (Lilian's task list) — Keyword + page decision
// ---------------------------------------------------------------------------

export type KeywordDecisionValue = "target_new" | "improve_existing" | "ignore";

export interface KeywordDecisionRow {
  id: string;
  website_id: string;
  page: string;
  query: string;
  decision: KeywordDecisionValue;
  note: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// X-3 (Lilian's task list) — multi-site overview
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
