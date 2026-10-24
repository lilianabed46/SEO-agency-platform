import { google } from "googleapis";
import type {
  SearchConsoleSummary,
  SearchAnalyticsRow,
  SearchAnalyticsTotals,
  Ga4Summary,
  Ga4ReportRow,
  Ga4ReportTotals,
  PageQueryRow,
  PageAnalyticsRow,
  SearchConsolePageSummary,
} from "../types";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export async function getSearchConsoleData(
  auth: OAuth2Client,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 1000
): Promise<SearchConsoleSummary> {
  const webmasters = google.webmasters({ version: "v3", auth });
  const response = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: ["query"], rowLimit },
  });

  const rows: SearchAnalyticsRow[] = (response.data.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));

  const totals: SearchAnalyticsTotals = rows.reduce(
    (acc, row) => ({
      clicks: acc.clicks + row.clicks,
      impressions: acc.impressions + row.impressions,
      ctr: 0,
      position: acc.position + row.position,
    }),
    { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  );
  totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  totals.position = rows.length > 0 ? totals.position / rows.length : 0;

  return { siteUrl, startDate, endDate, rows, totals };
}

/**
 * True period totals, queried with no dimensions. Summing the query-dimension rows
 * instead would undercount: that response is capped at rowLimit and Google withholds
 * anonymised queries from it. Measurement compares periods, so it needs the real numbers.
 */
export async function getSearchConsoleTotals(
  auth: OAuth2Client,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<SearchAnalyticsTotals> {
  const webmasters = google.webmasters({ version: "v3", auth });
  const response = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: [], rowLimit: 1 },
  });

  const row = response.data.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

/**
 * Search Console at the (page, query) grain — one call, because everything downstream
 * derives from it: per-page totals, cannibalisation (one query, several pages), CTR
 * anomalies, and page-2 near-misses. Asking separately for each would burn quota to
 * rebuild data this response already contains.
 */
export async function getSearchConsoleByPageQuery(
  auth: OAuth2Client,
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit = 5000
): Promise<SearchConsolePageSummary> {
  const webmasters = google.webmasters({ version: "v3", auth });
  const response = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: ["page", "query"], rowLimit },
  });

  const rows: PageQueryRow[] = (response.data.rows ?? []).map((row) => ({
    page: row.keys?.[0] ?? "",
    query: row.keys?.[1] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));

  const byPage = new Map<string, { clicks: number; impressions: number; positionWeighted: number; queries: number }>();
  for (const row of rows) {
    const entry = byPage.get(row.page) ?? { clicks: 0, impressions: 0, positionWeighted: 0, queries: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.positionWeighted += row.position * row.impressions;
    entry.queries += 1;
    byPage.set(row.page, entry);
  }

  const pages: PageAnalyticsRow[] = [...byPage.entries()]
    .map(([page, entry]) => ({
      page,
      clicks: entry.clicks,
      impressions: entry.impressions,
      ctr: entry.impressions > 0 ? entry.clicks / entry.impressions : 0,
      position: entry.impressions > 0 ? entry.positionWeighted / entry.impressions : 0,
      query_count: entry.queries,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  return { siteUrl, startDate, endDate, rows, pages };
}

export async function getGa4Report(
  auth: OAuth2Client,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<Ga4Summary> {
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });
  const response = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "engagementRate" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    },
  });

  const rows: Ga4ReportRow[] = (response.data.rows ?? []).map((row) => ({
    date: row.dimensionValues?.[0]?.value ?? "",
    activeUsers: Number(row.metricValues?.[0]?.value ?? 0),
    sessions: Number(row.metricValues?.[1]?.value ?? 0),
    screenPageViews: Number(row.metricValues?.[2]?.value ?? 0),
    engagementRate: Number(row.metricValues?.[3]?.value ?? 0),
  }));

  const totals: Ga4ReportTotals = rows.reduce(
    (acc, row) => ({
      activeUsers: acc.activeUsers + row.activeUsers,
      sessions: acc.sessions + row.sessions,
      screenPageViews: acc.screenPageViews + row.screenPageViews,
      engagementRate: acc.engagementRate + row.engagementRate,
    }),
    { activeUsers: 0, sessions: 0, screenPageViews: 0, engagementRate: 0 }
  );
  totals.engagementRate = rows.length > 0 ? totals.engagementRate / rows.length : 0;

  return { propertyId, startDate, endDate, rows, totals };
}
