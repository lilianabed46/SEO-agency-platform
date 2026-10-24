import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import logo from "../assets/logo.png";
import { t } from "../i18n";
import "./Layout.css";

// The Google OAuth callback always redirects to the app root with ?google=..., regardless of
// which page the user started the connect flow from — this banner surfaces that everywhere.
export function Layout({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const googleParam = searchParams.get("google");

  function dismissBanner() {
    const next = new URLSearchParams(searchParams);
    next.delete("google");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="layout">
      <header className="layout-header">
        <Link to="/" className="brand">
          <img src={logo} alt="" className="brand-logo" />
          {t("nav.brand")}
        </Link>
        <div className="layout-header-right">
          <nav>
            <Link to="/">{t("nav.overview")}</Link>
            <Link to="/clients">{t("nav.clients")}</Link>
          </nav>
        </div>
      </header>
      {googleParam === "connected" && (
        <div className="banner banner-success">
          {t("nav.bannerGoogleConnected")}
          <button onClick={dismissBanner}>{t("nav.dismiss")}</button>
        </div>
      )}
      {googleParam === "error" && (
        <div className="banner banner-error">
          {t("nav.bannerGoogleError")}
          <button onClick={dismissBanner}>{t("nav.dismiss")}</button>
        </div>
      )}
      <main className="layout-content">{children}</main>
    </div>
  );
}
