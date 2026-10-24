import { useState } from "react";
import type { KeywordDecisionValue, KeywordDecision, SearchIntent, SearchIntentSummary } from "../../types";
import { MUTED, INTENT_LABELS } from "./format";
import { IntentBadge } from "./design/IntentBadge";
import { Ltr } from "../Ltr";
import { t } from "../../i18n";

interface KeywordDecisionPanelProps {
  searchIntent: SearchIntentSummary | null;
  searchIntentError: string | null;
  loadingSearchIntent: boolean;
  onLoadSearchIntent: () => void;
  keywordDecisions: Record<string, KeywordDecision>;
  savingKeywordDecision: Record<string, boolean>;
  onSaveKeywordDecision: (page: string, query: string, decision: KeywordDecisionValue, note?: string) => void;
}

const DECISION_VALUES: KeywordDecisionValue[] = ["target_new", "improve_existing", "ignore"];
const INTENT_VALUES: SearchIntent[] = ["transactional", "commercial", "local", "navigational", "informational"];

type DecisionFilter = "all" | "undecided" | KeywordDecisionValue;
type IntentFilter = "all" | SearchIntent;

/**
 * S5-3 — "أقرب شاشة اليوم هي Search intent: عرض تحليلي… لا شاشة قرار." This reuses
 * the same Search Intent fetch (no second Search Console call) and adds the one
 * thing that was missing: a decision + reason per (page, query), persisted so it
 * survives a tab switch or a reload instead of living only in the specialist's head.
 * Rows come from every page's top_queries, with a plain sortable/scrollable table
 * rather than pagination — acceptable per the task's own acceptance criteria
 * ("ترقيم صفحات أو تمرير افتراضي").
 *
 * Known gap, left open on purpose: the acceptance criteria also ask for a موقع
 * (ranking position) column, a CTR column, and enough rows per page to cover
 * "hundreds of keywords". All three need a change inside searchIntentService.ts
 * (Module 5 — position/ctr aren't in QueryIntent today, and the per-page cap is 5),
 * which is Aya's file per the task redistribution ("قرار الكلمة" moved to her), not
 * touched here. Once she adds those fields/raises that cap, this panel can show them.
 */
export function KeywordDecisionPanel({
  searchIntent,
  searchIntentError,
  loadingSearchIntent,
  onLoadSearchIntent,
  keywordDecisions,
  savingKeywordDecision,
  onSaveKeywordDecision,
}: KeywordDecisionPanelProps) {
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const allRows = (searchIntent?.pages ?? []).flatMap((page) =>
    page.top_queries.map((q) => ({ page: page.page, query: q }))
  );

  const rows = allRows
    .filter(({ query }) => intentFilter === "all" || query.primary_intent === intentFilter)
    .filter(({ page, query }) => {
      if (decisionFilter === "all") return true;
      const current = keywordDecisions[`${page}|${query.query}`]?.decision ?? "";
      return decisionFilter === "undecided" ? !current : current === decisionFilter;
    })
    .sort((a, b) => b.query.impressions - a.query.impressions);

  function noteValue(key: string) {
    return noteDrafts[key] ?? keywordDecisions[key]?.note ?? "";
  }

  function saveNote(page: string, query: string) {
    const key = `${page}|${query}`;
    const current = keywordDecisions[key]?.decision;
    if (!current) return; // A reason needs a decision to attach to — the server requires one too.
    const draft = noteDrafts[key];
    if (draft === undefined) return; // untouched — nothing to save
    onSaveKeywordDecision(page, query, current, draft.trim() || undefined);
  }

  return (
    <div>
      <p style={{ color: MUTED }}>{t("keywordDecision.intro")}</p>
      {!searchIntent && (
        <button onClick={onLoadSearchIntent} disabled={loadingSearchIntent}>
          {loadingSearchIntent ? t("keywordDecision.loading") : t("searchIntent.classify")}
        </button>
      )}
      {searchIntentError && <p style={{ color: "crimson" }}>{searchIntentError}</p>}

      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "12px 0" }}>
            <select value={intentFilter} onChange={(e) => setIntentFilter(e.target.value as IntentFilter)}>
              <option value="all">{t("keywordDecision.filterAll")}</option>
              {INTENT_VALUES.map((intent) => (
                <option key={intent} value={intent}>
                  {INTENT_LABELS[intent]}
                </option>
              ))}
            </select>
            <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value as DecisionFilter)}>
              <option value="all">{t("keywordDecision.filterAll")}</option>
              <option value="undecided">{t("keywordDecision.filterUndecided")}</option>
              {DECISION_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`keywordDecision.decisions.${value}` as any)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("keywordDecision.colQuery")}</th>
                  <th>{t("keywordDecision.colIntent")}</th>
                  <th>{t("keywordDecision.colImpressions")}</th>
                  <th>{t("keywordDecision.colClicks")}</th>
                  <th>{t("keywordDecision.colTargetPage")}</th>
                  <th>{t("keywordDecision.colDecision")}</th>
                  <th>{t("keywordDecision.colReason")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ page, query }) => {
                  const key = `${page}|${query.query}`;
                  const current = keywordDecisions[key]?.decision ?? "";
                  const saving = savingKeywordDecision[key];
                  return (
                    <tr key={key}>
                      <td>{query.query}</td>
                      <td>
                        <IntentBadge intent={query.primary_intent} />
                      </td>
                      <td>{query.impressions}</td>
                      <td>{query.clicks}</td>
                      <td>
                        <a href={page} target="_blank" rel="noreferrer">
                          <Ltr>{page}</Ltr>
                        </a>
                      </td>
                      <td>
                        <select
                          value={current}
                          disabled={saving}
                          onChange={(e) => onSaveKeywordDecision(page, query.query, e.target.value as KeywordDecisionValue, keywordDecisions[key]?.note ?? undefined)}
                        >
                          <option value="" disabled>
                            {t("keywordDecision.noDecision")}
                          </option>
                          {DECISION_VALUES.map((value) => (
                            <option key={value} value={value}>
                              {t(`keywordDecision.decisions.${value}` as any)}
                            </option>
                          ))}
                        </select>
                        {saving && <span style={{ marginInlineStart: 6, color: MUTED, fontSize: 12 }}>{t("keywordDecision.saving")}</span>}
                      </td>
                      <td>
                        <input
                          value={noteValue(key)}
                          disabled={!current || saving}
                          placeholder={current ? t("keywordDecision.reasonPlaceholder") : t("keywordDecision.reasonNeedsDecision")}
                          onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={() => saveNote(page, query.query)}
                          style={{ minWidth: 160 }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {searchIntent && rows.length === 0 && <p style={{ color: MUTED }}>{t("keywordDecision.empty")}</p>}
    </div>
  );
}
