// Needed because priorityScore reaches ../config through the llm module, and config
// validates TOKEN_ENCRYPTION_KEY at import time.
import "dotenv/config";
import { v4 as uuid } from "uuid";
import { getDb, saveDb } from "../db";
import { queryOne, run } from "../db/helpers";
import { runAudit, siteStructureFindings } from "../audit/rules";
import { priorityScore } from "../services/diagnoseService";
import type { ActionType, Crawl, CrawlLink, CrawlPage, DiagnosisDraft } from "../types";

/**
 * Builds a complete offline demo: a crawl, its audit, diagnoses, approved actions and
 * measured results — so every step of the loop has something to show even with no
 * network, no API keys, and no Google connection.
 *
 * Two honesty rules hold:
 *  - Every row is stamped is_demo_seed = 1 and the UI labels it "demo data".
 *  - Only the crawl *input* is invented. The audit issues below are produced by the
 *    real rules engine running over those pages, and priority scores by the real
 *    formula — so what the demo shows is genuinely computed, not typed out.
 *
 * IMPORTANT: stop the server before running this. sql.js holds the whole database in
 * memory, so a running server will overwrite whatever this script writes.
 *   npx tsx src/scripts/seedDemo.ts
 */

const DEMO_CLIENT_NAME = "Demo Client (seeded)";
const DEMO_SITE_URL = "https://demo.example.com";

const ROBOTS_TXT = `User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: https://demo.example.com/sitemap.xml
`;

/** Listed in the sitemap; deliberately never linked, so ORPHAN_PAGE fires. */
const SITEMAP_URLS = [
  "https://demo.example.com/",
  "https://demo.example.com/services",
  "https://demo.example.com/services/implants",
  "https://demo.example.com/services/whitening",
  "https://demo.example.com/about",
  "https://demo.example.com/offers/ramadan-discount",
];

type SeedPage = Omit<CrawlPage, "id" | "crawl_id" | "crawled_at">;

const page = (over: Partial<SeedPage> & { url: string }): SeedPage => ({
  status_code: 200,
  title: "عيادة الشام لطب الأسنان",
  meta_description: "عيادة أسنان في حلب",
  meta_robots: null,
  h1: "عيادة الشام",
  h1_count: 1,
  h2_count: 3,
  h3_count: 2,
  images_count: 4,
  images_missing_alt: 0,
  hreflang_count: 0,
  schema_types: '["Organization","LocalBusiness"]',
  html_lang: "ar",
  canonical_url: over.url,
  redirect_url: null,
  content_type: "text/html; charset=utf-8",
  word_count: 720,
  response_time_ms: 340,
  is_broken: 0,
  discovered_from: DEMO_SITE_URL,
  ...over,
});

// Each page is shaped to trip a specific rule, so the audit output covers every category.
const PAGES: SeedPage[] = [
  page({
    url: "https://demo.example.com/",
    title: "عيادة الشام لطب الأسنان في حلب — تقويم وزراعة وتبييض الأسنان بأحدث التقنيات",
    discovered_from: null,
  }),
  page({ url: "https://demo.example.com/services", meta_description: null, schema_types: "[]" }),
  page({
    url: "https://demo.example.com/services/implants",
    title: "خدماتنا",
    word_count: 140,
    h2_count: 0,
    schema_types: "[]",
  }),
  page({
    url: "https://demo.example.com/services/whitening",
    title: "خدماتنا",
    images_count: 3,
    images_missing_alt: 2,
    schema_types: "[]",
  }),
  page({
    url: "https://demo.example.com/about",
    meta_robots: "noindex, follow",
    word_count: 410,
  }),
  page({
    url: "https://demo.example.com/contact",
    images_count: 5,
    images_missing_alt: 5,
    canonical_url: null,
    word_count: 190,
    schema_types: "[]",
  }),
  page({
    url: "https://demo.example.com/blog/teeth-cleaning-guide",
    title: "دليل تنظيف الأسنان",
    word_count: 900,
    h2_count: 0,
    html_lang: null,
    schema_types: "[]",
  }),
  page({ url: "https://demo.example.com/old-price-list", status_code: 404, is_broken: 1, title: null }),
];

type SeedLink = Omit<CrawlLink, "id" | "crawl_id" | "checked_at">;

const LINKS: SeedLink[] = [
  { source_url: "https://demo.example.com/", target_url: "https://demo.example.com/services", anchor_text: "خدماتنا", is_internal: 1, status_code: null, is_broken: 0 },
  { source_url: "https://demo.example.com/", target_url: "https://demo.example.com/about", anchor_text: "من نحن", is_internal: 1, status_code: null, is_broken: 0 },
  { source_url: "https://demo.example.com/", target_url: "https://demo.example.com/contact", anchor_text: "اتصل بنا", is_internal: 1, status_code: null, is_broken: 0 },
  { source_url: "https://demo.example.com/services", target_url: "https://demo.example.com/services/implants", anchor_text: "زراعة الأسنان", is_internal: 1, status_code: null, is_broken: 0 },
  { source_url: "https://demo.example.com/services", target_url: "https://demo.example.com/services/whitening", anchor_text: "تبييض الأسنان", is_internal: 1, status_code: null, is_broken: 0 },
  { source_url: "https://demo.example.com/services", target_url: "https://demo.example.com/old-price-list", anchor_text: "قائمة الأسعار", is_internal: 1, status_code: 404, is_broken: 1 },
  { source_url: "https://demo.example.com/contact", target_url: "https://maps.example.org/aleppo-clinic", anchor_text: "موقعنا على الخريطة", is_internal: 0, status_code: 404, is_broken: 1 },
];

/** Written by hand, but scored by the real priority formula rather than typed in. */
const DIAGNOSIS_DRAFTS: DiagnosisDraft[] = [
  {
    problem: "The About page is excluded from Google by a noindex tag",
    evidence: [
      "/about serves meta robots \"noindex, follow\"",
      "It is linked from the homepage, so visitors reach it but search engines are told to drop it",
      "For a local clinic the About page carries the trust signals patients search for by name",
    ],
    root_cause:
      "A noindex left over from the site's staging phase was never removed when the page went live.",
    severity: 5,
    business_impact: 4,
    effort: 1,
    confidence: 0.95,
    action_type: "fix_technical",
    recommended_action: "Remove the noindex directive from /about and request re-indexing in Search Console",
  },
  {
    problem: "The two main service pages share one title and compete with each other",
    evidence: [
      "/services/implants and /services/whitening both use the title \"خدماتنا\"",
      "Neither title names the service or the city",
      "/services/implants also has only 140 words and no h2 headings",
    ],
    root_cause:
      "Service pages were created from one template and the title field was never customised per service.",
    severity: 4,
    business_impact: 5,
    effort: 2,
    confidence: 0.9,
    action_type: "improve_title",
    recommended_action:
      "Give each service page its own title naming the treatment and the city, e.g. \"زراعة الأسنان في حلب — عيادة الشام\"",
  },
  {
    problem: "The contact page gives search engines nothing to read",
    evidence: [
      "All 5 images on /contact are missing alt attributes",
      "The page has 190 words and no canonical URL",
      "It carries no structured data, so opening hours and address are invisible to Google",
    ],
    root_cause:
      "The page was built as a map embed plus photos, with the practice details rendered only inside images.",
    severity: 3,
    business_impact: 4,
    effort: 2,
    confidence: 0.85,
    action_type: "improve_schema",
    recommended_action:
      "Add LocalBusiness structured data with address, phone and opening hours, and alt text describing each photo",
  },
  {
    problem: "A promotional landing page exists but nothing on the site links to it",
    evidence: [
      "/offers/ramadan-discount appears in the sitemap but has no internal link pointing to it",
      "The crawler could not reach it from any page",
    ],
    root_cause: "The offer page was published directly without being added to any menu or campaign block.",
    severity: 3,
    business_impact: 3,
    effort: 1,
    confidence: 0.8,
    action_type: "add_internal_links",
    recommended_action: "Link the offer page from the homepage hero and the services page sidebar",
  },
];

/**
 * Stage 7 (minimum viable): a hand-authored draft, not model-generated — seedDemo.ts
 * runs offline with no API key. It exists so the Content Draft section of the UI has
 * something to show before any real LLM call ever succeeds, and is stamped
 * is_demo_seed = 1 like everything else this script writes.
 */
const CONTENT_DEMO_ACTION_TITLE = "Publish a page on dental implant recovery timelines";
const CONTENT_DEMO_DRAFT = {
  primary_keyword: "مدة التعافي بعد زراعة الأسنان",
  secondary_keywords: ["زراعة الأسنان في حلب", "نصائح ما بعد الزراعة", "الألم بعد زراعة الأسنان"],
  content_type: "informational" as const,
  seo_title: "مدة التعافي بعد زراعة الأسنان — الجدول الزمني الكامل",
  meta_description: "تعرف على مراحل التعافي بعد زراعة الأسنان أسبوعًا بأسبوع، ومتى تعود لطعامك المعتاد.",
  url_slug: "recovery-timeline-dental-implants",
  outline: [
    { level: "h1" as const, text: "مدة التعافي بعد زراعة الأسنان" },
    { level: "h2" as const, text: "الأسبوع الأول: الالتهاب والراحة" },
    { level: "h2" as const, text: "الأسبوعان الثاني والثالث: العودة التدريجية للطعام الطبيعي" },
    { level: "h2" as const, text: "الشهر الثاني إلى السادس: اندماج الزرعة بالعظم" },
    { level: "h3" as const, text: "متى تحتاج مراجعة الطبيب فورًا" },
  ],
  body_markdown:
    "# مدة التعافي بعد زراعة الأسنان\n\n" +
    "يسأل معظم المرضى في عيادة الشام عن السؤال نفسه: متى أعود لحياتي الطبيعية بعد زراعة الأسنان؟ " +
    "الجواب يختلف حسب عدد الزرعات وصحة الفك، لكن هذا هو الجدول الزمني المعتاد.\n\n" +
    "## الأسبوع الأول: الالتهاب والراحة\n\n" +
    "توقع بعض التورم والانزعاج الخفيف خلال الأيام الثلاثة الأولى. الكمادات الباردة ومسكنات الألم " +
    "الموصوفة كافية لمعظم المرضى. تجنب المضغ على جهة الزرعة تمامًا خلال هذه المرحلة.\n\n" +
    "## الأسبوعان الثاني والثالث: العودة التدريجية للطعام الطبيعي\n\n" +
    "يقل التورم بشكل ملحوظ، ويمكن البدء بإدخال أطعمة طرية إلى النظام الغذائي. اللثة حول الزرعة " +
    "تكون لا تزال حساسة، فالتنظيف اللطيف بفرشاة ناعمة ضروري لمنع الالتهاب.\n\n" +
    "## الشهر الثاني إلى السادس: اندماج الزرعة بالعظم\n\n" +
    "هذه أهم مرحلة، وتحدث تحت السطح دون أعراض ملحوظة غالبًا. الزرعة تندمج مع عظم الفك في عملية " +
    "تسمى الالتحام العظمي، وتستغرق بين ثلاثة وستة أشهر حسب كثافة العظم.\n\n" +
    "### متى تحتاج مراجعة الطبيب فورًا\n\n" +
    "ألم متزايد بعد اليوم الخامس، أو نزيف لا يتوقف، أو حمى، كلها إشارات تستدعي اتصالًا فوريًا " +
    "بالعيادة بدل انتظار الموعد التالي.",
};

interface SeedAction {
  actionType: ActionType;
  title: string;
  daysAgo: number;
  beforeClicks: number;
  afterClicks: number;
}

/** Mixed on purpose: the Learning table is only interesting if some types fail. */
const SEED_ACTIONS: SeedAction[] = [
  { actionType: "improve_title", title: "Rewrite titles on the 12 category pages", daysAgo: 150, beforeClicks: 420, afterClicks: 512 },
  { actionType: "improve_title", title: "Shorten truncated titles on blog posts", daysAgo: 118, beforeClicks: 512, afterClicks: 587 },
  { actionType: "improve_title", title: "Add brand suffix to product titles", daysAgo: 86, beforeClicks: 587, afterClicks: 601 },
  { actionType: "add_internal_links", title: "Link the pillar guide from 8 supporting posts", daysAgo: 132, beforeClicks: 455, afterClicks: 548 },
  { actionType: "add_internal_links", title: "Add contextual links to orphaned service pages", daysAgo: 74, beforeClicks: 601, afterClicks: 655 },
  { actionType: "fix_technical", title: "Fix 23 broken internal links", daysAgo: 104, beforeClicks: 548, afterClicks: 559 },
  { actionType: "fix_technical", title: "Add canonical tags to paginated listings", daysAgo: 62, beforeClicks: 655, afterClicks: 648 },
  { actionType: "refresh_content", title: "Expand the four thinnest service pages", daysAgo: 96, beforeClicks: 559, afterClicks: 634 },
  { actionType: "improve_meta", title: "Write meta descriptions for 31 pages", daysAgo: 48, beforeClicks: 648, afterClicks: 641 },
];

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const db = await getDb();

  let client = queryOne<{ id: string }>(db, "SELECT id FROM clients WHERE name = ?", [DEMO_CLIENT_NAME]);
  if (!client) {
    const id = uuid();
    run(db, "INSERT INTO clients (id, name, notes) VALUES (?, ?, ?)", [
      id,
      DEMO_CLIENT_NAME,
      "Seeded by src/scripts/seedDemo.ts — an offline walkthrough of the whole loop. Not a real client.",
    ]);
    client = { id };
  }

  let website = queryOne<{ id: string }>(db, "SELECT id FROM websites WHERE client_id = ? AND url = ?", [
    client.id,
    DEMO_SITE_URL,
  ]);
  if (!website) {
    const id = uuid();
    run(
      db,
      `INSERT INTO websites (id, client_id, url, site_type, country, language, goal, niche, target_audience, cms)
       VALUES (?, ?, ?, 'services', 'SY', 'ar', ?, ?, ?, 'WordPress')`,
      [
        id,
        client.id,
        DEMO_SITE_URL,
        "Increase appointment bookings",
        "Dental clinics",
        "Aleppo residents looking for a local dentist",
      ]
    );
    website = { id };
  }

  // Clearing by flag keeps the script re-runnable without touching real rows. Deleting
  // the crawl cascades to its pages, links, sitemap urls and audit issues.
  run(db, "DELETE FROM actions WHERE is_demo_seed = 1", []);
  run(db, "DELETE FROM diagnoses WHERE is_demo_seed = 1", []);
  run(db, "DELETE FROM crawls WHERE website_id = ?", [website.id]);

  // --- Step 1: the crawl -----------------------------------------------------
  const crawlId = uuid();
  const brokenLinks = LINKS.filter((link) => link.is_broken).length;
  run(
    db,
    `INSERT INTO crawls
      (id, website_id, status, started_at, finished_at, pages_crawled, broken_links_count,
       robots_status, robots_content, robots_sitemaps, sitemap_url, sitemap_status, sitemap_url_count)
     VALUES (?, ?, 'completed', ?, ?, ?, ?, 200, ?, ?, ?, 200, ?)`,
    [
      crawlId,
      website.id,
      isoDaysAgo(0),
      isoDaysAgo(0),
      PAGES.length,
      brokenLinks,
      ROBOTS_TXT,
      JSON.stringify(["https://demo.example.com/sitemap.xml"]),
      "https://demo.example.com/sitemap.xml",
      SITEMAP_URLS.length,
    ]
  );

  const pageRows: CrawlPage[] = PAGES.map((seed) => ({
    ...seed,
    id: uuid(),
    crawl_id: crawlId,
    crawled_at: isoDaysAgo(0),
  }));
  for (const row of pageRows) {
    run(
      db,
      `INSERT INTO crawl_pages
        (id, crawl_id, url, status_code, title, meta_description, meta_robots, h1, h1_count,
         h2_count, h3_count, images_count, images_missing_alt, hreflang_count, schema_types, html_lang,
         canonical_url, redirect_url, content_type, word_count, response_time_ms, is_broken, discovered_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, crawlId, row.url, row.status_code, row.title, row.meta_description, row.meta_robots,
        row.h1, row.h1_count, row.h2_count, row.h3_count, row.images_count, row.images_missing_alt,
        row.hreflang_count, row.schema_types, row.html_lang, row.canonical_url, row.redirect_url,
        row.content_type, row.word_count, row.response_time_ms, row.is_broken, row.discovered_from,
      ]
    );
  }

  const linkRows: CrawlLink[] = LINKS.map((seed) => ({
    ...seed,
    id: uuid(),
    crawl_id: crawlId,
    checked_at: isoDaysAgo(0),
  }));
  for (const row of linkRows) {
    run(
      db,
      `INSERT INTO crawl_links (id, crawl_id, source_url, target_url, anchor_text, is_internal, status_code, is_broken)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, crawlId, row.source_url, row.target_url, row.anchor_text, row.is_internal, row.status_code, row.is_broken]
    );
  }

  for (const url of SITEMAP_URLS) {
    run(db, "INSERT INTO crawl_sitemap_urls (id, crawl_id, url, lastmod) VALUES (?, ?, ?, ?)", [
      uuid(),
      crawlId,
      url,
      isoDateDaysAgo(20),
    ]);
  }

  // --- Step 2: the audit, produced by the real rules engine ------------------
  const crawlRow = queryOne<Crawl>(db, "SELECT * FROM crawls WHERE id = ?", [crawlId])!;
  const findings = [
    ...runAudit(pageRows, linkRows),
    ...siteStructureFindings(crawlRow, pageRows, linkRows, SITEMAP_URLS),
  ];
  for (const finding of findings) {
    run(
      db,
      `INSERT INTO audit_issues (id, website_id, crawl_id, rule_code, category, severity, page_url, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), website.id, crawlId, finding.rule_code, finding.category, finding.severity, finding.page_url, finding.detail]
    );
  }

  // --- Step 3: diagnoses -----------------------------------------------------
  const diagnosisIds: string[] = [];
  for (const draft of DIAGNOSIS_DRAFTS) {
    const id = uuid();
    diagnosisIds.push(id);
    run(
      db,
      `INSERT INTO diagnoses
        (id, website_id, crawl_id, problem, evidence, root_cause, severity, business_impact,
         effort, confidence, priority_score, action_type, recommended_action, model, is_demo_seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seeded demo data', 1)`,
      [
        id, website.id, crawlId, draft.problem, JSON.stringify(draft.evidence), draft.root_cause,
        draft.severity, draft.business_impact, draft.effort, draft.confidence,
        priorityScore(draft), draft.action_type, draft.recommended_action,
      ]
    );
  }

  // --- Steps 5-7: actions with measured results ------------------------------
  for (const seed of SEED_ACTIONS) {
    const actionId = uuid();
    run(
      db,
      `INSERT INTO actions (id, website_id, diagnosis_id, action_type, title, status, before_metrics, approved_at, is_demo_seed)
       VALUES (?, ?, NULL, ?, ?, 'done', ?, ?, 1)`,
      [
        actionId,
        website.id,
        seed.actionType,
        seed.title,
        JSON.stringify({
          clicks: seed.beforeClicks,
          impressions: seed.beforeClicks * 18,
          ctr: 1 / 18,
          position: 14.2,
          period_start: isoDateDaysAgo(seed.daysAgo + 28),
          period_end: isoDateDaysAgo(seed.daysAgo + 1),
        }),
        isoDaysAgo(seed.daysAgo),
      ]
    );

    const deltaClicks = seed.afterClicks - seed.beforeClicks;
    run(
      db,
      `INSERT INTO action_results
        (id, action_id, after_metrics, delta_clicks, delta_impressions, delta_ctr, delta_position, success, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        actionId,
        JSON.stringify({
          clicks: seed.afterClicks,
          impressions: seed.afterClicks * 17,
          ctr: 1 / 17,
          position: 13.1,
          period_start: isoDateDaysAgo(seed.daysAgo),
          period_end: isoDateDaysAgo(seed.daysAgo - 27),
        }),
        deltaClicks,
        seed.afterClicks * 17 - seed.beforeClicks * 18,
        1 / 17 - 1 / 18,
        1.1,
        deltaClicks > 0 ? 1 : 0,
        isoDaysAgo(seed.daysAgo - 28),
      ]
    );
  }

  // --- Stage 7 (minimum viable): one action with a hand-authored draft attached ---
  const contentActionId = uuid();
  run(
    db,
    `INSERT INTO actions (id, website_id, diagnosis_id, action_type, title, status, before_metrics, approved_at, is_demo_seed)
     VALUES (?, ?, NULL, 'create_content', ?, 'approved', NULL, ?, 1)`,
    [contentActionId, website.id, CONTENT_DEMO_ACTION_TITLE, isoDaysAgo(1)]
  );
  run(
    db,
    `INSERT INTO content_drafts
      (id, action_id, website_id, primary_keyword, secondary_keywords, content_type,
       seo_title, meta_description, url_slug, outline, body_markdown, model, is_demo_seed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seeded demo data', 1)`,
    [
      uuid(),
      contentActionId,
      website.id,
      CONTENT_DEMO_DRAFT.primary_keyword,
      JSON.stringify(CONTENT_DEMO_DRAFT.secondary_keywords),
      CONTENT_DEMO_DRAFT.content_type,
      CONTENT_DEMO_DRAFT.seo_title,
      CONTENT_DEMO_DRAFT.meta_description,
      CONTENT_DEMO_DRAFT.url_slug,
      JSON.stringify(CONTENT_DEMO_DRAFT.outline),
      CONTENT_DEMO_DRAFT.body_markdown,
    ]
  );

  saveDb();

  console.log(`Seeded demo website ${website.id}`);
  console.log(`  crawl:     ${PAGES.length} pages, ${LINKS.length} links, ${SITEMAP_URLS.length} sitemap urls`);
  console.log(`  audit:     ${findings.length} issues, computed by the real rules engine`);
  console.log(`  diagnoses: ${diagnosisIds.length}, priority scored by the real formula`);
  console.log(`  actions:   ${SEED_ACTIONS.length} with measured results`);
  console.log(`  content:   1 hand-authored draft (Stage 7 minimum) on a create_content action`);
  console.log("");
  console.log("Every row is is_demo_seed = 1 and shows a 'demo data' badge in the UI.");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
