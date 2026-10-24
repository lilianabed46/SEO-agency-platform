import type { LearningResponse } from "../../types";
import { CRIMSON, MUTED, pct, signed } from "./format";
import { t } from "../../i18n";

interface LearningPanelProps {
  learning: LearningResponse | null;
  learningScope: "website" | "all";
  onScopeChange: (scope: "website" | "all") => void;
}

/** "7 · Learning — which action types actually work" tab. */
export function LearningPanel({ learning, learningScope, onScopeChange }: LearningPanelProps) {
  return (
    <div>
      <p style={{ color: MUTED }}>{t("learning.intro")}</p>
      <label>
        <input type="radio" checked={learningScope === "website"} onChange={() => onScopeChange("website")} />{" "}
        {t("learning.thisSite")}
      </label>{" "}
      <label>
        <input type="radio" checked={learningScope === "all"} onChange={() => onScopeChange("all")} />{" "}
        {t("learning.allClients")}
      </label>

      {learning?.includes_demo_data && (
        <p style={{ color: "#b45309" }}>{t("learning.includesDemoNote")}</p>
      )}

      {!learning || learning.rows.length === 0 ? (
        <p style={{ color: MUTED }}>{t("learning.noActions")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("learning.colActionType")}</th>
              <th>{t("learning.colTried")}</th>
              <th>{t("learning.colMeasured")}</th>
              <th>{t("learning.colSucceeded")}</th>
              <th>{t("learning.colSuccessRate")}</th>
              <th>{t("learning.colAvgClicks")}</th>
            </tr>
          </thead>
          <tbody>
            {learning.rows.map((row) => (
              <tr key={row.action_type}>
                <td>{row.action_type}</td>
                <td>{row.tried}</td>
                <td>{row.measured}</td>
                <td>{row.succeeded}</td>
                <td>{row.success_rate === null ? "—" : pct(row.success_rate)}</td>
                <td
                  style={{
                    color: row.avg_delta_clicks === null ? undefined : row.avg_delta_clicks > 0 ? "#186b45" : CRIMSON,
                  }}
                >
                  {row.avg_delta_clicks === null ? "—" : signed(row.avg_delta_clicks, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
