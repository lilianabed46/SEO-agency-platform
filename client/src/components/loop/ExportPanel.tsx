import { api } from "../../api/client";
import { MUTED } from "./format";
import { t } from "../../i18n";

interface ExportPanelProps {
  websiteId: string;
}

/** "8 · Export — the client-ready report" tab. */
export function ExportPanel({ websiteId }: ExportPanelProps) {
  return (
    <div>
      <p style={{ color: MUTED }}>{t("exportPanel.intro")}</p>
      <a href={api.reportUrl(websiteId, "html")} target="_blank" rel="noreferrer">
        {t("exportPanel.openHtml")}
      </a>{" "}
      ·{" "}
      <a href={api.reportUrl(websiteId, "markdown")} target="_blank" rel="noreferrer">
        {t("exportPanel.openMarkdown")}
      </a>
    </div>
  );
}
