import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { OverviewRow } from "../types";
import { ScoreBadge } from "../components/loop/design/ScoreBadge";
import { Ltr } from "../components/Ltr";
import { t } from "../i18n";
import "./ClientPage.css";

/**
 * X-3 — multi-site overview. "كل ما نملكه اليوم Client Profile لكل موقع على حدة…
 * لا شاشة تجمع كل العملاء والمواقع في صف واحد لكل موقع." One request (GET
 * /api/overview), one row per website, sorted worst-first (most critical alerts,
 * then stalest crawl) so whoever opens this in the morning sees what needs
 * attention first without clicking into every client.
 */
export function OverviewPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOverview()
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="clients-header" style={{ marginBottom: 8 }}>
        <h1>{t("overview.title")}</h1>
      </div>
      <p style={{ color: "#666", marginTop: 0, marginBottom: 24 }}>{t("overview.subtitle")}</p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {loading ? (
        <p>{t("overview.loading")}</p>
      ) : rows.length === 0 ? (
        <p>{t("overview.empty")}</p>
      ) : (
        <table style={{ marginTop: 4 }}>
          <thead>
            <tr>
              <th>{t("overview.colClient")}</th>
              <th>{t("overview.colWebsite")}</th>
              <th>{t("overview.colScore")}</th>
              <th>{t("overview.colCriticalAlerts")}</th>
              <th>{t("overview.colLastCrawl")}</th>
              <th>{t("overview.colOpenActions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.website_id}
                className="client-row"
                onClick={() => navigate(`/clients/${row.client_id}/websites/${row.website_id}`)}
              >
                <td>{row.client_name}</td>
                <td>
                  <Ltr>{row.url}</Ltr>
                </td>
                <td>{row.audit_score !== null ? <ScoreBadge score={row.audit_score} /> : t("overview.noScore")}</td>
                <td style={{ color: row.critical_alert_count > 0 ? "crimson" : undefined }}>
                  {row.critical_alert_count}
                </td>
                <td>{row.last_crawl_at ? <Ltr>{row.last_crawl_at}</Ltr> : t("overview.never")}</td>
                <td>{row.open_action_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
