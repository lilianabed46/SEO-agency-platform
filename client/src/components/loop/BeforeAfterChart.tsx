import { CRIMSON } from "./format";

interface Metric {
  label: string;
  before: number;
  after: number;
}

interface BeforeAfterChartProps {
  metrics: Metric[];
  success: boolean;
}

const BAR_MAX_WIDTH = 130;
const LABEL_SPACE = 40;
const CHART_WIDTH = BAR_MAX_WIDTH + LABEL_SPACE;
const BAR_HEIGHT = 16;
const BAR_GAP = 6;

/**
 * Phase 4 polish: a plain inline SVG bar comparison for the before/after Search
 * Console windows — no charting library, just two rects per metric scaled to
 * whichever of the two values is larger.
 */
export function BeforeAfterChart({ metrics, success }: BeforeAfterChartProps) {
  const afterColor = success ? "#186b45" : CRIMSON;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 12 }}>
      {metrics.map((metric) => {
        const max = Math.max(metric.before, metric.after, 1);
        const beforeWidth = (metric.before / max) * BAR_MAX_WIDTH;
        const afterWidth = (metric.after / max) * BAR_MAX_WIDTH;
        const svgHeight = BAR_HEIGHT * 2 + BAR_GAP;

        return (
          <div key={metric.label}>
            <div style={{ fontSize: 12.5, color: "#666", marginBottom: 4 }}>{metric.label}</div>
            <svg width={CHART_WIDTH} height={svgHeight} role="img" aria-label={`${metric.label}: before ${metric.before}, after ${metric.after}`}>
              <rect x={0} y={0} width={beforeWidth} height={BAR_HEIGHT} fill="#9aa3af" rx={2} />
              <text x={beforeWidth + 4} y={BAR_HEIGHT - 4} fontSize={11} fill="#666">
                {metric.before}
              </text>
              <rect x={0} y={BAR_HEIGHT + BAR_GAP} width={afterWidth} height={BAR_HEIGHT} fill={afterColor} rx={2} />
              <text x={afterWidth + 4} y={BAR_HEIGHT * 2 + BAR_GAP - 4} fontSize={11} fill={afterColor} fontWeight={600}>
                {metric.after}
              </text>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
