import fs from "fs";
import path from "path";
import initSqlJs, { Database } from "sql.js";

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS websites (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    site_type TEXT NOT NULL CHECK (site_type IN ('store', 'services', 'blog')),
    country TEXT NOT NULL,
    language TEXT NOT NULL,
    goal TEXT,
    niche TEXT,
    target_audience TEXT,
    cms TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_websites_client_id ON websites(client_id);

  -- Singleton: exactly one row, the agency's own Google account
  CREATE TABLE IF NOT EXISTS google_connections (
    id TEXT PRIMARY KEY,
    google_account_email TEXT,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_expiry TEXT NOT NULL,
    scope TEXT NOT NULL,
    connected_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Per-website mapping to properties visible in that one Google account
  CREATE TABLE IF NOT EXISTS website_google_properties (
    website_id TEXT PRIMARY KEY REFERENCES websites(id) ON DELETE CASCADE,
    gsc_site_url TEXT,
    ga4_property_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS crawls (
    id TEXT PRIMARY KEY,
    website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')) DEFAULT 'running',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    pages_crawled INTEGER NOT NULL DEFAULT 0,
    broken_links_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    robots_status INTEGER,
    robots_content TEXT,
    robots_sitemaps TEXT,
    sitemap_url TEXT,
    sitemap_status INTEGER,
    sitemap_url_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_crawls_website_id ON crawls(website_id);

  CREATE TABLE IF NOT EXISTS crawl_pages (
    id TEXT PRIMARY KEY,
    crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    status_code INTEGER,
    title TEXT,
    meta_description TEXT,
    meta_robots TEXT,
    h1 TEXT,
    h1_count INTEGER NOT NULL DEFAULT 0,
    h2_count INTEGER NOT NULL DEFAULT 0,
    h3_count INTEGER NOT NULL DEFAULT 0,
    images_count INTEGER NOT NULL DEFAULT 0,
    images_missing_alt INTEGER NOT NULL DEFAULT 0,
    hreflang_count INTEGER NOT NULL DEFAULT 0,
    schema_types TEXT,
    html_lang TEXT,
    canonical_url TEXT,
    redirect_url TEXT,
    content_type TEXT,
    word_count INTEGER,
    response_time_ms INTEGER,
    is_broken INTEGER NOT NULL DEFAULT 0,
    discovered_from TEXT,
    crawled_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_pages_dedupe ON crawl_pages(crawl_id, url);

  CREATE TABLE IF NOT EXISTS crawl_links (
    id TEXT PRIMARY KEY,
    crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    anchor_text TEXT,
    is_internal INTEGER NOT NULL DEFAULT 0,
    status_code INTEGER,
    is_broken INTEGER NOT NULL DEFAULT 0,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_crawl_links_crawl_id ON crawl_links(crawl_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_links_dedupe ON crawl_links(crawl_id, source_url, target_url);

  -- What the sitemap claims exists, so the audit can compare it against what the
  -- crawler could actually reach (orphan pages) and what it found but the sitemap omits.
  CREATE TABLE IF NOT EXISTS crawl_sitemap_urls (
    id TEXT PRIMARY KEY,
    crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    lastmod TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_sitemap_urls_dedupe ON crawl_sitemap_urls(crawl_id, url);

  -- Stage 3-7 loop: Analysis -> Diagnosis -> Decision -> Action -> Measurement -> Learning.
  -- Narrow key/value on purpose: this codebase has no migrations (CREATE TABLE IF NOT EXISTS
  -- only), so a wide column-per-metric table could never gain a column on an existing db.
  CREATE TABLE IF NOT EXISTS metric_snapshots (
    id TEXT PRIMARY KEY,
    website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('gsc', 'ga4', 'psi')),
    metric_key TEXT NOT NULL,
    metric_value REAL NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_metric_snapshots_lookup
    ON metric_snapshots(website_id, source, metric_key, period_start);

  CREATE TABLE IF NOT EXISTS audit_issues (
    id TEXT PRIMARY KEY,
    website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    crawl_id TEXT NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
    rule_code TEXT NOT NULL,
    category TEXT NOT NULL,
    severity INTEGER NOT NULL,
    page_url TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_issues_crawl_id ON audit_issues(crawl_id);

  CREATE TABLE IF NOT EXISTS diagnoses (
    id TEXT PRIMARY KEY,
    website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    crawl_id TEXT REFERENCES crawls(id) ON DELETE SET NULL,
    problem TEXT NOT NULL,
    evidence TEXT NOT NULL,
    root_cause TEXT NOT NULL,
    severity INTEGER NOT NULL,
    business_impact INTEGER NOT NULL,
    effort INTEGER NOT NULL,
    confidence REAL NOT NULL,
    priority_score REAL NOT NULL,
    action_type TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    model TEXT,
    is_demo_seed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_diagnoses_website_id ON diagnoses(website_id);

  -- is_demo_seed marks rows written by scripts/seedDemo.ts so the UI can label them
  -- "demo data" instead of passing them off as the client's own numbers.
  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    diagnosis_id TEXT REFERENCES diagnoses(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('approved', 'done', 'dismissed')) DEFAULT 'approved',
    before_metrics TEXT,
    approved_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_demo_seed INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_actions_website_id ON actions(website_id);

  CREATE TABLE IF NOT EXISTS action_results (
    id TEXT PRIMARY KEY,
    action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    after_metrics TEXT,
    delta_clicks REAL,
    delta_impressions REAL,
    delta_ctr REAL,
    delta_position REAL,
    success INTEGER,
    measured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_action_results_action_id ON action_results(action_id);

  -- Stage 7 (minimum viable): one draft per approved action. outline is a
  -- JSON-encoded OutlineItem[] (see types/index.ts) rather than its own table —
  -- it's never queried independently of the draft that owns it.
  CREATE TABLE IF NOT EXISTS content_drafts (
    id TEXT PRIMARY KEY,
    action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
    website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    primary_keyword TEXT NOT NULL,
    secondary_keywords TEXT NOT NULL,
    content_type TEXT NOT NULL,
    seo_title TEXT NOT NULL,
    meta_description TEXT NOT NULL,
    url_slug TEXT NOT NULL,
    outline TEXT NOT NULL,
    body_markdown TEXT NOT NULL,
    model TEXT,
    is_demo_seed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_drafts_action ON content_drafts(action_id);

  -- S5-3 (Lilian's task list, keyword intelligence stage): one decision per (page, query)
  -- pair so a specialist can see and set "target with new content / improve existing /
  -- ignore" for a specific keyword+page combination, not just view the analytics.
  CREATE TABLE IF NOT EXISTS keyword_decisions (
    id TEXT PRIMARY KEY,
    website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    page TEXT NOT NULL,
    query TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('target_new', 'improve_existing', 'ignore')),
    note TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_decisions_dedupe ON keyword_decisions(website_id, page, query);

  -- S7-1: a snapshot of a draft's editable fields taken right before an in-place Save
  -- overwrites them, so "الحفظ لا يفقد المراجعة السابقة" holds — a save never destroys
  -- the version it replaces. Only in-place edits are snapshotted here; a full
  -- Regenerate already keeps nothing (it deletes+reinserts the row by design), so it
  -- has nothing to preserve. Feeds the publish log a later stage (S9-4) will read.
  CREATE TABLE IF NOT EXISTS content_draft_versions (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES content_drafts(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    primary_keyword TEXT NOT NULL,
    secondary_keywords TEXT NOT NULL,
    seo_title TEXT NOT NULL,
    meta_description TEXT NOT NULL,
    url_slug TEXT NOT NULL,
    outline TEXT NOT NULL,
    body_markdown TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_content_draft_versions_draft ON content_draft_versions(draft_id, version);
`;

const RECONCILE_STALE_CRAWLS = `
  UPDATE crawls SET status = 'failed', error = 'interrupted by server restart' WHERE status = 'running';
`;

/**
 * Additive migrations. SCHEMA above only ever CREATEs, so a table that already exists
 * in someone's local db never gains a new column from it — these ALTERs are how those
 * databases catch up. SQLite throws on a duplicate ADD COLUMN, hence the table_info
 * guard. Additive only: never put a drop, rename, or type change in here.
 */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: "websites", column: "niche", definition: "TEXT" },
  { table: "websites", column: "target_audience", definition: "TEXT" },
  { table: "websites", column: "cms", definition: "TEXT" },
  { table: "crawl_pages", column: "h2_count", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_pages", column: "h3_count", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_pages", column: "images_count", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_pages", column: "images_missing_alt", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_pages", column: "hreflang_count", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_pages", column: "schema_types", definition: "TEXT" },
  { table: "crawl_pages", column: "html_lang", definition: "TEXT" },
  { table: "crawls", column: "robots_status", definition: "INTEGER" },
  { table: "crawls", column: "robots_content", definition: "TEXT" },
  { table: "crawls", column: "robots_sitemaps", definition: "TEXT" },
  { table: "crawls", column: "sitemap_url", definition: "TEXT" },
  { table: "crawls", column: "sitemap_status", definition: "INTEGER" },
  { table: "crawls", column: "sitemap_url_count", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "diagnoses", column: "is_demo_seed", definition: "INTEGER NOT NULL DEFAULT 0" },
  // S4-2 / S9-5 (Lilian's task list): a diagnosis/opportunity can be dismissed from the
  // Decision screen without ever becoming an action — distinct from actions.status
  // 'dismissed', which only applies after approval.
  { table: "diagnoses", column: "dismissed", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "diagnoses", column: "dismissed_reason", definition: "TEXT" },
  // S7-1 / S8-3 (Lilian's task list): in-place editing of a generated draft, and the
  // human approve/edit/reject step after the pre-publish gate's verdict.
  { table: "content_drafts", column: "review_status", definition: "TEXT NOT NULL DEFAULT 'pending'" },
  { table: "content_drafts", column: "review_reason", definition: "TEXT" },
  { table: "content_drafts", column: "reviewed_at", definition: "TEXT" },
  { table: "content_drafts", column: "is_edited", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "content_drafts", column: "edited_at", definition: "TEXT" },
  { table: "content_drafts", column: "version", definition: "INTEGER NOT NULL DEFAULT 1" },
];

function applyAdditiveMigrations(database: Database): void {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const info = database.exec(`PRAGMA table_info(${table})`);
    const existing = info[0]?.values.map((row) => String(row[1])) ?? [];
    if (existing.includes(column)) continue;
    database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const existing = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : undefined;
  db = existing ? new SQL.Database(existing) : new SQL.Database();
  // Must be its own statement, before anything else. SQLite makes this pragma a no-op
  // inside a transaction, and it was previously the first line of the multi-statement
  // SCHEMA string — where it silently did nothing, leaving every ON DELETE CASCADE
  // inert. Deleting a client used to orphan its websites, crawls and actions instead.
  db.run("PRAGMA foreign_keys = ON");

  db.run(SCHEMA);
  applyAdditiveMigrations(db);
  db.run(RECONCILE_STALE_CRAWLS);
  saveDb();

  return db;
}

export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  // sql.js's export() closes the connection and reopens it, which resets every
  // per-connection pragma — so foreign key enforcement has to be switched back on
  // after each save, or the first saveDb() silently disables it for the rest of the
  // process and every ON DELETE CASCADE stops firing.
  db.run("PRAGMA foreign_keys = ON");
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}
