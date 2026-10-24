import "dotenv/config";
import { getDb } from "../db";
import { queryAll, queryOne } from "../db/helpers";

/**
 * Demo-day readiness check. Answers one question: what is still missing?
 *
 * Reads the database directly and imports nothing that touches ../config, so a missing
 * environment variable is reported as a failed check rather than crashing the script.
 *
 *   npm run check          (stop the server first — see the sql.js note below)
 */

type Level = "ok" | "warn" | "fail";

const results: { level: Level; label: string; detail: string }[] = [];

function record(level: Level, label: string, detail: string): void {
  results.push({ level, label, detail });
}

function envCheck(name: string, level: Level, note: string): void {
  const value = process.env[name];
  if (value && value.trim()) record("ok", name, "set");
  else record(level, name, note);
}

const EXPECTED_TABLES = [
  "clients",
  "websites",
  "google_connections",
  "website_google_properties",
  "crawls",
  "crawl_pages",
  "crawl_links",
  "crawl_sitemap_urls",
  "metric_snapshots",
  "audit_issues",
  "diagnoses",
  "actions",
  "action_results",
];

/** Columns added by applyAdditiveMigrations — the ones an older local db would lack. */
const EXPECTED_COLUMNS: [string, string[]][] = [
  ["websites", ["niche", "target_audience", "cms"]],
  ["crawl_pages", ["h2_count", "images_missing_alt", "schema_types", "html_lang"]],
  ["crawls", ["robots_status", "sitemap_url", "sitemap_url_count"]],
  ["diagnoses", ["is_demo_seed"]],
];

async function main(): Promise<void> {
  // --- environment -----------------------------------------------------------
  envCheck("TOKEN_ENCRYPTION_KEY", "fail", "REQUIRED — the server will not boot without it");
  envCheck("GOOGLE_CLIENT_ID", "fail", "REQUIRED for the Google connection");
  envCheck("GOOGLE_CLIENT_SECRET", "fail", "REQUIRED for the Google connection");
  envCheck("LLM_API_KEY", "fail", "MISSING — step 3 (Diagnosis) cannot run");
  envCheck("PAGESPEED_API_KEY", "warn", "missing — PageSpeed's anonymous quota is exhausted, so step 2 loses Core Web Vitals");

  const provider = process.env.LLM_PROVIDER ?? "gemini (default)";
  record("ok", "LLM_PROVIDER", provider);

  // --- schema ----------------------------------------------------------------
  const db = await getDb();

  const tables = new Set(
    queryAll<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table'", []).map((row) => row.name)
  );
  const missingTables = EXPECTED_TABLES.filter((table) => !tables.has(table));
  if (missingTables.length === 0) record("ok", "tables", `all ${EXPECTED_TABLES.length} present`);
  else record("fail", "tables", `missing: ${missingTables.join(", ")}`);

  const missingColumns: string[] = [];
  for (const [table, columns] of EXPECTED_COLUMNS) {
    if (!tables.has(table)) continue;
    const present = new Set(
      (db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? []).map((row) => String(row[1]))
    );
    for (const column of columns) {
      if (!present.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }
  if (missingColumns.length === 0) record("ok", "migrations", "every added column is present");
  else record("fail", "migrations", `missing: ${missingColumns.join(", ")} — restart the server to apply them`);

  // --- google ----------------------------------------------------------------
  const connection = queryOne<{ google_account_email: string | null; connected_at: string }>(
    db,
    "SELECT google_account_email, connected_at FROM google_connections LIMIT 1",
    []
  );
  if (connection) record("ok", "google account", `${connection.google_account_email} (since ${connection.connected_at})`);
  else record("fail", "google account", "not connected — steps 1, 6 and 7 have no data source");

  // --- demo fallback ---------------------------------------------------------
  const seededActions = queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM actions WHERE is_demo_seed = 1", []);
  const seededDiagnoses = queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM diagnoses WHERE is_demo_seed = 1", []);
  if ((seededActions?.n ?? 0) > 0 && (seededDiagnoses?.n ?? 0) > 0) {
    record("ok", "demo fallback", `${seededDiagnoses?.n} diagnoses, ${seededActions?.n} actions — run \`npm run seed\` to refresh`);
  } else {
    record("warn", "demo fallback", "not seeded — run `npm run seed` (with the server stopped) for an offline demo path");
  }

  // --- per-website readiness -------------------------------------------------
  const websites = queryAll<{ id: string; url: string }>(db, "SELECT id, url FROM websites ORDER BY created_at", []);
  console.log("");
  if (websites.length === 0) {
    record("warn", "websites", "none yet — add a client and a website before the demo");
  } else {
    for (const website of websites) {
      const mapping = queryOne<{ gsc_site_url: string | null }>(
        db,
        "SELECT gsc_site_url FROM website_google_properties WHERE website_id = ?",
        [website.id]
      );
      const crawl = queryOne<{ id: string; pages_crawled: number }>(
        db,
        "SELECT id, pages_crawled FROM crawls WHERE website_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1",
        [website.id]
      );
      const issues = crawl
        ? queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM audit_issues WHERE crawl_id = ?", [crawl.id])
        : null;
      const diagnoses = queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM diagnoses WHERE website_id = ?", [
        website.id,
      ]);

      const steps = [
        `crawl ${crawl ? `${crawl.pages_crawled}p` : "—"}`,
        `audit ${issues?.n ? `${issues.n}` : "—"}`,
        `diagnoses ${diagnoses?.n ? `${diagnoses.n}` : "—"}`,
        `gsc ${mapping?.gsc_site_url ? "yes" : "—"}`,
      ].join("  ·  ");

      const ready = Boolean(crawl && issues?.n && diagnoses?.n);
      record(ready ? "ok" : "warn", website.url, steps);
    }
  }

  // --- output ----------------------------------------------------------------
  const icon: Record<Level, string> = { ok: " OK ", warn: "WARN", fail: "FAIL" };
  const width = Math.max(...results.map((result) => result.label.length));

  console.log("DEMO READINESS\n");
  for (const result of results) {
    console.log(`[${icon[result.level]}]  ${result.label.padEnd(width)}  ${result.detail}`);
  }

  const failures = results.filter((result) => result.level === "fail").length;
  const warnings = results.filter((result) => result.level === "warn").length;
  console.log("");
  console.log(failures === 0 ? `No blockers. ${warnings} warning(s).` : `${failures} blocker(s), ${warnings} warning(s).`);
  console.log("");
  console.log("Reminder: sql.js keeps the whole database in memory, so stop the server");
  console.log("before running any script that writes (npm run seed) or its writes are lost.");

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
