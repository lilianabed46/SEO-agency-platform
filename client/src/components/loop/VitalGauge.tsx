import { VITAL_BANDS, formatVital, vitalColor } from "./format";

interface VitalGaugeProps {
  vitalKey: string;
  value: number | null;
}

/**
 * Phase 4 polish: Core Web Vitals as a small visual band instead of a bare number —
 * a track shaded good/needs-improvement/poor (from the same VITAL_BANDS already used
 * to colour the text) with a marker at the measured value. The number stays, as the
 * label under the bar, so nothing measurable is lost.
 */
export function VitalGauge({ vitalKey, value }: VitalGaugeProps) {
  const band = VITAL_BANDS[vitalKey];
  const color = vitalColor(vitalKey, value);

  if (!band || value === null) {
    return <span style={{ color: "#666" }}>{formatVital(vitalKey, value)}</span>;
  }

  const scaleMax = band.poor * 1.4;
  const goodPct = (band.good / scaleMax) * 100;
  const poorPct = (band.poor / scaleMax) * 100;
  const markerPct = Math.min((value / scaleMax) * 100, 100);

  return (
    <div style={{ minInlineSize: 96 }}>
      <div
        style={{
          position: "relative",
          blockSize: 6,
          borderRadius: 999,
          background: `linear-gradient(to right, #186b45 0%, #186b45 ${goodPct}%, #b45309 ${goodPct}%, #b45309 ${poorPct}%, crimson ${poorPct}%, crimson 100%)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            insetBlockStart: -2,
            insetInlineStart: `calc(${markerPct}% - 4px)`,
            inlineSize: 10,
            blockSize: 10,
            borderRadius: "50%",
            background: "#fff",
            border: `2px solid ${color ?? "#111"}`,
          }}
        />
      </div>
      <span style={{ color, fontSize: 12.5 }}>{formatVital(vitalKey, value)}</span>
    </div>
  );
}
