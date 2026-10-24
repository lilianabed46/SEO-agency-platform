import type { ActionType, ContentDraftInput, OutlineItem, SearchIntent } from "../types";
import { currentModelLabel, generateJson } from "../lib/llm";
import type { SiteContext } from "./diagnoseService";

/**
 * Stage 7, minimum viable: brief + title + outline + a first draft, in one model
 * call. Not a full content engine — no AEO/GEO/E-E-A-T pass, no fact-checking, no
 * internal-link recommendations, all excluded per CONTRIBUTING.md. What this
 * produces is a real starting draft an editor finishes, not a finished article.
 *
 * Same two rules as diagnoseService.ts, because a second, differently-shaped output
 * validator is a second place for the same class of bug to hide:
 *  1. Every field the model returns is sanitised before it reaches the db.
 *  2. The draft is stored, and a failed regeneration falls back to what's stored
 *     rather than showing an empty screen.
 */

const VALID_INTENTS: SearchIntent[] = ["transactional", "commercial", "local", "navigational", "informational"];
const VALID_LEVELS: OutlineItem["level"][] = ["h1", "h2", "h3"];

const SYSTEM_PROMPT = `You are a senior SEO content strategist and writer.
You are given a specific technical or content problem on a client's site and asked to
produce a publish-ready content brief plus a first draft addressing it.
Write in the site's declared language, for the site's declared audience.
Answer only with JSON matching the requested schema. No prose, no markdown fences.`;

export interface ContentBriefRequest {
  site: SiteContext;
  actionType: ActionType;
  actionTitle: string;
  /** The diagnosis that produced this action, when there is one — gives the model
   *  the "why", not just the instruction, so the draft actually addresses the cause. */
  diagnosisContext?: {
    problem: string;
    rootCause: string;
    evidence: string[];
  } | null;
}

function buildPrompt(request: ContentBriefRequest): string {
  const contextBlock = request.diagnosisContext
    ? `DIAGNOSIS THIS ACTION CAME FROM:
Problem: ${request.diagnosisContext.problem}
Root cause: ${request.diagnosisContext.rootCause}
Evidence: ${request.diagnosisContext.evidence.join("; ")}`
    : "No linked diagnosis — brief this from the action title alone.";

  return `BUSINESS CONTEXT:
URL: ${request.site.url}
Business type: ${request.site.site_type}
Country: ${request.site.country}  |  Language: ${request.site.language}
${request.site.niche ? `Niche: ${request.site.niche}\n` : ""}${request.site.target_audience ? `Target audience: ${request.site.target_audience}\n` : ""}${request.site.goal ? `Business goal: ${request.site.goal}\n` : ""}

ACTION TO EXECUTE: ${request.actionTitle}
ACTION TYPE: ${request.actionType}

${contextBlock}

Write the entire brief and draft in ${request.site.language === "ar" ? "Arabic" : "the site's declared language"}.
The draft should run 400-700 words: enough to be a real starting point, not a stub.

Respond with JSON of exactly this shape:
{
  "primary_keyword": "the single keyword this content should rank for",
  "secondary_keywords": ["3-6 related keywords or phrases"],
  "content_type": one of ${JSON.stringify(VALID_INTENTS)},
  "seo_title": "under 60 characters, includes the primary keyword",
  "meta_description": "under 160 characters, includes a reason to click",
  "url_slug": "lowercase-hyphenated-slug, latin characters only even if the content is in Arabic",
  "outline": [{"level": "h1"|"h2"|"h3", "text": "heading text"}],
  "body_markdown": "the draft itself, in markdown, using the outline's headings"
}`;
}

function clampLength(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
}

function coerceIntent(value: unknown): SearchIntent {
  return VALID_INTENTS.includes(value as SearchIntent) ? (value as SearchIntent) : "informational";
}

function coerceStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, max);
}

function coerceOutline(value: unknown): OutlineItem[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .map((item): OutlineItem | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const level = VALID_LEVELS.includes(record.level as OutlineItem["level"])
        ? (record.level as OutlineItem["level"])
        : null;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      return level && text ? { level, text } : null;
    })
    .filter((item): item is OutlineItem => item !== null);

  // A brief with no h1 isn't a usable outline — force one from the first heading
  // rather than silently shipping a draft with no title heading at all.
  if (items.length > 0 && !items.some((item) => item.level === "h1")) {
    items[0] = { ...items[0], level: "h1" };
  }
  return items.slice(0, 20);
}

/** slugify(seoTitle) is the fallback when the model's own slug is empty or invalid —
 *  a missing slug should never fail the whole draft over one field. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sanitise(raw: Partial<ContentDraftInput>, fallbackTitle: string): ContentDraftInput | null {
  const primaryKeyword = typeof raw.primary_keyword === "string" ? raw.primary_keyword.trim() : "";
  const seoTitle = typeof raw.seo_title === "string" ? raw.seo_title.trim() : "";
  const bodyMarkdown = typeof raw.body_markdown === "string" ? raw.body_markdown.trim() : "";
  if (!primaryKeyword || !seoTitle || !bodyMarkdown) return null;

  const outline = coerceOutline(raw.outline);
  if (outline.length === 0) return null;

  const rawSlug = typeof raw.url_slug === "string" ? slugify(raw.url_slug) : "";
  const metaDescription = typeof raw.meta_description === "string" ? raw.meta_description.trim() : "";

  return {
    primary_keyword: primaryKeyword,
    secondary_keywords: coerceStringArray(raw.secondary_keywords, 8),
    content_type: coerceIntent(raw.content_type),
    seo_title: clampLength(seoTitle, 70),
    meta_description: clampLength(metaDescription || fallbackTitle, 170),
    url_slug: rawSlug || slugify(seoTitle) || slugify(fallbackTitle),
    outline,
    body_markdown: bodyMarkdown,
  };
}

export interface ContentGenerationResult {
  draft: ContentDraftInput;
  model: string;
}

export async function generateContentDraft(request: ContentBriefRequest): Promise<ContentGenerationResult> {
  const raw = await generateJson<Partial<ContentDraftInput>>(buildPrompt(request), {
    system: SYSTEM_PROMPT,
    temperature: 0.4,
    maxTokens: 3000,
  });

  const draft = sanitise(raw, request.actionTitle);
  if (!draft) {
    throw new Error("Model response did not include a usable primary_keyword, seo_title, outline and body");
  }

  return { draft, model: currentModelLabel() };
}
