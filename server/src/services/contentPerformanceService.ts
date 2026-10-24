import { expectedCtr } from "../audit/rules";
import type { ContentPerformanceStatus, ContentPerformanceSummary, PageAnalyticsRow, PagePerformance } from "../types";

/**
 * Module 29 — Content Performance Engine. Classifies every page as performing,
 * underperforming, or decaying by comparing two consecutive Search Console windows
 * live — no snapshot history required, the same "compare now" approach measureService
 * uses for the Measurement step. Deterministic, no model call.
 */

/** Below this many impressions in the current window, a page's numbers are too noisy to judge. */
const MIN_IMPRESSIONS_FOR_JUDGEMENT = 30;

/** A relative drop in clicks past this fraction, with enough prior volume, reads as decay. */
const DECAY_DROP_FRACTION = 0.3;
const MIN_PREVIOUS_CLICKS_FOR_DECAY = 10;

/** Underperforming if actual CTR is under this fraction of what the position typically earns. */
const UNDERPERFORM_CTR_FRACTION = 0.5;

function classifyPage(current: PageAnalyticsRow, previousClicks: number): PagePerformance {
  const deltaClicks = current.clicks - previousClicks;

  if (current.impressions < MIN_IMPRESSIONS_FOR_JUDGEMENT) {
    return {
      page: current.page,
      status: "insufficient_data",
      current_clicks: current.clicks,
      previous_clicks: previousClicks,
      delta_clicks: deltaClicks,
      current_impressions: current.impressions,
      current_ctr: current.ctr,
      current_position: current.position,
      expected_ctr: null,
      reason: `Only ${current.impressions} impressions in the current window (need ${MIN_IMPRESSIONS_FOR_JUDGEMENT}+ to judge reliably)`,
    };
  }

  const relativeDrop = previousClicks > 0 ? (previousClicks - current.clicks) / previousClicks : 0;
  if (previousClicks >= MIN_PREVIOUS_CLICKS_FOR_DECAY && relativeDrop >= DECAY_DROP_FRACTION) {
    return {
      page: current.page,
      status: "decaying",
      current_clicks: current.clicks,
      previous_clicks: previousClicks,
      delta_clicks: deltaClicks,
      current_impressions: current.impressions,
      current_ctr: current.ctr,
      current_position: current.position,
      expected_ctr: null,
      reason: `Clicks fell ${Math.round(relativeDrop * 100)}% (${previousClicks} → ${current.clicks}) versus the prior period`,
    };
  }

  if (current.position <= 10) {
    const expected = expectedCtr(current.position);
    if (current.ctr < expected * UNDERPERFORM_CTR_FRACTION) {
      return {
        page: current.page,
        status: "underperforming",
        current_clicks: current.clicks,
        previous_clicks: previousClicks,
        delta_clicks: deltaClicks,
        current_impressions: current.impressions,
        current_ctr: current.ctr,
        current_position: current.position,
        expected_ctr: expected,
        reason:
          `Ranks at position ${current.position.toFixed(1)} (typically ~${(expected * 100).toFixed(0)}% CTR) ` +
          `but earns only ${(current.ctr * 100).toFixed(1)}%`,
      };
    }
  }

  return {
    page: current.page,
    status: "performing",
    current_clicks: current.clicks,
    previous_clicks: previousClicks,
    delta_clicks: deltaClicks,
    current_impressions: current.impressions,
    current_ctr: current.ctr,
    current_position: current.position,
    expected_ctr: null,
    reason:
      previousClicks > 0
        ? `Clicks ${deltaClicks >= 0 ? "held or grew" : "dipped only slightly"} versus the prior period`
        : "New in the current window with no prior period to compare",
  };
}

export function classifyContentPerformance(params: {
  siteUrl: string;
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  currentPages: PageAnalyticsRow[];
  previousPages: PageAnalyticsRow[];
}): ContentPerformanceSummary {
  const previousByPage = new Map(params.previousPages.map((page) => [page.page, page.clicks]));

  const pages = params.currentPages
    .map((page) => classifyPage(page, previousByPage.get(page.page) ?? 0))
    .sort((a, b) => b.current_impressions - a.current_impressions);

  const counts: Record<ContentPerformanceStatus, number> = {
    performing: 0,
    underperforming: 0,
    decaying: 0,
    insufficient_data: 0,
  };
  for (const page of pages) counts[page.status] += 1;

  return {
    siteUrl: params.siteUrl,
    currentPeriod: params.currentPeriod,
    previousPeriod: params.previousPeriod,
    counts,
    pages,
  };
}
