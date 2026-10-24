import { config } from "../config";
import type { CoreWebVitals, PageSpeedStrategy, PageSpeedSummary } from "../types";

/**
 * PageSpeed Insights — free, and it returns two different things in one response:
 *
 *  - Lighthouse "lab" data: a synthetic run, always present.
 *  - CrUX "field" data: what real Chrome users actually experienced over the last
 *    28 days. Only exists for URLs/origins with enough traffic, so it is often null
 *    and every caller has to cope with that.
 *
 * Field data is the one Google ranks on, so it wins wherever both are available.
 * INP has no lab equivalent at all — it is field-only, and we never fake it from
 * Total Blocking Time.
 */

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_TIMEOUT_MS = 60_000;

export class PageSpeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageSpeedError";
  }
}

function numericAudit(audits: Record<string, any> | undefined, id: string): number | null {
  const value = audits?.[id]?.numericValue;
  return typeof value === "number" ? Math.round(value) : null;
}

function labVitals(lighthouse: any): CoreWebVitals {
  const audits = lighthouse?.audits;
  const cls = audits?.["cumulative-layout-shift"]?.numericValue;
  return {
    lcp_ms: numericAudit(audits, "largest-contentful-paint"),
    // INP is field-only; Lighthouse has no equivalent, so this stays null on purpose.
    inp_ms: null,
    cls: typeof cls === "number" ? Number(cls.toFixed(3)) : null,
    fcp_ms: numericAudit(audits, "first-contentful-paint"),
    ttfb_ms: numericAudit(audits, "server-response-time"),
  };
}

function fieldMetric(metrics: Record<string, any> | undefined, key: string): number | null {
  const percentile = metrics?.[key]?.percentile;
  return typeof percentile === "number" ? percentile : null;
}

function fieldVitals(experience: any): CoreWebVitals | null {
  const metrics = experience?.metrics;
  if (!metrics) return null;

  // CrUX reports CLS as an integer scaled by 100 (a score of 0.08 arrives as 8).
  const clsRaw = fieldMetric(metrics, "CUMULATIVE_LAYOUT_SHIFT_SCORE");

  const vitals: CoreWebVitals = {
    lcp_ms: fieldMetric(metrics, "LARGEST_CONTENTFUL_PAINT_MS"),
    inp_ms: fieldMetric(metrics, "INTERACTION_TO_NEXT_PAINT"),
    cls: clsRaw === null ? null : Number((clsRaw / 100).toFixed(3)),
    fcp_ms: fieldMetric(metrics, "FIRST_CONTENTFUL_PAINT_MS"),
    ttfb_ms: fieldMetric(metrics, "EXPERIMENTAL_TIME_TO_FIRST_BYTE"),
  };

  const hasAny = Object.values(vitals).some((value) => value !== null);
  return hasAny ? vitals : null;
}

export async function fetchPageSpeed(
  url: string,
  strategy: PageSpeedStrategy = "mobile"
): Promise<PageSpeedSummary> {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  // Works without a key, but on a very low anonymous quota — fine for one demo run,
  // not for a batch.
  if (config.pageSpeedApiKey) params.set("key", config.pageSpeedApiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PSI_TIMEOUT_MS);
  let payload: any;
  try {
    const response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, { signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new PageSpeedError(`PageSpeed returned ${response.status}: ${detail.slice(0, 300)}`);
    }
    payload = await response.json();
  } catch (err) {
    if (err instanceof PageSpeedError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new PageSpeedError(`PageSpeed timed out after ${PSI_TIMEOUT_MS}ms`);
    }
    throw new PageSpeedError(`PageSpeed request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const lighthouse = payload?.lighthouseResult;
  const rawScore = lighthouse?.categories?.performance?.score;

  // loadingExperience is this URL; originLoadingExperience is the whole domain and is
  // the usual fallback for a page too quiet to have its own CrUX sample.
  const urlField = fieldVitals(payload?.loadingExperience);
  const originField = urlField ? null : fieldVitals(payload?.originLoadingExperience);

  return {
    url: payload?.id ?? url,
    strategy,
    performance_score: typeof rawScore === "number" ? Math.round(rawScore * 100) : null,
    lab: labVitals(lighthouse),
    field: urlField ?? originField,
    field_source: urlField ? "url" : originField ? "origin" : null,
    fetched_at: new Date().toISOString(),
  };
}

/** Field data is what Google actually ranks on, so it wins where it exists. */
export function effectiveVitals(summary: PageSpeedSummary): CoreWebVitals {
  if (!summary.field) return summary.lab;
  return {
    lcp_ms: summary.field.lcp_ms ?? summary.lab.lcp_ms,
    inp_ms: summary.field.inp_ms,
    cls: summary.field.cls ?? summary.lab.cls,
    fcp_ms: summary.field.fcp_ms ?? summary.lab.fcp_ms,
    ttfb_ms: summary.field.ttfb_ms ?? summary.lab.ttfb_ms,
  };
}
