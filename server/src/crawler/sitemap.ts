import * as cheerio from "cheerio";

/**
 * Sitemap fetch + parse, including sitemap-index files.
 *
 * Bounded on purpose: a real sitemap can hold 50,000 URLs and an index can point at
 * hundreds of children. The audit only needs enough to spot orphans and gaps, so both
 * the child count and the total URL count are capped rather than followed exhaustively.
 */

export interface SitemapUrl {
  url: string;
  lastmod: string | null;
}

export interface SitemapResult {
  url: string | null;
  status: number | null;
  /** True when the located file was a <sitemapindex> rather than a <urlset>. */
  isIndex: boolean;
  urls: SitemapUrl[];
  truncated: boolean;
}

const MAX_URLS = 1000;
const MAX_CHILD_SITEMAPS = 3;

/** Same normalisation on both sides of every comparison, or nothing lines up. */
export function normaliseUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

async function fetchXml(url: string, timeoutMs: number, userAgent: string): Promise<{ status: number | null; body: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": userAgent },
    });
    if (!response.ok) return { status: response.status, body: null };
    return { status: response.status, body: await response.text() };
  } catch {
    return { status: null, body: null };
  } finally {
    clearTimeout(timer);
  }
}

function parseUrlset(xml: string): SitemapUrl[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: SitemapUrl[] = [];
  $("urlset > url").each((_, el) => {
    if (urls.length >= MAX_URLS) return;
    const loc = $(el).children("loc").first().text().trim();
    if (!loc) return;
    urls.push({ url: loc, lastmod: $(el).children("lastmod").first().text().trim() || null });
  });
  return urls;
}

function parseIndex(xml: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const children: string[] = [];
  $("sitemapindex > sitemap > loc").each((_, el) => {
    const loc = $(el).text().trim();
    if (loc) children.push(loc);
  });
  return children;
}

/**
 * Tries the sitemaps robots.txt declares first — that is the authoritative list —
 * then falls back to the conventional /sitemap.xml.
 */
export async function fetchSitemap(
  siteUrl: string,
  declaredSitemaps: string[],
  timeoutMs: number,
  userAgent: string
): Promise<SitemapResult> {
  const candidates = [...declaredSitemaps];
  const fallback = new URL("/sitemap.xml", siteUrl).toString();
  if (!candidates.includes(fallback)) candidates.push(fallback);

  for (const candidate of candidates) {
    const { status, body } = await fetchXml(candidate, timeoutMs, userAgent);
    if (!body) continue;

    const childSitemaps = parseIndex(body);
    if (childSitemaps.length > 0) {
      const urls: SitemapUrl[] = [];
      for (const child of childSitemaps.slice(0, MAX_CHILD_SITEMAPS)) {
        if (urls.length >= MAX_URLS) break;
        const childBody = await fetchXml(child, timeoutMs, userAgent);
        if (childBody.body) urls.push(...parseUrlset(childBody.body));
      }
      return {
        url: candidate,
        status,
        isIndex: true,
        urls: urls.slice(0, MAX_URLS),
        truncated: urls.length >= MAX_URLS || childSitemaps.length > MAX_CHILD_SITEMAPS,
      };
    }

    const urls = parseUrlset(body);
    if (urls.length > 0) {
      return { url: candidate, status, isIndex: false, urls, truncated: urls.length >= MAX_URLS };
    }
  }

  return { url: null, status: null, isIndex: false, urls: [], truncated: false };
}
