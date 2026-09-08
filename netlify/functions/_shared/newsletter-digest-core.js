const DEFAULT_SITE_URL = "https://trrb.net";
const DEFAULT_MIN_ARTICLES = 10;
const DEFAULT_TARGET_ARTICLES = 15;
const DEFAULT_MAX_ARTICLES = 20;
const PRIMARY_WINDOW_MS = 24 * 60 * 60 * 1000;
const FALLBACK_WINDOW_MS = 72 * 60 * 60 * 1000;
const RETIRED_DIGEST_CATEGORIES = new Set(["重要新闻", "中国官场", "庇护百科"]);

function text(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function html(value) {
  return text(value, 5000).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function timestamp(article) {
  const value = Date.parse(article?.published_at || "");
  return Number.isFinite(value) ? value : 0;
}

function articleIdentity(article) {
  return text(article?.id || article?.slug || article?.title, 500).toLowerCase();
}

function articleUrl(article, siteUrl = DEFAULT_SITE_URL) {
  const id = text(article?.id, 200);
  if (!id) return "";
  return `${String(siteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "")}/article.html?id=${encodeURIComponent(id)}`;
}

function compareArticles(left, right) {
  const breaking = Number(Boolean(right?.is_breaking)) - Number(Boolean(left?.is_breaking));
  if (breaking) return breaking;
  const rank = Number(right?.rank_score || 0) - Number(left?.rank_score || 0);
  if (rank) return rank;
  return timestamp(right) - timestamp(left);
}

function eligibleArticles(rows, nowMs) {
  const cutoff = nowMs - FALLBACK_WINDOW_MS;
  const seen = new Set();
  return (Array.isArray(rows) ? rows : [])
    .filter((article) => article?.status === "published" && article?.visibility === "public")
    .filter((article) => text(article?.title, 300) && text(article?.id, 200))
    .filter((article) => !RETIRED_DIGEST_CATEGORIES.has(text(article?.category_name, 80)))
    .filter((article) => timestamp(article) >= cutoff && timestamp(article) <= nowMs)
    .filter((article) => {
      const identity = articleIdentity(article);
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .sort(compareArticles);
}

function selectWithCategoryDiversity(rows, limit) {
  const selected = [];
  const deferred = [];
  const categories = new Map();
  const categoryCap = Math.max(2, Math.ceil(limit / 3));

  for (const article of rows) {
    const category = text(article?.category_name, 80) || "其他新闻";
    const count = categories.get(category) || 0;
    if (count >= categoryCap) {
      deferred.push(article);
      continue;
    }
    selected.push(article);
    categories.set(category, count + 1);
    if (selected.length === limit) return selected;
  }

  for (const article of deferred) {
    selected.push(article);
    if (selected.length === limit) break;
  }
  return selected;
}

function selectDigestArticles(rows, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const minimum = Math.min(Math.max(Number(options.minimum || DEFAULT_MIN_ARTICLES), 1), DEFAULT_MAX_ARTICLES);
  const maximum = Math.min(Math.max(Number(options.maximum || DEFAULT_MAX_ARTICLES), minimum), DEFAULT_MAX_ARTICLES);
  const target = Math.min(Math.max(Number(options.target || DEFAULT_TARGET_ARTICLES), minimum), maximum);
  const eligible = eligibleArticles(rows, nowMs);
  const primaryCutoff = nowMs - PRIMARY_WINDOW_MS;
  const primary = eligible.filter((article) => timestamp(article) >= primaryCutoff);
  const pool = primary.length >= minimum
    ? primary
    : [...primary, ...eligible.filter((article) => timestamp(article) < primaryCutoff)];
  const selected = selectWithCategoryDiversity(pool, Math.min(target, maximum));

  return {
    ready: selected.length >= minimum,
    selected,
    eligibleCount: eligible.length,
    usedFallbackWindow: primary.length < minimum,
    minimum,
    maximum,
    target
  };
}

function buildDigestEmail(articles, options = {}) {
  const issueDate = text(options.issueDate || new Date().toISOString().slice(0, 10), 20);
  const siteUrl = options.siteUrl || DEFAULT_SITE_URL;
  const items = (Array.isArray(articles) ? articles : []).map((article, index) => {
    const title = text(article?.title, 300);
    const summary = text(article?.summary, 240);
    const category = text(article?.category_name, 80) || "新闻";
    const url = articleUrl(article, siteUrl);
    return { index: index + 1, title, summary, category, url };
  });
  const subject = `唐人日报每日快报｜${issueDate}`;
  const htmlBody = [
    "<!doctype html><html><body>",
    `<h1>${html(subject)}</h1>`,
    `<p>今日为您精选 ${items.length} 条已发布新闻。</p>`,
    "<ol>",
    ...items.map((item) => `<li><p><strong>${html(item.category)}</strong></p><h2><a href="${html(item.url)}">${html(item.title)}</a></h2>${item.summary ? `<p>${html(item.summary)}</p>` : ""}</li>`),
    "</ol>",
    `<p><a href="${html(siteUrl)}">访问唐人日报</a></p>`,
    "</body></html>"
  ].join("");
  const textBody = [
    subject,
    `今日为您精选 ${items.length} 条已发布新闻。`,
    "",
    ...items.flatMap((item) => [`${item.index}. [${item.category}] ${item.title}`, item.summary, item.url, ""]),
    `访问唐人日报：${siteUrl}`
  ].filter((line) => line !== undefined).join("\n");
  return { subject, html: htmlBody, text: textBody, items };
}

module.exports = {
  DEFAULT_MIN_ARTICLES,
  DEFAULT_TARGET_ARTICLES,
  DEFAULT_MAX_ARTICLES,
  PRIMARY_WINDOW_MS,
  FALLBACK_WINDOW_MS,
  RETIRED_DIGEST_CATEGORIES,
  articleUrl,
  selectDigestArticles,
  buildDigestEmail
};
