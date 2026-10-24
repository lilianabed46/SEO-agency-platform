import { google } from "googleapis";
import { getSearchConsoleTotals } from "./googleDataService";
import type { MetricsSnapshotJson, SearchAnalyticsTotals } from "../types";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * Step 6 of the loop. Search Console keeps roughly 16 months of history, so we never
 * have to wait for a window to elapse — pick a pivot date and the before/after
 * comparison is available immediately, in Google's own numbers rather than ours.
 */

export const COMPARISON_WINDOW_DAYS = 28;

/** Search Console lags a couple of days; asking for today returns a short window. */
const GSC_DATA_LAG_DAYS = 3;

export function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function latestUsableDate(): string {
  return shiftDays(today(), -GSC_DATA_LAG_DAYS);
}

export interface ComparisonPeriod {
  start: string;
  end: string;
  totals: SearchAnalyticsTotals;
}

export interface Comparison {
  pivot_date: string;
  window_days: number;
  before: ComparisonPeriod;
  after: ComparisonPeriod;
  delta_clicks: number;
  delta_impressions: number;
  delta_ctr: number;
  /** Negative is an improvement for position, so this is flipped deliberately. */
  delta_position: number;
  success: boolean;
}

export function periodsAround(pivotDate: string): { before: { start: string; end: string }; after: { start: string; end: string } } {
  return {
    before: { start: shiftDays(pivotDate, -COMPARISON_WINDOW_DAYS), end: shiftDays(pivotDate, -1) },
    after: { start: pivotDate, end: shiftDays(pivotDate, COMPARISON_WINDOW_DAYS - 1) },
  };
}

/** True once the whole after-window has data Google will actually serve. */
export function afterWindowIsComplete(pivotDate: string): boolean {
  return periodsAround(pivotDate).after.end <= latestUsableDate();
}

export function toSnapshot(period: ComparisonPeriod): MetricsSnapshotJson {
  return {
    clicks: period.totals.clicks,
    impressions: period.totals.impressions,
    ctr: period.totals.ctr,
    position: period.totals.position,
    period_start: period.start,
    period_end: period.end,
  };
}

export async function compareAround(
  auth: OAuth2Client,
  gscSiteUrl: string,
  pivotDate: string
): Promise<Comparison> {
  const { before, after } = periodsAround(pivotDate);

  const [beforeTotals, afterTotals] = await Promise.all([
    getSearchConsoleTotals(auth, gscSiteUrl, before.start, before.end),
    getSearchConsoleTotals(auth, gscSiteUrl, after.start, after.end),
  ]);

  const deltaClicks = afterTotals.clicks - beforeTotals.clicks;

  return {
    pivot_date: pivotDate,
    window_days: COMPARISON_WINDOW_DAYS,
    before: { ...before, totals: beforeTotals },
    after: { ...after, totals: afterTotals },
    delta_clicks: deltaClicks,
    delta_impressions: afterTotals.impressions - beforeTotals.impressions,
    delta_ctr: afterTotals.ctr - beforeTotals.ctr,
    delta_position: beforeTotals.position - afterTotals.position,
    success: deltaClicks > 0,
  };
}
