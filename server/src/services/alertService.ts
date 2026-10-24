import type { Alert, AuditIssue, Crawl } from "../types";
import type { Comparison } from "./measureService";

/**
 * Module 36 — Alert Engine. Two independent sources, both deterministic:
 *
 *  - technicalAlerts diffs the two most recent completed crawls: robots.txt changes,
 *    sitemap disappearing or shrinking, and audit issues that are new since the last
 *    crawl (not just present — new).
 *  - trafficAlerts reads one Comparison object (the same 28-vs-28 structure the
 *    Measurement step already computes) for site-wide clicks, ranking and CTR moves.
 *
 * No model call, no stored alert history — recomputed fresh on every request from
 * data the loop already collects. Nothing here mutates the database.
 */

const TRAFFIC_DROP_FRACTION = 0.25;
const MIN_PREVIOUS_CLICKS_FOR_TRAFFIC_ALERT = 20;
const RANKING_DROP_PLACES = 3;
const CTR_DROP_FRACTION = 0.3;
/** Impressions must be within this band to call a CTR move "anomalous" rather than
 *  a side effect of more (or fewer) people seeing the site at all. */
const IMPRESSIONS_STABILITY_BAND = 0.15;
/** Below this many impressions in the "before" period, one or two clicks swing CTR
 *  by double digits on their own — not enough volume to call it an anomaly. */
const MIN_IMPRESSIONS_FOR_CTR_ALERT = 200;

const SITEMAP_SHRINK_FRACTION = 0.3;

/** These rule codes get their own, more specific alert type — excluded here to avoid
 *  raising the same underlying problem twice under two different alert types. */
const SPECIFIC_RULE_CODES = new Set(["BROKEN_LINK", "NOINDEX_PAGE", "BLOCKED_BY_ROBOTS"]);

function issueKey(issue: Pick<AuditIssue, "rule_code" | "page_url" | "detail">): string {
  return `${issue.rule_code}::${issue.page_url ?? ""}::${issue.detail ?? ""}`;
}

export function technicalAlerts(
  latestCrawl: Crawl,
  previousCrawl: Crawl | null,
  latestIssues: AuditIssue[],
  previousIssues: AuditIssue[]
): Alert[] {
  const alerts: Alert[] = [];
  if (!previousCrawl) return alerts;

  if (previousCrawl.robots_status !== latestCrawl.robots_status) {
    const nowMissing = latestCrawl.robots_status === null || latestCrawl.robots_status >= 400;
    alerts.push({
      type: "robots_changed",
      severity: nowMissing ? "critical" : "warning",
      message: `robots.txt status changed (${previousCrawl.robots_status ?? "missing"} → ${latestCrawl.robots_status ?? "missing"})`,
      detail: nowMissing
        ? "robots.txt is now unreachable or erroring — crawlers get no directives and no sitemap pointer"
        : "Status code changed since the last crawl; confirm the change was intentional",
    });
  } else if (
    (previousCrawl.robots_content || latestCrawl.robots_content) &&
    previousCrawl.robots_content !== latestCrawl.robots_content
  ) {
    alerts.push({
      type: "robots_changed",
      severity: "warning",
      message: "robots.txt content changed since the last crawl",
      detail: "The status code is unchanged but the directives themselves differ — review before assuming nothing changed for crawlers",
    });
  }

  if (previousCrawl.sitemap_url && !latestCrawl.sitemap_url) {
    alerts.push({
      type: "sitemap_changed",
      severity: "critical",
      message: "Sitemap is no longer reachable",
      detail: `Previously served at ${previousCrawl.sitemap_url} with ${previousCrawl.sitemap_url_count} URLs`,
    });
  } else if (
    previousCrawl.sitemap_url_count > 0 &&
    latestCrawl.sitemap_url_count < previousCrawl.sitemap_url_count * (1 - SITEMAP_SHRINK_FRACTION)
  ) {
    alerts.push({
      type: "sitemap_changed",
      severity: "warning",
      message: `Sitemap URL count dropped from ${previousCrawl.sitemap_url_count} to ${latestCrawl.sitemap_url_count}`,
      detail: "A sharp drop often means a broken sitemap generator or a mass-deindex, not real page removal",
    });
  }

  const previousKeys = new Set(previousIssues.map(issueKey));
  const newIssues = latestIssues.filter((issue) => !previousKeys.has(issueKey(issue)));

  const newBrokenLinks = newIssues.filter((issue) => issue.rule_code === "BROKEN_LINK");
  if (newBrokenLinks.length > 0) {
    alerts.push({
      type: "new_broken_links",
      severity: "warning",
      message: `${newBrokenLinks.length} new broken link${newBrokenLinks.length > 1 ? "s" : ""} since the last crawl`,
      detail: newBrokenLinks
        .slice(0, 3)
        .map((issue) => issue.page_url ?? "site-wide")
        .join(", "),
    });
  }

  const newIndexingIssues = newIssues.filter(
    (issue) => issue.rule_code === "NOINDEX_PAGE" || issue.rule_code === "BLOCKED_BY_ROBOTS"
  );
  if (newIndexingIssues.length > 0) {
    alerts.push({
      type: "indexing_error",
      severity: "critical",
      message: `${newIndexingIssues.length} page${newIndexingIssues.length > 1 ? "s" : ""} newly excluded from indexing`,
      detail: newIndexingIssues
        .slice(0, 3)
        .map((issue) => `${issue.page_url ?? "site-wide"} (${issue.rule_code})`)
        .join(", "),
    });
  }

  const newOtherCritical = newIssues.filter((issue) => issue.severity >= 5 && !SPECIFIC_RULE_CODES.has(issue.rule_code));
  if (newOtherCritical.length > 0) {
    alerts.push({
      type: "new_critical_issue",
      severity: "critical",
      message: `${newOtherCritical.length} new critical issue${newOtherCritical.length > 1 ? "s" : ""} since the last crawl`,
      detail: newOtherCritical
        .slice(0, 3)
        .map((issue) => `${issue.rule_code}: ${issue.detail}`)
        .join(" | "),
    });
  }

  return alerts;
}

export function trafficAlerts(comparison: Comparison): Alert[] {
  const alerts: Alert[] = [];
  const beforeClicks = comparison.before.totals.clicks;
  const afterClicks = comparison.after.totals.clicks;

  if (beforeClicks >= MIN_PREVIOUS_CLICKS_FOR_TRAFFIC_ALERT) {
    const relativeDrop = (beforeClicks - afterClicks) / beforeClicks;
    if (relativeDrop >= TRAFFIC_DROP_FRACTION) {
      alerts.push({
        type: "traffic_drop",
        severity: relativeDrop >= 0.5 ? "critical" : "warning",
        message: `Organic clicks fell ${Math.round(relativeDrop * 100)}%`,
        detail: `${beforeClicks} → ${afterClicks} clicks, comparing the last ${comparison.window_days} days to the ${comparison.window_days} before that`,
      });
    }
  }

  if (comparison.delta_position <= -RANKING_DROP_PLACES) {
    alerts.push({
      type: "ranking_drop",
      severity: comparison.delta_position <= -(RANKING_DROP_PLACES + 2) ? "critical" : "warning",
      message: `Average position worsened by ${Math.abs(comparison.delta_position).toFixed(1)} places`,
      detail: `${comparison.before.totals.position.toFixed(1)} → ${comparison.after.totals.position.toFixed(1)}`,
    });
  }

  const beforeImpressions = comparison.before.totals.impressions;
  const afterImpressions = comparison.after.totals.impressions;
  const impressionsStable =
    beforeImpressions > 0 && Math.abs(afterImpressions - beforeImpressions) / beforeImpressions <= IMPRESSIONS_STABILITY_BAND;

  if (
    impressionsStable &&
    beforeImpressions >= MIN_IMPRESSIONS_FOR_CTR_ALERT &&
    comparison.before.totals.ctr > 0
  ) {
    const ctrRelativeDrop = (comparison.before.totals.ctr - comparison.after.totals.ctr) / comparison.before.totals.ctr;
    if (ctrRelativeDrop >= CTR_DROP_FRACTION) {
      alerts.push({
        type: "ctr_anomaly",
        severity: "warning",
        message: `CTR fell ${Math.round(ctrRelativeDrop * 100)}% with impressions roughly unchanged`,
        detail:
          `${(comparison.before.totals.ctr * 100).toFixed(1)}% → ${(comparison.after.totals.ctr * 100).toFixed(1)}% — ` +
          "often a title/snippet regression or a new SERP feature above the result, not a ranking change",
      });
    }
  }

  return alerts;
}

const SEVERITY_ORDER: Record<Alert["severity"], number> = { critical: 0, warning: 1, info: 2 };

export function combineAndSortAlerts(...groups: Alert[][]): Alert[] {
  return groups.flat().sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
