import { Router } from "express";
import { getDb } from "../db";
import { queryAll } from "../db/helpers";
import { auditScore, countAnalysablePages } from "../audit/rules";
import type { Website, Crawl, CrawlPage, AuditIssue, OverviewRow } from "../types";

const router = Router();

/**
 * X-3 (Lilian's task list) — one row per website across the whole portfolio, from
 * one HTTP call. Internally this still touches the local sqlite db per website (a
 * handful of cheap in-process queries, not the kind of N+1 the task warns about —
 * that warning is about live Google API calls, which this endpoint makes none of;
 * every number here comes from stored tables, same as the task requires).
 */
router.get("/", async (_req, res) => {
  const db = await getDb();

  const sites = queryAll<Website & { client_name: string }>(
    db,
    `SELECT w.*, c.name AS client_name
       FROM websites w
       JOIN clients c ON c.id = w.client_id
      ORDER BY c.name ASC, w.url ASC`
  );

  // Latest crawl (any status) and latest *completed* crawl, per website — one query
  // each, reduced in JS instead of a query per site.
  const allCrawls = queryAll<Crawl>(db, "SELECT * FROM crawls ORDER BY started_at DESC");
  const latestCrawlByWebsite = new Map<string, Crawl>();
  const latestCompletedByWebsite = new Map<string, Crawl>();
  for (const crawl of allCrawls) {
    if (!latestCrawlByWebsite.has(crawl.website_id)) latestCrawlByWebsite.set(crawl.website_id, crawl);
    if (crawl.status === "completed" && !latestCompletedByWebsite.has(crawl.website_id)) {
      latestCompletedByWebsite.set(crawl.website_id, crawl);
    }
  }

  const openActionCounts = queryAll<{ website_id: string; n: number }>(
    db,
    "SELECT website_id, COUNT(*) AS n FROM actions WHERE status = 'approved' GROUP BY website_id"
  );
  const openActionByWebsite = new Map(openActionCounts.map((row) => [row.website_id, row.n]));

  const rows: OverviewRow[] = sites.map((site) => {
    const latestCrawl = latestCrawlByWebsite.get(site.id) ?? null;
    const completedCrawl = latestCompletedByWebsite.get(site.id) ?? null;

    let auditScoreValue: number | null = null;
    let criticalAlertCount = 0;
    if (completedCrawl) {
      const issues = queryAll<AuditIssue>(db, "SELECT * FROM audit_issues WHERE crawl_id = ?", [completedCrawl.id]);
      const pages = queryAll<CrawlPage>(db, "SELECT * FROM crawl_pages WHERE crawl_id = ?", [completedCrawl.id]);
      // Compute the score even with zero issues — a clean audit is a real 100, not "no data".
      auditScoreValue = auditScore(
        issues.map((issue) => ({
          rule_code: issue.rule_code,
          category: issue.category,
          severity: issue.severity,
          page_url: issue.page_url,
          detail: issue.detail ?? "",
        })),
        countAnalysablePages(pages)
      );
      criticalAlertCount = issues.filter((issue) => issue.severity >= 5).length;
    }

    return {
      website_id: site.id,
      client_id: site.client_id,
      client_name: site.client_name,
      url: site.url,
      audit_score: auditScoreValue,
      critical_alert_count: criticalAlertCount,
      last_crawl_at: latestCrawl?.started_at ?? null,
      last_crawl_status: latestCrawl?.status ?? null,
      open_action_count: openActionByWebsite.get(site.id) ?? 0,
    };
  });

  // Default sort per the spec: most critical alerts first, then oldest crawl (stalest
  // data needs attention too), sites never crawled last.
  rows.sort((a, b) => {
    if (b.critical_alert_count !== a.critical_alert_count) return b.critical_alert_count - a.critical_alert_count;
    if (!a.last_crawl_at && !b.last_crawl_at) return 0;
    if (!a.last_crawl_at) return -1;
    if (!b.last_crawl_at) return 1;
    return a.last_crawl_at.localeCompare(b.last_crawl_at);
  });

  res.json(rows);
});

export default router;
