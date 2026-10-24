import type {
  ActionResultRow,
  ActionRow,
  AuditIssue,
  ContentDraft,
  Diagnosis,
  LearningRow,
  PageSpeedSummary,
  Website,
} from "../types";

/**
 * Stage 8. The thing the client actually takes away.
 *
 * One structured model, two renderers. Converting Markdown to HTML would need a
 * dependency and would still lose the table styling, so each format is written
 * directly from the same data instead.
 */

export interface ReportModel {
  website: Website;
  generatedAt: string;
  crawlPages: number;
  /** False when no crawl has run — a 0/100 score would read as a failing site. */
  hasAudit: boolean;
  score: number;
  issues: AuditIssue[];
  issuesByCategory: Record<string, number>;
  pageSpeed: PageSpeedSummary | null;
  diagnoses: Diagnosis[];
  actions: (ActionRow & { result: ActionResultRow | null })[];
  learning: LearningRow[];
  learningIncludesDemoData: boolean;
  /** Joined with the action title it belongs to, since a draft has no title of its own
   *  until it's rendered — action.title is what drove the brief in the first place. */
  contentDrafts: (ContentDraft & { action_title: string })[];
}

const CATEGORY_LABELS: Record<string, string> = {
  meta: "Meta",
  content: "Content",
  indexing: "Indexing",
  links: "Links",
  performance: "Performance",
  opportunity: "Opportunity",
};

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function signed(value: number | null, digits = 0): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function vitalRows(summary: PageSpeedSummary): [string, string, string][] {
  const format = (key: "lcp_ms" | "inp_ms" | "cls" | "fcp_ms" | "ttfb_ms", from: "lab" | "field") => {
    const source = from === "lab" ? summary.lab : summary.field;
    const value = source?.[key] ?? null;
    if (value === null) return "—";
    return key === "cls" ? value.toFixed(3) : `${Math.round(value)}ms`;
  };
  return (["lcp_ms", "inp_ms", "cls", "fcp_ms", "ttfb_ms"] as const).map((key) => [
    key.replace("_ms", "").toUpperCase(),
    format(key, "field"),
    format(key, "lab"),
  ]);
}

function siteContextLines(website: Website): string[] {
  const lines = [
    `- **URL:** ${website.url}`,
    `- **Type:** ${website.site_type}`,
    `- **Market:** ${website.country} / ${website.language}`,
  ];
  if (website.niche) lines.push(`- **Niche:** ${website.niche}`);
  if (website.target_audience) lines.push(`- **Audience:** ${website.target_audience}`);
  if (website.goal) lines.push(`- **Goal:** ${website.goal}`);
  if (website.cms) lines.push(`- **CMS:** ${website.cms}`);
  return lines;
}

export function renderMarkdown(model: ReportModel): string {
  const out: string[] = [];

  out.push(`# SEO report — ${model.website.url}`, "");
  out.push(`Generated ${model.generatedAt}`, "");
  out.push(...siteContextLines(model.website), "");

  out.push("## 1. Audit", "");
  if (!model.hasAudit) {
    out.push("_No crawl has been run for this site yet, so there is nothing to score._", "");
  } else {
    out.push(
      `**Score: ${model.score}/100** across ${model.crawlPages} crawled pages, ${model.issues.length} issues.`,
      ""
    );
  }
  const categories = Object.entries(model.issuesByCategory).filter(([, count]) => count > 0);
  if (categories.length > 0) {
    out.push("| Category | Issues |", "|---|---|");
    for (const [category, count] of categories) {
      out.push(`| ${CATEGORY_LABELS[category] ?? category} | ${count} |`);
    }
    out.push("");
  }

  if (model.issues.length > 0) {
    out.push("| Severity | Rule | Page | Detail |", "|---|---|---|---|");
    for (const issue of model.issues) {
      out.push(
        `| ${issue.severity} | ${issue.rule_code} | ${issue.page_url ?? "site-wide"} | ${(issue.detail ?? "").replace(/\|/g, "\\|")} |`
      );
    }
    out.push("");
  }

  if (model.pageSpeed) {
    out.push("## 2. Core Web Vitals", "");
    out.push(`Performance score: **${model.pageSpeed.performance_score ?? "—"}/100** (${model.pageSpeed.strategy})`, "");
    out.push("| Vital | Field (real users) | Lab (synthetic) |", "|---|---|---|");
    for (const [label, field, lab] of vitalRows(model.pageSpeed)) {
      out.push(`| ${label} | ${field} | ${lab} |`);
    }
    out.push("");
    if (!model.pageSpeed.field) {
      out.push("_No real-user data: this site has too little Chrome traffic for a CrUX sample._", "");
    }
  }

  if (model.diagnoses.length > 0) {
    out.push("## 3. Diagnosis", "");
    for (const diagnosis of model.diagnoses) {
      out.push(`### [Priority ${diagnosis.priority_score}] ${diagnosis.problem}`, "");
      out.push(
        `Severity ${diagnosis.severity} · Business impact ${diagnosis.business_impact} · ` +
          `Effort ${diagnosis.effort} · Confidence ${pct(diagnosis.confidence)}`,
        ""
      );
      if (diagnosis.evidence.length > 0) {
        out.push("**Evidence**", "");
        for (const item of diagnosis.evidence) out.push(`- ${item}`);
        out.push("");
      }
      out.push(`**Root cause:** ${diagnosis.root_cause}`, "");
      out.push(`**Recommended action:** ${diagnosis.recommended_action} _(${diagnosis.action_type})_`, "");
    }
  }

  if (model.actions.length > 0) {
    out.push("## 4. Actions and measured results", "");
    out.push("| Approved | Action | Type | Status | Clicks change |", "|---|---|---|---|---|");
    for (const action of model.actions) {
      const change = action.result ? signed(action.result.delta_clicks) : "not measured";
      const demo = action.is_demo_seed === 1 ? " _(demo data)_" : "";
      out.push(
        `| ${action.approved_at.slice(0, 10)} | ${action.title}${demo} | ${action.action_type} | ${action.status} | ${change} |`
      );
    }
    out.push("");
  }

  if (model.contentDrafts.length > 0) {
    out.push("## 5. Content drafts (Stage 7 minimum)", "");
    for (const draft of model.contentDrafts) {
      const demo = draft.is_demo_seed === 1 ? " _(demo data)_" : "";
      out.push(`### ${draft.seo_title}${demo}`, "");
      out.push(`For action: ${draft.action_title}`, "");
      out.push(`**Primary keyword:** ${draft.primary_keyword}`, "");
      if (draft.secondary_keywords.length > 0) {
        out.push(`**Secondary keywords:** ${draft.secondary_keywords.join(", ")}`, "");
      }
      out.push(`**Meta description:** ${draft.meta_description}`, "");
      out.push(`**URL slug:** /${draft.url_slug}`, "");
      out.push("**Outline**", "");
      for (const item of draft.outline) {
        const indent = item.level === "h1" ? "" : item.level === "h2" ? "  " : "    ";
        out.push(`${indent}- ${item.text}`);
      }
      out.push("", "**Draft**", "", draft.body_markdown, "");
    }
  }

  if (model.learning.length > 0) {
    out.push("## 6. What has worked so far", "");
    if (model.learningIncludesDemoData) {
      out.push("> **Includes demo data.** Seeded rows are counted below and are not real client results.", "");
    }
    out.push("| Action type | Tried | Measured | Succeeded | Success rate | Avg clicks gained |", "|---|---|---|---|---|---|");
    for (const row of model.learning) {
      out.push(
        `| ${row.action_type} | ${row.tried} | ${row.measured} | ${row.succeeded} | ` +
          `${pct(row.success_rate)} | ${signed(row.avg_delta_clicks, 1)} |`
      );
    }
    out.push("");
  }

  return out.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -- Status/severity/category color mapping -------------------------------
// A small, fixed palette used throughout: status colors (good/warning/serious/
// critical) are reserved for state and never reused as category identity;
// category chips use a fixed categorical hue order so the same category is
// always the same color across reports.

const STATUS = {
  good: { fg: "#0a7d0a", bg: "#e9f7e9", icon: "✓" }, // check
  warning: { fg: "#8a5a00", bg: "#fdf1d8", icon: "▲" }, // triangle
  serious: { fg: "#a8431f", bg: "#fbe6dc", icon: "▲" },
  critical: { fg: "#b91c1c", bg: "#fbe1e1", icon: "✕" }, // cross
  neutral: { fg: "#52514e", bg: "#eeede9", icon: "–" }, // dash
} as const;

type StatusKey = keyof typeof STATUS;

const CATEGORY_COLORS: Record<string, string> = {
  meta: "#2a78d6",
  content: "#c9591f",
  indexing: "#128a5e",
  links: "#a97400",
  performance: "#c14f79",
  opportunity: "#1a7a1a",
};

function severityStatus(severity: number): StatusKey {
  if (severity >= 5) return "critical";
  if (severity >= 4) return "serious";
  if (severity >= 3) return "warning";
  return "neutral";
}

function scoreStatus(score: number): StatusKey {
  if (score >= 80) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

/** Thresholds mirror server/src/audit/rules.ts's CORE_WEB_VITALS_THRESHOLDS — the
 *  same "good / needs improvement / poor" bands Google publishes, so the report
 *  never disagrees with the audit that produced it. fcp has no rule threshold
 *  there, so it is left unstyled here too rather than inventing one. */
const VITAL_THRESHOLDS: Partial<Record<string, { good: number; poor: number }>> = {
  lcp_ms: { good: 2500, poor: 4000 },
  inp_ms: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  ttfb_ms: { good: 800, poor: 1800 },
};

function vitalStatus(key: string, value: number | null): StatusKey | null {
  const band = VITAL_THRESHOLDS[key.toLowerCase()];
  if (!band || value === null) return null;
  if (value <= band.good) return "good";
  if (value >= band.poor) return "critical";
  return "warning";
}

function statusChip(status: StatusKey, label: string): string {
  const s = STATUS[status];
  return `<span class="chip" style="color:${s.fg};background:${s.bg}"><i aria-hidden="true">${s.icon}</i>${escapeHtml(label)}</span>`;
}

/** Wraps text that may be Arabic (or any RTL script) so the browser sets its own
 *  paragraph direction from its first strong character — the page frame and
 *  labels stay LTR while user-authored Arabic content reads correctly RTL,
 *  instead of every mixed-language block inheriting one fixed direction. */
function bidi(value: string, tag = "span"): string {
  return `<${tag} dir="auto">${escapeHtml(value)}</${tag}>`;
}

/** Every row in the issues table repeats the site's own domain in the Page column —
 *  on a report scoped to one website that's pure repetition, and it's what forces
 *  the column to wrap character-by-character. Shows the path relative to the
 *  site's origin instead (falling back to the full URL for a different origin,
 *  e.g. an external link target), with the full URL kept as a hover tooltip. */
function pagePath(url: string, siteOrigin: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== siteOrigin) return url;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return url;
  }
}

function pageCell(url: string | null, siteOrigin: string): string {
  if (!url) return `<span class="muted">site-wide</span>`;
  const path = pagePath(url, siteOrigin);
  return path === url
    ? `<span class="url-full">${escapeHtml(url)}</span>`
    : `<span class="url-path" title="${escapeHtml(url)}">${escapeHtml(path)}</span>`;
}

function siteInfoGrid(website: Website): string {
  const rows: [string, string | null][] = [
    ["URL", website.url],
    ["Type", website.site_type],
    ["Market", `${website.country} / ${website.language}`],
    ["Niche", website.niche],
    ["Audience", website.target_audience],
    ["Goal", website.goal],
    ["CMS", website.cms],
  ];
  return `<div class="info-grid">${rows
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="info-cell"><dt>${escapeHtml(label)}</dt><dd>${bidi(value as string)}</dd></div>`)
    .join("")}</div>`;
}

export function renderHtml(model: ReportModel): string {
  const parts: string[] = [];
  const siteOrigin = (() => {
    try {
      return new URL(model.website.url).origin;
    } catch {
      return model.website.url;
    }
  })();

  // -- Header --------------------------------------------------------------
  parts.push(`
    <header class="report-header">
      <p class="eyebrow">SEO Report</p>
      <h1 dir="auto">${escapeHtml(model.website.url)}</h1>
      <p class="muted">Generated ${escapeHtml(model.generatedAt)}</p>
      ${siteInfoGrid(model.website)}
    </header>
  `);

  // -- 1. Audit --------------------------------------------------------------
  parts.push(`<section><h2><span class="step">1</span>Audit</h2>`);
  if (!model.hasAudit) {
    parts.push(`<p class="empty">No crawl has been run for this site yet, so there is nothing to score.</p>`);
  } else {
    const status = scoreStatus(model.score);
    const categories = Object.entries(model.issuesByCategory).filter(([, count]) => count > 0);
    parts.push(`
      <div class="stat-row">
        <div class="stat-tile score-tile" style="--tile-accent:${STATUS[status].fg}">
          <span class="stat-value">${model.score}<small>/100</small></span>
          <span class="stat-label">Audit score</span>
        </div>
        <div class="stat-tile">
          <span class="stat-value">${model.crawlPages}</span>
          <span class="stat-label">Pages crawled</span>
        </div>
        <div class="stat-tile">
          <span class="stat-value">${model.issues.length}</span>
          <span class="stat-label">Issues found</span>
        </div>
      </div>
    `);
    if (categories.length > 0) {
      parts.push(
        `<div class="chip-row">${categories
          .map(
            ([category, count]) =>
              `<span class="chip cat-chip"><i aria-hidden="true" style="background:${CATEGORY_COLORS[category] ?? "#898781"}"></i>${escapeHtml(
                CATEGORY_LABELS[category] ?? category
              )} <b>${count}</b></span>`
          )
          .join("")}</div>`
      );
    }
  }
  if (model.issues.length > 0) {
    parts.push(
      `<div class="table-card"><table><thead><tr><th>Severity</th><th>Rule</th><th>Page</th><th>Detail</th></tr></thead><tbody>` +
        model.issues
          .map((issue) => {
            const s = severityStatus(issue.severity);
            return (
              `<tr><td>${statusChip(s, String(issue.severity))}</td>` +
              `<td><code>${escapeHtml(issue.rule_code)}</code><div class="muted small">${escapeHtml(
                CATEGORY_LABELS[issue.category] ?? issue.category
              )}</div></td>` +
              `<td class="url">${pageCell(issue.page_url, siteOrigin)}</td>` +
              `<td>${escapeHtml(issue.detail ?? "")}</td></tr>`
            );
          })
          .join("") +
        `</tbody></table></div>`
    );
  }
  parts.push(`</section>`);

  // -- 2. Core Web Vitals ------------------------------------------------
  if (model.pageSpeed) {
    const perfScore = model.pageSpeed.performance_score;
    const perfStatus = perfScore === null ? null : scoreStatus(perfScore);
    parts.push(`<section><h2><span class="step">2</span>Core Web Vitals</h2>`);
    parts.push(`
      <div class="stat-row">
        <div class="stat-tile score-tile" style="--tile-accent:${perfStatus ? STATUS[perfStatus].fg : "#898781"}">
          <span class="stat-value">${perfScore ?? "—"}<small>/100</small></span>
          <span class="stat-label">Performance (${escapeHtml(model.pageSpeed.strategy)})</span>
        </div>
      </div>
    `);
    parts.push(
      `<div class="table-card"><table><thead><tr><th>Vital</th><th>Field (real users)</th><th>Lab (synthetic)</th></tr></thead><tbody>` +
        (["lcp_ms", "inp_ms", "cls", "fcp_ms", "ttfb_ms"] as const)
          .map((key) => {
            const format = (from: "lab" | "field") => {
              const source = from === "lab" ? model.pageSpeed!.lab : model.pageSpeed!.field;
              const value = source?.[key] ?? null;
              const text = value === null ? "—" : key === "cls" ? value.toFixed(3) : `${Math.round(value)}ms`;
              const status = vitalStatus(key, value);
              return status ? statusChip(status, text) : `<span class="muted">${text}</span>`;
            };
            return `<tr><td>${key.replace("_ms", "").toUpperCase()}</td><td>${format("field")}</td><td>${format("lab")}</td></tr>`;
          })
          .join("") +
        `</tbody></table></div>`
    );
    if (!model.pageSpeed.field) {
      parts.push(`<p class="empty">No real-user data: this site has too little Chrome traffic for a CrUX sample.</p>`);
    }
    parts.push(`</section>`);
  }

  // -- 3. Diagnosis --------------------------------------------------------
  if (model.diagnoses.length > 0) {
    parts.push(`<section><h2><span class="step">3</span>Diagnosis</h2>`);
    for (const diagnosis of model.diagnoses) {
      const tier = diagnosis.priority_score >= 70 ? "high" : diagnosis.priority_score >= 40 ? "medium" : "low";
      const dismissed = diagnosis.dismissed
        ? `<p class="dismissed-note">${statusChip("neutral", "Dismissed")} ${
            diagnosis.dismissed_reason ? bidi(diagnosis.dismissed_reason) : ""
          }</p>`
        : "";
      parts.push(`
        <article class="card${diagnosis.dismissed ? " card-dismissed" : ""}">
          <div class="card-head">
            <div class="priority-pill tier-${tier}"><span>${diagnosis.priority_score}</span><small>priority</small></div>
            <h3 dir="auto">${escapeHtml(diagnosis.problem)}</h3>
          </div>
          <p class="muted small">
            Severity ${diagnosis.severity} &middot; Business impact ${diagnosis.business_impact} &middot;
            Effort ${diagnosis.effort} &middot; Confidence ${pct(diagnosis.confidence)}
          </p>
          ${dismissed}
          ${
            diagnosis.evidence.length
              ? `<ul class="evidence">${diagnosis.evidence.map((item) => `<li dir="auto">${escapeHtml(item)}</li>`).join("")}</ul>`
              : ""
          }
          <dl class="kv">
            <div><dt>Root cause</dt><dd dir="auto">${escapeHtml(diagnosis.root_cause)}</dd></div>
            <div><dt>Recommended</dt><dd dir="auto">${escapeHtml(diagnosis.recommended_action)}
              <span class="muted small">(${escapeHtml(diagnosis.action_type)})</span></dd></div>
          </dl>
        </article>
      `);
    }
    parts.push(`</section>`);
  }

  // -- 4. Actions and measured results ------------------------------------
  if (model.actions.length > 0) {
    parts.push(`<section><h2><span class="step">4</span>Actions and measured results</h2>`);
    const actionStatus: Record<string, StatusKey> = { done: "good", approved: "warning", dismissed: "neutral" };
    parts.push(
      `<div class="table-card"><table><thead><tr><th>Approved</th><th>Action</th><th>Type</th><th>Status</th><th>Clicks change</th></tr></thead><tbody>` +
        model.actions
          .map((action) => {
            const change = action.result
              ? (() => {
                  const v = action.result!.delta_clicks;
                  if (v === null) return `<span class="muted">—</span>`;
                  const status: StatusKey = v > 0 ? "good" : v < 0 ? "critical" : "neutral";
                  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "–";
                  return `<span class="delta" style="color:${STATUS[status].fg}">${arrow} ${signed(v)}</span>`;
                })()
              : `<span class="muted">not measured</span>`;
            return (
              `<tr><td class="nowrap">${escapeHtml(action.approved_at.slice(0, 10))}</td>` +
              `<td dir="auto">${escapeHtml(action.title)}${
                action.is_demo_seed === 1 ? ' <span class="demo-tag">demo data</span>' : ""
              }</td>` +
              `<td>${escapeHtml(action.action_type)}</td>` +
              `<td>${statusChip(actionStatus[action.status] ?? "neutral", action.status)}</td>` +
              `<td>${change}</td></tr>`
            );
          })
          .join("") +
        `</tbody></table></div></section>`
    );
  }

  // -- 5. Content drafts ----------------------------------------------------
  if (model.contentDrafts.length > 0) {
    parts.push(`<section><h2><span class="step">5</span>Content drafts <small class="muted">(Stage 7 minimum)</small></h2>`);
    for (const draft of model.contentDrafts) {
      const demo = draft.is_demo_seed === 1 ? ' <span class="demo-tag">demo data</span>' : "";
      parts.push(`
        <article class="card">
          <div class="card-head"><h3 dir="auto">${escapeHtml(draft.seo_title)}${demo}</h3></div>
          <p class="muted small">For action: ${escapeHtml(draft.action_title)}</p>
          <dl class="kv">
            <div><dt>Primary keyword</dt><dd dir="auto">${escapeHtml(draft.primary_keyword)}</dd></div>
            ${
              draft.secondary_keywords.length
                ? `<div><dt>Secondary keywords</dt><dd dir="auto">${escapeHtml(draft.secondary_keywords.join(", "))}</dd></div>`
                : ""
            }
            <div><dt>Meta description</dt><dd dir="auto">${escapeHtml(draft.meta_description)}</dd></div>
            <div><dt>URL slug</dt><dd><code>/${escapeHtml(draft.url_slug)}</code></dd></div>
          </dl>
          <p class="kv-label">Outline</p>
          <ul class="outline">${draft.outline
            .map(
              (item) =>
                `<li class="lvl-${item.level}" dir="auto">${escapeHtml(item.text)}</li>`
            )
            .join("")}</ul>
          <p class="kv-label">Draft</p>
          <p class="draft-body" dir="auto">${escapeHtml(draft.body_markdown)}</p>
        </article>
      `);
    }
    parts.push(`</section>`);
  }

  // -- 6. Learning ------------------------------------------------------
  if (model.learning.length > 0) {
    parts.push(`<section><h2><span class="step">6</span>What has worked so far</h2>`);
    if (model.learningIncludesDemoData) {
      parts.push(
        `<p class="notice">${statusChip("warning", "Includes demo data")} Seeded rows are counted below and are not real client results.</p>`
      );
    }
    parts.push(
      `<div class="table-card"><table><thead><tr><th>Action type</th><th>Tried</th><th>Measured</th><th>Succeeded</th>` +
        `<th>Success rate</th><th>Avg clicks gained</th></tr></thead><tbody>` +
        model.learning
          .map((row) => {
            const rateStatus: StatusKey | null =
              row.success_rate === null ? null : row.success_rate >= 0.6 ? "good" : row.success_rate >= 0.3 ? "warning" : "critical";
            return (
              `<tr><td>${escapeHtml(row.action_type)}</td><td>${row.tried}</td><td>${row.measured}</td>` +
              `<td>${row.succeeded}</td><td>${rateStatus ? statusChip(rateStatus, pct(row.success_rate)) : '<span class="muted">—</span>'}</td>` +
              `<td>${signed(row.avg_delta_clicks, 1)}</td></tr>`
            );
          })
          .join("") +
        `</tbody></table></div>`
    );
    parts.push(`</section>`);
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SEO report — ${escapeHtml(model.website.url)}</title>
<style>
  :root {
    color-scheme: light;
    --ink: #0b0b0b;
    --ink-2: #52514e;
    --ink-muted: #898781;
    --page: #f4f4f2;
    --surface: #ffffff;
    --hairline: #e5e3dd;
    --border: rgba(11,11,11,0.10);
    --brand: #17458c;
    --brand-light: #eaf0f9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--page); color: var(--ink);
    font: 15px/1.6 -apple-system, "Segoe UI", system-ui, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet { max-width: 1120px; margin: 0 auto; padding: 48px 24px 96px; }
  .muted { color: var(--ink-2); }
  .small { font-size: 12.5px; }
  code { background: var(--brand-light); border: 1px solid var(--border); border-radius: 4px;
         padding: 1px 5px; font-size: 12px; color: var(--brand); }

  /* Header */
  .report-header { background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
                    padding: 32px 32px 24px; margin-bottom: 32px; box-shadow: 0 1px 2px rgba(11,11,11,0.04); }
  .eyebrow { margin: 0 0 6px; font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase;
             color: var(--brand); font-weight: 700; }
  .report-header h1 { font-size: 25px; margin: 0 0 6px; word-break: break-word; }
  .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
               gap: 14px 24px; margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--hairline); }
  .info-cell dt { font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-muted);
                  margin: 0 0 3px; }
  .info-cell dd { margin: 0; font-size: 13.5px; color: var(--ink); }

  /* Sections */
  section { margin-bottom: 40px; }
  h2 { display: flex; align-items: center; gap: 10px; font-size: 18px; margin: 0 0 18px; }
  .step { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
          border-radius: 999px; background: var(--brand); color: #fff; font-size: 12px; font-weight: 700; }
  h3 { font-size: 15.5px; margin: 0; }
  .empty, .notice { background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
                     padding: 12px 16px; color: var(--ink-2); font-size: 13.5px; }
  .notice { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }

  /* Stat tiles */
  .stat-row { display: flex; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
  .stat-tile { flex: 1 1 140px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
               padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
  .score-tile { border-top: 3px solid var(--tile-accent, var(--brand)); }
  .stat-value { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .score-tile .stat-value { color: var(--tile-accent, var(--ink)); }
  .stat-value small { font-size: 14px; font-weight: 500; color: var(--ink-muted); }
  .stat-label { font-size: 12px; color: var(--ink-2); }

  /* Chips */
  .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 3px 10px;
          font-size: 12px; font-weight: 600; white-space: nowrap; }
  .chip i { font-style: normal; }
  .cat-chip { background: var(--surface); border: 1px solid var(--border); color: var(--ink-2); font-weight: 500; }
  .cat-chip i { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
  .cat-chip b { color: var(--ink); font-weight: 700; }

  /* Tables */
  .table-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
                overflow: hidden; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th { text-align: left; font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase;
       color: var(--ink-muted); padding: 10px 14px; border-bottom: 1px solid var(--hairline);
       background: #fafaf8; white-space: nowrap; }
  td { padding: 10px 14px; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: #fbfbfa; }
  td.url { overflow-wrap: anywhere; word-break: normal; max-width: 280px; color: var(--ink-2); font-size: 12px; }
  .url-path { font-family: ui-monospace, "SF Mono", Consolas, monospace; }
  .url-full { word-break: break-all; }
  td.nowrap { white-space: nowrap; }
  .delta { font-weight: 700; font-variant-numeric: tabular-nums; }
  .demo-tag { color: #8a5a00; background: #fdf1d8; font-size: 10.5px; font-weight: 700;
              border-radius: 4px; padding: 1px 6px; margin-inline-start: 4px; }

  /* Cards (diagnosis / content drafts) */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
          padding: 18px 20px; margin-bottom: 14px; }
  .card-dismissed { opacity: 0.7; }
  .card-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
  .priority-pill { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
                    width: 52px; height: 52px; border-radius: 12px; font-weight: 700; }
  .priority-pill span { font-size: 18px; line-height: 1.1; }
  .priority-pill small { font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; opacity: .85; }
  .tier-high { background: var(--brand); color: #fff; }
  .tier-medium { background: var(--brand-light); color: var(--brand); }
  .tier-low { background: #f1f1ee; color: var(--ink-2); }
  .dismissed-note { margin: 4px 0 10px; font-size: 13px; }
  .evidence { margin: 10px 0; padding-inline-start: 20px; }
  .evidence li { margin-bottom: 4px; font-size: 13.5px; }
  .kv { display: grid; gap: 8px 20px; margin: 12px 0 0; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .kv dt { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-muted); margin: 0 0 2px; }
  .kv dd { margin: 0; font-size: 13.5px; }
  .kv-label { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-muted);
              margin: 16px 0 4px; }
  .outline { margin: 4px 0 14px; padding: 0; list-style: none; font-size: 13.5px; }
  .outline li { padding: 3px 0; border-inline-start: 2px solid var(--hairline); padding-inline-start: 10px; margin-bottom: 2px; }
  .outline li.lvl-h1 { font-weight: 700; border-inline-start-color: var(--brand); }
  .outline li.lvl-h2 { margin-inline-start: 16px; }
  .outline li.lvl-h3 { margin-inline-start: 32px; color: var(--ink-2); }
  .draft-body { white-space: pre-wrap; font-size: 13.5px; line-height: 1.7; background: #fafaf8;
                border: 1px solid var(--hairline); border-radius: 8px; padding: 14px 16px; }

  footer { text-align: center; color: var(--ink-muted); font-size: 11.5px; margin-top: 48px; }

  @media print {
    body { background: #fff; }
    .sheet { padding: 0; max-width: none; }
    .report-header, .stat-tile, .table-card, .card { box-shadow: none; }
    .card, .table-card, section { break-inside: avoid; }
  }
</style></head><body>
<div class="sheet">
${parts.join("\n")}
<footer>Generated by the SEO Operating System &middot; ${escapeHtml(model.generatedAt)}</footer>
</div>
</body></html>`;
}
