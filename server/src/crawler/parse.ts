import * as cheerio from "cheerio";

export interface ParsedLink {
  url: string;
  anchorText: string | null;
}

export interface ParsedPage {
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  h1: string | null;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  canonicalUrl: string | null;
  wordCount: number;
  imagesCount: number;
  imagesMissingAlt: number;
  hreflangCount: number;
  /** @type values found in JSON-LD blocks, e.g. ["Organization", "BreadcrumbList"]. */
  schemaTypes: string[];
  htmlLang: string | null;
  links: ParsedLink[];
}

function resolveUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (!/^https?:$/i.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Pulls @type out of a JSON-LD block. The shape is loose in the wild: a single object,
 * an array of them, a @graph wrapper, and @type itself may be a string or an array.
 * Malformed blocks are common, so a parse failure is skipped rather than thrown.
 */
function collectSchemaTypes(raw: string, into: Set<string>): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (typeof type === "string") into.add(type);
    else if (Array.isArray(type)) type.filter((t): t is string => typeof t === "string").forEach((t) => into.add(t));

    if (record["@graph"]) visit(record["@graph"]);
  };

  visit(parsed);
}

export function parseHtml(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim() || null;
  const metaDescription = $('meta[name="description" i]').attr("content")?.trim() || null;
  const metaRobots = $('meta[name="robots" i]').attr("content")?.trim() || null;

  const h1Elements = $("h1");
  const h1 = h1Elements.first().text().trim() || null;
  const h1Count = h1Elements.length;

  const canonicalHref = $('link[rel="canonical" i]').attr("href");
  const canonicalUrl = canonicalHref ? resolveUrl(canonicalHref, pageUrl) : null;

  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript").remove();
  const wordCount = bodyClone.text().trim().split(/\s+/).filter(Boolean).length;

  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  const htmlLang = $("html").attr("lang")?.trim() || null;
  const hreflangCount = $('link[rel="alternate" i][hreflang]').length;

  const images = $("img");
  const imagesCount = images.length;
  // A decorative image is correctly marked with alt="" — present but empty is valid,
  // so only a missing attribute counts against the page.
  const imagesMissingAlt = images.filter((_, el) => $(el).attr("alt") === undefined).length;

  const schemaTypeSet = new Set<string>();
  $('script[type="application/ld+json" i]').each((_, el) => {
    collectSchemaTypes($(el).text(), schemaTypeSet);
  });

  const links: ParsedLink[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href.trim())) return;

    const absolute = resolveUrl(href, pageUrl);
    if (!absolute || seen.has(absolute)) return;
    seen.add(absolute);

    links.push({ url: absolute, anchorText: $(el).text().trim() || null });
  });

  return {
    title,
    metaDescription,
    metaRobots,
    h1,
    h1Count,
    h2Count,
    h3Count,
    canonicalUrl,
    wordCount,
    imagesCount,
    imagesMissingAlt,
    hreflangCount,
    schemaTypes: [...schemaTypeSet],
    htmlLang,
    links,
  };
}
