import type {
  ActionType,
  AuditFinding,
  DiagnosisDraft,
  SearchConsolePageSummary,
} from "../types";
import { ACTION_TYPES } from "../types";
import { currentModelLabel, generateJson } from "../lib/llm";

/**
 * Step 3 of the loop. Takes the deterministic audit findings plus whatever Search
 * Console knows about the site, and asks the model for a *structured* diagnosis —
 * problem, evidence, root cause, and the four numbers the priority score needs.
 *
 * Two rules hold this together:
 *  1. The model never sets priority_score. We compute it, so ranking stays explainable.
 *  2. Every number the model returns is clamped before it reaches the db, because one
 *     invented action_type would fragment the Learning query permanently.
 */

const SYSTEM_PROMPT = `You are a senior technical SEO analyst.
You are given the output of an automated site crawl and, when available, Google Search Console data.
Diagnose the underlying problems — not the symptoms the crawler already listed.
Answer only with JSON matching the requested schema. No prose, no markdown fences.`;

interface GroupedFinding {
  rule_code: string;
  category: string;
  severity: number;
  count: number;
  examples: string[];
  sample_detail: string;
}

function groupFindings(findings: AuditFinding[]): GroupedFinding[] {
  const groups = new Map<string, GroupedFinding>();
  for (const finding of findings) {
    const existing = groups.get(finding.rule_code);
    if (existing) {
      existing.count += 1;
      if (existing.examples.length < 3 && finding.page_url) existing.examples.push(finding.page_url);
      continue;
    }
    groups.set(finding.rule_code, {
      rule_code: finding.rule_code,
      category: finding.category,
      severity: finding.severity,
      count: 1,
      examples: finding.page_url ? [finding.page_url] : [],
      sample_detail: finding.detail,
    });
  }
  return [...groups.values()].sort((a, b) => b.severity * b.count - a.severity * a.count);
}

/**
 * Onboarding context from the websites row. Without it the model scores
 * business_impact in the abstract; with it, "thin content on /pricing" reads
 * differently for a dental clinic chasing bookings than for a hobby blog.
 */
export interface SiteContext {
  url: string;
  site_type: string;
  country: string;
  language: string;
  goal: string | null;
  niche: string | null;
  target_audience: string | null;
  cms: string | null;
}

function describeSite(site: SiteContext): string {
  const lines = [
    `URL: ${site.url}`,
    `Business type: ${site.site_type}`,
    `Country: ${site.country}`,
    `Language: ${site.language}`,
  ];
  if (site.niche) lines.push(`Niche: ${site.niche}`);
  if (site.target_audience) lines.push(`Target audience: ${site.target_audience}`);
  if (site.goal) lines.push(`Business goal: ${site.goal}`);
  if (site.cms) lines.push(`CMS: ${site.cms}`);
  return lines.join("\n");
}

function buildPrompt(params: {
  site: SiteContext;
  pagesAnalysed: number;
  score: number;
  findings: AuditFinding[];
  searchConsole: SearchConsolePageSummary | null;
}): string {
  const grouped = groupFindings(params.findings);

  // Page-level data is what lets the model tie a finding to a page that actually earns
  // traffic, instead of scoring every issue as if all pages mattered equally.
  const gscBlock = params.searchConsole
    ? JSON.stringify(
        {
          period: `${params.searchConsole.startDate} to ${params.searchConsole.endDate}`,
          top_pages: params.searchConsole.pages.slice(0, 15).map((page) => ({
            page: page.page,
            clicks: page.clicks,
            impressions: page.impressions,
            ctr: Number(page.ctr.toFixed(4)),
            position: Number(page.position.toFixed(1)),
          })),
          top_queries: params.searchConsole.rows
            .slice()
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, 15),
        },
        null,
        2
      )
    : "null (this site has no Search Console data mapped yet)";

  return `BUSINESS CONTEXT:
${describeSite(params.site)}

PAGES CRAWLED AND ANALYSED: ${params.pagesAnalysed}
DETERMINISTIC AUDIT SCORE: ${params.score}/100

AUDIT FINDINGS (grouped by rule, highest severity x count first):
${JSON.stringify(grouped, null, 2)}

SEARCH CONSOLE (last 28 days, by page and by query):
${gscBlock}

Return between 3 and 6 diagnoses, ordered by how much they matter to this site's organic traffic.
Merge related findings into one diagnosis rather than restating each rule separately.
Score business_impact against the BUSINESS CONTEXT above — the same technical issue is
worth more on a page that serves this site's audience and goal than on one that does not.
Where a finding names a page that appears in top_pages, weigh it by that page's real
impressions and clicks, and say those numbers in the evidence.

Respond with JSON of exactly this shape:
{
  "diagnoses": [
    {
      "problem": "one sentence naming what is wrong",
      "evidence": ["concrete facts drawn from the data above, with numbers or URLs"],
      "root_cause": "why this is happening, not what the symptom is",
      "severity": 1-5,
      "business_impact": 1-5,
      "effort": 1-5,
      "confidence": 0.0-1.0,
      "action_type": one of ${JSON.stringify(ACTION_TYPES)},
      "recommended_action": "one specific, executable instruction"
    }
  ]
}`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function coerceActionType(value: unknown): ActionType {
  return ACTION_TYPES.includes(value as ActionType) ? (value as ActionType) : "fix_technical";
}

function coerceEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8);
}

/** Never trust the model's numbers — one out-of-range value would skew every ranking. */
function sanitise(raw: Partial<DiagnosisDraft>): DiagnosisDraft | null {
  const problem = typeof raw.problem === "string" ? raw.problem.trim() : "";
  const rootCause = typeof raw.root_cause === "string" ? raw.root_cause.trim() : "";
  const recommended = typeof raw.recommended_action === "string" ? raw.recommended_action.trim() : "";
  if (!problem || !rootCause || !recommended) return null;

  return {
    problem,
    evidence: coerceEvidence(raw.evidence),
    root_cause: rootCause,
    severity: clampInt(raw.severity, 1, 5, 3),
    business_impact: clampInt(raw.business_impact, 1, 5, 3),
    effort: clampInt(raw.effort, 1, 5, 3),
    confidence: clampFloat(raw.confidence, 0, 1, 0.5),
    action_type: coerceActionType(raw.action_type),
    recommended_action: recommended,
  };
}

/**
 * (severity x business_impact x confidence) / effort, rescaled to 0-100.
 * Max raw value is (5 x 5 x 1) / 1 = 25, hence the x4.
 */
export function priorityScore(draft: DiagnosisDraft): number {
  const raw = (draft.severity * draft.business_impact * draft.confidence) / draft.effort;
  return Math.min(100, Math.round(raw * 4));
}

export interface DiagnosisResult {
  drafts: DiagnosisDraft[];
  model: string;
}

export async function diagnose(params: {
  site: SiteContext;
  pagesAnalysed: number;
  score: number;
  findings: AuditFinding[];
  searchConsole: SearchConsolePageSummary | null;
}): Promise<DiagnosisResult> {
  const response = await generateJson<{ diagnoses?: unknown[] }>(buildPrompt(params), {
    system: SYSTEM_PROMPT,
    temperature: 0.2,
  });

  const drafts = (response.diagnoses ?? [])
    .map((item) => sanitise((item ?? {}) as Partial<DiagnosisDraft>))
    .filter((draft): draft is DiagnosisDraft => draft !== null);

  return { drafts, model: currentModelLabel() };
}
