import type {
  IntentTag,
  PageAnalyticsRow,
  PageIntentSummary,
  PageQueryRow,
  QueryIntent,
  SearchConsolePageSummary,
  SearchIntent,
  SearchIntentSummary,
} from "../types";

/**
 * Module 5 — Search Intent Engine. Deterministic keyword-pattern classification over
 * queries Search Console already gave us, in both English and Arabic. No model call:
 * this feeds the priority formula's business_impact ("a transactional query converts
 * clients, an informational one builds trust") and later feeds Stage 5/7 content
 * planning with a real "Search Intent" field instead of a guess.
 *
 * Known limitation, stated plainly rather than faked: local intent is detected from
 * explicit signals (near me, address, hours) and an optional site-provided locality
 * list — this is not general place-name recognition. A query like "dentist aleppo"
 * with no city list supplied classifies on its other words, not as local.
 */

interface CategoryPattern {
  category: SearchIntent;
  /** Weight lets one strong signal ("how much" = price intent) outweigh a generic one. */
  weight: number;
  test: RegExp;
}

const CATEGORY_PATTERNS: CategoryPattern[] = [
  // Transactional — the query implies handing over money or booking time, now.
  { category: "transactional", weight: 2, test: /\bhow much\b/i },
  { category: "transactional", weight: 1, test: /\bbuy\b|\bpurchase\b|\border\b|\bhire\b|\bquote\b/i },
  { category: "transactional", weight: 1, test: /\bbook(ing)?\b|\bappointment\b|\bschedule\b/i },
  { category: "transactional", weight: 1, test: /\bprice[s]?\b|\bcost[s]?\b|\brates?\b/i },
  { category: "transactional", weight: 1, test: /\bcoupon\b|\bdiscount\b|\bdeal[s]?\b|\bsale\b/i },
  { category: "transactional", weight: 2, test: /كم سعر|كم تكلفة|كم يكلف/ },
  { category: "transactional", weight: 1, test: /اشتري|شراء|احجز|حجز|موعد|سعر|أسعار|اسعار|عرض|خصم|كوبون|اطلب|طلب/ },

  // Local — explicit locality signals only; see the file-level note on scope.
  { category: "local", weight: 1, test: /\bnear me\b|\bnearby\b/i },
  { category: "local", weight: 1, test: /\baddress\b|\bdirections\b|\bopening hours\b|\bopen now\b/i },
  { category: "local", weight: 1, test: /قرب|بالقرب|أقرب|فرع|عنوان|دوام|مواعيد العمل|كيف اوصل/ },

  // Commercial — comparing options before a transactional query, not making one yet.
  { category: "commercial", weight: 1, test: /\bbest\b|\btop\b|\brecommended\b/i },
  { category: "commercial", weight: 1, test: /\bcheap(est)?\b|\baffordable\b|\bbudget\b/i },
  { category: "commercial", weight: 1, test: /أفضل|احسن|أحسن|ارخص|أرخص|رخيص|موصى/ },

  // Navigational — looking for a specific known destination, not researching options.
  { category: "navigational", weight: 1, test: /\blogin\b|\bsign[- ]?in\b|\bofficial\b|\bhomepage\b/i },
  { category: "navigational", weight: 1, test: /\bcontact us\b|\bcustomer service\b/i },
  { category: "navigational", weight: 1, test: /تسجيل الدخول|الموقع الرسمي|الصفحة الرئيسية|اتصل بنا|خدمة العملاء/ },

  // Informational — the default. Small baseline weight so an unmatched query still
  // resolves to informational rather than an arbitrary tie among the zero-scores.
  { category: "informational", weight: 1, test: /\bhow\b|\bwhat\b|\bwhy\b|\bwhen\b|\btips\b|\bmeaning\b/i },
  { category: "informational", weight: 1, test: /كيف|ماذا|لماذا|متى|نصائح|طريقة|تعريف/ },
];

const INFORMATIONAL_BASELINE = 0.5;

/** Breaks ties when two categories score equally — highest commercial value first. */
const PRECEDENCE: SearchIntent[] = ["navigational", "transactional", "local", "commercial", "informational"];

const TAG_PATTERNS: { tag: IntentTag; test: RegExp }[] = [
  { tag: "comparison", test: /\bvs\b|\bversus\b|\bcompare\b|\balternative[s]?\b/i },
  { tag: "comparison", test: /مقارنة|بديل|أفضل بديل/ },
  { tag: "review", test: /\breview[s]?\b|\brating[s]?\b/i },
  { tag: "review", test: /تقييم|مراجعة|آراء/ },
  { tag: "how_to", test: /\bhow to\b|\bhow do i\b|\bhow can i\b/i },
  { tag: "how_to", test: /كيفية|طريقة عمل/ },
  { tag: "guide", test: /\bguide\b|\bultimate guide\b|\bstep[- ]by[- ]step\b/i },
  { tag: "guide", test: /دليل شامل|دليل|خطوة بخطوة/ },
];

/**
 * Raw per-category scores from the same pattern list classifyQuery uses — exported
 * so contentCoverageService (module 16) can ask "does this text carry any
 * transactional signal at all", not just "what's the single winning category",
 * without duplicating the pattern list.
 */
export function scoreIntentSignals(text: string): Record<SearchIntent, number> {
  const scores: Record<SearchIntent, number> = {
    transactional: 0,
    local: 0,
    commercial: 0,
    navigational: 0,
    informational: INFORMATIONAL_BASELINE,
  };
  for (const { category, weight, test } of CATEGORY_PATTERNS) {
    if (test.test(text)) scores[category] += weight;
  }
  return scores;
}

/**
 * @param localityHints Optional site-specific place names (a city, a neighbourhood)
 * to treat as local-intent signals. Without them, only explicit phrases like
 * "near me" register as local — see the file-level limitation note.
 */
export function classifyQuery(query: string, localityHints: string[] = []): { primary: SearchIntent; tags: IntentTag[] } {
  const scores = scoreIntentSignals(query);
  for (const hint of localityHints) {
    if (hint.trim() && query.toLowerCase().includes(hint.trim().toLowerCase())) scores.local += 1;
  }

  let primary: SearchIntent = "informational";
  let best = -Infinity;
  for (const category of PRECEDENCE) {
    // PRECEDENCE order plus a strict '>' makes this deterministic: the first category
    // in precedence order among those sharing the top score always wins the tie.
    if (scores[category] > best) {
      best = scores[category];
      primary = category;
    }
  }

  const tags = TAG_PATTERNS.filter(({ test }) => test.test(query)).map(({ tag }) => tag);
  const uniqueTags = [...new Set(tags)];

  return { primary, tags: uniqueTags };
}

function emptyMix(): Record<SearchIntent, number> {
  return { transactional: 0, commercial: 0, local: 0, navigational: 0, informational: 0 };
}

function classifyRows(rows: PageQueryRow[], localityHints: string[]): QueryIntent[] {
  return rows.map((row) => {
    const { primary, tags } = classifyQuery(row.query, localityHints);
    return { query: row.query, impressions: row.impressions, clicks: row.clicks, primary_intent: primary, tags };
  });
}

function summariseForPage(
  page: PageAnalyticsRow,
  queryIntents: Map<string, QueryIntent>,
  rowsForPage: PageQueryRow[]
): PageIntentSummary {
  const mix = emptyMix();
  const topQueries: QueryIntent[] = [];

  for (const row of rowsForPage) {
    const intent = queryIntents.get(row.query);
    if (!intent) continue;
    mix[intent.primary_intent] += row.impressions;
    topQueries.push(intent);
  }
  topQueries.sort((a, b) => b.impressions - a.impressions);

  const dominant = (Object.entries(mix) as [SearchIntent, number][]).reduce<SearchIntent | null>(
    (winner, [intent, impressions]) => {
      if (impressions <= 0) return winner;
      if (winner === null || impressions > mix[winner]) return intent;
      return winner;
    },
    null
  );

  return {
    page: page.page,
    dominant_intent: dominant,
    intent_mix: mix,
    total_impressions: page.impressions,
    top_queries: topQueries.slice(0, 5),
  };
}

export function classifySearchConsoleData(
  summary: SearchConsolePageSummary,
  localityHints: string[] = []
): SearchIntentSummary {
  // Each query classified once, even though it may appear under several pages.
  const uniqueByQuery = new Map<string, PageQueryRow>();
  for (const row of summary.rows) {
    if (!uniqueByQuery.has(row.query)) uniqueByQuery.set(row.query, row);
    else {
      const existing = uniqueByQuery.get(row.query)!;
      uniqueByQuery.set(row.query, { ...existing, impressions: existing.impressions + row.impressions, clicks: existing.clicks + row.clicks });
    }
  }
  const queries = classifyRows([...uniqueByQuery.values()], localityHints).sort(
    (a, b) => b.impressions - a.impressions
  );
  const queryIntents = new Map(queries.map((q) => [q.query, q]));

  const rowsByPage = new Map<string, PageQueryRow[]>();
  for (const row of summary.rows) {
    rowsByPage.set(row.page, [...(rowsByPage.get(row.page) ?? []), row]);
  }

  const pages = summary.pages
    .map((page) => summariseForPage(page, queryIntents, rowsByPage.get(page.page) ?? []))
    .sort((a, b) => b.total_impressions - a.total_impressions);

  const overallMix = emptyMix();
  for (const query of queries) overallMix[query.primary_intent] += query.impressions;

  return {
    siteUrl: summary.siteUrl,
    startDate: summary.startDate,
    endDate: summary.endDate,
    overall_mix: overallMix,
    queries,
    pages,
  };
}
