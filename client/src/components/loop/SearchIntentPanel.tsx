import type { SearchIntent, SearchIntentSummary } from "../../types";
import { CRIMSON, INTENT_LABELS, MUTED } from "./format";
import { IntentBadge } from "./design/IntentBadge";
import { Ltr } from "../Ltr";
import { t } from "../../i18n";

interface SearchIntentPanelProps {
  searchIntent: SearchIntentSummary | null;
  searchIntentError: string | null;
  loadingSearchIntent: boolean;
  onLoadSearchIntent: () => void;
}

/** Analysis sub-tab: Module 5 — query-pattern intent classification, no model call. */
export function SearchIntentPanel({
  searchIntent,
  searchIntentError,
  loadingSearchIntent,
  onLoadSearchIntent,
}: SearchIntentPanelProps) {
  return (
    <div>
      <p style={{ color: MUTED }}>{t("searchIntent.intro")}</p>
      <button onClick={onLoadSearchIntent} disabled={loadingSearchIntent}>
        {loadingSearchIntent ? t("searchIntent.loading") : t("searchIntent.classify")}
      </button>
      {searchIntentError && <p style={{ color: CRIMSON }}>{searchIntentError}</p>}

      {searchIntent && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 8px" }}>
            <b>{t("searchIntent.overallMix")}</b>{" "}
            {(Object.entries(searchIntent.overall_mix) as [SearchIntent, number][])
              .filter(([, impressions]) => impressions > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([intent, impressions]) => (
                <span key={intent} style={{ marginInlineEnd: 12 }}>
                  <IntentBadge intent={intent} /> {impressions}
                </span>
              ))}
          </p>

          <h3>{t("searchIntent.byPage")}</h3>
          <table>
            <thead>
              <tr>
                <th>{t("searchIntent.colPage")}</th>
                <th>{t("searchIntent.colDominantIntent")}</th>
                <th>{t("searchIntent.colImpressions")}</th>
                <th>{t("searchIntent.colTopQueries")}</th>
              </tr>
            </thead>
            <tbody>
              {searchIntent.pages.slice(0, 10).map((page) => (
                <tr key={page.page}>
                  <td>
                    <Ltr>{page.page}</Ltr>
                  </td>
                  <td>{page.dominant_intent ? <IntentBadge intent={page.dominant_intent} /> : "—"}</td>
                  <td>{page.total_impressions}</td>
                  <td>
                    {page.top_queries
                      .slice(0, 3)
                      .map((q) => `${q.query} (${INTENT_LABELS[q.primary_intent]})`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
