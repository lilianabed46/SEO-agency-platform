import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { WebsiteLoopPanel } from "../components/WebsiteLoopPanel";
import { AlertsBadge } from "../components/loop/AlertsBadge";
import { LoopTabs } from "../components/loop/LoopTabs";
import { LOOP_TABS, type LoopTabId } from "../components/loop/tabs";
import { ProgressBar } from "../components/loop/ProgressBar";
import { Ltr } from "../components/Ltr";
import { t } from "../i18n";
import { COUNTRY_LABELS, LANGUAGE_LABELS, joinedLabels } from "../lib/geoLabels";
import type { Website, GoogleStatus, GoogleProperties, WebsiteGoogleProperties, WebsiteGoogleData, Crawl, CrawlDetail } from "../types";
import "./WebsiteDetailPage.css";

const POLL_INTERVAL_MS = 2000;

export function WebsiteDetailPage() {
  const { websiteId } = useParams<{ websiteId: string }>();

  const [website, setWebsite] = useState<Website | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<LoopTabId>("data");

  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [properties, setProperties] = useState<GoogleProperties | null>(null);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  const [mapping, setMapping] = useState<WebsiteGoogleProperties | null>(null);
  const [gscSiteUrl, setGscSiteUrl] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [savingMapping, setSavingMapping] = useState(false);

  const [googleData, setGoogleData] = useState<WebsiteGoogleData | null>(null);
  const [googleDataError, setGoogleDataError] = useState<string | null>(null);
  const [loadingGoogleData, setLoadingGoogleData] = useState(false);

  const [crawls, setCrawls] = useState<Crawl[]>([]);
  const [activeCrawl, setActiveCrawl] = useState<CrawlDetail | null>(null);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [startingCrawl, setStartingCrawl] = useState(false);
  const pollRef = useRef<number | null>(null);

  function stopPolling() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function refreshCrawls(id: string) {
    api.listCrawls(id).then((list) => {
      setCrawls(list);
      const running = list.find((c) => c.status === "running");
      if (running) startPolling(id, running.id);
    });
  }

  function startPolling(id: string, crawlId: string) {
    stopPolling();
    const poll = () => {
      api.getCrawl(id, crawlId).then((detail) => {
        setActiveCrawl(detail);
        if (detail.status !== "running") {
          stopPolling();
          refreshCrawls(id);
        }
      });
    };
    poll();
    pollRef.current = window.setInterval(poll, POLL_INTERVAL_MS);
  }

  useEffect(() => {
    if (!websiteId) return;
    api.getWebsite(websiteId).then(setWebsite).catch((err) => setError(err.message));
    api.getGoogleStatus().then(setGoogleStatus).catch(() => {});
    api.getWebsiteGoogle(websiteId).then((m) => {
      setMapping(m);
      setGscSiteUrl(m.gsc_site_url ?? "");
      setGa4PropertyId(m.ga4_property_id ?? "");
    });
    refreshCrawls(websiteId);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId]);

  useEffect(() => {
    if (!googleStatus?.connected) return;
    api.getGoogleProperties().then(setProperties).catch((err) => setPropertiesError(err.message));
  }, [googleStatus]);

  async function handleConnectClick() {
    window.location.href = api.googleConnectUrl;
  }

  async function handleDisconnect() {
    await api.disconnectGoogle();
    setGoogleStatus({ connected: false, google_account_email: null, connected_at: null });
    setProperties(null);
  }

  async function handleSaveMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteId) return;
    setSavingMapping(true);
    setError(null);
    try {
      const updated = await api.saveWebsiteGoogle(websiteId, {
        gsc_site_url: gscSiteUrl || null,
        ga4_property_id: ga4PropertyId || null,
      });
      setMapping(updated);
      setGoogleData(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingMapping(false);
    }
  }

  async function handleLoadGoogleData() {
    if (!websiteId) return;
    setLoadingGoogleData(true);
    setGoogleDataError(null);
    try {
      setGoogleData(await api.getGoogleData(websiteId));
    } catch (err) {
      setGoogleDataError((err as Error).message);
    } finally {
      setLoadingGoogleData(false);
    }
  }

  async function handleStartCrawl() {
    if (!websiteId) return;
    setStartingCrawl(true);
    setCrawlError(null);
    try {
      const { id } = await api.startCrawl(websiteId);
      startPolling(websiteId, id);
    } catch (err) {
      setCrawlError((err as Error).message);
    } finally {
      setStartingCrawl(false);
    }
  }

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!website) return <p>{t("common.loading")}</p>;

  const hasMapping = Boolean(mapping?.gsc_site_url || mapping?.ga4_property_id);
  const crawlRunning = activeCrawl?.status === "running" || crawls.some((c) => c.status === "running");

  return (
    <div>
      <Link to={`/clients/${website.client_id}`} className="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
        <span>{t("websiteDetail.backToClient")}</span>
      </Link>

      {/* Top white rectangle — the project's own info, always visible regardless of which
          loop step is selected below. */}
      <div className="website-info-card">
        <div className="website-info-left">
          <div className="website-info-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
          </div>
          <div>
            <h1>
              <Ltr>{website.url}</Ltr>
            </h1>
            <p className="website-info-meta">
              {t(`clientProfilePage.siteTypes.${website.site_type}` as any)} · {joinedLabels(website.country, COUNTRY_LABELS)} · {joinedLabels(website.language, LANGUAGE_LABELS)}
              {website.niche && ` · ${website.niche}`}
              {website.cms && ` · ${website.cms}`}
            </p>
            {(website.target_audience || website.goal) && (
              <p className="website-info-meta">
                {website.target_audience && <>{t("clientProfilePage.audienceLabel")}: {website.target_audience}. </>}
                {website.goal && <>{t("clientProfilePage.goalLabel")}: {website.goal}.</>}
              </p>
            )}
          </div>
        </div>

        {/* Persistent — outside the tabs, always visible, per LILIAN_TODAY.md: an alert
            must be seen without pressing a button. */}
        <div className="website-info-right">
          <AlertsBadge websiteId={website.id} />
        </div>
      </div>

      {/* Below the info card: filter buttons (the loop steps) on the left, the
          view space for whichever step is selected on the right. */}
      <div className="website-detail-body">
        <aside className="website-sidebar">
          <LoopTabs tabs={LOOP_TABS} activeId={activeTab} onChange={setActiveTab} orientation="vertical" />
        </aside>

        <div className="website-view">
          {activeTab === "data" && (
            <div className="data-grid">
              <div className="data-card">
                <div className="data-card-head">
                  <div className="data-card-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <ellipse cx="12" cy="5" rx="8" ry="3" />
                      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
                      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
                    </svg>
                  </div>
                  <div>
                    <h3>{t("websiteDetail.dataTitle")}</h3>
                    <p>{t("websiteDetail.dataSubtitle")}</p>
                  </div>
                </div>

                <div className="data-row">
                  <div className="data-row-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M21.6 12.23c0-.68-.06-1.36-.18-2H12v3.99h5.4a4.62 4.62 0 0 1-2 3.03v2.5h3.23c1.9-1.75 2.97-4.32 2.97-7.52Z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 22c2.7 0 4.96-.9 6.62-2.44l-3.23-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.6-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
                        fill="#34A853"
                      />
                      <path d="M6.4 13.9a5.99 5.99 0 0 1 0-3.8V7.52H3.06a10 10 0 0 0 0 8.96l3.34-2.58Z" fill="#FBBC05" />
                      <path
                        d="M12 6.18c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 3.09 14.7 2 12 2A10 10 0 0 0 3.06 7.52L6.4 10.1C7.2 7.74 9.4 6.18 12 6.18Z"
                        fill="#EA4335"
                      />
                    </svg>
                  </div>
                  <div className="data-row-body">
                    <strong>{t("websiteDetail.googleConnection")}</strong>
                    {googleStatus?.connected ? (
                      <span>
                        {t("websiteDetail.connectedAs")} <b>{googleStatus.google_account_email}</b>
                      </span>
                    ) : (
                      <span>{t("websiteDetail.notConnected")}</span>
                    )}
                  </div>
                  <div className="data-row-action">
                    {googleStatus?.connected ? (
                      <button onClick={handleDisconnect}>{t("websiteDetail.disconnect")}</button>
                    ) : (
                      <button onClick={handleConnectClick}>{t("websiteDetail.connect")}</button>
                    )}
                  </div>
                </div>

                <div className="data-row data-row-wrap">
                  <div className="data-row-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
                    </svg>
                  </div>
                  <div className="data-row-body">
                    <strong>{t("websiteDetail.gscGa4")}</strong>
                    {!googleStatus?.connected ? (
                      <span>{t("websiteDetail.connectFirst")}</span>
                    ) : (
                      <form
                        onSubmit={handleSaveMapping}
                        style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}
                      >
                        <select value={gscSiteUrl} onChange={(e) => setGscSiteUrl(e.target.value)} dir="ltr">
                          <option value="">{t("websiteDetail.noGscSite")}</option>
                          {properties?.gscSites.map((s) => (
                            <option key={s.siteUrl} value={s.siteUrl}>
                              {s.siteUrl}
                            </option>
                          ))}
                        </select>
                        <select value={ga4PropertyId} onChange={(e) => setGa4PropertyId(e.target.value)}>
                          <option value="">{t("websiteDetail.noGa4Property")}</option>
                          {properties?.ga4Properties.map((p) => (
                            <option key={p.propertyId} value={p.propertyId}>
                              {p.displayName ?? p.propertyId} ({p.accountName ?? "—"})
                            </option>
                          ))}
                        </select>
                        <button type="submit" disabled={savingMapping}>
                          {t("websiteDetail.saveMapping")}
                        </button>
                        {propertiesError && <span style={{ color: "crimson" }}>{propertiesError}</span>}
                      </form>
                    )}
                  </div>
                </div>

                <div className="data-row data-row-wrap">
                  <div className="data-row-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 17l6-6 4 4 8-8" />
                      <path d="M15 7h6v6" />
                    </svg>
                  </div>
                  <div className="data-row-body">
                    <strong>{t("websiteDetail.searchConsoleAnalytics")}</strong>
                    {!hasMapping ? (
                      <span>{t("websiteDetail.mapPropertyFirst")}</span>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <button onClick={handleLoadGoogleData} disabled={loadingGoogleData}>
                          {loadingGoogleData ? t("websiteDetail.loadingData") : t("websiteDetail.loadLast28")}
                        </button>
                        {googleDataError && <p style={{ color: "crimson" }}>{googleDataError}</p>}

                        {googleData?.searchConsole && (
                          <div style={{ marginTop: 12 }}>
                            <h4>
                              {t("websiteDetail.searchConsoleHeading")} ({googleData.searchConsole.startDate} →{" "}
                              {googleData.searchConsole.endDate})
                            </h4>
                            <p>
                              {t("websiteDetail.clicks")}: {googleData.searchConsole.totals.clicks} ·{" "}
                              {t("websiteDetail.impressions")}: {googleData.searchConsole.totals.impressions} ·{" "}
                              {t("websiteDetail.ctr")}: {(googleData.searchConsole.totals.ctr * 100).toFixed(1)}% ·{" "}
                              {t("websiteDetail.avgPosition")}: {googleData.searchConsole.totals.position.toFixed(1)}
                            </p>
                            {googleData.searchConsole.rows.length > 0 && (
                              <table>
                                <thead>
                                  <tr>
                                    <th>{t("websiteDetail.colQuery")}</th>
                                    <th>{t("websiteDetail.colClicks")}</th>
                                    <th>{t("websiteDetail.colImpressions")}</th>
                                    <th>{t("websiteDetail.colCtr")}</th>
                                    <th>{t("websiteDetail.colPosition")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {googleData.searchConsole.rows.slice(0, 10).map((row) => (
                                    <tr key={row.query}>
                                      <td>{row.query}</td>
                                      <td>{row.clicks}</td>
                                      <td>{row.impressions}</td>
                                      <td>{(row.ctr * 100).toFixed(1)}%</td>
                                      <td>{row.position.toFixed(1)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}

                        {googleData?.ga4 && (
                          <div style={{ marginTop: 12 }}>
                            <h4>
                              {t("websiteDetail.ga4Heading")} ({googleData.ga4.startDate} → {googleData.ga4.endDate})
                            </h4>
                            <p>
                              {t("websiteDetail.activeUsers")}: {googleData.ga4.totals.activeUsers} ·{" "}
                              {t("websiteDetail.sessions")}: {googleData.ga4.totals.sessions} ·{" "}
                              {t("websiteDetail.pageViews")}: {googleData.ga4.totals.screenPageViews} ·{" "}
                              {t("websiteDetail.engagementRate")}: {(googleData.ga4.totals.engagementRate * 100).toFixed(1)}%
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="data-card">
                <div className="data-card-head">
                  <div className="data-card-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="7" />
                      <path d="M12 9v3l2 2M9 3l1.5 2M15 3l-1.5 2M2 12h2M20 12h2" />
                    </svg>
                  </div>
                  <div>
                    <h3>{t("websiteDetail.crawlTitle")}</h3>
                    <p>{t("websiteDetail.crawlSubtitle")}</p>
                  </div>
                </div>

                <button
                  className="run-crawl-btn"
                  onClick={handleStartCrawl}
                  disabled={startingCrawl || crawlRunning}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="6 4 20 12 6 20" />
                  </svg>
                  {crawlRunning ? t("websiteDetail.crawlRunning") : t("websiteDetail.runCrawl")}
                </button>
                {crawlError && <p style={{ color: "crimson" }}>{crawlError}</p>}

                {activeCrawl && (
                  <div style={{ marginTop: 12 }}>
                    <p>
                      {t("websiteDetail.status")}: <b>{activeCrawl.status}</b> · {t("websiteDetail.pagesCrawled")}:{" "}
                      <b style={{ fontSize: activeCrawl.status === "running" ? 18 : undefined }}>
                        {activeCrawl.pages_crawled}
                      </b>{" "}
                      · {t("websiteDetail.brokenLinks")}: {activeCrawl.broken_links_count}
                      {activeCrawl.error && <span style={{ color: "crimson" }}> · {activeCrawl.error}</span>}
                    </p>
                    {activeCrawl.status === "running" && <ProgressBar label={t("websiteDetail.crawlingLive")} />}
                    {activeCrawl.status !== "running" && activeCrawl.pages.length > 0 && (
                      <table>
                        <thead>
                          <tr>
                            <th>{t("websiteDetail.colUrl")}</th>
                            <th>{t("websiteDetail.colStatus")}</th>
                            <th>{t("websiteDetail.colTitle")}</th>
                            <th>{t("websiteDetail.colWords")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeCrawl.pages.map((p) => (
                            <tr key={p.id} style={p.is_broken ? { color: "crimson" } : undefined}>
                              <td>
                                <Ltr>{p.url}</Ltr>
                              </td>
                              <td>{p.status_code ?? "—"}</td>
                              <td>{p.title ?? "—"}</td>
                              <td>{p.word_count ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                <div className="history-head">
                  <h4>{t("websiteDetail.historyTitle")}</h4>
                  {crawls.length > 0 && (
                    <span className="muted-text">
                      {crawls.length} {t("websiteDetail.historyTotal")}
                    </span>
                  )}
                </div>
                {crawls.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                        <path d="M8 9h5M8 13h8M8 17h5" />
                        <circle cx="17" cy="17" r="3" />
                        <path d="m19.5 19.5 2 2" />
                      </svg>
                    </div>
                    <strong>{t("websiteDetail.noHistory")}</strong>
                    <span>{t("websiteDetail.noHistorySubtitle")}</span>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>{t("websiteDetail.colStarted")}</th>
                        <th>{t("websiteDetail.colStatus")}</th>
                        <th>{t("websiteDetail.colPages")}</th>
                        <th>{t("websiteDetail.brokenLinks")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crawls.map((c) => (
                        <tr key={c.id}>
                          <td>{c.started_at}</td>
                          <td>{c.status}</td>
                          <td>{c.pages_crawled}</td>
                          <td>{c.broken_links_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab !== "data" && <WebsiteLoopPanel websiteId={website.id} activeTab={activeTab} />}
        </div>
      </div>
    </div>
  );
}
