import type {
  AuditCategory,
  AuditFinding,
  CoreWebVitals,
  Crawl,
  CrawlLink,
  CrawlPage,
  SearchConsolePageSummary,
} from "../types";
import { parseRobotsTxt, isBlockedByRobots, matchRobotsRule } from "../crawler/robots";
import { normaliseUrl } from "../crawler/sitemap";

/**
 * Deterministic technical audit over one crawl's output. No model call, no network,
 * no cost, no latency — this is what turns raw crawl rows into a categorised,
 * severity-weighted issue list that the diagnosis step then reasons about.
 *
 * Adding a rule is one entry in PAGE_RULES (or one block in runAudit for the
 * cross-page and link rules, which don't fit a per-page signature).
 */

const TITLE_MAX_LENGTH = 60;
const THIN_CONTENT_WORDS = 300;

/** Keeps a site with thousands of bad links from producing thousands of rows. */
const MAX_ISSUES_PER_RULE = 50;

interface PageRule {
  code: string;
  category: AuditCategory;
  severity: number;
  /** Returns the evidence string when the rule fires, or null when the page is fine. */
  test: (page: CrawlPage) => string | null;
}

const PAGE_RULES: PageRule[] = [
  {
    code: "MISSING_TITLE",
    category: "meta",
    severity: 5,
    test: (page) => (page.title && page.title.trim() ? null : "Page has no <title>"),
  },
  {
    code: "TITLE_TOO_LONG",
    category: "meta",
    severity: 2,
    test: (page) => {
      const length = page.title?.trim().length ?? 0;
      return length > TITLE_MAX_LENGTH
        ? `Title is ${length} characters (over ${TITLE_MAX_LENGTH}, so Google will truncate it)`
        : null;
    },
  },
  {
    code: "MISSING_META_DESCRIPTION",
    category: "meta",
    severity: 3,
    test: (page) =>
      page.meta_description && page.meta_description.trim() ? null : "Page has no meta description",
  },
  {
    code: "H1_NOT_EXACTLY_ONE",
    category: "content",
    severity: 3,
    test: (page) =>
      page.h1_count === 1 ? null : `Page has ${page.h1_count} <h1> elements (expected exactly 1)`,
  },
  {
    code: "MISSING_CANONICAL",
    category: "indexing",
    severity: 2,
    test: (page) => (page.canonical_url ? null : "Page declares no canonical URL"),
  },
  {
    code: "THIN_CONTENT",
    category: "content",
    severity: 3,
    test: (page) => {
      const words = page.word_count ?? 0;
      return words < THIN_CONTENT_WORDS
        ? `Page has ${words} words (under the ${THIN_CONTENT_WORDS}-word thin-content threshold)`
        : null;
    },
  },
  {
    // The most damaging single tag in SEO: it removes the page from Google entirely.
    code: "NOINDEX_PAGE",
    category: "indexing",
    severity: 5,
    test: (page) =>
      page.meta_robots && /noindex/i.test(page.meta_robots)
        ? `Page is excluded from search by meta robots: "${page.meta_robots}"`
        : null,
  },
  {
    code: "IMAGES_MISSING_ALT",
    category: "content",
    severity: 3,
    test: (page) =>
      page.images_missing_alt > 0
        ? `${page.images_missing_alt} of ${page.images_count} images have no alt attribute`
        : null,
  },
  {
    // Only meaningful once there is enough text to need structuring.
    code: "NO_HEADING_STRUCTURE",
    category: "content",
    severity: 2,
    test: (page) =>
      (page.word_count ?? 0) >= THIN_CONTENT_WORDS && page.h2_count === 0
        ? `Page has ${page.word_count} words but no <h2> headings to structure them`
        : null,
  },
  {
    code: "NO_SCHEMA",
    category: "meta",
    severity: 2,
    test: (page) => {
      const types = parseJsonStringArray(page.schema_types);
      return types.length === 0 ? "Page has no JSON-LD structured data" : null;
    },
  },
  {
    code: "MISSING_HTML_LANG",
    category: "content",
    severity: 2,
    test: (page) => (page.html_lang ? null : "The <html> element declares no lang attribute"),
  },
];

/** Several columns hold a JSON-encoded string[]; a malformed value reads as empty. */
export function parseJsonStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** A page the content rules can meaningfully judge: fetched, 2xx, and HTML. */
function isAnalysable(page: CrawlPage): boolean {
  if (page.is_broken) return false;
  if (page.status_code === null || page.status_code < 200 || page.status_code >= 300) return false;
  // content_type is null on some responses; treat unknown as HTML rather than skipping the page.
  return page.content_type === null || /html/i.test(page.content_type);
}

function normaliseTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function runAudit(pages: CrawlPage[], links: CrawlLink[]): AuditFinding[] {
  const analysable = pages.filter(isAnalysable);
  const findings: AuditFinding[] = [];
  const emitted = new Map<string, number>();

  const emit = (finding: AuditFinding): void => {
    const count = emitted.get(finding.rule_code) ?? 0;
    if (count >= MAX_ISSUES_PER_RULE) return;
    emitted.set(finding.rule_code, count + 1);
    findings.push(finding);
  };

  for (const page of analysable) {
    for (const rule of PAGE_RULES) {
      const detail = rule.test(page);
      if (detail === null) continue;
      emit({
        rule_code: rule.code,
        category: rule.category,
        severity: rule.severity,
        page_url: page.url,
        detail,
      });
    }
  }

  // Broken links live on crawl_links, not on the page row, so they need their own pass.
  for (const link of links) {
    if (!link.is_broken) continue;
    emit({
      rule_code: "BROKEN_LINK",
      category: "links",
      severity: 5,
      page_url: link.source_url,
      detail: `Links to ${link.target_url}${link.status_code ? ` (HTTP ${link.status_code})` : " (unreachable)"}`,
    });
  }

  // Duplicate titles are a property of the set of pages, not of any single page,
  // so this one is reported once per duplicated title rather than once per page.
  const byTitle = new Map<string, string[]>();
  for (const page of analysable) {
    if (!page.title || !page.title.trim()) continue;
    const key = normaliseTitle(page.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), page.url]);
  }
  for (const [title, urls] of byTitle) {
    if (urls.length < 2) continue;
    const shown = urls.slice(0, 3).join(", ");
    const rest = urls.length > 3 ? `, +${urls.length - 3} more` : "";
    emit({
      rule_code: "DUPLICATE_TITLE",
      category: "content",
      severity: 4,
      page_url: null,
      detail: `${urls.length} pages share the title "${title}": ${shown}${rest}`,
    });
  }

  return findings;
}

/**
 * Site-level findings that no single page can produce: they come from comparing
 * robots.txt, the sitemap, and the crawl against each other.
 */
export function siteStructureFindings(
  crawl: Crawl,
  pages: CrawlPage[],
  links: CrawlLink[],
  sitemapUrls: string[]
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const analysable = pages.filter(isAnalysable);

  const robotsMissing = crawl.robots_status === null || crawl.robots_status === 404;
  if (robotsMissing) {
    findings.push({
      rule_code: "ROBOTS_TXT_MISSING",
      category: "indexing",
      severity: 3,
      page_url: null,
      detail: "No robots.txt was served — crawlers get no directives and no sitemap pointer",
    });
  }

  // A page that is both crawlable by us and disallowed for Google is the worst case:
  // it looks fine to a human and is invisible in search.
  if (crawl.robots_content) {
    const { rules } = parseRobotsTxt(crawl.robots_content);
    for (const page of analysable) {
      if (!isBlockedByRobots(rules, page.url)) continue;
      const rule = matchRobotsRule(rules, new URL(page.url).pathname);
      if (findings.filter((f) => f.rule_code === "BLOCKED_BY_ROBOTS").length >= MAX_ISSUES_PER_RULE) break;
      findings.push({
        rule_code: "BLOCKED_BY_ROBOTS",
        category: "indexing",
        severity: 5,
        page_url: page.url,
        detail: `robots.txt blocks this page${rule ? ` via "Disallow: ${rule.path}"` : ""}`,
      });
    }
  }

  if (!crawl.sitemap_url) {
    findings.push({
      rule_code: "SITEMAP_MISSING",
      category: "indexing",
      severity: 3,
      page_url: null,
      detail: "No XML sitemap was found at /sitemap.xml or declared in robots.txt",
    });
    // Every other sitemap rule below would just restate this one.
    return findings;
  }

  const declared = parseJsonStringArray(crawl.robots_sitemaps);
  if (!robotsMissing && declared.length === 0) {
    findings.push({
      rule_code: "SITEMAP_NOT_IN_ROBOTS",
      category: "indexing",
      severity: 2,
      page_url: null,
      detail: `A sitemap exists at ${crawl.sitemap_url} but robots.txt does not declare it`,
    });
  }

  const crawlHost = hostOf(analysable[0]?.url ?? crawl.sitemap_url ?? "");
  const sitemapHost = hostOf(sitemapUrls[0] ?? "");

  // If the sitemap lists a different domain, every URL comparison below is meaningless
  // and would report the whole sitemap as orphaned. The mismatch is itself the finding.
  if (crawlHost && sitemapHost && crawlHost !== sitemapHost) {
    findings.push({
      rule_code: "SITEMAP_WRONG_DOMAIN",
      category: "indexing",
      severity: 4,
      page_url: crawl.sitemap_url,
      detail:
        `The sitemap lists URLs on ${sitemapHost} but this site is being crawled as ${crawlHost} — ` +
        `either the site has moved and the audit should target ${sitemapHost}, or the sitemap is stale`,
    });
    return findings;
  }

  const linkedTo = new Set(links.filter((link) => link.is_internal).map((link) => normaliseUrl(link.target_url)));
  const crawled = new Set(analysable.map((page) => normaliseUrl(page.url)));
  const inSitemap = new Set(sitemapUrls.map(normaliseUrl));

  // The homepage is reachable by definition and the crawl's entry point, so nothing
  // linking *to* it does not make it orphaned. Excluded explicitly, or it shows up as
  // a false positive on almost every site.
  const entryPoints = new Set(
    analysable
      .filter((page) => page.discovered_from === null || new URL(page.url).pathname === "/")
      .map((page) => normaliseUrl(page.url))
  );

  // Listed in the sitemap but nothing links to it — reachable only if Google hands it
  // to the user. Reported once with a count: fifty separate rows is noise, not a finding.
  const orphans = [...inSitemap].filter((url) => !linkedTo.has(url) && !entryPoints.has(url));
  if (orphans.length > 0) {
    findings.push({
      rule_code: "ORPHAN_PAGE",
      category: "links",
      severity: 3,
      page_url: null,
      detail: `${orphans.length} of ${inSitemap.size} sitemap URLs have no internal link pointing to them: ${summarise(orphans)}`,
    });
  }

  const missing = [...crawled].filter((url) => !inSitemap.has(url));
  if (missing.length > 0) {
    findings.push({
      rule_code: "NOT_IN_SITEMAP",
      category: "indexing",
      severity: 2,
      page_url: null,
      detail: `${missing.length} crawled pages are absent from the sitemap: ${summarise(missing)}`,
    });
  }

  return findings;
}

/**
 * Roughly what CTR a result earns at each position on page one. Not a precise model —
 * it exists so "this page underperforms for where it ranks" can be stated with a
 * number instead of a hunch, and only fires when actual CTR is under half of it.
 */
export function expectedCtr(position: number): number {
  if (position <= 1.5) return 0.25;
  if (position <= 2.5) return 0.15;
  if (position <= 3.5) return 0.1;
  if (position <= 6.5) return 0.06;
  return 0.03;
}

const MIN_IMPRESSIONS_FOR_CTR = 100;
const MIN_IMPRESSIONS_FOR_CANNIBALISATION = 50;
const MIN_IMPRESSIONS_FOR_STRIKING_DISTANCE = 50;

/**
 * Findings that only exist once the crawl is joined to Search Console. These are
 * opportunities rather than defects: the page already ranks, it just isn't earning
 * what its position should. Silent when the site has no Search Console mapping.
 */
export function searchPerformanceFindings(summary: SearchConsolePageSummary): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Ranking on page one but under-clicked — almost always a title or description problem.
  for (const page of summary.pages) {
    if (page.impressions < MIN_IMPRESSIONS_FOR_CTR || page.position > 10) continue;
    const expected = expectedCtr(page.position);
    if (page.ctr >= expected / 2) continue;
    if (findings.filter((f) => f.rule_code === "LOW_CTR_FOR_POSITION").length >= MAX_ISSUES_PER_RULE) break;
    findings.push({
      rule_code: "LOW_CTR_FOR_POSITION",
      category: "opportunity",
      severity: 3,
      page_url: page.page,
      detail:
        `Ranks at position ${page.position.toFixed(1)} with ${page.impressions} impressions but only ` +
        `${(page.ctr * 100).toFixed(1)}% CTR (around ${(expected * 100).toFixed(0)}% is typical at that position)`,
    });
  }

  // Two pages competing for one query: Google has to pick, and usually picks worse
  // than the site would have.
  const pagesByQuery = new Map<string, { page: string; impressions: number; position: number }[]>();
  for (const row of summary.rows) {
    if (row.impressions < MIN_IMPRESSIONS_FOR_CANNIBALISATION) continue;
    pagesByQuery.set(row.query, [
      ...(pagesByQuery.get(row.query) ?? []),
      { page: row.page, impressions: row.impressions, position: row.position },
    ]);
  }
  for (const [query, competing] of pagesByQuery) {
    if (competing.length < 2) continue;
    if (findings.filter((f) => f.rule_code === "KEYWORD_CANNIBALISATION").length >= MAX_ISSUES_PER_RULE) break;
    const ranked = competing.sort((a, b) => a.position - b.position);
    findings.push({
      rule_code: "KEYWORD_CANNIBALISATION",
      category: "opportunity",
      severity: 3,
      page_url: ranked[0].page,
      detail:
        `${competing.length} pages compete for "${query}": ` +
        ranked.map((entry) => `${entry.page} (pos ${entry.position.toFixed(1)})`).join(", "),
    });
  }

  // Page two. The cheapest wins on any site that already has traffic.
  const strikingDistance = summary.rows
    .filter((row) => row.position > 10 && row.position <= 20 && row.impressions >= MIN_IMPRESSIONS_FOR_STRIKING_DISTANCE)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);
  if (strikingDistance.length > 0) {
    findings.push({
      rule_code: "STRIKING_DISTANCE",
      category: "opportunity",
      severity: 2,
      page_url: null,
      detail:
        `${strikingDistance.length} queries sit on page two (positions 11-20) with real impressions — ` +
        strikingDistance
          .slice(0, 3)
          .map((row) => `"${row.query}" (pos ${row.position.toFixed(1)}, ${row.impressions} impr)`)
          .join(", "),
    });
  }

  return findings;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function summarise(urls: string[], shown = 3): string {
  const head = urls.slice(0, shown).join(", ");
  return urls.length > shown ? `${head}, +${urls.length - shown} more` : head;
}

/**
 * Core Web Vitals thresholds, straight from Google's published good / needs-improvement
 * / poor bands. Kept as data so the numbers can be checked against the docs at a glance
 * rather than being buried in branches.
 */
interface VitalThreshold {
  code: string;
  label: string;
  /** At or below this is good — nothing is reported. */
  good: number;
  /** Above this is poor; between good and this is "needs improvement". */
  poor: number;
  poorSeverity: number;
  warnSeverity: number;
  format: (value: number) => string;
}

const ms = (value: number) => `${Math.round(value)}ms`;

const VITAL_THRESHOLDS: Record<keyof CoreWebVitals, VitalThreshold | null> = {
  lcp_ms: { code: "CWV_LCP", label: "Largest Contentful Paint", good: 2500, poor: 4000, poorSeverity: 5, warnSeverity: 3, format: ms },
  inp_ms: { code: "CWV_INP", label: "Interaction to Next Paint", good: 200, poor: 500, poorSeverity: 4, warnSeverity: 2, format: ms },
  cls: { code: "CWV_CLS", label: "Cumulative Layout Shift", good: 0.1, poor: 0.25, poorSeverity: 4, warnSeverity: 2, format: (value) => value.toFixed(3) },
  ttfb_ms: { code: "CWV_TTFB", label: "Time to First Byte", good: 800, poor: 1800, poorSeverity: 3, warnSeverity: 2, format: ms },
  // FCP is a diagnostic, not a Core Web Vital — measured and shown, never scored.
  fcp_ms: null,
};

/**
 * Performance findings, kept separate from runAudit because they come from PageSpeed
 * rather than the crawl and are measured once for the site, not once per page.
 * `source` says whether the numbers are real-user field data or a synthetic lab run —
 * that distinction belongs in the evidence the client reads.
 */
export function performanceFindings(
  vitals: CoreWebVitals,
  performanceScore: number | null,
  pageUrl: string,
  source: "field" | "lab"
): AuditFinding[] {
  const origin = source === "field" ? "real users, last 28 days" : "lab run";
  const findings: AuditFinding[] = [];

  for (const [key, threshold] of Object.entries(VITAL_THRESHOLDS)) {
    if (!threshold) continue;
    const value = vitals[key as keyof CoreWebVitals];
    if (value === null || value <= threshold.good) continue;

    const isPoor = value > threshold.poor;
    findings.push({
      rule_code: threshold.code,
      category: "performance",
      severity: isPoor ? threshold.poorSeverity : threshold.warnSeverity,
      page_url: pageUrl,
      detail:
        `${threshold.label} is ${threshold.format(value)} (${origin}) — ` +
        `${isPoor ? "poor" : "needs improvement"}, target is ${threshold.format(threshold.good)} or better`,
    });
  }

  if (performanceScore !== null && performanceScore < 90) {
    findings.push({
      rule_code: "PERFORMANCE_SCORE",
      category: "performance",
      severity: performanceScore < 50 ? 4 : 2,
      page_url: pageUrl,
      detail: `Lighthouse performance score is ${performanceScore}/100 (target is 90+)`,
    });
  }

  return findings;
}

/**
 * Score out of 100. Deliberately simple arithmetic so it can be explained to a
 * client line by line: average severity carried per analysed page, scaled by 4.
 * A site where every page trips one severity-3 rule scores 88; one where every
 * page is missing title + description + h1 scores 56.
 */
export function auditScore(findings: AuditFinding[], pagesAnalysed: number): number {
  if (pagesAnalysed === 0) return 0;
  const penalty = findings.reduce((sum, finding) => sum + finding.severity, 0);
  return Math.max(0, Math.round(100 - (penalty / pagesAnalysed) * 4));
}

export function countByCategory(findings: AuditFinding[]): Record<AuditCategory, number> {
  const counts: Record<AuditCategory, number> = {
    meta: 0,
    content: 0,
    indexing: 0,
    links: 0,
    performance: 0,
    opportunity: 0,
  };
  for (const finding of findings) {
    counts[finding.category] += 1;
  }
  return counts;
}

export function countAnalysablePages(pages: CrawlPage[]): number {
  return pages.filter(isAnalysable).length;
}
