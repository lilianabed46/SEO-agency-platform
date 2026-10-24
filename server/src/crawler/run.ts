import { v4 as uuid } from "uuid";
import type { Database } from "sql.js";
import { config } from "../config";
import { saveDb } from "../db";
import { run as dbRun } from "../db/helpers";
import { parseHtml } from "./parse";
import { ConcurrencyLimiter } from "./limiter";
import { fetchRobotsTxt } from "./robots";
import { fetchSitemap, type SitemapResult } from "./sitemap";

const USER_AGENT = "SEO-Agency-Crawler/1.0";

interface QueueItem {
  url: string;
  discoveredFrom: string | null;
}

interface PageRow {
  id: string;
  url: string;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  h1: string | null;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  imagesCount: number;
  imagesMissingAlt: number;
  hreflangCount: number;
  /** JSON-encoded string[]; null when the page wasn't parsed as HTML. */
  schemaTypes: string | null;
  htmlLang: string | null;
  canonicalUrl: string | null;
  redirectUrl: string | null;
  contentType: string | null;
  wordCount: number | null;
  responseTimeMs: number | null;
  isBroken: number;
  discoveredFrom: string | null;
}

interface LinkRow {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string | null;
  isInternal: number;
  statusCode: number | null;
  isBroken: number;
}

function bareHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function isSameSite(url: string, siteHost: string): boolean {
  try {
    return bareHost(new URL(url).hostname) === siteHost;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, method: "GET" | "HEAD", timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Statuses that mean "this bot isn't welcome", not "this link is dead". Plenty of
 * large sites answer a non-browser User-Agent with 401/403/429 while serving the page
 * fine to a person, and reporting those as broken links buries the real ones.
 */
const ACCESS_RESTRICTED_STATUSES = new Set([401, 403, 429, 999]);

async function checkExternalLink(
  url: string,
  timeoutMs: number
): Promise<{ statusCode: number | null; isBroken: boolean }> {
  try {
    let response = await fetchWithTimeout(url, "HEAD", timeoutMs);
    // Some servers reject HEAD outright; retry those with GET before believing them.
    if (response.status === 405 || response.status === 501 || ACCESS_RESTRICTED_STATUSES.has(response.status)) {
      response = await fetchWithTimeout(url, "GET", timeoutMs);
    }
    const isBroken = response.status >= 400 && !ACCESS_RESTRICTED_STATUSES.has(response.status);
    return { statusCode: response.status, isBroken };
  } catch {
    return { statusCode: null, isBroken: true };
  }
}

/** Runs one crawl to completion and persists results. Never throws — see `startCrawl`. */
async function runCrawl(crawlId: string, startUrl: string, db: Database): Promise<void> {
  const deadline = Date.now() + config.crawler.totalTimeoutMs;
  const maxPages = config.crawler.maxPages;
  const siteHost = bareHost(new URL(startUrl).hostname);

  const visited = new Set<string>([startUrl]);
  let scheduledCount = 0;

  const pages: PageRow[] = [];
  const links: LinkRow[] = [];
  const externalLinkCache = new Map<string, { statusCode: number | null; isBroken: boolean }>();
  let brokenCount = 0;

  const limiter = new ConcurrencyLimiter(config.crawler.concurrency);
  const inFlight = new Set<Promise<void>>();

  // Site-level files, fetched once. robots.txt comes first because it names the
  // authoritative sitemap; both degrade to "absent" rather than failing the crawl.
  const robots = await fetchRobotsTxt(startUrl, config.crawler.requestTimeoutMs, USER_AGENT);
  const sitemap = await fetchSitemap(startUrl, robots.sitemaps, config.crawler.requestTimeoutMs, USER_AGENT);

  async function processOne(item: QueueItem): Promise<void> {
    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout(item.url, "GET", config.crawler.requestTimeoutMs);
      const responseTimeMs = Date.now() - startedAt;
      const contentType = response.headers.get("content-type");
      const redirectUrl = response.redirected && response.url !== item.url ? response.url : null;
      const isBroken = response.status >= 400;
      if (isBroken) brokenCount++;

      let parsed: ReturnType<typeof parseHtml> | null = null;
      if (!isBroken && contentType && contentType.includes("text/html")) {
        const html = await response.text();
        parsed = parseHtml(html, item.url);
      }

      pages.push({
        id: uuid(),
        url: item.url,
        statusCode: response.status,
        title: parsed?.title ?? null,
        metaDescription: parsed?.metaDescription ?? null,
        metaRobots: parsed?.metaRobots ?? null,
        h1: parsed?.h1 ?? null,
        h1Count: parsed?.h1Count ?? 0,
        h2Count: parsed?.h2Count ?? 0,
        h3Count: parsed?.h3Count ?? 0,
        imagesCount: parsed?.imagesCount ?? 0,
        imagesMissingAlt: parsed?.imagesMissingAlt ?? 0,
        hreflangCount: parsed?.hreflangCount ?? 0,
        schemaTypes: parsed ? JSON.stringify(parsed.schemaTypes) : null,
        htmlLang: parsed?.htmlLang ?? null,
        canonicalUrl: parsed?.canonicalUrl ?? null,
        redirectUrl,
        contentType,
        wordCount: parsed?.wordCount ?? null,
        responseTimeMs,
        isBroken: isBroken ? 1 : 0,
        discoveredFrom: item.discoveredFrom,
      });

      if (!parsed) return;

      for (const link of parsed.links) {
        if (isSameSite(link.url, siteHost)) {
          links.push({
            id: uuid(),
            sourceUrl: item.url,
            targetUrl: link.url,
            anchorText: link.anchorText,
            isInternal: 1,
            statusCode: null,
            isBroken: 0,
          });

          if (!visited.has(link.url) && scheduledCount < maxPages && Date.now() < deadline) {
            visited.add(link.url);
            scheduledCount++;
            schedule({ url: link.url, discoveredFrom: item.url });
          }
        } else {
          let cached = externalLinkCache.get(link.url);
          if (!cached) {
            cached = await checkExternalLink(link.url, config.crawler.requestTimeoutMs);
            externalLinkCache.set(link.url, cached);
          }
          if (cached.isBroken) brokenCount++;

          links.push({
            id: uuid(),
            sourceUrl: item.url,
            targetUrl: link.url,
            anchorText: link.anchorText,
            isInternal: 0,
            statusCode: cached.statusCode,
            isBroken: cached.isBroken ? 1 : 0,
          });
        }
      }
    } catch (err) {
      brokenCount++;
      pages.push({
        id: uuid(),
        url: item.url,
        statusCode: null,
        title: null,
        metaDescription: null,
        metaRobots: null,
        h1: null,
        h1Count: 0,
        h2Count: 0,
        h3Count: 0,
        imagesCount: 0,
        imagesMissingAlt: 0,
        hreflangCount: 0,
        schemaTypes: null,
        htmlLang: null,
        canonicalUrl: null,
        redirectUrl: null,
        contentType: null,
        wordCount: null,
        responseTimeMs: Date.now() - startedAt,
        isBroken: 1,
        discoveredFrom: item.discoveredFrom,
      });
      void err;
    }
  }

  function schedule(item: QueueItem): void {
    const task = limiter.run(() => processOne(item));
    inFlight.add(task);
    task.finally(() => inFlight.delete(task));
  }

  scheduledCount = 1;
  schedule({ url: startUrl, discoveredFrom: null });

  while (inFlight.size > 0 && Date.now() < deadline) {
    await Promise.race(inFlight);
  }

  persistResults(crawlId, db, pages, links, brokenCount, robots, sitemap);
}

function persistResults(
  crawlId: string,
  db: Database,
  pages: PageRow[],
  links: LinkRow[],
  brokenCount: number,
  robots: Awaited<ReturnType<typeof fetchRobotsTxt>>,
  sitemap: SitemapResult
): void {
  for (const page of pages) {
    dbRun(
      db,
      `INSERT INTO crawl_pages
        (id, crawl_id, url, status_code, title, meta_description, meta_robots, h1, h1_count,
         h2_count, h3_count, images_count, images_missing_alt, hreflang_count, schema_types, html_lang,
         canonical_url, redirect_url, content_type, word_count, response_time_ms, is_broken, discovered_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(crawl_id, url) DO NOTHING`,
      [
        page.id,
        crawlId,
        page.url,
        page.statusCode,
        page.title,
        page.metaDescription,
        page.metaRobots,
        page.h1,
        page.h1Count,
        page.h2Count,
        page.h3Count,
        page.imagesCount,
        page.imagesMissingAlt,
        page.hreflangCount,
        page.schemaTypes,
        page.htmlLang,
        page.canonicalUrl,
        page.redirectUrl,
        page.contentType,
        page.wordCount,
        page.responseTimeMs,
        page.isBroken,
        page.discoveredFrom,
      ]
    );
  }

  for (const link of links) {
    dbRun(
      db,
      `INSERT INTO crawl_links (id, crawl_id, source_url, target_url, anchor_text, is_internal, status_code, is_broken)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(crawl_id, source_url, target_url) DO NOTHING`,
      [link.id, crawlId, link.sourceUrl, link.targetUrl, link.anchorText, link.isInternal, link.statusCode, link.isBroken]
    );
  }

  for (const entry of sitemap.urls) {
    dbRun(
      db,
      `INSERT INTO crawl_sitemap_urls (id, crawl_id, url, lastmod) VALUES (?, ?, ?, ?)
       ON CONFLICT(crawl_id, url) DO NOTHING`,
      [uuid(), crawlId, entry.url, entry.lastmod]
    );
  }

  dbRun(
    db,
    `UPDATE crawls
       SET status = 'completed', finished_at = datetime('now'), pages_crawled = ?, broken_links_count = ?,
           robots_status = ?, robots_content = ?, robots_sitemaps = ?,
           sitemap_url = ?, sitemap_status = ?, sitemap_url_count = ?
     WHERE id = ?`,
    [
      pages.length,
      brokenCount,
      robots.status,
      robots.content,
      JSON.stringify(robots.sitemaps),
      sitemap.url,
      sitemap.status,
      sitemap.urls.length,
      crawlId,
    ]
  );

  saveDb();
}

/**
 * Kicks off a crawl without awaiting it (the route responds 202 immediately).
 * Wrapped so an uncaught rejection can't become a process-crashing `unhandledRejection`
 * and instead flips the crawl row to `failed`.
 */
export function startCrawl(crawlId: string, startUrl: string, db: Database): void {
  runCrawl(crawlId, startUrl, db).catch((err) => {
    console.error(`Crawl ${crawlId} failed:`, err);
    try {
      dbRun(
        db,
        `UPDATE crawls SET status = 'failed', finished_at = datetime('now'), error = ? WHERE id = ?`,
        [err instanceof Error ? err.message : "Unknown crawler error", crawlId]
      );
      saveDb();
    } catch (persistErr) {
      console.error(`Failed to persist crawl failure for ${crawlId}:`, persistErr);
    }
  });
}
