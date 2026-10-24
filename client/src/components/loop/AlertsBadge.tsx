import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AlertSummary } from "../../types";
import { ALERT_SEVERITY_COLORS, MUTED } from "./format";
import { t } from "../../i18n";
import "./AlertsBadge.css";

interface AlertsBadgeProps {
  websiteId: string;
}

/**
 * Module 36 — Alert Engine, promoted out of the loop tabs entirely per
 * LILIAN_TODAY.md: "an alert must be visible without pressing a button". Self-
 * contained (owns its own fetch state) so it can sit at the top of the website
 * page, outside — and independent of — the 8-tab nav below it. Checks once on
 * mount, same as the other loop sections that auto-load; a manual refresh is
 * still available since alerts are recomputed fresh each time, nothing is stored.
 */
export function AlertsBadge({ websiteId }: AlertsBadgeProps) {
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .getAlerts(websiteId)
      .then(setSummary)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId]);

  const alerts = summary?.alerts ?? [];
  const highestSeverity = alerts.some((a) => a.severity === "critical")
    ? "critical"
    : alerts.some((a) => a.severity === "warning")
      ? "warning"
      : null;

  const pillClass = loading
    ? "alerts-badge-pill"
    : highestSeverity === "critical"
      ? "alerts-badge-pill alerts-badge-pill--critical"
      : highestSeverity === "warning"
        ? "alerts-badge-pill alerts-badge-pill--warning"
        : summary
          ? "alerts-badge-pill alerts-badge-pill--ok"
          : "alerts-badge-pill";

  const label = loading
    ? t("alerts.checking")
    : error
      ? t("alerts.unavailable")
      : !summary
        ? t("alerts.label")
        : alerts.length === 0
          ? t("alerts.none")
          : t("alerts.count")(alerts.length);

  return (
    <div className="alerts-badge">
      <button type="button" className={pillClass} onClick={() => setExpanded((v) => !v)} disabled={loading && !summary}>
        {!loading && <span className="alerts-badge-dot" />}
        {label}
      </button>
      <button type="button" className="alerts-badge-recheck" onClick={load} disabled={loading}>
        {loading ? t("alerts.recheckShort") : t("alerts.recheck")}
      </button>

      {expanded && (
        <div className="alerts-badge-panel">
          {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
          {summary && alerts.length === 0 && (
            <p style={{ color: "#186b45", margin: 0 }}>{t("alerts.noneDetail")}</p>
          )}
          {alerts.map((alert, index) => (
            <div
              key={index}
              className="alerts-badge-item"
              style={{ color: ALERT_SEVERITY_COLORS[alert.severity] }}
            >
              <b>
                [{alert.severity}] {alert.message}
              </b>
              <div style={{ color: MUTED, fontSize: 13 }}>{alert.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
