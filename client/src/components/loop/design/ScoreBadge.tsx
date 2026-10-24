import { scoreColor } from "../format";
import "../design-system.css";

interface ScoreBadgeProps {
  score: number;
  /** e.g. "/100" — appended after the number, muted. Defaults to "/100". */
  suffix?: string;
  /** Optional caption shown before the number, e.g. "Coverage". */
  label?: string;
  size?: "default" | "large";
}

/** Shared score pill: green 80+, amber 50-79, red under 50 — used everywhere a
 * 0-100 score is shown (audit, PageSpeed, content QA, coverage, pre-publish gate). */
export function ScoreBadge({ score, suffix = "/100", label, size = "default" }: ScoreBadgeProps) {
  return (
    <span className="score-badge" style={{ fontSize: size === "large" ? 20 : undefined, color: scoreColor(score) }}>
      {label && <span className="score-badge-label">{label}</span>}
      {score}
      <span className="score-badge-label">{suffix}</span>
    </span>
  );
}
