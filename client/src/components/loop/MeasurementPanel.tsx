import type { Comparison } from "../../types";
import { CRIMSON, pct, signed } from "./format";
import { BeforeAfterChart } from "./BeforeAfterChart";
import { ProgressBar } from "./ProgressBar";
import { t } from "../../i18n";

interface MeasurementPanelProps {
  pivotDate: string;
  onPivotDateChange: (date: string) => void;
  comparison: Comparison | null;
  comparisonError: string | null;
  measuring: boolean;
  onMeasure: () => void;
}

/** "6 · Measurement — 28 days before vs after" tab. */
export function MeasurementPanel({
  pivotDate,
  onPivotDateChange,
  comparison,
  comparisonError,
  measuring,
  onMeasure,
}: MeasurementPanelProps) {
  return (
    <div>
      <p style={{ color: "#666" }}>{t("measurement.intro")}</p>
      <label>
        {t("measurement.pivotDate")}{" "}
        <input type="date" value={pivotDate} onChange={(event) => onPivotDateChange(event.target.value)} dir="ltr" />
      </label>{" "}
      <button onClick={onMeasure} disabled={measuring}>
        {measuring ? t("measurement.comparing") : t("measurement.compare")}
      </button>
      {measuring && <ProgressBar label={t("measurement.comparing")} />}
      {comparisonError && <p style={{ color: CRIMSON }}>{comparisonError}</p>}

      {comparison && (
        <div style={{ marginTop: 12 }}>
          <BeforeAfterChart
            success={comparison.success}
            metrics={[
              { label: t("measurement.colClicks"), before: comparison.before.totals.clicks, after: comparison.after.totals.clicks },
              {
                label: t("measurement.colImpressions"),
                before: comparison.before.totals.impressions,
                after: comparison.after.totals.impressions,
              },
            ]}
          />
          {!comparison.after_window_complete && (
            <p style={{ color: "#b45309" }}>
              {t("measurement.partialWindow")(comparison.window_days, comparison.pivot_date)}
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>{t("measurement.colPeriod")}</th>
                <th>{t("measurement.colClicks")}</th>
                <th>{t("measurement.colImpressions")}</th>
                <th>{t("measurement.colCtr")}</th>
                <th>{t("measurement.colPosition")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {t("measurement.before")} ({comparison.before.start} → {comparison.before.end})
                </td>
                <td>{comparison.before.totals.clicks}</td>
                <td>{comparison.before.totals.impressions}</td>
                <td>{pct(comparison.before.totals.ctr)}</td>
                <td>{comparison.before.totals.position.toFixed(1)}</td>
              </tr>
              <tr>
                <td>
                  {t("measurement.after")} ({comparison.after.start} → {comparison.after.end})
                </td>
                <td>{comparison.after.totals.clicks}</td>
                <td>{comparison.after.totals.impressions}</td>
                <td>{pct(comparison.after.totals.ctr)}</td>
                <td>{comparison.after.totals.position.toFixed(1)}</td>
              </tr>
              <tr style={{ fontWeight: 600, color: comparison.success ? "#186b45" : CRIMSON }}>
                <td>{t("measurement.change")}</td>
                <td>{signed(comparison.delta_clicks)}</td>
                <td>{signed(comparison.delta_impressions)}</td>
                <td>
                  {signed(comparison.delta_ctr * 100, 2)} {t("measurement.pts")}
                </td>
                <td>
                  {signed(comparison.delta_position, 1)} {t("measurement.places")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
