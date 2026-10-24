// Renders the real /api/websites/:id/report?format=html output for one website,
// straight from data/app.db, using the app's own reportService.ts + audit/rules.ts
// (loaded with Node's built-in TS type-stripping) and Node's built-in node:sqlite —
// no npm install needed. Used to produce faithful "before"/"after" screenshots of the
// HTML export without running the full Express server (blocked here: npm registry
// access is down in this sandbox).
//
// Usage: node --experimental-strip-types scripts/render_report.mjs <site-url> <out.html>

import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "app.db");
const siteUrl = process.argv[2];
const outPath = process.argv[3];
if (!siteUrl || !outPath) {
  console.error("Usage: node --experimental-strip-types scripts/render_report.mjs <site-url> <out.html>");
  process.exit(1);
}

const { renderHtml } = await import("../src/services/reportService.ts");

// Inlined from src/audit/rules.ts (auditScore / countByCategory / countAnalysablePages
// only — not imported directly because that module also pulls in crawler/robots.ts and
// crawler/sitemap.ts, which import the "cheerio" npm package that isn't installed here).
function auditScore(findings, pagesAnalysed) {
  if (pagesAnalysed === 0) return 0;
  const penalty = findings.reduce((sum, f) => sum + f.severity, 0);
  return Math.max(0, Math.round(100 - (penalty / pagesAnalysed) * 4));
}
function countByCategory(findings) {
  const counts = { meta: 0, content: 0, indexing: 0, links: 0, performance: 0, opportunity: 0 };
  for (const f of findings) counts[f.category] += 1;
  return counts;
}
function isAnalysable(p) {
  if (p.is_broken) return false;
  if (p.status_code === null || p.status_code < 200 || p.status_code >= 300) return false;
  return p.content_type === null || /html/i.test(p.content_type);
}
function countAnalysablePages(pages) {
  return pages.filter(isAnalysable).length;
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const one = (sql, ...params) => db.prepare(sql).get(...params) ?? null;
const all = (sql, ...params) => db.prepare(sql).all(...params);

const website = one("SELECT * FROM websites WHERE url = ?", siteUrl);
if (!website) {
  console.error(`No website found with url ${siteUrl}`);
  process.exit(1);
}

const crawl = one(
  "SELECT * FROM crawls WHERE website_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1",
  website.id
);
const issues = crawl
  ? all("SELECT * FROM audit_issues WHERE crawl_id = ? ORDER BY severity DESC, rule_code ASC", crawl.id)
  : [];
const findings = issues.map((issue) => ({
  rule_code: issue.rule_code,
  category: issue.category,
  severity: issue.severity,
  page_url: issue.page_url,
  detail: issue.detail ?? "",
}));
const crawlPages = crawl ? all("SELECT * FROM crawl_pages WHERE crawl_id = ?", crawl.id) : [];

// -- PageSpeed, ported from readStoredPageSpeed() in routes/websites.ts --
const psiRows = all(
  "SELECT * FROM metric_snapshots WHERE website_id = ? AND source = 'psi' ORDER BY captured_at DESC",
  website.id
);
let pageSpeed = null;
if (psiRows.length > 0) {
  const latest = psiRows[0].captured_at;
  const values = new Map(psiRows.filter((r) => r.captured_at === latest).map((r) => [r.metric_key, r.metric_value]));
  const pick = (key) => (values.has(key) ? values.get(key) : null);
  const vitals = (prefix) => ({
    lcp_ms: pick(`${prefix}_lcp_ms`),
    inp_ms: pick(`${prefix}_inp_ms`),
    cls: pick(`${prefix}_cls`),
    fcp_ms: pick(`${prefix}_fcp_ms`),
    ttfb_ms: pick(`${prefix}_ttfb_ms`),
  });
  const field = vitals("field");
  const hasField = Object.values(field).some((v) => v !== null);
  pageSpeed = {
    url: "",
    strategy: "mobile",
    performance_score: pick("performance_score"),
    lab: vitals("lab"),
    field: hasField ? field : null,
    field_source: hasField ? "url" : null,
    fetched_at: latest,
    from_cache: true,
  };
}

// -- diagnoses, ported from readDiagnoses() --
const diagnoses = all(
  "SELECT * FROM diagnoses WHERE website_id = ? ORDER BY priority_score DESC, created_at DESC",
  website.id
).map((row) => ({ ...row, evidence: JSON.parse(row.evidence) }));

// -- actions + results --
const actions = all("SELECT * FROM actions WHERE website_id = ? ORDER BY approved_at DESC", website.id);
const results = all(
  "SELECT r.* FROM action_results r JOIN actions a ON a.id = r.action_id WHERE a.website_id = ?",
  website.id
);
const resultByAction = new Map(results.map((r) => [r.action_id, r]));

// -- learning --
const learningRaw = all(
  `SELECT a.action_type AS action_type, COUNT(*) AS tried, COUNT(r.id) AS measured,
          COALESCE(SUM(r.success), 0) AS succeeded, AVG(r.delta_clicks) AS avg_delta_clicks
     FROM actions a LEFT JOIN action_results r ON r.action_id = a.id
    WHERE a.website_id = ?
    GROUP BY a.action_type ORDER BY tried DESC`,
  website.id
);

// -- content drafts --
const contentDrafts = all(
  `SELECT cd.*, a.title AS action_title FROM content_drafts cd
     JOIN actions a ON a.id = cd.action_id
    WHERE cd.website_id = ? ORDER BY cd.created_at DESC`,
  website.id
).map((row) => ({
  ...row,
  secondary_keywords: JSON.parse(row.secondary_keywords),
  outline: JSON.parse(row.outline),
}));

const model = {
  website,
  generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  crawlPages: crawl?.pages_crawled ?? 0,
  hasAudit: crawl !== null && issues.length > 0,
  score: auditScore(findings, countAnalysablePages(crawlPages)),
  issues,
  issuesByCategory: countByCategory(findings),
  pageSpeed,
  diagnoses,
  actions: actions.map((a) => ({ ...a, result: resultByAction.get(a.id) ?? null })),
  learning: learningRaw.map((row) => ({
    ...row,
    success_rate: row.measured > 0 ? row.succeeded / row.measured : null,
  })),
  learningIncludesDemoData: actions.some((a) => a.is_demo_seed === 1),
  contentDrafts,
};

writeFileSync(outPath, renderHtml(model));
console.log(`Wrote ${outPath} (hasAudit=${model.hasAudit}, issues=${issues.length}, diagnoses=${diagnoses.length})`);
