import type { GateResult, GateSubscore } from "../types";

/**
 * Module 26 — Pre-Publish SEO Gate. Combines the sub-scores we can actually compute
 * into one PASS/FAIL.
 *
 * The brief lists twelve inputs (SEO Score, Content Quality, Topic Coverage, Entity
 * Coverage, Search Intent, AEO, GEO, E-E-A-T, Internal Links, External Sources,
 * Originality, Schema, Critical Issues). Six of those are SERP-dependent or
 * explicitly out of scope per CONTRIBUTING.md (AEO/GEO/E-E-A-T/Internal Links/
 * External Sources/Originality) and are not computed anywhere in this codebase —
 * they show up in `excluded_checks`, not silently dropped from the result.
 *
 * Pure aggregator: no database access, no website id. Callers supply whatever
 * sub-scores they have; a missing one is excluded from the weighted average rather
 * than defaulted to zero, so an unfinished piece can't drag the score down before
 * it exists.
 */

const PASS_THRESHOLD = 70;

/** A single unresolved severity-5 issue fails the gate outright, regardless of score
 *  — a page excluded from search by a noindex tag is not "70% ready to publish". */
const CRITICAL_ISSUE_SEVERITY = 5;

const OUT_OF_SCOPE_CHECKS = [
  "AEO (Answer Engine Optimisation)",
  "GEO (Generative Engine Optimisation)",
  "E-E-A-T",
  "Internal Link Engine",
  "External Source Engine",
  "Originality / Differentiation (needs SERP data)",
];

export function evaluateGate(params: {
  auditScore: number;
  criticalIssueCount: number;
  contentQualityScore?: number | null;
}): GateResult {
  const subscores: GateSubscore[] = [{ name: "Technical SEO (audit)", score: params.auditScore, weight: 0.6 }];

  if (params.contentQualityScore !== undefined && params.contentQualityScore !== null) {
    subscores.push({ name: "Content Quality", score: params.contentQualityScore, weight: 0.4 });
  }

  const available = subscores.filter((s): s is GateSubscore & { score: number } => s.score !== null);
  const totalWeight = available.reduce((sum, s) => sum + s.weight, 0);
  const overallScore =
    totalWeight > 0 ? Math.round(available.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight) : 0;

  const hasCriticalIssues = params.criticalIssueCount > 0;
  const pass = !hasCriticalIssues && overallScore >= PASS_THRESHOLD;

  return {
    pass,
    overall_score: overallScore,
    critical_issue_count: params.criticalIssueCount,
    subscores,
    excluded_checks: OUT_OF_SCOPE_CHECKS,
  };
}

export { PASS_THRESHOLD, CRITICAL_ISSUE_SEVERITY };
