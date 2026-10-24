#!/usr/bin/env python3
"""
Adds a SECOND demo client + website to server/data/app.db, with fake data filled in
across every stage of the pipeline (crawl -> audit -> diagnosis -> keyword decisions
-> actions -> content -> measurement -> learning), alongside the existing
"Demo Client (seeded)" dental-clinic demo from src/scripts/seedDemo.ts.

WHY PYTHON INSTEAD OF THE PROJECT'S OWN seedDemo.ts:
This sandbox's npm registry access was blocked (403 on every package, even a fresh
`npm install`), so `npx tsx src/scripts/seedDemo.ts`-style seeding couldn't run here.
app.db is a plain SQLite file, so this script writes to it directly with Python's
built-in sqlite3 module instead -- no node_modules required. It intentionally mirrors
seedDemo.ts's structure and its honesty rule: every row is stamped is_demo_seed = 1
(where that column exists) and the audit_issues below are produced by a faithful
Python port of the real rule engine (server/src/audit/rules.ts) running over the fake
crawl pages/links -- not typed out by hand -- and diagnoses use the exact same
priority-score formula as server/src/services/diagnoseService.ts:
    round(min(100, (severity * business_impact * confidence / effort) * 4))

Safe to re-run: it deletes and re-inserts only rows belonging to this demo client's
website (matched by name/url), never touching the dental-clinic demo or any real data.

Usage:
    python3 scripts/seed_new_demo_client.py [path/to/app.db]
(defaults to ../data/app.db relative to this script, i.e. server/data/app.db)
"""

import json
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

DEMO_CLIENT_NAME = "متجر عبير للعطور المنزلية (بيانات وهمية)"
DEMO_SITE_URL = "https://abeer-fragrances.example.com"

TITLE_MAX_LENGTH = 60
THIN_CONTENT_WORDS = 300


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_days_ago(days: int) -> str:
    return (now_utc() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")


def iso_date_days_ago(days: int) -> str:
    return (now_utc() - timedelta(days=days)).strftime("%Y-%m-%d")


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Fake crawl input (the only thing that's "invented" -- everything downstream of
# this, i.e. the audit findings, is computed from it, same rule as seedDemo.ts)
# ---------------------------------------------------------------------------

def page(url, **over):
    base = dict(
        status_code=200,
        title="متجر عبير للعطور المنزلية",
        meta_description="عبير للعطور المنزلية — شموع وبخور وزيوت عطرية فاخرة، توصيل لجميع أنحاء لبنان والخليج",
        meta_robots=None,
        h1="عبير للعطور المنزلية",
        h1_count=1,
        h2_count=3,
        h3_count=2,
        images_count=6,
        images_missing_alt=0,
        hreflang_count=0,
        schema_types='["Organization","WebSite"]',
        html_lang="ar",
        canonical_url=url,
        redirect_url=None,
        content_type="text/html; charset=utf-8",
        word_count=520,
        response_time_ms=310,
        is_broken=0,
        discovered_from=DEMO_SITE_URL,
    )
    base.update(over)
    base["url"] = url
    return base


PAGES = [
    page(f"{DEMO_SITE_URL}/", discovered_from=None),
    page(
        f"{DEMO_SITE_URL}/products",
        title="المنتجات",
        meta_description=None,
        h1="منتجاتنا",
        h2_count=2,
        h3_count=0,
        images_count=12,
        schema_types="[]",
        word_count=160,
    ),
    page(
        f"{DEMO_SITE_URL}/products/oud-royal-candle",
        title="شمعة عود ملكي معطرة فاخرة مصنوعة يدويًا من شمع الصويا الطبيعي 100%",
        h1="شمعة عود ملكي",
        h2_count=2,
        h3_count=1,
        images_count=4,
        images_missing_alt=1,
        schema_types='["Product"]',
        word_count=340,
        discovered_from=f"{DEMO_SITE_URL}/products",
    ),
    page(
        f"{DEMO_SITE_URL}/products/rose-perfume-oil",
        title="زيت عطر الورد الفاخر",
        h1="زيت عطر الورد",
        h2_count=1,
        h3_count=0,
        images_count=3,
        schema_types='["Product"]',
        word_count=210,
        discovered_from=f"{DEMO_SITE_URL}/products",
    ),
    page(
        f"{DEMO_SITE_URL}/products/oud-perfume-oil",
        title="زيت عطر الورد الفاخر",  # duplicated on purpose (copy-paste mistake) -> DUPLICATE_TITLE
        h1="زيت عطر العود",
        h2_count=2,
        h3_count=1,
        images_count=3,
        schema_types='["Product"]',
        word_count=650,
        discovered_from=f"{DEMO_SITE_URL}/products",
    ),
    page(
        f"{DEMO_SITE_URL}/about",
        title="من نحن",
        meta_robots="noindex, follow",  # leftover from staging -> NOINDEX_PAGE
        h1="قصة عبير",
        h2_count=2,
        word_count=300,
    ),
    page(
        f"{DEMO_SITE_URL}/blog/how-to-choose-home-fragrance",
        title="كيف تختارين العطر المنزلي المناسب لكل غرفة",
        h1="كيف تختارين العطر المنزلي المناسب",
        h2_count=0,  # long but unstructured -> NO_HEADING_STRUCTURE
        h3_count=0,
        html_lang=None,  # -> MISSING_HTML_LANG
        images_count=5,
        word_count=950,
    ),
    page(
        f"{DEMO_SITE_URL}/contact",
        title="تواصلي معنا",
        meta_description="",
        h1="تواصلي معنا",
        h2_count=1,
        h3_count=0,
        images_count=1,
        schema_types="[]",  # -> NO_SCHEMA
        canonical_url=None,  # -> MISSING_CANONICAL
        word_count=150,
    ),
    page(
        f"{DEMO_SITE_URL}/old-collection-2023",
        status_code=404,
        is_broken=1,
        title=None,
        meta_description=None,
        h1=None,
        h1_count=0,
        h2_count=0,
        images_count=0,
        schema_types=None,
        word_count=None,
        discovered_from=f"{DEMO_SITE_URL}/products",
    ),
]

LINKS = [
    dict(source_url=f"{DEMO_SITE_URL}/", target_url=f"{DEMO_SITE_URL}/products", anchor_text="المنتجات", is_internal=1, status_code=None, is_broken=0),
    dict(source_url=f"{DEMO_SITE_URL}/", target_url=f"{DEMO_SITE_URL}/about", anchor_text="من نحن", is_internal=1, status_code=None, is_broken=0),
    dict(source_url=f"{DEMO_SITE_URL}/", target_url=f"{DEMO_SITE_URL}/contact", anchor_text="تواصلي معنا", is_internal=1, status_code=None, is_broken=0),
    dict(source_url=f"{DEMO_SITE_URL}/", target_url=f"{DEMO_SITE_URL}/blog/how-to-choose-home-fragrance", anchor_text="المدونة", is_internal=1, status_code=None, is_broken=0),
    dict(source_url=f"{DEMO_SITE_URL}/products", target_url=f"{DEMO_SITE_URL}/products/oud-royal-candle", anchor_text="شمعة عود ملكي", is_internal=1, status_code=None, is_broken=0),
    dict(source_url=f"{DEMO_SITE_URL}/products", target_url=f"{DEMO_SITE_URL}/products/rose-perfume-oil", anchor_text="زيت عطر الورد", is_internal=1, status_code=None, is_broken=0),
    dict(source_url=f"{DEMO_SITE_URL}/products", target_url=f"{DEMO_SITE_URL}/products/oud-perfume-oil", anchor_text="زيت عطر العود", is_internal=1, status_code=None, is_broken=0),
    dict(source_url=f"{DEMO_SITE_URL}/products", target_url=f"{DEMO_SITE_URL}/old-collection-2023", anchor_text="التشكيلة القديمة", is_internal=1, status_code=404, is_broken=1),
    dict(source_url=f"{DEMO_SITE_URL}/contact", target_url="https://maps.example.org/beirut-store", anchor_text="موقعنا على الخريطة", is_internal=0, status_code=404, is_broken=1),
]

# Listed in the sitemap; "/contact" and the broken "/old-collection-2023" are
# deliberately left out, and "/offers/mothers-day-bundle" is deliberately never
# linked from anywhere, so NOT_IN_SITEMAP and ORPHAN_PAGE both fire for real.
SITEMAP_URLS = [
    f"{DEMO_SITE_URL}/",
    f"{DEMO_SITE_URL}/products",
    f"{DEMO_SITE_URL}/products/oud-royal-candle",
    f"{DEMO_SITE_URL}/products/rose-perfume-oil",
    f"{DEMO_SITE_URL}/products/oud-perfume-oil",
    f"{DEMO_SITE_URL}/about",
    f"{DEMO_SITE_URL}/blog/how-to-choose-home-fragrance",
    f"{DEMO_SITE_URL}/offers/mothers-day-bundle",
]


# ---------------------------------------------------------------------------
# Faithful Python port of server/src/audit/rules.ts, run over the fake pages/links
# above so audit_issues are genuinely computed, not typed out.
# ---------------------------------------------------------------------------

PAGE_RULES = [
    ("MISSING_TITLE", "meta", 5, lambda p: None if (p["title"] or "").strip() else "Page has no <title>"),
    (
        "TITLE_TOO_LONG", "meta", 2,
        lambda p: (f"Title is {len((p['title'] or '').strip())} characters (over {TITLE_MAX_LENGTH}, so Google will truncate it)"
                    if len((p["title"] or "").strip()) > TITLE_MAX_LENGTH else None),
    ),
    ("MISSING_META_DESCRIPTION", "meta", 3, lambda p: None if (p["meta_description"] or "").strip() else "Page has no meta description"),
    ("H1_NOT_EXACTLY_ONE", "content", 3, lambda p: None if p["h1_count"] == 1 else f"Page has {p['h1_count']} <h1> elements (expected exactly 1)"),
    ("MISSING_CANONICAL", "indexing", 2, lambda p: None if p["canonical_url"] else "Page declares no canonical URL"),
    (
        "THIN_CONTENT", "content", 3,
        lambda p: (f"Page has {p['word_count'] or 0} words (under the {THIN_CONTENT_WORDS}-word thin-content threshold)"
                    if (p["word_count"] or 0) < THIN_CONTENT_WORDS else None),
    ),
    (
        "NOINDEX_PAGE", "indexing", 5,
        lambda p: (f'Page is excluded from search by meta robots: "{p["meta_robots"]}"'
                    if p["meta_robots"] and "noindex" in p["meta_robots"].lower() else None),
    ),
    (
        "IMAGES_MISSING_ALT", "content", 3,
        lambda p: (f"{p['images_missing_alt']} of {p['images_count']} images have no alt attribute"
                    if p["images_missing_alt"] > 0 else None),
    ),
    (
        "NO_HEADING_STRUCTURE", "content", 2,
        lambda p: (f"Page has {p['word_count']} words but no <h2> headings to structure them"
                    if (p["word_count"] or 0) >= THIN_CONTENT_WORDS and p["h2_count"] == 0 else None),
    ),
    ("NO_SCHEMA", "meta", 2, None),  # placeholder, replaced below with a proper function
    ("MISSING_HTML_LANG", "content", 2, lambda p: None if p["html_lang"] else "The <html> element declares no lang attribute"),
]


def _no_schema(p):
    try:
        types = json.loads(p["schema_types"]) if p["schema_types"] else []
    except (TypeError, ValueError):
        types = []
    return "Page has no JSON-LD structured data" if not types else None


# Fix the NO_SCHEMA rule with the real implementation (lambdas above needed the
# helper defined after them).
PAGE_RULES[9] = ("NO_SCHEMA", "meta", 2, _no_schema)


def is_analysable(p):
    if p["is_broken"]:
        return False
    if p["status_code"] is None or p["status_code"] < 200 or p["status_code"] >= 300:
        return False
    return p["content_type"] is None or "html" in p["content_type"].lower()


def normalise_title(title):
    return " ".join(title.strip().lower().split())


def run_audit(pages, links):
    analysable = [p for p in pages if is_analysable(p)]
    findings = []

    for p in analysable:
        for code, category, severity, test in PAGE_RULES:
            detail = test(p)
            if detail is None:
                continue
            findings.append(dict(rule_code=code, category=category, severity=severity, page_url=p["url"], detail=detail))

    for link in links:
        if not link["is_broken"]:
            continue
        suffix = f" (HTTP {link['status_code']})" if link["status_code"] else " (unreachable)"
        findings.append(dict(
            rule_code="BROKEN_LINK", category="links", severity=5, page_url=link["source_url"],
            detail=f"Links to {link['target_url']}{suffix}",
        ))

    by_title = {}
    for p in analysable:
        if not (p["title"] or "").strip():
            continue
        key = normalise_title(p["title"])
        by_title.setdefault(key, []).append(p["url"])
    for title, urls in by_title.items():
        if len(urls) < 2:
            continue
        shown = ", ".join(urls[:3])
        rest = f", +{len(urls) - 3} more" if len(urls) > 3 else ""
        findings.append(dict(
            rule_code="DUPLICATE_TITLE", category="content", severity=4, page_url=None,
            detail=f'{len(urls)} pages share the title "{title}": {shown}{rest}',
        ))

    return findings


def host_of(url):
    try:
        return urlsplit(url).hostname.lower().removeprefix("www.")
    except Exception:
        return None


def normalise_url(raw):
    try:
        parts = urlsplit(raw)
        path = parts.path
        if len(path) > 1 and path.endswith("/"):
            path = path[:-1]
        host = parts.hostname.lower().removeprefix("www.") if parts.hostname else ""
        return f"{parts.scheme}://{host}{path}"
    except Exception:
        return raw


def summarise(urls, shown=3):
    head = ", ".join(urls[:shown])
    return f"{head}, +{len(urls) - shown} more" if len(urls) > shown else head


def site_structure_findings(crawl, pages, links, sitemap_urls):
    findings = []
    analysable = [p for p in pages if is_analysable(p)]

    robots_missing = crawl["robots_status"] is None or crawl["robots_status"] == 404
    if robots_missing:
        findings.append(dict(
            rule_code="ROBOTS_TXT_MISSING", category="indexing", severity=3, page_url=None,
            detail="No robots.txt was served — crawlers get no directives and no sitemap pointer",
        ))

    if not crawl["sitemap_url"]:
        findings.append(dict(
            rule_code="SITEMAP_MISSING", category="indexing", severity=3, page_url=None,
            detail="No XML sitemap was found at /sitemap.xml or declared in robots.txt",
        ))
        return findings

    linked_to = {normalise_url(l["target_url"]) for l in links if l["is_internal"]}
    crawled = {normalise_url(p["url"]) for p in analysable}
    in_sitemap = {normalise_url(u) for u in sitemap_urls}

    entry_points = {
        normalise_url(p["url"]) for p in analysable
        if p["discovered_from"] is None or urlsplit(p["url"]).path == "/"
    }

    orphans = [u for u in in_sitemap if u not in linked_to and u not in entry_points]
    if orphans:
        findings.append(dict(
            rule_code="ORPHAN_PAGE", category="links", severity=3, page_url=None,
            detail=f"{len(orphans)} of {len(in_sitemap)} sitemap URLs have no internal link pointing to them: {summarise(orphans)}",
        ))

    missing = [u for u in crawled if u not in in_sitemap]
    if missing:
        findings.append(dict(
            rule_code="NOT_IN_SITEMAP", category="indexing", severity=2, page_url=None,
            detail=f"{len(missing)} crawled pages are absent from the sitemap: {summarise(missing)}",
        ))

    return findings


def priority_score(severity, business_impact, effort, confidence):
    raw = (severity * business_impact * confidence) / effort
    return min(100, round(raw * 4))


# ---------------------------------------------------------------------------
# Diagnoses, keyword decisions, actions, content -- hand-authored (this is the
# "human/LLM judgement" layer in the real app), but the numbers behind them
# (priority_score) are computed the same way the app computes them.
# ---------------------------------------------------------------------------

DIAGNOSES = [
    dict(
        problem="صفحة \"من نحن\" مستبعدة من نتائج غوغل بسبب وسم noindex متبقٍ من مرحلة التطوير",
        evidence=[
            "صفحة /about تصدر meta robots \"noindex, follow\"",
            "الصفحة مرتبطة من الصفحة الرئيسية فيصلها الزوار لكن محركات البحث لا تفهرسها",
            "صفحة \"من نحن\" لمتجر عطور محلي تحمل إشارات ثقة يبحث عنها العملاء باسم المتجر",
        ],
        root_cause="وسم noindex بقي من مرحلة تجربة الموقع قبل الإطلاق ولم يُزَل عند النشر الفعلي.",
        severity=5, business_impact=4, effort=1, confidence=0.95,
        action_type="fix_technical",
        recommended_action="إزالة وسم noindex من صفحة /about وطلب إعادة الفهرسة عبر Search Console",
        dismissed=0, dismissed_reason=None,
    ),
    dict(
        problem="صفحتا \"زيت عطر الورد\" و\"زيت عطر العود\" تتشاركان نفس عنوان الصفحة وتتنافسان على نفس الكلمة المفتاحية",
        evidence=[
            "/products/rose-perfume-oil و/products/oud-perfume-oil يحملان العنوان نفسه \"زيت عطر الورد الفاخر\"",
            "الأرجح أن العنوان نُسخ من منتج إلى آخر عند إضافة منتج زيت العود",
            "هذا يجعل غوغل يختار صفحة واحدة فقط للظهور بدل الاثنتين",
        ],
        root_cause="تكرار العنوان عند نسخ صفحة منتج لإنشاء منتج جديد دون تعديل الحقول الأساسية.",
        severity=4, business_impact=5, effort=2, confidence=0.9,
        action_type="improve_title",
        recommended_action="إعطاء كل صفحة منتج عنوانًا مخصصًا يذكر اسم المنتج ورائحته، مثل \"زيت عطر العود الفاخر — عبير\"",
        dismissed=0, dismissed_reason=None,
    ),
    dict(
        problem="صفحة \"تواصلي معنا\" لا تحمل أي بيانات هيكلية ولا رابطًا أساسيًا (canonical)",
        evidence=[
            "/contact لا تحتوي على أي JSON-LD",
            "لا يوجد canonical URL معرّف على الصفحة",
            "معلومات المتجر (العنوان وساعات العمل) غير ظاهرة لغوغل كبيانات منظمة",
        ],
        root_cause="صفحة التواصل بُنيت بخريطة مدمجة وصور فقط دون إضافة بيانات LocalBusiness الهيكلية.",
        severity=3, business_impact=3, effort=2, confidence=0.85,
        action_type="improve_schema",
        recommended_action="إضافة بيانات LocalBusiness الهيكلية (العنوان، الهاتف، ساعات العمل) وربط صفحة التواصل بصفحة كل فرع",
        dismissed=0, dismissed_reason=None,
    ),
    dict(
        problem="عرض \"طقم هدايا عيد الأم\" موجود في خريطة الموقع لكن لا يوجد أي رابط داخلي يشير إليه",
        evidence=[
            "/offers/mothers-day-bundle مذكورة في sitemap.xml",
            "لم يستطع الزاحف الوصول إليها من أي صفحة أخرى في الموقع",
        ],
        root_cause="صفحة العرض نُشرت مباشرة دون إضافتها إلى أي قائمة تنقل أو حملة على الصفحة الرئيسية.",
        severity=3, business_impact=4, effort=1, confidence=0.8,
        action_type="add_internal_links",
        recommended_action="ربط صفحة العرض من الصفحة الرئيسية ومن صفحة المنتجات",
        dismissed=1,
        dismissed_reason="العرض موسمي وينتهي خلال أسبوعين — تأجيل الربط الداخلي إلى الموسم القادم بدل تنفيذه الآن.",
    ),
    dict(
        problem="لا يوجد محتوى يستهدف نية شراء \"أطقم هدايا عطور\" رغم حجم بحث ملحوظ عليها",
        evidence=[
            "لا توجد صفحة مخصصة لأطقم الهدايا رغم أنها من أكثر المنتجات طلبًا موسميًا",
            "المنافسون المحليون لديهم صفحة أو تصنيف مخصص لهذا الغرض",
        ],
        root_cause="أطقم الهدايا تُباع حاليًا كخيار إضافي داخل صفحات المنتجات الفردية بدل أن يكون لها تصنيف مستقل.",
        severity=3, business_impact=4, effort=3, confidence=0.75,
        action_type="create_content",
        recommended_action="إنشاء صفحة تصنيف \"أطقم هدايا عطور منزلية\" مع محتوى موجّه لمناسبات الهدايا",
        dismissed=0, dismissed_reason=None,
    ),
]

KEYWORD_DECISIONS = [
    dict(page=f"{DEMO_SITE_URL}/", query="متجر عطور منزلية لبنان", decision="improve_existing",
         note="الصفحة قوية لكن لا تذكر \"لبنان\" صراحة في العنوان أو الوصف."),
    dict(page=f"{DEMO_SITE_URL}/products/oud-royal-candle", query="شمعة عود فاخرة", decision="improve_existing",
         note="الصفحة موجودة وتترتب جزئيًا، تحتاج عنوانًا أقصر وفقرة تعريفية أوضح."),
    dict(page=f"{DEMO_SITE_URL}/blog/how-to-choose-home-fragrance", query="كيف اختار عطر المنزل المناسب", decision="improve_existing",
         note="محتوى جيد لكنه بلا عناوين فرعية — يحتاج إعادة هيكلة قبل الترويج له."),
    dict(page=f"{DEMO_SITE_URL}/gifts/mothers-day-perfume-sets", query="أفضل هدايا عطور لعيد الأم", decision="target_new",
         note="لا توجد صفحة مخصصة بعد؛ يُقترح إنشاء تصنيف جديد بهذا الرابط."),
    dict(page=f"{DEMO_SITE_URL}/products/rose-perfume-oil", query="زيت عطر الورد الطبيعي", decision="ignore",
         note="حجم بحث منخفض جدًا حاليًا، لا تستحق الأولوية هذا الربع."),
]

HISTORICAL_ACTIONS = [
    dict(action_type="improve_meta", title="كتابة أوصاف ميتا لـ 18 صفحة منتج", days_ago=140, before_clicks=310, after_clicks=402),
    dict(action_type="fix_technical", title="إصلاح 9 روابط داخلية معطلة", days_ago=110, before_clicks=402, after_clicks=415),
    dict(action_type="add_internal_links", title="ربط تدوينات المدونة بصفحات المنتجات ذات الصلة", days_ago=95, before_clicks=415, after_clicks=478),
    dict(action_type="improve_title", title="إعادة كتابة عناوين صفحات تصنيفات المنتجات", days_ago=70, before_clicks=478, after_clicks=560),
    dict(action_type="improve_performance", title="ضغط صور المنتجات وتفعيل التحميل الكسول", days_ago=50, before_clicks=560, after_clicks=571),
    dict(action_type="refresh_content", title="تحديث مقال العناية بالشموع القديم", days_ago=30, before_clicks=571, after_clicks=549),
]

CONTENT_DRAFT = dict(
    primary_keyword="أطقم هدايا عطور منزلية",
    secondary_keywords=["هدايا عيد الأم عطور", "طقم شموع وبخور هدية", "أفضل هدايا عطور لبنان"],
    content_type="commercial",
    seo_title="أطقم هدايا عطور منزلية — تشكيلة عبير لعيد الأم",
    meta_description="اكتشفي أطقم هدايا العطور المنزلية من عبير: شموع وبخور وزيوت عطرية بتغليف فاخر، توصيل سريع لجميع أنحاء لبنان.",
    url_slug="gifts/mothers-day-perfume-sets",
    outline=[
        dict(level="h1", text="أطقم هدايا عطور منزلية"),
        dict(level="h2", text="لماذا تُعد أطقم العطور هدية مثالية"),
        dict(level="h2", text="التشكيلات المتوفرة هذا الموسم"),
        dict(level="h3", text="طقم العود والورد الكلاسيكي"),
        dict(level="h3", text="طقم الشموع الثلاثية للمنزل"),
        dict(level="h2", text="كيف تختارين الطقم المناسب حسب المناسبة"),
    ],
    body_markdown=(
        "# أطقم هدايا عطور منزلية\n\n"
        "تبحث كثير من الزائرات عن هدية عملية وفاخرة في الوقت نفسه — وهذا بالضبط ما تقدمه أطقم "
        "عبير للعطور المنزلية.\n\n"
        "## لماذا تُعد أطقم العطور هدية مثالية\n\n"
        "تجمع الأطقم بين عدة منتجات بتغليف واحد أنيق، فتوفر على المُهدي حيرة الاختيار وتمنح "
        "المُستلمة تجربة متكاملة من العطر المنزلي.\n\n"
        "## التشكيلات المتوفرة هذا الموسم\n\n"
        "### طقم العود والورد الكلاسيكي\n\n"
        "يجمع بين شمعة عود ملكي وزيت عطر ورد، مناسب لمن تفضل الروائح الشرقية الدافئة.\n\n"
        "### طقم الشموع الثلاثية للمنزل\n\n"
        "ثلاث شموع بروائح مختلفة لكل غرفة في المنزل، بعلبة هدية جاهزة للتغليف.\n\n"
        "## كيف تختارين الطقم المناسب حسب المناسبة\n\n"
        "لعيد الأم يُفضَّل الطقم الكلاسيكي، أما لهدايا المنزل الجديد فطقم الشموع الثلاثية هو "
        "الخيار الأكثر عملية."
    ),
)

# The in-place-edit snapshot (S7-1): what the draft looked like before a human
# shortened the meta description, showing the version-history table in use.
CONTENT_DRAFT_PRIOR_VERSION_META = (
    "اكتشفي أطقم هدايا العطور المنزلية من متجر عبير للعطور والشموع والبخور الفاخرة، "
    "بتغليف هدايا فاخر ومناسب لجميع المناسبات مع توصيل إلى جميع المناطق."
)


def main():
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data" / "app.db"
    if not db_path.exists():
        sys.exit(f"Database not found at {db_path}")

    con = sqlite3.connect(str(db_path))
    con.execute("PRAGMA foreign_keys = ON")
    con.row_factory = sqlite3.Row

    # --- client + website (idempotent: re-running updates the same demo rows) ---
    row = con.execute("SELECT id FROM clients WHERE name = ?", (DEMO_CLIENT_NAME,)).fetchone()
    if row:
        client_id = row["id"]
    else:
        client_id = new_id()
        con.execute(
            "INSERT INTO clients (id, name, contact_email, contact_phone, notes) VALUES (?, ?, ?, ?, ?)",
            (client_id, DEMO_CLIENT_NAME, "info@abeer-fragrances.example.com", "+961 00 000000",
             "عميل تجريبي بالكامل — بيانات وهمية أُضيفت لعرض كل مراحل النظام (الزحف، التشخيص، القرار، "
             "الإجراء، المحتوى، القياس). ليست بيانات عميل حقيقي."),
        )

    row = con.execute("SELECT id FROM websites WHERE client_id = ? AND url = ?", (client_id, DEMO_SITE_URL)).fetchone()
    if row:
        website_id = row["id"]
    else:
        website_id = new_id()
        con.execute(
            """INSERT INTO websites
               (id, client_id, url, site_type, country, language, goal, niche, target_audience, cms)
               VALUES (?, ?, ?, 'store', 'LB', 'ar', ?, ?, ?, 'Shopify')""",
            (website_id, client_id, DEMO_SITE_URL,
             "زيادة عدد الطلبات عبر المتجر الإلكتروني",
             "تجارة إلكترونية — عطور ومعطرات منزلية",
             "نساء 25-45 سنة في لبنان ودول الخليج يشترين هدايا وديكور منزلي"),
        )

    con.execute(
        """INSERT INTO website_google_properties (website_id, gsc_site_url, ga4_property_id)
           VALUES (?, ?, ?)
           ON CONFLICT(website_id) DO UPDATE SET gsc_site_url = excluded.gsc_site_url, ga4_property_id = excluded.ga4_property_id""",
        (website_id, "sc-domain:abeer-fragrances.example.com", "properties/398217456"),
    )

    # Clear this demo website's own previous rows so the script is safely re-runnable.
    con.execute("DELETE FROM actions WHERE website_id = ?", (website_id,))
    con.execute("DELETE FROM diagnoses WHERE website_id = ?", (website_id,))
    con.execute("DELETE FROM keyword_decisions WHERE website_id = ?", (website_id,))
    con.execute("DELETE FROM metric_snapshots WHERE website_id = ?", (website_id,))
    con.execute("DELETE FROM crawls WHERE website_id = ?", (website_id,))  # cascades pages/links/sitemap/audit_issues

    # --- Stage 1: data collection (crawl) --------------------------------------
    crawl_id = new_id()
    broken_links = sum(1 for l in LINKS if l["is_broken"])
    con.execute(
        """INSERT INTO crawls
           (id, website_id, status, started_at, finished_at, pages_crawled, broken_links_count,
            robots_status, robots_content, robots_sitemaps, sitemap_url, sitemap_status, sitemap_url_count)
           VALUES (?, ?, 'completed', ?, ?, ?, ?, 404, NULL, NULL, ?, 200, ?)""",
        (crawl_id, website_id, iso_days_ago(0), iso_days_ago(0), len(PAGES), broken_links,
         f"{DEMO_SITE_URL}/sitemap.xml", len(SITEMAP_URLS)),
    )

    page_rows = []
    for p in PAGES:
        row = dict(p)
        row["id"] = new_id()
        row["crawl_id"] = crawl_id
        row["crawled_at"] = iso_days_ago(0)
        page_rows.append(row)
        con.execute(
            """INSERT INTO crawl_pages
               (id, crawl_id, url, status_code, title, meta_description, meta_robots, h1, h1_count,
                h2_count, h3_count, images_count, images_missing_alt, hreflang_count, schema_types, html_lang,
                canonical_url, redirect_url, content_type, word_count, response_time_ms, is_broken, discovered_from, crawled_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (row["id"], crawl_id, row["url"], row["status_code"], row["title"], row["meta_description"],
             row["meta_robots"], row["h1"], row["h1_count"], row["h2_count"], row["h3_count"], row["images_count"],
             row["images_missing_alt"], row["hreflang_count"], row["schema_types"], row["html_lang"],
             row["canonical_url"], row["redirect_url"], row["content_type"], row["word_count"],
             row["response_time_ms"], row["is_broken"], row["discovered_from"], row["crawled_at"]),
        )

    link_rows = []
    for l in LINKS:
        row = dict(l)
        row["id"] = new_id()
        row["crawl_id"] = crawl_id
        link_rows.append(row)
        con.execute(
            """INSERT INTO crawl_links (id, crawl_id, source_url, target_url, anchor_text, is_internal, status_code, is_broken)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (row["id"], crawl_id, row["source_url"], row["target_url"], row["anchor_text"],
             row["is_internal"], row["status_code"], row["is_broken"]),
        )

    for url in SITEMAP_URLS:
        con.execute(
            "INSERT INTO crawl_sitemap_urls (id, crawl_id, url, lastmod) VALUES (?, ?, ?, ?)",
            (new_id(), crawl_id, url, iso_date_days_ago(15)),
        )

    # PSI snapshot (the only source this app actually persists into metric_snapshots)
    psi_values = [
        ("performance_score", 72),
        ("lab_lcp_ms", 2100), ("lab_inp_ms", 180), ("lab_cls", 0.08), ("lab_fcp_ms", 1400), ("lab_ttfb_ms", 620),
        ("field_lcp_ms", 3200), ("field_inp_ms", 310), ("field_cls", 0.15), ("field_ttfb_ms", 980),
    ]
    capture_date = iso_date_days_ago(0)
    field_start = iso_date_days_ago(27)
    for key, value in psi_values:
        is_field = key.startswith("field_")
        con.execute(
            """INSERT INTO metric_snapshots (id, website_id, source, metric_key, metric_value, period_start, period_end)
               VALUES (?, ?, 'psi', ?, ?, ?, ?)""",
            (new_id(), website_id, key, value, field_start if is_field else capture_date, capture_date),
        )

    # --- Stage 2: audit, computed by the ported rule engine --------------------
    crawl_row = dict(
        robots_status=404, robots_content=None, robots_sitemaps=None,
        sitemap_url=f"{DEMO_SITE_URL}/sitemap.xml",
    )
    findings = run_audit(page_rows, link_rows) + site_structure_findings(crawl_row, page_rows, link_rows, SITEMAP_URLS)
    for f in findings:
        con.execute(
            """INSERT INTO audit_issues (id, website_id, crawl_id, rule_code, category, severity, page_url, detail)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (new_id(), website_id, crawl_id, f["rule_code"], f["category"], f["severity"], f["page_url"], f["detail"]),
        )

    # --- Stage 3: diagnoses, priority_score computed by the real formula -------
    diagnosis_ids = {}
    for i, d in enumerate(DIAGNOSES):
        diag_id = new_id()
        diagnosis_ids[i] = diag_id
        score = priority_score(d["severity"], d["business_impact"], d["effort"], d["confidence"])
        con.execute(
            """INSERT INTO diagnoses
               (id, website_id, crawl_id, problem, evidence, root_cause, severity, business_impact,
                effort, confidence, priority_score, action_type, recommended_action, model, is_demo_seed,
                dismissed, dismissed_reason)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seeded demo data (python)', 1, ?, ?)""",
            (diag_id, website_id, crawl_id, d["problem"], json.dumps(d["evidence"], ensure_ascii=False),
             d["root_cause"], d["severity"], d["business_impact"], d["effort"], d["confidence"], score,
             d["action_type"], d["recommended_action"], d["dismissed"], d["dismissed_reason"]),
        )

    # --- Stage 4: keyword decisions ---------------------------------------------
    for kd in KEYWORD_DECISIONS:
        con.execute(
            """INSERT INTO keyword_decisions (id, website_id, page, query, decision, note)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(website_id, page, query) DO UPDATE SET decision = excluded.decision, note = excluded.note""",
            (new_id(), website_id, kd["page"], kd["query"], kd["decision"], kd["note"]),
        )

    # --- Stage 5-6: approve the non-dismissed diagnoses into actions -----------
    action_id_for_diag = {}
    for i, d in enumerate(DIAGNOSES):
        if d["dismissed"]:
            continue
        action_id = new_id()
        action_id_for_diag[i] = action_id
        status = "approved" if d["action_type"] == "create_content" else "done"
        con.execute(
            """INSERT INTO actions (id, website_id, diagnosis_id, action_type, title, status, before_metrics, approved_at, is_demo_seed)
               VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1)""",
            (action_id, website_id, diagnosis_ids[i], d["action_type"], d["recommended_action"], status, iso_days_ago(3)),
        )
        if status == "done":
            con.execute(
                """INSERT INTO action_results (id, action_id, after_metrics, delta_clicks, delta_impressions, delta_ctr, delta_position, success, measured_at)
                   VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?)""",
                (new_id(), action_id, iso_days_ago(1)),
            )

    # --- Stage 6-8: older, fully measured actions (the Learning table) ---------
    for seed in HISTORICAL_ACTIONS:
        action_id = new_id()
        before = dict(
            clicks=seed["before_clicks"], impressions=seed["before_clicks"] * 18, ctr=1 / 18, position=15.4,
            period_start=iso_date_days_ago(seed["days_ago"] + 28), period_end=iso_date_days_ago(seed["days_ago"] + 1),
        )
        con.execute(
            """INSERT INTO actions (id, website_id, diagnosis_id, action_type, title, status, before_metrics, approved_at, is_demo_seed)
               VALUES (?, ?, NULL, ?, ?, 'done', ?, ?, 1)""",
            (action_id, website_id, seed["action_type"], seed["title"], json.dumps(before), iso_days_ago(seed["days_ago"])),
        )
        delta_clicks = seed["after_clicks"] - seed["before_clicks"]
        after = dict(
            clicks=seed["after_clicks"], impressions=seed["after_clicks"] * 17, ctr=1 / 17, position=14.2,
            period_start=iso_date_days_ago(seed["days_ago"]), period_end=iso_date_days_ago(seed["days_ago"] - 27),
        )
        con.execute(
            """INSERT INTO action_results
               (id, action_id, after_metrics, delta_clicks, delta_impressions, delta_ctr, delta_position, success, measured_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (new_id(), action_id, json.dumps(after), delta_clicks,
             seed["after_clicks"] * 17 - seed["before_clicks"] * 18, 1 / 17 - 1 / 18, 1.2,
             1 if delta_clicks > 0 else 0, iso_days_ago(seed["days_ago"] - 28)),
        )

    # --- Stage 7-8: content draft on the create_content action, with an edit history ---
    content_action_id = action_id_for_diag.get(4)  # the create_content diagnosis above
    if content_action_id:
        draft_id = new_id()
        con.execute(
            """INSERT INTO content_drafts
               (id, action_id, website_id, primary_keyword, secondary_keywords, content_type,
                seo_title, meta_description, url_slug, outline, body_markdown, model, is_demo_seed,
                review_status, review_reason, reviewed_at, is_edited, edited_at, version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seeded demo data (python)', 1,
                       'approved', 'راجعتها لين — اختصار المقدمة وتوضيح الفرق بين الطقمين', ?, 1, ?, 2)""",
            (draft_id, content_action_id, website_id, CONTENT_DRAFT["primary_keyword"],
             json.dumps(CONTENT_DRAFT["secondary_keywords"], ensure_ascii=False), CONTENT_DRAFT["content_type"],
             CONTENT_DRAFT["seo_title"], CONTENT_DRAFT["meta_description"], CONTENT_DRAFT["url_slug"],
             json.dumps(CONTENT_DRAFT["outline"], ensure_ascii=False), CONTENT_DRAFT["body_markdown"],
             iso_days_ago(1), iso_days_ago(2)),
        )
        # Snapshot of the draft before the in-place edit above (S7-1: a save never
        # destroys the version it replaces).
        con.execute(
            """INSERT INTO content_draft_versions
               (id, draft_id, action_id, version, primary_keyword, secondary_keywords, seo_title,
                meta_description, url_slug, outline, body_markdown, saved_at)
               VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (new_id(), draft_id, content_action_id, CONTENT_DRAFT["primary_keyword"],
             json.dumps(CONTENT_DRAFT["secondary_keywords"], ensure_ascii=False), CONTENT_DRAFT["seo_title"],
             CONTENT_DRAFT_PRIOR_VERSION_META, CONTENT_DRAFT["url_slug"],
             json.dumps(CONTENT_DRAFT["outline"], ensure_ascii=False), CONTENT_DRAFT["body_markdown"],
             iso_days_ago(3)),
        )

    con.commit()

    counts = {t: con.execute(f"SELECT COUNT(*) c FROM {t} WHERE website_id = ?", (website_id,)).fetchone()["c"]
              for t in ["crawls", "audit_issues", "diagnoses", "keyword_decisions", "actions", "metric_snapshots"]}
    n_pages = con.execute("SELECT COUNT(*) c FROM crawl_pages WHERE crawl_id = ?", (crawl_id,)).fetchone()["c"]
    n_content = con.execute("SELECT COUNT(*) c FROM content_drafts WHERE website_id = ?", (website_id,)).fetchone()["c"]
    con.close()

    print(f"Seeded new demo client '{DEMO_CLIENT_NAME}'")
    print(f"  client_id:  {client_id}")
    print(f"  website_id: {website_id}  ({DEMO_SITE_URL})")
    print(f"  crawl: {n_pages} pages, {len(LINKS)} links, {len(SITEMAP_URLS)} sitemap urls, {counts['metric_snapshots']} PSI metrics")
    print(f"  audit: {counts['audit_issues']} issues (computed by the ported rule engine)")
    print(f"  diagnoses: {counts['diagnoses']} (1 dismissed), priority scored by the real formula")
    print(f"  keyword_decisions: {counts['keyword_decisions']}")
    print(f"  actions: {counts['actions']} (with measured results on the 'done' ones)")
    print(f"  content_drafts: {n_content} (with 1 prior version snapshot)")


if __name__ == "__main__":
    main()
