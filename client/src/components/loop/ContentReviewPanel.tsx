import type { ContentCoverageResult, ContentQualityResult, GateResult } from "../../types";
import { CRIMSON, MUTED } from "./format";
import { ScoreBadge } from "./design/ScoreBadge";
import { IntentBadge } from "./design/IntentBadge";
import { ProgressBar } from "./ProgressBar";
import { t } from "../../i18n";

export interface ReviewResult {
  coverage: ContentCoverageResult;
  quality: ContentQualityResult;
  gate: GateResult;
}

interface ContentReviewPanelProps {
  result: ReviewResult | null;
  loading: boolean;
  error: string | null;
  onReview: () => void;
}

/**
 * Phase 2 (LILIAN_TODAY.md, المرحلة ٢) — the single "review before publish" panel.
 * Replaces three separate sections (Content Quality QA's free-text box, the
 * per-draft "Check coverage" button, and the standalone Pre-Publish Gate) with one
 * button that calls all three existing endpoints — coverage, content-quality (now
 * run automatically against the draft's own text, nothing pasted by hand) and
 * pre-publish-gate — and shows one prominent verdict plus three sub-cards.
 */
export function ContentReviewPanel({ result, loading, error, onReview }: ContentReviewPanelProps) {
  return (
    <div style={{ marginTop: 16, paddingTop: 8 }}>
      <button onClick={onReview} disabled={loading}>
        {loading ? t("review.reviewing") : result ? t("review.reReview") : t("review.reviewButton")}
      </button>
      {loading && <ProgressBar label={t("review.reviewingLabel")} />}
      {error && <p style={{ color: CRIMSON }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: "0 0 10px" }}>
            <b style={{ color: result.gate.pass ? "#186b45" : CRIMSON, fontSize: 20 }}>
              {result.gate.pass ? t("review.pass") : t("review.fail")}
            </b>{" "}
            <ScoreBadge score={result.gate.overall_score} size="large" /> ·{" "}
            <span style={{ color: MUTED }}>{t("review.criticalIssues")(result.gate.critical_issue_count)}</span>
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: "1 1 240px", minInlineSize: 220, border: "1px solid #e4e4e4", borderRadius: 6, padding: 10 }}>
              <h4 style={{ margin: "0 0 6px" }}>
                {t("review.coverageTitle")} <ScoreBadge score={result.coverage.score} />
              </h4>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: MUTED }}>
                {t("review.intent")}: <IntentBadge intent={result.coverage.declared_intent} />
                {!result.coverage.intent_signal_present && ` ${t("review.noIntentSignal")}`}
              </p>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: MUTED }}>
                {t("review.primaryKeywordLabel")}{" "}
                {result.coverage.primary_keyword_found ? t("review.primaryKeywordFound") : t("review.primaryKeywordMissing")} (
                {result.coverage.primary_keyword_count}x
                {result.coverage.primary_keyword_in_heading ? t("review.inHeading") : t("review.notInHeading")})
              </p>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: MUTED }}>
                {t("review.secondaryLabel")} {result.coverage.secondary_keywords_covered}/
                {result.coverage.secondary_keywords_total} · {t("review.outlineLabel")}{" "}
                {result.coverage.outline_headings_matched}/{result.coverage.outline_headings_total}
              </p>
              {result.coverage.findings.map((finding, index) => (
                <p key={index} style={{ margin: "2px 0", fontSize: 12.5 }}>
                  <b>[{finding.rule_code}]</b> {finding.detail}
                </p>
              ))}
            </div>

            <div style={{ flex: "1 1 240px", minInlineSize: 220, border: "1px solid #e4e4e4", borderRadius: 6, padding: 10 }}>
              <h4 style={{ margin: "0 0 6px" }}>
                {t("review.qualityTitle")} <ScoreBadge score={result.quality.score} />
              </h4>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: MUTED }}>
                {t("review.wordsSentences")(result.quality.word_count, result.quality.sentence_count)}
              </p>
              {result.quality.findings.length === 0 ? (
                <p style={{ margin: 0, color: "#186b45", fontSize: 12.5 }}>{t("review.noIssuesFound")}</p>
              ) : (
                result.quality.findings.map((finding, index) => (
                  <p key={index} style={{ margin: "2px 0", fontSize: 12.5 }}>
                    <b>[{finding.rule_code}]</b> {finding.detail}
                  </p>
                ))
              )}
            </div>

            <div style={{ flex: "1 1 240px", minInlineSize: 220, border: "1px solid #e4e4e4", borderRadius: 6, padding: 10 }}>
              <h4 style={{ margin: "0 0 6px" }}>{t("review.gateTitle")}</h4>
              {result.gate.subscores.map((sub) => (
                <p key={sub.name} style={{ margin: "2px 0", fontSize: 13 }}>
                  {sub.name}: <b>{sub.score ?? "—"}</b>{" "}
                  <span style={{ color: MUTED }}>({(sub.weight * 100).toFixed(0)}%)</span>
                </p>
              ))}
              <p style={{ margin: "6px 0 0", color: MUTED, fontSize: 12 }}>
                {t("review.notChecked")} {result.gate.excluded_checks.join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
