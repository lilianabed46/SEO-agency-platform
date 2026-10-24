import { Fragment, useEffect, useState } from "react";
import type { ActionType, ActionWithResult, ContentDraft, ContentDraftEdit, ReviewDecision } from "../../types";
import { MUTED, OUTLINE_INDENT, signed } from "./format";
import { DemoBadge } from "./design/DemoBadge";
import { ContentReviewPanel, type ReviewResult } from "./ContentReviewPanel";
import { Ltr } from "../Ltr";
import { t } from "../../i18n";

interface ActionPanelProps {
  actions: ActionWithResult[];
  onMeasureAction: (actionId: string) => void;
  measureErrors: Record<string, string | undefined>;

  contentLoading: Record<string, boolean>;
  contentErrors: Record<string, string | undefined>;
  contentDrafts: Record<string, ContentDraft>;
  expandedContent: Set<string>;
  onToggleContent: (actionId: string) => void;
  onGenerateContent: (actionId: string) => void;

  reviewResults: Record<string, ReviewResult>;
  reviewLoading: Record<string, boolean>;
  reviewErrors: Record<string, string | undefined>;
  onReview: (actionId: string) => void;

  savingContentId: string | null;
  onSaveContent: (actionId: string, edit: ContentDraftEdit) => Promise<boolean>;
  reviewingDecisionId: string | null;
  onReviewDecision: (actionId: string, decision: ReviewDecision, reason?: string) => void;
}

/** S9-5: only content-related actions ever produce a draft — a "Fix broken links"
 *  row generating "content" made no sense. */
const CONTENT_ACTION_TYPES: ActionType[] = ["create_content", "refresh_content"];

/**
 * "5 · Action" tab. Per-draft review (Modules 16/20/26) lives in one
 * <ContentReviewPanel/> (Phase 2). S7-1 adds in-place editing of the draft's own
 * fields (Save, not a full Regenerate) and S8-3 adds the approve/edit/reject step
 * that must follow the gate's verdict before content counts as "ready".
 */
export function ActionPanel({
  actions,
  onMeasureAction,
  measureErrors,
  contentLoading,
  contentErrors,
  contentDrafts,
  expandedContent,
  onToggleContent,
  onGenerateContent,
  reviewResults,
  reviewLoading,
  reviewErrors,
  onReview,
  savingContentId,
  onSaveContent,
  reviewingDecisionId,
  onReviewDecision,
}: ActionPanelProps) {
  return (
    <div>
      {actions.length === 0 ? (
        <p style={{ color: MUTED }}>{t("action.empty")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("action.colApproved")}</th>
              <th>{t("action.colAction")}</th>
              <th>{t("action.colType")}</th>
              <th>{t("action.colStatus")}</th>
              <th>{t("action.colResult")}</th>
              <th></th>
              <th>
                {t("action.colContent")} <span style={{ fontWeight: 400, fontSize: 11, color: "#b45309" }}>{t("action.contentNew")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => {
              const isContentAction = CONTENT_ACTION_TYPES.includes(action.action_type);
              const canMeasure = !action.result && Boolean(action.before_metrics);
              return (
                <Fragment key={action.id}>
                  <tr>
                    <td>{action.approved_at.slice(0, 10)}</td>
                    <td>
                      {action.title}
                      {action.is_demo_seed === 1 && <DemoBadge />}
                    </td>
                    <td>{action.action_type}</td>
                    <td>{action.status}</td>
                    <td>
                      {action.result ? (
                        `${signed(action.result.delta_clicks ?? 0)} ${t("websiteDetail.clicks")}`
                      ) : action.before_metrics ? (
                        t("action.notMeasured")
                      ) : (
                        <span title={t("action.noBeforeSnapshotTooltip")}>{t("action.noBeforeSnapshot")}</span>
                      )}
                      {measureErrors[action.id] && (
                        <div style={{ color: "crimson", fontSize: 12.5, marginTop: 2 }}>
                          {t("action.measureError")(measureErrors[action.id] as string)}
                        </div>
                      )}
                    </td>
                    <td>
                      {!action.result && (
                        <button
                          onClick={() => onMeasureAction(action.id)}
                          disabled={!canMeasure}
                          title={!canMeasure ? t("action.noBeforeSnapshotTooltip") : undefined}
                        >
                          {t("action.measure")}
                        </button>
                      )}
                    </td>
                    <td>
                      {isContentAction && (
                        <>
                          <button onClick={() => onToggleContent(action.id)} disabled={contentLoading[action.id]}>
                            {contentLoading[action.id]
                              ? t("common.loading")
                              : expandedContent.has(action.id)
                                ? t("common.hide")
                                : contentDrafts[action.id]
                                  ? t("common.view")
                                  : t("action.generate")}
                          </button>
                          {/* S8-3: "الحالة ظاهرة على المسودة في كل مكان تُعرض فيه" —
                              not just inside the expanded editor. */}
                          {contentDrafts[action.id] && (
                            <span
                              style={{
                                marginInlineStart: 6,
                                fontSize: 11,
                                borderRadius: 999,
                                padding: "1px 8px",
                                border: "1px solid var(--color-border)",
                                color:
                                  contentDrafts[action.id].review_status === "approved"
                                    ? "#186b45"
                                    : contentDrafts[action.id].review_status === "rejected"
                                      ? "crimson"
                                      : MUTED,
                              }}
                            >
                              {contentDrafts[action.id].review_status === "approved"
                                ? t("review.statusBadgeApproved")
                                : contentDrafts[action.id].review_status === "rejected"
                                  ? t("review.statusBadgeRejected")
                                  : t("review.statusBadgePending")}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                  {expandedContent.has(action.id) && isContentAction && (
                    <tr>
                      <td colSpan={7} style={{ background: "#faf7f0" }}>
                        {contentErrors[action.id] && <p style={{ color: "#b45309" }}>{contentErrors[action.id]}</p>}
                        {contentDrafts[action.id] && (
                          <ContentDraftEditor
                            actionId={action.id}
                            draft={contentDrafts[action.id]}
                            saving={savingContentId === action.id}
                            onSave={(edit) => onSaveContent(action.id, edit)}
                            onRegenerate={() => onGenerateContent(action.id)}
                            reviewResult={reviewResults[action.id] ?? null}
                            reviewLoading={reviewLoading[action.id] ?? false}
                            reviewError={reviewErrors[action.id] ?? null}
                            onReview={() => onReview(action.id)}
                            reviewingDecision={reviewingDecisionId === action.id}
                            onReviewDecision={(decision, reason) => onReviewDecision(action.id, decision, reason)}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface ContentDraftEditorProps {
  actionId: string;
  draft: ContentDraft;
  saving: boolean;
  onSave: (edit: ContentDraftEdit) => Promise<boolean>;
  onRegenerate: () => void;
  reviewResult: ReviewResult | null;
  reviewLoading: boolean;
  reviewError: string | null;
  onReview: () => void;
  reviewingDecision: boolean;
  onReviewDecision: (decision: ReviewDecision, reason?: string) => void;
}

/**
 * S7-1: the draft is editable in place — title/meta/slug/outline/body are all
 * controlled inputs with a Save button that PUTs just those fields, so a human edit
 * survives instead of only ever being replaced wholesale by "Regenerate". S8-3: once
 * a review has run, the gate's PASS/FAIL is followed by an explicit approve/edit/
 * reject step — "edit" here just re-opens this same form, since that's the workspace.
 */
function ContentDraftEditor({
  actionId,
  draft,
  saving,
  onSave,
  onRegenerate,
  reviewResult,
  reviewLoading,
  reviewError,
  onReview,
  reviewingDecision,
  onReviewDecision,
}: ContentDraftEditorProps) {
  const [editing, setEditing] = useState(false);
  const [seoTitle, setSeoTitle] = useState(draft.seo_title);
  const [metaDescription, setMetaDescription] = useState(draft.meta_description);
  const [urlSlug, setUrlSlug] = useState(draft.url_slug);
  const [outline, setOutline] = useState(draft.outline);
  const [bodyMarkdown, setBodyMarkdown] = useState(draft.body_markdown);
  const [rejectDraftOpen, setRejectDraftOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Re-sync the form whenever a fresh draft arrives (after Save, Regenerate, or a
  // review decision) — but not on every keystroke, since this effect only depends on
  // the draft identity/content coming from the parent, not the local edit state.
  useEffect(() => {
    setSeoTitle(draft.seo_title);
    setMetaDescription(draft.meta_description);
    setUrlSlug(draft.url_slug);
    setOutline(draft.outline);
    setBodyMarkdown(draft.body_markdown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id, draft.edited_at, draft.created_at]);

  function startEdit() {
    setEditing(true);
  }

  async function save() {
    // Only leave edit mode once the save actually succeeded — otherwise a failed
    // PATCH would exit edit mode while these fields still hold unsaved text, showing
    // it as if it were committed.
    const ok = await onSave({ seo_title: seoTitle, meta_description: metaDescription, url_slug: urlSlug, outline, body_markdown: bodyMarkdown });
    if (ok) setEditing(false);
  }

  function discard() {
    setSeoTitle(draft.seo_title);
    setMetaDescription(draft.meta_description);
    setUrlSlug(draft.url_slug);
    setOutline(draft.outline);
    setBodyMarkdown(draft.body_markdown);
    setEditing(false);
  }

  function updateOutlineItem(index: number, text: string) {
    setOutline((prev) => prev.map((item, i) => (i === index ? { ...item, text } : item)));
  }

  function removeOutlineItem(index: number) {
    setOutline((prev) => prev.filter((_, i) => i !== index));
  }

  function addOutlineItem() {
    setOutline((prev) => [...prev, { level: "h2", text: "" }]);
  }

  function handleRegenerateClick() {
    if (draft.is_edited === 1 && !window.confirm(t("action.regenerateWarning"))) return;
    onRegenerate();
  }

  function confirmReject() {
    if (!rejectReason.trim()) return;
    onReviewDecision("rejected", rejectReason.trim());
    setRejectDraftOpen(false);
    setRejectReason("");
  }

  /** S8-3: "تعطيل الاعتماد عند FAIL أو طلب تأكيد صريح للتجاوز" — a FAIL can still be
   *  approved deliberately (an excluded check, a call the specialist stands behind),
   *  but only with an explicit override, never a silent click-through. */
  function handleApproveClick() {
    if (reviewResult && !reviewResult.gate.pass && !window.confirm(t("review.approveOverrideWarning"))) return;
    onReviewDecision("approved");
  }

  return (
    <div style={{ padding: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <h4 style={{ margin: 0 }}>
          {editing ? (
            <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} style={{ minWidth: 320 }} />
          ) : (
            seoTitle
          )}
          {draft.is_demo_seed === 1 && <DemoBadge />}
        </h4>
        {draft.is_edited === 1 && (
          <span style={{ fontSize: 11, color: MUTED, border: "1px solid var(--color-border)", borderRadius: 999, padding: "1px 8px" }}>
            {t("action.editedBadge")} · v{draft.version}
          </span>
        )}
      </div>

      <p style={{ margin: "0 0 4px", color: MUTED }}>
        <b>{t("action.primaryKeyword")}:</b> {draft.primary_keyword}
        {draft.secondary_keywords.length > 0 && (
          <>
            {" "}
            · <b>{t("action.secondaryKeywords")}:</b> {draft.secondary_keywords.join(", ")}
          </>
        )}
      </p>

      <p style={{ margin: "0 0 4px", color: MUTED }}>
        <b>{t("action.metaDescription")}:</b>{" "}
        {editing ? (
          <input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} style={{ minWidth: 420 }} />
        ) : (
          metaDescription
        )}
      </p>
      <p style={{ margin: "0 0 8px", color: MUTED }}>
        <b>{t("action.slug")}:</b>{" "}
        {editing ? (
          <input value={urlSlug} onChange={(e) => setUrlSlug(e.target.value)} dir="ltr" style={{ minWidth: 220 }} />
        ) : (
          <Ltr>/{urlSlug}</Ltr>
        )}
      </p>

      <p style={{ margin: "0 0 4px" }}>
        <b>{t("action.outline")}</b>
      </p>
      {editing ? (
        <div style={{ margin: "0 0 8px" }}>
          {outline.map((item, index) => (
            <div key={index} style={{ display: "flex", gap: 6, marginBottom: 4, marginInlineStart: OUTLINE_INDENT[item.level] }}>
              <span style={{ color: MUTED, fontSize: 12, minInlineSize: 24 }}>{item.level}</span>
              <input
                value={item.text}
                onChange={(e) => updateOutlineItem(index, e.target.value)}
                placeholder={t("action.outlineItemPlaceholder")}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn-secondary" onClick={() => removeOutlineItem(index)}>
                {t("action.removeOutlineItem")}
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={addOutlineItem}>
            {t("action.addOutlineItem")}
          </button>
        </div>
      ) : (
        <ul style={{ margin: "0 0 8px" }}>
          {outline.map((item, index) => (
            <li key={index} style={{ marginInlineStart: OUTLINE_INDENT[item.level] }}>
              {item.text}
            </li>
          ))}
        </ul>
      )}

      <details open={editing}>
        <summary style={{ cursor: "pointer" }}>{t("action.draft")}</summary>
        {editing ? (
          <textarea
            value={bodyMarkdown}
            onChange={(e) => setBodyMarkdown(e.target.value)}
            rows={14}
            style={{ width: "100%", marginTop: 6 }}
          />
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{bodyMarkdown}</pre>
        )}
      </details>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {editing ? (
          <>
            <button onClick={save} disabled={saving}>
              {saving ? t("action.savingDraft") : t("action.saveDraft")}
            </button>
            <button type="button" className="btn-secondary" onClick={discard} disabled={saving}>
              {t("action.discardEdits")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={startEdit}>
              {t("action.editMode")}
            </button>
            <button type="button" className="btn-secondary" onClick={handleRegenerateClick}>
              {t("action.regenerate")}
            </button>
          </>
        )}
      </div>

      <ContentReviewPanel result={reviewResult} loading={reviewLoading} error={reviewError} onReview={onReview} />

      {/* S8-3: only meaningful once a review has actually run — approving/rejecting
          before that would be a decision made blind. */}
      {reviewResult && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{t("review.reviewStepTitle")}</p>
          {draft.review_status === "approved" && (
            <p style={{ margin: 0, color: "#186b45" }}>{t("review.reviewApproved")}</p>
          )}
          {draft.review_status === "rejected" && (
            <p style={{ margin: 0, color: "crimson" }}>
              {t("review.reviewRejected")}
              {draft.review_reason && (
                <span style={{ display: "block", color: MUTED, fontSize: 13 }}>
                  <b>{t("review.rejectedReasonLabel")}</b> {draft.review_reason}
                </span>
              )}
            </p>
          )}
          {draft.review_status === "pending" && (
            <>
              <p style={{ margin: "0 0 6px", color: MUTED, fontSize: 13 }}>{t("review.notReadyNote")}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleApproveClick}
                  disabled={reviewingDecision}
                  title={reviewResult && !reviewResult.gate.pass ? t("review.approveOverrideTooltip") : undefined}
                >
                  {reviewingDecision ? t("review.approvingDraft") : t("review.approveDraft")}
                </button>
                <button type="button" className="btn-secondary" onClick={startEdit}>
                  {t("review.editDraft")}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setRejectDraftOpen(true)} disabled={reviewingDecision}>
                  {t("review.rejectDraft")}
                </button>
              </div>
              {rejectDraftOpen && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 13 }}>{t("review.rejectReasonPrompt")}:</span>
                  <input
                    autoFocus
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t("review.rejectReasonPlaceholder")}
                    style={{ flex: 1 }}
                  />
                  <button onClick={confirmReject} disabled={!rejectReason.trim() || reviewingDecision}>
                    {reviewingDecision ? t("review.rejecting") : t("review.rejectConfirm")}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setRejectDraftOpen(false)}>
                    {t("common.cancel")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
