/**
 * Module 20 — Content Quality QA. Deterministic text analysis, no model call.
 *
 * Deliberately narrower than the brief's full list (Repetition, Filler, Generic
 * Intro/Conclusion, AI Clichés, Keyword Stuffing, Unsupported Claims, Over-
 * Optimization, Weak Explanations, Depth, Specificity, Readability): "Unsupported
 * Claims" and "Depth/Specificity" need judgement a keyword pattern can't supply
 * without a high false-positive rate, so they are left out rather than shipped as
 * unreliable rules — the same bar every rule in audit/rules.ts is held to.
 *
 * Standalone on purpose: this takes raw text in, not a website id or a database row.
 * It has no dependency on the content_drafts table, so it can be called the moment a
 * draft exists, from whatever route ends up owning that table, without this file or
 * its route needing to change.
 */

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

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/^[-*+]\s+/gm, "");
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Handles Latin and Arabic sentence terminators; good enough for QA, not a tokenizer. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function normaliseSentence(sentence: string): string {
  return sentence.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?؟]+$/, "");
}

const FILLER_PATTERNS: RegExp[] = [
  /\bin today's (fast-paced |digital )?world\b/i,
  /\bit is important to note that\b/i,
  /\bneedless to say\b/i,
  /\bat the end of the day\b/i,
  /\bwhen it comes to\b/i,
  /في عالم اليوم|من الجدير بالذكر|لا يخفى على أحد|في نهاية المطاف|تجدر الإشارة إلى/,
];

const GENERIC_INTRO_PATTERNS: RegExp[] = [
  /^in today's (fast-paced |digital )?world/i,
  /^in this (comprehensive )?(guide|article|post)/i,
  /^are you looking for/i,
  /^have you ever wondered/i,
  /^في عالم يتسم بـ|^هل تبحث عن|^في هذا المقال سنتحدث عن|^لا شك أن/,
];

const GENERIC_CONCLUSION_PATTERNS: RegExp[] = [
  /^in conclusion\b/i,
  /^to sum up\b/i,
  /^overall,/i,
  /^in summary\b/i,
  /^في الختام|^وفي النهاية|^خلاصة القول/,
];

/** Phrasing strongly associated with unedited LLM output — lighter on Arabic since the
 *  pattern is far less standardised there; document rather than pad the list to match. */
const AI_CLICHE_PATTERNS: RegExp[] = [
  /\bdelve into\b/i,
  /\bin the realm of\b/i,
  /\bunlock (the|your) (potential|power)\b/i,
  /\bgame[- ]changer\b/i,
  /\bnavigate the complexities\b/i,
  /\belevate your\b/i,
  /\bin today's digital age\b/i,
];

const MAX_AVG_SENTENCE_WORDS = 32;
/** Independent of the average: one 100-word run-on buried among short sentences
 *  doesn't move the average much, but it is unambiguously a run-on on its own. */
const MAX_SINGLE_SENTENCE_WORDS = 45;

export function analyzeContentQuality(rawText: string, targetKeyword?: string): ContentQualityResult {
  const findings: ContentQualityFinding[] = [];
  const text = stripMarkdown(rawText);
  const paragraphs = splitParagraphs(text);
  const sentences = splitSentences(text);
  const wordCount = countWords(text);

  if (wordCount === 0) {
    return { score: 0, word_count: 0, sentence_count: 0, findings: [] };
  }

  // Repetition: the same sentence verbatim more than once is never intentional style.
  const seen = new Map<string, number>();
  for (const sentence of sentences) {
    const key = normaliseSentence(sentence);
    if (key.length < 15) continue; // short sentences ("Book now.") repeat legitimately.
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const repeated = [...seen.entries()].filter(([, count]) => count > 1);
  if (repeated.length > 0) {
    findings.push({
      rule_code: "REPETITION",
      severity: 3,
      detail: `${repeated.length} sentence(s) repeated verbatim, e.g. "${repeated[0][0].slice(0, 80)}" (${repeated[0][1]}x)`,
    });
  }

  const fillerHits = FILLER_PATTERNS.filter((pattern) => pattern.test(text));
  if (fillerHits.length >= 2) {
    findings.push({
      rule_code: "FILLER_PHRASES",
      severity: 2,
      detail: `${fillerHits.length} filler phrase pattern(s) matched — text carries words without adding information`,
    });
  }

  if (paragraphs.length > 0 && GENERIC_INTRO_PATTERNS.some((pattern) => pattern.test(paragraphs[0]))) {
    findings.push({
      rule_code: "GENERIC_INTRO",
      severity: 2,
      detail: `Opening paragraph uses a generic hook: "${paragraphs[0].slice(0, 80)}"`,
    });
  }

  if (paragraphs.length > 1) {
    const last = paragraphs[paragraphs.length - 1];
    if (GENERIC_CONCLUSION_PATTERNS.some((pattern) => pattern.test(last))) {
      findings.push({
        rule_code: "GENERIC_CONCLUSION",
        severity: 2,
        detail: `Closing paragraph uses a generic wrap-up: "${last.slice(0, 80)}"`,
      });
    }
  }

  const clicheHits = AI_CLICHE_PATTERNS.filter((pattern) => pattern.test(text));
  if (clicheHits.length > 0) {
    findings.push({
      rule_code: "AI_CLICHES",
      severity: 3,
      detail: `${clicheHits.length} phrase(s) commonly flagged as unedited AI output`,
    });
  }

  if (targetKeyword && targetKeyword.trim()) {
    const keyword = targetKeyword.trim().toLowerCase();
    const occurrences = text.toLowerCase().split(keyword).length - 1;
    const density = occurrences / wordCount;
    // 2.5% is already generous; real copy for a multi-word phrase rarely clears 1%.
    if (density > 0.025 && occurrences >= 3) {
      findings.push({
        rule_code: "KEYWORD_STUFFING",
        severity: 3,
        detail: `"${targetKeyword}" appears ${occurrences} times (${(density * 100).toFixed(1)}% density) — reads as stuffed, not natural`,
      });
    }
  }

  if (sentences.length > 0) {
    const avgSentenceWords = wordCount / sentences.length;
    if (avgSentenceWords > MAX_AVG_SENTENCE_WORDS) {
      findings.push({
        rule_code: "LOW_READABILITY",
        severity: 2,
        detail:
          `Average sentence length is ${avgSentenceWords.toFixed(0)} words (target under ${MAX_AVG_SENTENCE_WORDS}) — ` +
          "a proxy for readability, not a validated Flesch-style score, and not tuned for Arabic sentence structure",
      });
    }

    // Checked independently of the average — a single long run-on doesn't move a
    // whole-text average much when it's surrounded by short sentences.
    const longest = sentences.reduce((max, s) => (countWords(s) > countWords(max) ? s : max), sentences[0]);
    const longestWords = countWords(longest);
    if (longestWords > MAX_SINGLE_SENTENCE_WORDS) {
      findings.push({
        rule_code: "RUN_ON_SENTENCE",
        severity: 2,
        detail: `One sentence runs ${longestWords} words long: "${longest.slice(0, 90)}…"`,
      });
    }
  }

  const penalty = findings.reduce((sum, finding) => sum + finding.severity, 0);
  const score = Math.max(0, Math.round(100 - penalty * 6));

  return { score, word_count: wordCount, sentence_count: sentences.length, findings };
}
