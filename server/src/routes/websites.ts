import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDb, saveDb } from "../db";
import { queryAll, queryOne, run } from "../db/helpers";
import { getAuthorizedClient, GoogleNotConnectedError } from "../lib/googleAuth";
import {
  getSearchConsoleData,
  getGa4Report,
  getSearchConsoleTotals,
  getSearchConsoleByPageQuery,
} from "../services/googleDataService";
import { startCrawl } from "../crawler/run";
import {
  runAudit,
  auditScore,
  countByCategory,
  countAnalysablePages,
  performanceFindings,
  siteStructureFindings,
  searchPerformanceFindings,
} from "../audit/rules";
import { fetchPageSpeed, effectiveVitals } from "../services/pageSpeedService";
import { diagnose, priorityScore } from "../services/diagnoseService";
import { renderMarkdown, renderHtml, type ReportModel } from "../services/reportService";
import { classifySearchConsoleData } from "../services/searchIntentService";
import { classifyContentPerformance } from "../services/contentPerformanceService";
import { technicalAlerts, trafficAlerts, combineAndSortAlerts } from "../services/alertService";
import { analyzeContentQuality } from "../services/contentQualityService";
import { evaluateGate, CRITICAL_ISSUE_SEVERITY } from "../services/preFlightGateService";
import { generateContentDraft } from "../services/contentService";
import { analyzeContentCoverage } from "../services/contentCoverageService";
import {
  compareAround,
  afterWindowIsComplete,
  latestUsableDate,
  shiftDays,
  toSnapshot,
  COMPARISON_WINDOW_DAYS,
} from "../services/measureService";
import type {
  Website,
  WebsiteGoogleProperties,
  Crawl,
  CrawlPage,
  CrawlLink,
  CrawlDetail,
  AuditIssue,
  AuditFinding,
  AuditSummary,
  Diagnosis,
  DiagnosisRow,
  ActionRow,
  ActionResultRow,
  ActionType,
  LearningRow,
  MetricSnapshot,
  CoreWebVitals,
  PageSpeedSummary,
  CrawlSitemapUrl,
  SearchConsolePageSummary,
  Alert,
  AlertSummary,
  ContentDraftRow,
  ContentDraft,
  ContentDraftEdit,
  ReviewDecision,
  KeywordDecisionRow,
  KeywordDecisionValue,
} from "../types";

const router = Router();
const validSiteTypes = ["store", "services", "blog"];

// GET /api/websites/:id
router.get("/:id", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }
  res.json(website);
});

// PUT /api/websites/:id — update a website
router.put("/:id", async (req, res) => {
  const db = await getDb();
  const existing = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!existing) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const { url, site_type, country, language, goal, niche, target_audience, cms } = req.body ?? {};
  if (site_type && !validSiteTypes.includes(site_type)) {
    res.status(400).json({ error: "site_type must be one of store/services/blog" });
    return;
  }

  run(
    db,
    `UPDATE websites
        SET url = ?, site_type = ?, country = ?, language = ?, goal = ?,
            niche = ?, target_audience = ?, cms = ?
      WHERE id = ?`,
    [
      url ?? existing.url,
      site_type ?? existing.site_type,
      country ?? existing.country,
      language ?? existing.language,
      goal ?? existing.goal,
      niche ?? existing.niche,
      target_audience ?? existing.target_audience,
      cms ?? existing.cms,
      req.params.id,
    ]
  );
  saveDb();

  const updated = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  res.json(updated);
});

// DELETE /api/websites/:id
router.delete("/:id", async (req, res) => {
  const db = await getDb();
  const existing = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!existing) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  run(db, "DELETE FROM websites WHERE id = ?", [req.params.id]);
  saveDb();
  res.status(204).send();
});

// GET /api/websites/:id/google — this website's mapped GSC/GA4 properties
router.get("/:id/google", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const mapping = queryOne<WebsiteGoogleProperties>(
    db,
    "SELECT website_id, gsc_site_url, ga4_property_id, updated_at FROM website_google_properties WHERE website_id = ?",
    [req.params.id]
  );
  res.json(mapping ?? { website_id: req.params.id, gsc_site_url: null, ga4_property_id: null, updated_at: null });
});

// PUT /api/websites/:id/google — save which GSC site / GA4 property this website maps to
router.put("/:id/google", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const { gsc_site_url, ga4_property_id } = req.body ?? {};
  run(
    db,
    `INSERT INTO website_google_properties (website_id, gsc_site_url, ga4_property_id)
     VALUES (?, ?, ?)
     ON CONFLICT(website_id) DO UPDATE SET
       gsc_site_url = excluded.gsc_site_url,
       ga4_property_id = excluded.ga4_property_id,
       updated_at = datetime('now')`,
    [req.params.id, gsc_site_url ?? null, ga4_property_id ?? null]
  );
  saveDb();

  const updated = queryOne<WebsiteGoogleProperties>(
    db,
    "SELECT website_id, gsc_site_url, ga4_property_id, updated_at FROM website_google_properties WHERE website_id = ?",
    [req.params.id]
  );
  res.json(updated);
});

// GET /api/websites/:id/google/data — pull GSC + GA4 data for this website's mapped properties
router.get("/:id/google/data", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const mapping = queryOne<WebsiteGoogleProperties>(
    db,
    "SELECT website_id, gsc_site_url, ga4_property_id, updated_at FROM website_google_properties WHERE website_id = ?",
    [req.params.id]
  );
  if (!mapping || (!mapping.gsc_site_url && !mapping.ga4_property_id)) {
    res.status(400).json({ error: "No Google property mapped for this website yet" });
    return;
  }

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const auth = getAuthorizedClient(db);
    const [searchConsole, ga4] = await Promise.all([
      mapping.gsc_site_url ? getSearchConsoleData(auth, mapping.gsc_site_url, startDate, endDate) : Promise.resolve(null),
      mapping.ga4_property_id ? getGa4Report(auth, mapping.ga4_property_id, startDate, endDate) : Promise.resolve(null),
    ]);
    res.json({ searchConsole, ga4 });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Failed to load Google data for website", req.params.id, err);
    res.status(502).json({ error: "Failed to load data from Google" });
  }
});

// POST /api/websites/:id/crawls — start a crawl (409 if one's already running)
router.post("/:id/crawls", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const runningCrawl = queryOne<Crawl>(db, "SELECT * FROM crawls WHERE website_id = ? AND status = 'running'", [
    req.params.id,
  ]);
  if (runningCrawl) {
    res.status(409).json({ error: "A crawl is already running for this website", crawl: runningCrawl });
    return;
  }

  const id = uuid();
  run(db, "INSERT INTO crawls (id, website_id, status) VALUES (?, ?, 'running')", [id, req.params.id]);
  saveDb();

  startCrawl(id, website.url, db);

  res.status(202).json({ id, status: "running" });
});

// GET /api/websites/:id/crawls — crawl history, newest first
router.get("/:id/crawls", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const crawls = queryAll<Crawl>(db, "SELECT * FROM crawls WHERE website_id = ? ORDER BY started_at DESC", [
    req.params.id,
  ]);
  res.json(crawls);
});

// GET /api/websites/:id/crawls/:crawlId — one crawl's full detail
router.get("/:id/crawls/:crawlId", async (req, res) => {
  const db = await getDb();
  const crawl = queryOne<Crawl>(db, "SELECT * FROM crawls WHERE id = ? AND website_id = ?", [
    req.params.crawlId,
    req.params.id,
  ]);
  if (!crawl) {
    res.status(404).json({ error: "Crawl not found" });
    return;
  }

  const pages = queryAll<CrawlPage>(db, "SELECT * FROM crawl_pages WHERE crawl_id = ? ORDER BY crawled_at ASC", [
    req.params.crawlId,
  ]);
  const links = queryAll<CrawlLink>(db, "SELECT * FROM crawl_links WHERE crawl_id = ? ORDER BY checked_at ASC", [
    req.params.crawlId,
  ]);

  const detail: CrawlDetail = { ...crawl, pages, links };
  res.json(detail);
});

// ---------------------------------------------------------------------------
// The loop: Analysis -> Diagnosis -> Decision -> Action -> Measurement -> Learning
// ---------------------------------------------------------------------------

function latestCompletedCrawl(db: Awaited<ReturnType<typeof getDb>>, websiteId: string): Crawl | null {
  return queryOne<Crawl>(
    db,
    "SELECT * FROM crawls WHERE website_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1",
    [websiteId]
  );
}

/** The last two completed crawls, newest first — [null, null] if fewer than one exists. */
function lastTwoCompletedCrawls(db: Awaited<ReturnType<typeof getDb>>, websiteId: string): [Crawl | null, Crawl | null] {
  const rows = queryAll<Crawl>(
    db,
    "SELECT * FROM crawls WHERE website_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 2",
    [websiteId]
  );
  return [rows[0] ?? null, rows[1] ?? null];
}

function gscSiteUrlFor(db: Awaited<ReturnType<typeof getDb>>, websiteId: string): string | null {
  const mapping = queryOne<WebsiteGoogleProperties>(
    db,
    "SELECT gsc_site_url FROM website_google_properties WHERE website_id = ?",
    [websiteId]
  );
  return mapping?.gsc_site_url ?? null;
}

function issuesToFindings(issues: AuditIssue[]): AuditFinding[] {
  return issues.map((issue) => ({
    rule_code: issue.rule_code,
    category: issue.category,
    severity: issue.severity,
    page_url: issue.page_url,
    detail: issue.detail ?? "",
  }));
}

// POST /api/websites/:id/audit — run the rules engine over the latest completed crawl
router.post("/:id/audit", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const crawl = latestCompletedCrawl(db, req.params.id);
  if (!crawl) {
    res.status(400).json({ error: "No completed crawl for this website yet — run a crawl first" });
    return;
  }

  const pages = queryAll<CrawlPage>(db, "SELECT * FROM crawl_pages WHERE crawl_id = ?", [crawl.id]);
  const links = queryAll<CrawlLink>(db, "SELECT * FROM crawl_links WHERE crawl_id = ?", [crawl.id]);

  const sitemapUrls = queryAll<CrawlSitemapUrl>(db, "SELECT * FROM crawl_sitemap_urls WHERE crawl_id = ?", [
    crawl.id,
  ]).map((row) => row.url);

  const findings = [
    ...runAudit(pages, links),
    ...siteStructureFindings(crawl, pages, links, sitemapUrls),
  ];

  // Joining the crawl to Search Console is what turns "this page has no title" into
  // "this page has no title and 4,000 impressions". One fast call — but the audit is
  // still useful without it, so a failure here degrades rather than fails the request.
  const gscSiteUrl = gscSiteUrlFor(db, req.params.id);
  if (gscSiteUrl) {
    try {
      const auth = getAuthorizedClient(db);
      const byPage = await getSearchConsoleByPageQuery(
        auth,
        gscSiteUrl,
        shiftDays(latestUsableDate(), -27),
        latestUsableDate()
      );
      findings.push(...searchPerformanceFindings(byPage));
    } catch (err) {
      console.warn("Audit proceeding without Search Console data:", (err as Error).message);
    }
  }

  const pagesAnalysed = countAnalysablePages(pages);

  // Re-running an audit replaces the previous one for that crawl rather than stacking.
  // Performance rows are excluded: they come from PageSpeed, not the crawl, and are
  // owned by POST /:id/pagespeed — wiping them here would silently drop them.
  run(db, "DELETE FROM audit_issues WHERE crawl_id = ? AND category != 'performance'", [crawl.id]);
  for (const finding of findings) {
    run(
      db,
      `INSERT INTO audit_issues (id, website_id, crawl_id, rule_code, category, severity, page_url, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), req.params.id, crawl.id, finding.rule_code, finding.category, finding.severity, finding.page_url, finding.detail]
    );
  }
  saveDb();

  const summary: AuditSummary = {
    crawl_id: crawl.id,
    score: auditScore(findings, pagesAnalysed),
    pages_analysed: pagesAnalysed,
    issues_by_category: countByCategory(findings),
    issues: queryAll<AuditIssue>(
      db,
      "SELECT * FROM audit_issues WHERE crawl_id = ? ORDER BY severity DESC, rule_code ASC",
      [crawl.id]
    ),
  };
  res.json(summary);
});

// GET /api/websites/:id/audit — the stored audit for the latest completed crawl
router.get("/:id/audit", async (req, res) => {
  const db = await getDb();
  const crawl = latestCompletedCrawl(db, req.params.id);
  if (!crawl) {
    res.status(404).json({ error: "No completed crawl for this website yet" });
    return;
  }

  const issues = queryAll<AuditIssue>(
    db,
    "SELECT * FROM audit_issues WHERE crawl_id = ? ORDER BY severity DESC, rule_code ASC",
    [crawl.id]
  );
  if (issues.length === 0) {
    res.status(404).json({ error: "No audit has been run for the latest crawl yet" });
    return;
  }

  const pagesAnalysed = countAnalysablePages(
    queryAll<CrawlPage>(db, "SELECT * FROM crawl_pages WHERE crawl_id = ?", [crawl.id])
  );
  const findings = issuesToFindings(issues);

  const summary: AuditSummary = {
    crawl_id: crawl.id,
    score: auditScore(findings, pagesAnalysed),
    pages_analysed: pagesAnalysed,
    issues_by_category: countByCategory(findings),
    issues,
  };
  res.json(summary);
});

const PSI_FIELD_WINDOW_DAYS = 28;

/** Flattens a summary into metric_snapshots rows. Lab and field are prefixed so the
 *  two never collide — they measure the same vital by very different means. */
function persistPageSpeed(
  db: Awaited<ReturnType<typeof getDb>>,
  websiteId: string,
  summary: PageSpeedSummary
): void {
  const captureDate = summary.fetched_at.slice(0, 10);
  const fieldStart = shiftDays(captureDate, -(PSI_FIELD_WINDOW_DAYS - 1));

  const entries: { key: string; value: number; start: string; end: string }[] = [];
  const push = (key: string, value: number | null, start: string, end: string) => {
    if (value !== null) entries.push({ key, value, start, end });
  };

  push("performance_score", summary.performance_score, captureDate, captureDate);
  for (const [vital, value] of Object.entries(summary.lab)) {
    push(`lab_${vital}`, value, captureDate, captureDate);
  }
  if (summary.field) {
    // CrUX reports a rolling 28-day window, not a point in time.
    for (const [vital, value] of Object.entries(summary.field)) {
      push(`field_${vital}`, value, fieldStart, captureDate);
    }
  }

  for (const entry of entries) {
    run(
      db,
      `INSERT INTO metric_snapshots (id, website_id, source, metric_key, metric_value, period_start, period_end)
       VALUES (?, ?, 'psi', ?, ?, ?, ?)`,
      [uuid(), websiteId, entry.key, entry.value, entry.start, entry.end]
    );
  }
}

/** Rebuilds the most recent summary from metric_snapshots so a page reload doesn't
 *  force another 30-second PageSpeed run mid-demo. */
function readStoredPageSpeed(
  db: Awaited<ReturnType<typeof getDb>>,
  websiteId: string
): (PageSpeedSummary & { from_cache: true }) | null {
  const rows = queryAll<MetricSnapshot>(
    db,
    "SELECT * FROM metric_snapshots WHERE website_id = ? AND source = 'psi' ORDER BY captured_at DESC",
    [websiteId]
  );
  if (rows.length === 0) return null;

  const latest = rows[0].captured_at;
  const values = new Map(rows.filter((row) => row.captured_at === latest).map((row) => [row.metric_key, row.metric_value]));
  const pick = (key: string): number | null => (values.has(key) ? (values.get(key) as number) : null);
  const vitals = (prefix: string): CoreWebVitals => ({
    lcp_ms: pick(`${prefix}_lcp_ms`),
    inp_ms: pick(`${prefix}_inp_ms`),
    cls: pick(`${prefix}_cls`),
    fcp_ms: pick(`${prefix}_fcp_ms`),
    ttfb_ms: pick(`${prefix}_ttfb_ms`),
  });

  const field = vitals("field");
  const hasField = Object.values(field).some((value) => value !== null);

  return {
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

// POST /api/websites/:id/pagespeed — measure Core Web Vitals, store them, and fold
// the results into the current audit as performance issues
router.post("/:id/pagespeed", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const target = typeof req.body?.url === "string" && req.body.url ? req.body.url : website.url;

  try {
    const summary = await fetchPageSpeed(target, req.body?.strategy === "desktop" ? "desktop" : "mobile");
    persistPageSpeed(db, req.params.id, summary);

    // Fold into the latest crawl's audit so one score covers technical + performance.
    const crawl = latestCompletedCrawl(db, req.params.id);
    let foldedIntoAudit = false;
    if (crawl) {
      const findings = performanceFindings(
        effectiveVitals(summary),
        summary.performance_score,
        target,
        summary.field ? "field" : "lab"
      );
      run(db, "DELETE FROM audit_issues WHERE crawl_id = ? AND category = 'performance'", [crawl.id]);
      for (const finding of findings) {
        run(
          db,
          `INSERT INTO audit_issues (id, website_id, crawl_id, rule_code, category, severity, page_url, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), req.params.id, crawl.id, finding.rule_code, finding.category, finding.severity, finding.page_url, finding.detail]
        );
      }
      foldedIntoAudit = true;
    }

    saveDb();
    res.json({ ...summary, folded_into_audit: foldedIntoAudit });
  } catch (err) {
    console.error("PageSpeed failed for website", req.params.id, err);
    res.status(502).json({ error: (err as Error).message });
  }
});

// GET /api/websites/:id/pagespeed — the last stored measurement
router.get("/:id/pagespeed", async (req, res) => {
  const db = await getDb();
  const stored = readStoredPageSpeed(db, req.params.id);
  if (!stored) {
    res.status(404).json({ error: "No PageSpeed measurement stored for this website yet" });
    return;
  }
  res.json(stored);
});

// POST /api/websites/:id/diagnose — send the audit to the model, store structured diagnoses
router.post("/:id/diagnose", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const crawl = latestCompletedCrawl(db, req.params.id);
  if (!crawl) {
    res.status(400).json({ error: "No completed crawl for this website yet" });
    return;
  }

  const issues = queryAll<AuditIssue>(db, "SELECT * FROM audit_issues WHERE crawl_id = ?", [crawl.id]);
  if (issues.length === 0) {
    res.status(400).json({ error: "Run the audit before diagnosing" });
    return;
  }

  const findings = issuesToFindings(issues);
  const pagesAnalysed = countAnalysablePages(
    queryAll<CrawlPage>(db, "SELECT * FROM crawl_pages WHERE crawl_id = ?", [crawl.id])
  );

  let searchConsole: SearchConsolePageSummary | null = null;
  const gscSiteUrl = gscSiteUrlFor(db, req.params.id);
  if (gscSiteUrl) {
    try {
      const auth = getAuthorizedClient(db);
      searchConsole = await getSearchConsoleByPageQuery(
        auth,
        gscSiteUrl,
        shiftDays(latestUsableDate(), -27),
        latestUsableDate()
      );
    } catch (err) {
      // Diagnosing on crawl data alone is degraded but still useful — don't fail the request.
      console.warn("Diagnosis proceeding without Search Console data:", (err as Error).message);
    }
  }

  try {
    const { drafts, model } = await diagnose({
      site: website,
      pagesAnalysed,
      score: auditScore(findings, pagesAnalysed),
      findings,
      searchConsole,
    });

    run(db, "DELETE FROM diagnoses WHERE website_id = ? AND crawl_id = ?", [req.params.id, crawl.id]);
    for (const draft of drafts) {
      run(
        db,
        `INSERT INTO diagnoses
          (id, website_id, crawl_id, problem, evidence, root_cause, severity, business_impact,
           effort, confidence, priority_score, action_type, recommended_action, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          req.params.id,
          crawl.id,
          draft.problem,
          JSON.stringify(draft.evidence),
          draft.root_cause,
          draft.severity,
          draft.business_impact,
          draft.effort,
          draft.confidence,
          priorityScore(draft),
          draft.action_type,
          draft.recommended_action,
          model,
        ]
      );
    }
    saveDb();

    res.json({ stale: false, diagnoses: readDiagnoses(db, req.params.id) });
  } catch (err) {
    // Free tiers rate-limit. Rather than show an empty screen mid-demo, fall back to
    // the last diagnoses we stored for this site and say plainly that they are stale.
    const cached = readDiagnoses(db, req.params.id);
    if (cached.length > 0) {
      console.warn("Diagnosis failed, serving cached diagnoses:", (err as Error).message);
      res.json({ stale: true, reason: (err as Error).message, diagnoses: cached });
      return;
    }
    console.error("Diagnosis failed with no cached fallback", err);
    res.status(502).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Stage 7 (minimum viable): brief + title + outline + draft, one per approved action
// ---------------------------------------------------------------------------

function readContentDraft(db: Awaited<ReturnType<typeof getDb>>, actionId: string): ContentDraft | null {
  const row = queryOne<ContentDraftRow>(db, "SELECT * FROM content_drafts WHERE action_id = ?", [actionId]);
  if (!row) return null;
  return {
    ...row,
    secondary_keywords: JSON.parse(row.secondary_keywords) as string[],
    outline: JSON.parse(row.outline) as ContentDraft["outline"],
  };
}

// POST /api/websites/:id/actions/:actionId/content — generate (or regenerate) a draft
router.post("/:id/actions/:actionId/content", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const action = queryOne<ActionRow>(db, "SELECT * FROM actions WHERE id = ? AND website_id = ?", [
    req.params.actionId,
    req.params.id,
  ]);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }

  const diagnosis = action.diagnosis_id
    ? queryOne<DiagnosisRow>(db, "SELECT * FROM diagnoses WHERE id = ?", [action.diagnosis_id])
    : null;

  try {
    const { draft, model } = await generateContentDraft({
      site: website,
      actionType: action.action_type,
      actionTitle: action.title,
      diagnosisContext: diagnosis
        ? { problem: diagnosis.problem, rootCause: diagnosis.root_cause, evidence: JSON.parse(diagnosis.evidence) }
        : null,
    });

    const id = uuid();
    run(db, "DELETE FROM content_drafts WHERE action_id = ?", [action.id]);
    run(
      db,
      `INSERT INTO content_drafts
        (id, action_id, website_id, primary_keyword, secondary_keywords, content_type,
         seo_title, meta_description, url_slug, outline, body_markdown, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        action.id,
        req.params.id,
        draft.primary_keyword,
        JSON.stringify(draft.secondary_keywords),
        draft.content_type,
        draft.seo_title,
        draft.meta_description,
        draft.url_slug,
        JSON.stringify(draft.outline),
        draft.body_markdown,
        model,
      ]
    );
    saveDb();

    res.json({ stale: false, draft: readContentDraft(db, action.id) });
  } catch (err) {
    const cached = readContentDraft(db, action.id);
    if (cached) {
      console.warn("Content generation failed, serving cached draft:", (err as Error).message);
      res.json({ stale: true, reason: (err as Error).message, draft: cached });
      return;
    }
    console.error("Content generation failed with no cached fallback", err);
    res.status(502).json({ error: (err as Error).message });
  }
});

// PATCH /api/websites/:id/actions/:actionId/content — S7-1: edit the draft in place.
// Only the fields a human can change; ids/model/timestamps stay server-owned. Marks
// is_edited so a later "Regenerate" can warn before it silently overwrites a human edit.
router.patch("/:id/actions/:actionId/content", async (req, res) => {
  const db = await getDb();
  const existing = queryOne<ContentDraftRow>(db, "SELECT * FROM content_drafts WHERE action_id = ?", [
    req.params.actionId,
  ]);
  if (!existing) {
    res.status(404).json({ error: "No content draft generated for this action yet" });
    return;
  }

  const edit = (req.body ?? {}) as ContentDraftEdit;
  const secondaryKeywords = edit.secondary_keywords ?? (JSON.parse(existing.secondary_keywords) as string[]);
  const outline = edit.outline ?? (JSON.parse(existing.outline) as ContentDraft["outline"]);

  // S7-1: snapshot the version being replaced before overwriting it — "الحفظ لا يفقد
  // المراجعة السابقة (نسخة محفوظة)". Only the fields a human can edit are worth
  // keeping; a re-generation is a different mechanism (DELETE+INSERT) and has its own
  // "did you mean to lose your edits" guard client-side (the regenerate warning).
  run(
    db,
    `INSERT INTO content_draft_versions
      (id, draft_id, action_id, version, primary_keyword, secondary_keywords, seo_title,
       meta_description, url_slug, outline, body_markdown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      existing.id,
      req.params.actionId,
      existing.version,
      existing.primary_keyword,
      existing.secondary_keywords,
      existing.seo_title,
      existing.meta_description,
      existing.url_slug,
      existing.outline,
      existing.body_markdown,
    ]
  );

  run(
    db,
    `UPDATE content_drafts
        SET primary_keyword = ?, secondary_keywords = ?, seo_title = ?, meta_description = ?,
            url_slug = ?, outline = ?, body_markdown = ?, is_edited = 1, edited_at = datetime('now'),
            version = version + 1, review_status = 'pending', review_reason = NULL, reviewed_at = NULL
      WHERE action_id = ?`,
    [
      edit.primary_keyword ?? existing.primary_keyword,
      JSON.stringify(secondaryKeywords),
      edit.seo_title ?? existing.seo_title,
      edit.meta_description ?? existing.meta_description,
      edit.url_slug ?? existing.url_slug,
      JSON.stringify(outline),
      edit.body_markdown ?? existing.body_markdown,
      req.params.actionId,
    ]
  );
  saveDb();

  res.json(readContentDraft(db, req.params.actionId));
});

// PATCH /api/websites/:id/actions/:actionId/content/review — S8-3: the human decision
// after the pre-publish gate's PASS/FAIL. Content is never "ready" before this is
// 'approved' — a FAIL can still be approved deliberately (e.g. an excluded check), and
// a PASS can still be rejected (the gate cannot catch everything).
router.patch("/:id/actions/:actionId/content/review", async (req, res) => {
  const db = await getDb();
  const existing = queryOne<ContentDraftRow>(db, "SELECT * FROM content_drafts WHERE action_id = ?", [
    req.params.actionId,
  ]);
  if (!existing) {
    res.status(404).json({ error: "No content draft generated for this action yet" });
    return;
  }

  const { decision, reason } = (req.body ?? {}) as { decision?: ReviewDecision; reason?: string };
  if (decision !== "approved" && decision !== "rejected") {
    res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
    return;
  }
  if (decision === "rejected" && (typeof reason !== "string" || !reason.trim())) {
    res.status(400).json({ error: "reason is required to reject a draft" });
    return;
  }

  run(db, "UPDATE content_drafts SET review_status = ?, review_reason = ?, reviewed_at = datetime('now') WHERE action_id = ?", [
    decision,
    decision === "rejected" ? (reason as string).trim() : null,
    req.params.actionId,
  ]);
  saveDb();

  res.json(readContentDraft(db, req.params.actionId));
});

// GET /api/websites/:id/actions/:actionId/content/coverage — Module 16: does the
// stored draft actually cover the keywords and outline it was briefed with.
// Deterministic, computed fresh from the stored draft — nothing new is persisted.
router.get("/:id/actions/:actionId/content/coverage", async (req, res) => {
  const db = await getDb();
  const draft = readContentDraft(db, req.params.actionId);
  if (!draft) {
    res.status(404).json({ error: "No content draft generated for this action yet" });
    return;
  }

  res.json(
    analyzeContentCoverage({
      primaryKeyword: draft.primary_keyword,
      secondaryKeywords: draft.secondary_keywords,
      contentType: draft.content_type,
      outline: draft.outline,
      bodyMarkdown: draft.body_markdown,
    })
  );
});

// GET /api/websites/:id/actions/:actionId/content — the stored draft, if any
router.get("/:id/actions/:actionId/content", async (req, res) => {
  const db = await getDb();
  const draft = readContentDraft(db, req.params.actionId);
  if (!draft) {
    res.status(404).json({ error: "No content draft generated for this action yet" });
    return;
  }
  res.json(draft);
});

function readDiagnoses(db: Awaited<ReturnType<typeof getDb>>, websiteId: string): Diagnosis[] {
  const rows = queryAll<DiagnosisRow>(
    db,
    "SELECT * FROM diagnoses WHERE website_id = ? ORDER BY priority_score DESC, created_at DESC",
    [websiteId]
  );
  return rows.map((row) => ({ ...row, evidence: JSON.parse(row.evidence) as string[] }));
}

// GET /api/websites/:id/diagnoses — the Action Center feed, highest priority first
router.get("/:id/diagnoses", async (req, res) => {
  const db = await getDb();
  res.json(readDiagnoses(db, req.params.id));
});

// POST /api/websites/:id/diagnoses/:diagnosisId/dismiss — S4-2/S9-5: reject a
// diagnosis/opportunity from the Decision screen without it ever becoming an action.
// Stored with a reason — this *is* the human-review record the spec asks for.
router.post("/:id/diagnoses/:diagnosisId/dismiss", async (req, res) => {
  const db = await getDb();
  const diagnosis = queryOne<DiagnosisRow>(db, "SELECT * FROM diagnoses WHERE id = ? AND website_id = ?", [
    req.params.diagnosisId,
    req.params.id,
  ]);
  if (!diagnosis) {
    res.status(404).json({ error: "Diagnosis not found" });
    return;
  }

  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "reason is required" });
    return;
  }

  run(db, "UPDATE diagnoses SET dismissed = 1, dismissed_reason = ? WHERE id = ?", [reason.trim(), diagnosis.id]);
  saveDb();
  res.json(readDiagnoses(db, req.params.id).find((d) => d.id === diagnosis.id));
});

// DELETE /api/websites/:id/diagnoses/:diagnosisId/dismiss — undo a dismiss (the
// "dismissed" filter needs a way back for a specialist who changes their mind).
router.delete("/:id/diagnoses/:diagnosisId/dismiss", async (req, res) => {
  const db = await getDb();
  const diagnosis = queryOne<DiagnosisRow>(db, "SELECT * FROM diagnoses WHERE id = ? AND website_id = ?", [
    req.params.diagnosisId,
    req.params.id,
  ]);
  if (!diagnosis) {
    res.status(404).json({ error: "Diagnosis not found" });
    return;
  }

  run(db, "UPDATE diagnoses SET dismissed = 0, dismissed_reason = NULL WHERE id = ?", [diagnosis.id]);
  saveDb();
  res.json(readDiagnoses(db, req.params.id).find((d) => d.id === diagnosis.id));
});

// POST /api/websites/:id/actions — approve a diagnosis; snapshots "before" at this moment
router.post("/:id/actions", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const { diagnosis_id } = req.body ?? {};
  const diagnosis = queryOne<DiagnosisRow>(db, "SELECT * FROM diagnoses WHERE id = ? AND website_id = ?", [
    diagnosis_id ?? "",
    req.params.id,
  ]);
  if (!diagnosis) {
    res.status(400).json({ error: "diagnosis_id must reference a diagnosis for this website" });
    return;
  }

  // The snapshot is the whole point of this endpoint: without a "before", nothing
  // downstream can ever say whether the action worked.
  let beforeMetrics: string | null = null;
  const gscSiteUrl = gscSiteUrlFor(db, req.params.id);
  if (gscSiteUrl) {
    try {
      const auth = getAuthorizedClient(db);
      const end = latestUsableDate();
      const start = shiftDays(end, -(COMPARISON_WINDOW_DAYS - 1));
      const totals = await getSearchConsoleTotals(auth, gscSiteUrl, start, end);
      beforeMetrics = JSON.stringify(toSnapshot({ start, end, totals }));
    } catch (err) {
      console.warn("Could not snapshot before-metrics:", (err as Error).message);
    }
  }

  const id = uuid();
  run(
    db,
    `INSERT INTO actions (id, website_id, diagnosis_id, action_type, title, before_metrics)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, diagnosis.id, diagnosis.action_type, diagnosis.recommended_action, beforeMetrics]
  );
  saveDb();

  res.status(201).json(queryOne<ActionRow>(db, "SELECT * FROM actions WHERE id = ?", [id]));
});

// GET /api/websites/:id/actions — approved actions with their measured results
router.get("/:id/actions", async (req, res) => {
  const db = await getDb();
  const actions = queryAll<ActionRow>(
    db,
    "SELECT * FROM actions WHERE website_id = ? ORDER BY approved_at DESC",
    [req.params.id]
  );
  const results = queryAll<ActionResultRow>(
    db,
    "SELECT r.* FROM action_results r JOIN actions a ON a.id = r.action_id WHERE a.website_id = ?",
    [req.params.id]
  );
  const byAction = new Map(results.map((result) => [result.action_id, result]));

  res.json(actions.map((action) => ({ ...action, result: byAction.get(action.id) ?? null })));
});

// GET /api/websites/:id/measure?date=YYYY-MM-DD — 28 days before vs 28 days after a pivot
router.get("/:id/measure", async (req, res) => {
  const db = await getDb();
  const gscSiteUrl = gscSiteUrlFor(db, req.params.id);
  if (!gscSiteUrl) {
    res.status(400).json({ error: "This website has no Search Console property mapped" });
    return;
  }

  const pivot = typeof req.query.date === "string" ? req.query.date : shiftDays(latestUsableDate(), -COMPARISON_WINDOW_DAYS);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pivot)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  try {
    const auth = getAuthorizedClient(db);
    const comparison = await compareAround(auth, gscSiteUrl, pivot);
    res.json({ ...comparison, after_window_complete: afterWindowIsComplete(pivot) });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Measurement failed for website", req.params.id, err);
    res.status(502).json({ error: "Failed to load comparison data from Google" });
  }
});

// POST /api/websites/:id/actions/:actionId/measure — record what this action actually did
router.post("/:id/actions/:actionId/measure", async (req, res) => {
  const db = await getDb();
  const action = queryOne<ActionRow>(db, "SELECT * FROM actions WHERE id = ? AND website_id = ?", [
    req.params.actionId,
    req.params.id,
  ]);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }

  const gscSiteUrl = gscSiteUrlFor(db, req.params.id);
  if (!gscSiteUrl) {
    res.status(400).json({ error: "This website has no Search Console property mapped" });
    return;
  }

  // Default pivot is the day the action was approved; ?date= overrides it so a site
  // with history can be measured immediately instead of after a 28-day wait.
  const override = typeof req.body?.date === "string" ? req.body.date : null;
  const pivot = override ?? action.approved_at.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pivot)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  if (!afterWindowIsComplete(pivot)) {
    res.status(400).json({
      error: `The ${COMPARISON_WINDOW_DAYS}-day window after ${pivot} has not finished yet — pass an earlier date to measure now`,
    });
    return;
  }

  try {
    const auth = getAuthorizedClient(db);
    const comparison = await compareAround(auth, gscSiteUrl, pivot);

    run(db, "DELETE FROM action_results WHERE action_id = ?", [action.id]);
    run(
      db,
      `INSERT INTO action_results
        (id, action_id, after_metrics, delta_clicks, delta_impressions, delta_ctr, delta_position, success)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        action.id,
        JSON.stringify(toSnapshot(comparison.after)),
        comparison.delta_clicks,
        comparison.delta_impressions,
        comparison.delta_ctr,
        comparison.delta_position,
        comparison.success ? 1 : 0,
      ]
    );
    run(db, "UPDATE actions SET status = 'done' WHERE id = ?", [action.id]);
    saveDb();

    res.json({ action_id: action.id, comparison });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Failed to measure action", action.id, err);
    res.status(502).json({ error: "Failed to load comparison data from Google" });
  }
});

// GET /api/websites/:id/learning?scope=all — which action types actually work.
// Pure arithmetic over recorded outcomes; no model involved.
router.get("/:id/learning", async (req, res) => {
  const db = await getDb();
  const global = req.query.scope === "all";

  const rows = queryAll<{
    action_type: ActionType;
    tried: number;
    measured: number;
    succeeded: number;
    avg_delta_clicks: number | null;
  }>(
    db,
    `SELECT a.action_type AS action_type,
            COUNT(*) AS tried,
            COUNT(r.id) AS measured,
            COALESCE(SUM(r.success), 0) AS succeeded,
            AVG(r.delta_clicks) AS avg_delta_clicks
       FROM actions a
       LEFT JOIN action_results r ON r.action_id = a.id
      ${global ? "" : "WHERE a.website_id = ?"}
      GROUP BY a.action_type
      ORDER BY tried DESC`,
    global ? [] : [req.params.id]
  );

  const learning: LearningRow[] = rows.map((row) => ({
    ...row,
    success_rate: row.measured > 0 ? row.succeeded / row.measured : null,
  }));

  const seeded = queryOne<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM actions ${global ? "WHERE is_demo_seed = 1" : "WHERE website_id = ? AND is_demo_seed = 1"}`,
    global ? [] : [req.params.id]
  );

  res.json({ scope: global ? "all" : "website", includes_demo_data: (seeded?.n ?? 0) > 0, rows: learning });
});

// GET /api/websites/:id/search-intent — Module 5: classify each (page, query) pair
// from Search Console by search intent. Deterministic, no model call.
router.get("/:id/search-intent", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const gscSiteUrl = gscSiteUrlFor(db, req.params.id);
  if (!gscSiteUrl) {
    res.status(400).json({ error: "This website has no Search Console property mapped" });
    return;
  }

  try {
    const auth = getAuthorizedClient(db);
    const byPage = await getSearchConsoleByPageQuery(
      auth,
      gscSiteUrl,
      shiftDays(latestUsableDate(), -27),
      latestUsableDate()
    );
    // No stored locality list yet, so only explicit signals (near me, address, hours)
    // register as local — see the limitation documented in searchIntentService.ts.
    res.json(classifySearchConsoleData(byPage));
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Search intent classification failed for website", req.params.id, err);
    res.status(502).json({ error: "Failed to load Search Console data" });
  }
});

// GET /api/websites/:id/keyword-decisions — S5-3: every (page, query) decision
// recorded for this website so far.
router.get("/:id/keyword-decisions", async (req, res) => {
  const db = await getDb();
  const rows = queryAll<KeywordDecisionRow>(
    db,
    "SELECT * FROM keyword_decisions WHERE website_id = ? ORDER BY updated_at DESC",
    [req.params.id]
  );
  res.json(rows);
});

// PUT /api/websites/:id/keyword-decisions — S5-3: set (or clear, with decision null)
// the decision for one (page, query) pair. Upsert on the (website_id, page, query) key.
router.put("/:id/keyword-decisions", async (req, res) => {
  const db = await getDb();
  const { page, query, decision, note } = (req.body ?? {}) as {
    page?: string;
    query?: string;
    decision?: KeywordDecisionValue | null;
    note?: string | null;
  };
  if (typeof page !== "string" || !page || typeof query !== "string" || !query) {
    res.status(400).json({ error: "page and query are required" });
    return;
  }
  const validDecisions: KeywordDecisionValue[] = ["target_new", "improve_existing", "ignore"];
  if (!decision || !validDecisions.includes(decision)) {
    res.status(400).json({ error: "decision must be one of target_new/improve_existing/ignore" });
    return;
  }

  run(
    db,
    `INSERT INTO keyword_decisions (id, website_id, page, query, decision, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(website_id, page, query) DO UPDATE SET
       decision = excluded.decision, note = excluded.note, updated_at = datetime('now')`,
    [uuid(), req.params.id, page, query, decision, note ?? null]
  );
  saveDb();

  const row = queryOne<KeywordDecisionRow>(
    db,
    "SELECT * FROM keyword_decisions WHERE website_id = ? AND page = ? AND query = ?",
    [req.params.id, page, query]
  );
  res.json(row);
});

// GET /api/websites/:id/content-performance — Module 29: classify every page as
// performing / underperforming / decaying by comparing two consecutive 28-day
// Search Console windows live. Deterministic, no model call, no stored history needed.
router.get("/:id/content-performance", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const gscSiteUrl = gscSiteUrlFor(db, req.params.id);
  if (!gscSiteUrl) {
    res.status(400).json({ error: "This website has no Search Console property mapped" });
    return;
  }

  const currentEnd = latestUsableDate();
  const currentStart = shiftDays(currentEnd, -(COMPARISON_WINDOW_DAYS - 1));
  const previousEnd = shiftDays(currentStart, -1);
  const previousStart = shiftDays(previousEnd, -(COMPARISON_WINDOW_DAYS - 1));

  try {
    const auth = getAuthorizedClient(db);
    const [current, previous] = await Promise.all([
      getSearchConsoleByPageQuery(auth, gscSiteUrl, currentStart, currentEnd),
      getSearchConsoleByPageQuery(auth, gscSiteUrl, previousStart, previousEnd),
    ]);

    res.json(
      classifyContentPerformance({
        siteUrl: gscSiteUrl,
        currentPeriod: { start: currentStart, end: currentEnd },
        previousPeriod: { start: previousStart, end: previousEnd },
        currentPages: current.pages,
        previousPages: previous.pages,
      })
    );
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Content performance classification failed for website", req.params.id, err);
    res.status(502).json({ error: "Failed to load Search Console data" });
  }
});

// GET /api/websites/:id/alerts — Module 36: technical changes since the last crawl
// (robots/sitemap/new issues) plus traffic anomalies over the last 28 days. Both
// sources are deterministic and computed fresh on every request — nothing is stored.
router.get("/:id/alerts", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const [latestCrawl, previousCrawl] = lastTwoCompletedCrawls(db, req.params.id);
  let alerts: Alert[] = [];

  if (latestCrawl) {
    const latestIssues = queryAll<AuditIssue>(db, "SELECT * FROM audit_issues WHERE crawl_id = ?", [latestCrawl.id]);
    const previousIssues = previousCrawl
      ? queryAll<AuditIssue>(db, "SELECT * FROM audit_issues WHERE crawl_id = ?", [previousCrawl.id])
      : [];
    alerts = alerts.concat(technicalAlerts(latestCrawl, previousCrawl, latestIssues, previousIssues));
  }

  const gscSiteUrl = gscSiteUrlFor(db, req.params.id);
  if (gscSiteUrl) {
    try {
      const auth = getAuthorizedClient(db);
      const pivot = shiftDays(latestUsableDate(), -(COMPARISON_WINDOW_DAYS - 1));
      const comparison = await compareAround(auth, gscSiteUrl, pivot);
      alerts = alerts.concat(trafficAlerts(comparison));
    } catch (err) {
      // Alerts should still show technical findings even if Google is unreachable.
      console.warn("Alerts proceeding without traffic data:", (err as Error).message);
    }
  }

  const summary: AlertSummary = {
    website_id: req.params.id,
    generated_at: new Date().toISOString(),
    alerts: combineAndSortAlerts(alerts),
  };
  res.json(summary);
});

// POST /api/websites/:id/content-quality — Module 20: deterministic content QA over
// arbitrary text. Takes { text, target_keyword? } in the body — no dependency on any
// content storage table, so it works the moment a draft exists anywhere.
router.post("/:id/content-quality", async (req, res) => {
  const { text, target_keyword } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  res.json(analyzeContentQuality(text, typeof target_keyword === "string" ? target_keyword : undefined));
});

// GET /api/websites/:id/pre-publish-gate?content_quality_score=NN — Module 26.
// content_quality_score is optional; pass it once a draft's QA score is known
// (from POST .../content-quality above) — without it the gate runs on the
// technical audit alone.
router.get("/:id/pre-publish-gate", async (req, res) => {
  const db = await getDb();
  const crawl = latestCompletedCrawl(db, req.params.id);
  if (!crawl) {
    res.status(400).json({ error: "No completed crawl for this website yet — run a crawl and an audit first" });
    return;
  }

  const issues = queryAll<AuditIssue>(db, "SELECT * FROM audit_issues WHERE crawl_id = ?", [crawl.id]);
  const pagesAnalysed = countAnalysablePages(
    queryAll<CrawlPage>(db, "SELECT * FROM crawl_pages WHERE crawl_id = ?", [crawl.id])
  );
  const score = auditScore(issuesToFindings(issues), pagesAnalysed);
  const criticalIssueCount = issues.filter((issue) => issue.severity >= CRITICAL_ISSUE_SEVERITY).length;

  const rawQualityScore = req.query.content_quality_score;
  const contentQualityScore =
    typeof rawQualityScore === "string" && rawQualityScore.trim() !== "" ? Number(rawQualityScore) : null;

  res.json(
    evaluateGate({
      auditScore: score,
      criticalIssueCount,
      contentQualityScore: Number.isFinite(contentQualityScore) ? contentQualityScore : null,
    })
  );
});

// GET /api/websites/:id/report?format=markdown|html — Stage 8 export.
// Assembles everything the loop has produced into one client-ready document.
router.get("/:id/report", async (req, res) => {
  const db = await getDb();
  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [req.params.id]);
  if (!website) {
    res.status(404).json({ error: "Website not found" });
    return;
  }

  const crawl = latestCompletedCrawl(db, req.params.id);
  const issues = crawl
    ? queryAll<AuditIssue>(
        db,
        "SELECT * FROM audit_issues WHERE crawl_id = ? ORDER BY severity DESC, rule_code ASC",
        [crawl.id]
      )
    : [];

  const actions = queryAll<ActionRow>(db, "SELECT * FROM actions WHERE website_id = ? ORDER BY approved_at DESC", [
    req.params.id,
  ]);
  const results = queryAll<ActionResultRow>(
    db,
    "SELECT r.* FROM action_results r JOIN actions a ON a.id = r.action_id WHERE a.website_id = ?",
    [req.params.id]
  );
  const resultByAction = new Map(results.map((result) => [result.action_id, result]));

  const learningRows = queryAll<Omit<LearningRow, "success_rate">>(
    db,
    `SELECT a.action_type AS action_type, COUNT(*) AS tried, COUNT(r.id) AS measured,
            COALESCE(SUM(r.success), 0) AS succeeded, AVG(r.delta_clicks) AS avg_delta_clicks
       FROM actions a LEFT JOIN action_results r ON r.action_id = a.id
      WHERE a.website_id = ?
      GROUP BY a.action_type ORDER BY tried DESC`,
    [req.params.id]
  );

  const contentDraftRows = queryAll<ContentDraftRow & { action_title: string }>(
    db,
    `SELECT cd.*, a.title AS action_title FROM content_drafts cd
       JOIN actions a ON a.id = cd.action_id
      WHERE cd.website_id = ? ORDER BY cd.created_at DESC`,
    [req.params.id]
  );
  const contentDrafts = contentDraftRows.map((row) => ({
    ...row,
    secondary_keywords: JSON.parse(row.secondary_keywords) as string[],
    outline: JSON.parse(row.outline) as ContentDraft["outline"],
  }));

  const model: ReportModel = {
    website,
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    crawlPages: crawl?.pages_crawled ?? 0,
    hasAudit: crawl !== null && issues.length > 0,
    score: auditScore(issuesToFindings(issues), countAnalysablePages(
      crawl ? queryAll<CrawlPage>(db, "SELECT * FROM crawl_pages WHERE crawl_id = ?", [crawl.id]) : []
    )),
    issues,
    issuesByCategory: countByCategory(issuesToFindings(issues)),
    pageSpeed: readStoredPageSpeed(db, req.params.id),
    diagnoses: readDiagnoses(db, req.params.id),
    actions: actions.map((action) => ({ ...action, result: resultByAction.get(action.id) ?? null })),
    learning: learningRows.map((row) => ({
      ...row,
      success_rate: row.measured > 0 ? row.succeeded / row.measured : null,
    })),
    learningIncludesDemoData: actions.some((action) => action.is_demo_seed === 1),
    contentDrafts,
  };

  if (req.query.format === "html") {
    res.type("html").send(renderHtml(model));
    return;
  }
  res.type("text/markdown; charset=utf-8").send(renderMarkdown(model));
});

export default router;
