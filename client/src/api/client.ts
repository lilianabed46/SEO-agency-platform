import type {
  Client,
  ClientProfile,
  Website,
  GoogleStatus,
  GoogleProperties,
  WebsiteGoogleProperties,
  WebsiteGoogleData,
  Crawl,
  CrawlDetail,
  AuditSummary,
  Diagnosis,
  DiagnoseResponse,
  ActionWithResult,
  Comparison,
  LearningResponse,
  PageSpeedSummary,
  SearchIntentSummary,
  ContentPerformanceSummary,
  AlertSummary,
  ContentQualityResult,
  GateResult,
  ContentDraft,
  ContentDraftResponse,
  ContentDraftEdit,
  ReviewDecision,
  ContentCoverageResult,
  KeywordDecision,
  KeywordDecisionValue,
  OverviewRow,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listClients: () => request<Client[]>("/clients"),
  getClient: (id: string) => request<ClientProfile>(`/clients/${id}`),
  createClient: (data: Pick<Client, "name" | "contact_email" | "contact_phone" | "notes">) =>
    request<Client>("/clients", { method: "POST", body: JSON.stringify(data) }),
  deleteClient: (id: string) => request<void>(`/clients/${id}`, { method: "DELETE" }),

  addWebsite: (clientId: string, data: Omit<Website, "id" | "client_id" | "created_at">) =>
    request<Website>(`/clients/${clientId}/websites`, { method: "POST", body: JSON.stringify(data) }),
  getWebsite: (id: string) => request<Website>(`/websites/${id}`),
  deleteWebsite: (id: string) => request<void>(`/websites/${id}`, { method: "DELETE" }),

  // Google connection (global — one agency account, see CONTRIBUTING.md)
  googleConnectUrl: `${API_BASE}/google/connect`,
  getGoogleStatus: () => request<GoogleStatus>("/google/status"),
  disconnectGoogle: () => request<void>("/google", { method: "DELETE" }),
  getGoogleProperties: () => request<GoogleProperties>("/google/properties"),

  // Per-website Google property mapping + data pull
  getWebsiteGoogle: (websiteId: string) => request<WebsiteGoogleProperties>(`/websites/${websiteId}/google`),
  saveWebsiteGoogle: (websiteId: string, data: { gsc_site_url: string | null; ga4_property_id: string | null }) =>
    request<WebsiteGoogleProperties>(`/websites/${websiteId}/google`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  getGoogleData: (websiteId: string) => request<WebsiteGoogleData>(`/websites/${websiteId}/google/data`),

  // Site crawler
  startCrawl: (websiteId: string) =>
    request<{ id: string; status: string }>(`/websites/${websiteId}/crawls`, { method: "POST" }),
  listCrawls: (websiteId: string) => request<Crawl[]>(`/websites/${websiteId}/crawls`),
  getCrawl: (websiteId: string, crawlId: string) =>
    request<CrawlDetail>(`/websites/${websiteId}/crawls/${crawlId}`),

  // Analysis -> Diagnosis -> Decision -> Action -> Measurement -> Learning
  runAudit: (websiteId: string) =>
    request<AuditSummary>(`/websites/${websiteId}/audit`, { method: "POST" }),
  getAudit: (websiteId: string) => request<AuditSummary>(`/websites/${websiteId}/audit`),

  runPageSpeed: (websiteId: string, url?: string) =>
    request<PageSpeedSummary>(`/websites/${websiteId}/pagespeed`, {
      method: "POST",
      body: JSON.stringify(url ? { url } : {}),
    }),
  getPageSpeed: (websiteId: string) => request<PageSpeedSummary>(`/websites/${websiteId}/pagespeed`),

  // Module 5 — Search Intent Engine. Requires a mapped Search Console property.
  getSearchIntent: (websiteId: string) =>
    request<SearchIntentSummary>(`/websites/${websiteId}/search-intent`),

  // Module 29 — Content Performance Engine. Requires a mapped Search Console property.
  getContentPerformance: (websiteId: string) =>
    request<ContentPerformanceSummary>(`/websites/${websiteId}/content-performance`),

  // Module 36 — Alert Engine. Technical alerts work with just a crawl history;
  // traffic alerts additionally need a mapped Search Console property.
  getAlerts: (websiteId: string) => request<AlertSummary>(`/websites/${websiteId}/alerts`),

  // Module 20 — Content Quality QA. Takes raw text directly; no content storage
  // table involved, so it works standalone against any draft text.
  checkContentQuality: (websiteId: string, text: string, targetKeyword?: string) =>
    request<ContentQualityResult>(`/websites/${websiteId}/content-quality`, {
      method: "POST",
      body: JSON.stringify({ text, target_keyword: targetKeyword || undefined }),
    }),

  // Module 26 — Pre-Publish SEO Gate. contentQualityScore is optional.
  getPreFlightGate: (websiteId: string, contentQualityScore?: number) =>
    request<GateResult>(
      `/websites/${websiteId}/pre-publish-gate${
        contentQualityScore !== undefined ? `?content_quality_score=${contentQualityScore}` : ""
      }`
    ),

  runDiagnosis: (websiteId: string) =>
    request<DiagnoseResponse>(`/websites/${websiteId}/diagnose`, { method: "POST" }),
  listDiagnoses: (websiteId: string) => request<Diagnosis[]>(`/websites/${websiteId}/diagnoses`),

  // S4-2 / S9-5 — dismiss a diagnosis/opportunity from the Decision screen.
  dismissDiagnosis: (websiteId: string, diagnosisId: string, reason: string) =>
    request<Diagnosis>(`/websites/${websiteId}/diagnoses/${diagnosisId}/dismiss`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  undismissDiagnosis: (websiteId: string, diagnosisId: string) =>
    request<Diagnosis>(`/websites/${websiteId}/diagnoses/${diagnosisId}/dismiss`, { method: "DELETE" }),

  approveAction: (websiteId: string, diagnosisId: string) =>
    request<ActionWithResult>(`/websites/${websiteId}/actions`, {
      method: "POST",
      body: JSON.stringify({ diagnosis_id: diagnosisId }),
    }),
  listActions: (websiteId: string) => request<ActionWithResult[]>(`/websites/${websiteId}/actions`),

  measure: (websiteId: string, date?: string) =>
    request<Comparison>(`/websites/${websiteId}/measure${date ? `?date=${date}` : ""}`),
  measureAction: (websiteId: string, actionId: string, date?: string) =>
    request<{ action_id: string; comparison: Comparison }>(
      `/websites/${websiteId}/actions/${actionId}/measure`,
      { method: "POST", body: JSON.stringify(date ? { date } : {}) }
    ),

  // Stage 8 export — a plain URL so the browser handles rendering and saving.
  reportUrl: (websiteId: string, format: "markdown" | "html") =>
    `${API_BASE}/websites/${websiteId}/report?format=${format}`,

  // Stage 7 (minimum viable) — one draft per approved action.
  generateContent: (websiteId: string, actionId: string) =>
    request<ContentDraftResponse>(`/websites/${websiteId}/actions/${actionId}/content`, { method: "POST" }),
  getContent: (websiteId: string, actionId: string) =>
    request<ContentDraft>(`/websites/${websiteId}/actions/${actionId}/content`),

  // S7-1 — edit the draft's own fields in place (no full regenerate).
  updateContent: (websiteId: string, actionId: string, edit: ContentDraftEdit) =>
    request<ContentDraft>(`/websites/${websiteId}/actions/${actionId}/content`, {
      method: "PATCH",
      body: JSON.stringify(edit),
    }),

  // S8-3 — human approve/reject after the pre-publish gate's verdict.
  reviewContent: (websiteId: string, actionId: string, decision: ReviewDecision, reason?: string) =>
    request<ContentDraft>(`/websites/${websiteId}/actions/${actionId}/content/review`, {
      method: "PATCH",
      body: JSON.stringify({ decision, reason }),
    }),

  // Module 16 — Real-Time Content Intelligence. Recomputed live from the stored draft.
  getContentCoverage: (websiteId: string, actionId: string) =>
    request<ContentCoverageResult>(`/websites/${websiteId}/actions/${actionId}/content/coverage`),

  getLearning: (websiteId: string, scope: "website" | "all" = "website") =>
    request<LearningResponse>(`/websites/${websiteId}/learning${scope === "all" ? "?scope=all" : ""}`),

  // S5-3 — keyword + page decisions.
  getKeywordDecisions: (websiteId: string) => request<KeywordDecision[]>(`/websites/${websiteId}/keyword-decisions`),
  saveKeywordDecision: (websiteId: string, page: string, query: string, decision: KeywordDecisionValue, note?: string) =>
    request<KeywordDecision>(`/websites/${websiteId}/keyword-decisions`, {
      method: "PUT",
      body: JSON.stringify({ page, query, decision, note }),
    }),

  // X-3 — one row per website across the whole portfolio.
  getOverview: () => request<OverviewRow[]>("/overview"),
};
