import { scoreIntentSignals } from "./searchIntentService";
import type { ContentCoverageResult, CoverageFinding, OutlineItem, SearchIntent } from "../types";

/**
 * Module 16 — Real-Time Content Intelligence. Deterministic, no model call.
 *
 * Deliberately narrower than the brief's list (Keyword/Topic/Semantic/Entity
 * Coverage, Search Intent Match, Content Depth, Over-Optimization Detection):
 * "Topic Coverage" and "Entity Coverage" as originally scoped need embeddings or
 * named-entity extraction, neither of which exists in this codebase — building a
 * literal-keyword stand-in for those and calling it semantic understanding would
 * be exactly the kind of unreliable rule this project has avoided everywhere else.
 * What ships here is literal-match coverage: does the body actually contain the
 * keywords and headings its own brief promised, and does it read even faintly
 * like the search intent it claims to target.
 *
 * Complementary to contentQualityService.ts (module 20), not a duplicate of it:
 * that one grades how the text is written (repetition, filler, run-ons);
 * this one grades whether the text covers what it was briefed to cover. A draft
 * can score perfectly on writing quality while covering none of its brief.
 */

const MIN_SECONDARY_COVERAGE_FRACTION = 0.5;
const THIN_SECTION_WORDS = 40;

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[*_~]{1,3}/g, "");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function normaliseHeading(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

interface BodySection {
  heading: string | null; // null for any text before the first heading
  words: number;
}

/** Splits body_markdown on its own headings, independent of the declared outline
 *  — this is what the body actually contains, not what it was supposed to. */
function splitIntoSections(body: string): BodySection[] {
  const lines = body.split("\n");
  const sections: BodySection[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    sections.push({ heading: currentHeading, words: countWords(buffer.join(" ")) });
    buffer = [];
  };

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      flush();
      currentHeading = normaliseHeading(line);
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle.toLowerCase()).length - 1;
}

export function analyzeContentCoverage(params: {
  primaryKeyword: string;
  secondaryKeywords: string[];
  contentType: SearchIntent;
  outline: OutlineItem[];
  bodyMarkdown: string;
}): ContentCoverageResult {
  const findings: CoverageFinding[] = [];
  const bodyPlain = stripMarkdown(params.bodyMarkdown);
  const bodyLower = bodyPlain.toLowerCase();

  // --- Primary keyword ---------------------------------------------------
  const primaryKeywordLower = params.primaryKeyword.trim().toLowerCase();
  const primaryCount = countOccurrences(bodyLower, primaryKeywordLower);
  const primaryFound = primaryCount > 0;
  const primaryInHeading = params.outline.some((item) =>
    item.text.toLowerCase().includes(primaryKeywordLower)
  );

  if (!primaryFound) {
    findings.push({
      rule_code: "MISSING_PRIMARY_KEYWORD",
      severity: 5,
      detail: `"${params.primaryKeyword}" does not appear anywhere in the body — the draft doesn't target its own primary keyword`,
    });
  } else if (!primaryInHeading) {
    findings.push({
      rule_code: "PRIMARY_KEYWORD_NOT_IN_HEADING",
      severity: 2,
      detail: `"${params.primaryKeyword}" appears in the body but not in any heading — a weaker on-page signal`,
    });
  }

  // --- Secondary keywords --------------------------------------------------
  const secondaryMissing = params.secondaryKeywords.filter(
    (keyword) => countOccurrences(bodyLower, keyword.trim().toLowerCase()) === 0
  );
  const secondaryCovered = params.secondaryKeywords.length - secondaryMissing.length;
  const secondaryFraction =
    params.secondaryKeywords.length > 0 ? secondaryCovered / params.secondaryKeywords.length : 1;

  if (params.secondaryKeywords.length > 0 && secondaryFraction < MIN_SECONDARY_COVERAGE_FRACTION) {
    findings.push({
      rule_code: "LOW_SECONDARY_KEYWORD_COVERAGE",
      severity: 3,
      detail:
        `Only ${secondaryCovered} of ${params.secondaryKeywords.length} secondary keywords appear in the body: ` +
        `missing ${secondaryMissing.join(", ")}`,
    });
  }

  // --- Outline coverage: does the body's own headings match the brief? ----
  const sections = splitIntoSections(params.bodyMarkdown);
  const bodyHeadings = new Set(sections.map((s) => s.heading).filter((h): h is string => h !== null));

  const outlineMissing = params.outline.filter((item) => {
    const normalised = normaliseHeading(item.text);
    if (bodyHeadings.has(normalised)) return false;
    // Tolerate minor rewording: a body heading that contains the outline text
    // (or vice versa) still counts as covering it.
    return ![...bodyHeadings].some((h) => h.includes(normalised) || normalised.includes(h));
  });
  const outlineMatched = params.outline.length - outlineMissing.length;

  if (outlineMissing.length > 0) {
    findings.push({
      rule_code: "OUTLINE_MISMATCH",
      severity: 3,
      detail: `${outlineMissing.length} of ${params.outline.length} planned headings are missing from the body: ${outlineMissing.map((i) => i.text).join(", ")}`,
    });
  }

  // --- Section depth: any heading whose section reads as a stub? ----------
  const thinSections = sections.filter((s) => s.heading !== null && s.words > 0 && s.words < THIN_SECTION_WORDS);
  if (thinSections.length > 0) {
    findings.push({
      rule_code: "THIN_SECTION",
      severity: 2,
      detail: `${thinSections.length} section(s) under ${THIN_SECTION_WORDS} words: ${thinSections.map((s) => `"${s.heading}" (${s.words}w)`).join(", ")}`,
    });
  }

  // --- Search intent match: weak heuristic, stated as such -----------------
  // Skipped for "informational" on purpose: its patterns (how/what/why) describe
  // short interrogative queries, not article prose — a well-written informational
  // piece routinely explains declaratively without ever using those words, so
  // requiring them would flag good content as a false positive far too often.
  const intentScores = scoreIntentSignals(bodyPlain);
  const intentSignalPresent = params.contentType === "informational" || intentScores[params.contentType] > 0.5;
  if (!intentSignalPresent) {
    findings.push({
      rule_code: "INTENT_SIGNAL_ABSENT",
      severity: 2,
      detail:
        `The body carries no ${params.contentType} language patterns despite being briefed as ${params.contentType} — ` +
        "a weak heuristic, not semantic analysis; treat as a prompt to skim, not a verdict",
    });
  }

  const penalty = findings.reduce((sum, finding) => sum + finding.severity, 0);
  const score = Math.max(0, Math.round(100 - penalty * 6));

  return {
    primary_keyword_found: primaryFound,
    primary_keyword_count: primaryCount,
    primary_keyword_in_heading: primaryInHeading,
    secondary_keywords_total: params.secondaryKeywords.length,
    secondary_keywords_covered: secondaryCovered,
    secondary_keywords_missing: secondaryMissing,
    outline_headings_total: params.outline.length,
    outline_headings_matched: outlineMatched,
    outline_headings_missing: outlineMissing.map((i) => i.text),
    declared_intent: params.contentType,
    intent_signal_present: intentSignalPresent,
    score,
    findings,
  };
}
