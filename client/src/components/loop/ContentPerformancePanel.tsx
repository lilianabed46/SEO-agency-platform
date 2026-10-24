import type { ContentPerformanceStatus, ContentPerformanceSummary } from "../../types";
import { CRIMSON, MUTED, PERFORMANCE_COLORS, PERFORMANCE_LABELS } from "./format";
import { Ltr } from "../Ltr";
import { t } from "../../i18n";

interface ContentPerformancePanelProps {
  contentPerformance: ContentPerformanceSummary | null;
  contentPerformanceError: string | null;
  loadingContentPerformance: boolean;
  onLoadContentPerformance: () => void;
}

/** Analysis sub-tab: Module 29 — performing / underperforming / decaying, live GSC comparison. */
export function ContentPerformancePanel({
  contentPerformance,
  contentPerformanceError,
  loadingContentPerformance,
  onLoadContentPerformance,
}: ContentPerformancePanelProps) {
  return (
    <div>
      <p style={{ color: MUTED }}>{t("contentPerformance.intro")}</p>
      <button onClick={onLoadContentPerformance} disabled={loadingContentPerformance}>
        {loadingContentPerformance ? t("contentPerformance.loading") : t("contentPerformance.classify")}
      </button>
      {contentPerformanceError && <p style={{ color: CRIMSON }}>{contentPerformanceError}</p>}

      {contentPerformance && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 8px", color: MUTED }}>
            {contentPerformance.previousPeriod.start} → {contentPerformance.previousPeriod.end} ·{" "}
            {contentPerformance.currentPeriod.start} → {contentPerformance.currentPeriod.end}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            {(Object.entries(contentPerformance.counts) as [ContentPerformanceStatus, number][])
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <span key={status} style={{ color: PERFORMANCE_COLORS[status], marginInlineEnd: 12 }}>
                  {PERFORMANCE_LABELS[status]}: {count}
                </span>
              ))}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t("contentPerformance.colPage")}</th>
                <th>{t("contentPerformance.colStatus")}</th>
                <th>{t("contentPerformance.colClicks")}</th>
                <th>{t("contentPerformance.colPosition")}</th>
                <th>{t("contentPerformance.colWhy")}</th>
              </tr>
            </thead>
            <tbody>
              {contentPerformance.pages.slice(0, 20).map((page) => (
                <tr key={page.page}>
                  <td>
                    <Ltr>{page.page}</Ltr>
                  </td>
                  <td style={{ color: PERFORMANCE_COLORS[page.status] }}>{PERFORMANCE_LABELS[page.status]}</td>
                  <td>
                    {page.previous_clicks} → {page.current_clicks}
                  </td>
                  <td>{page.current_position.toFixed(1)}</td>
                  <td>{page.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
