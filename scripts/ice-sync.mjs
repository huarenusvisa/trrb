import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { upsertAutomatedArticle, upsertNewsCandidate, writeAutomationLog } from "./supabase-news.mjs";
import { accountsForTopic, sourceByAccount } from "./source-registry.mjs";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const ASSETS_DIR = path.join(ROOT, "assets");
const TOPIC_DIR = path.join(ROOT, "topic", "ice");
const NEWS_DIR = path.join(ROOT, "news", "ice");
const NEWS_FILE = path.join(DATA_DIR, "ice-news.json");
const STATE_FILE = path.join(DATA_DIR, "ice-state.json");
const PENDING_FILE = path.join(DATA_DIR, "ice-pending.json");
const DASHBOARD_FILE = path.join(DATA_DIR, "ice-dashboard.json");
const HOME_FILE = path.join(ROOT, "index.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");

loadLocalEnv(path.join(ROOT, ".env.ice"));

const ICE_OFFICIAL_ACCOUNTS = mergeAccounts(
  parseAccounts(process.env.ICE_OFFICIAL_ACCOUNTS || "ICEgov,HSI_HQ,DHSgov,CBP,TheJusticeDept,DOJCrimDiv"),
  accountsForTopic("ice", ROOT, ["A"])
);
const ICE_TRUSTED_ACCOUNTS = mergeAccounts(
  parseAccounts(process.env.ICE_TRUSTED_ACCOUNTS || "Reuters,AP,FoxNews,CNN,NBCNews,ABC,CBSNews,axios,politico,NewsNation,nytimes,washingtonpost"),
  accountsForTopic("ice", ROOT, ["B"])
);
const ICE_REVIEW_ACCOUNTS = parseAccounts(
  process.env.ICE_REVIEW_ACCOUNTS || "Breaking911,CollinRugg,EndWokeness"
);

const CONFIG = {
  xToken: firstEnv("X_BEARER_TOKEN", "X_API_BEARER_TOKEN", "TWITTER_BEARER_TOKEN"),
  openAIKey: firstEnv("OPENAI_API_KEY"),
  openAIModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  siteUrl: normalizeSiteUrl(process.env.SITE_URL || "https://trrb.net"),
  queryOverride: String(process.env.ICE_QUERY || "").trim(),
  officialAccounts: ICE_OFFICIAL_ACCOUNTS,
  trustedAccounts: ICE_TRUSTED_ACCOUNTS,
  reviewAccounts: ICE_REVIEW_ACCOUNTS,
  bootstrapLimit: intEnv("ICE_BOOTSTRAP_LIMIT", 60, 1, 300),
  maxNewPosts: intEnv("ICE_MAX_NEW_POSTS", 120, 1, 500),
  maxProcessPerRun: intEnv("ICE_MAX_PROCESS_PER_RUN", 18, 1, 100),
  maxPagesPerQuery: intEnv("ICE_MAX_PAGES_PER_QUERY", 3, 1, 10),
  maxResultsPerQuery: intEnv("ICE_MAX_RESULTS_PER_QUERY", 50, 10, 100),
  lookbackHours: intEnv("ICE_LOOKBACK_HOURS", 48, 1, 168),
  pendingRetentionHours: intEnv("ICE_PENDING_RETENTION_HOURS", 168, 24, 720),
  dedupeThreshold: floatEnv("ICE_DEDUPE_THRESHOLD", 0.72, 0.4, 0.95),
  minConfidence: intEnv("ICE_MIN_CONFIDENCE", 80, 0, 100),
  minRelevance: intEnv("ICE_MIN_RELEVANCE", 72, 0, 100),
  minCandidateScore: intEnv("ICE_MIN_CANDIDATE_SCORE", 52, 0, 100),
  useXMedia: boolEnv("ICE_USE_X_MEDIA", true),
  maxPendingRetries: intEnv("ICE_MAX_PENDING_RETRIES", 5, 1, 20),
};

CONFIG.queryLanes = buildIceQueryLanes();

const SUBJECTIVE_TERMS = [
  "震惊", "炸裂", "疯狂", "大快人心", "罪有应得", "恶徒", "非法分子",
  "铁腕", "横扫", "重磅出击", "严打", "丧心病狂", "令人发指"
];

const SYSTEM_PROMPT = `
你是唐人日报的中文新闻编辑。输入材料来自X平台上的美国联邦机构、主流媒体、地方媒体或其他公开账号，主题必须与美国移民与海关执法局（ICE）、HSI、ERO及相关移民执法直接有关。

硬性规则：
1. 只能使用输入材料中明确出现的事实，不得补充、猜测或虚构时间、地点、人数、身份、国籍、犯罪记录、法院结论或执法背景。
2. 使用简体中文，新闻写实风格，不表达支持或反对ICE的立场，不作政治评论。
3. arrested译为“被捕”，detained译为“被拘留”，charged译为“被指控”，indicted译为“被起诉”，convicted译为“被定罪”，sentenced译为“被判刑”，removed/deported译为“被遣返”。不得混淆这些状态。
4. 尚未定罪的人，不得称为“罪犯”“犯罪分子”或写成已经犯罪。
5. 不使用“震惊、炸裂、疯狂、铁腕、横扫、大快人心”等煽动性词语。
6. 输入事实很少时生成brief：标题必须为8至18个中文字符，summary为25至70个中文字符且只表达一个核心事实，正文不得为了凑字数扩写。输入含完整官方通报或完整新闻报道时生成article，正文总量约220至420个中文字符。
7. 不复制大段英文原文，不使用Markdown，不写项目符号。
8. article的title准确概括核心事实，summary为35至100个中文字符，body_paragraphs为2至4段；brief的title必须短而明确（8至18个中文字符），summary只写一行。
9. relevance_score为0至100，衡量材料是否直接属于ICE/HSI/ERO执法新闻；仅泛泛讨论移民、边境或政治观点时不得高于60。
10. importance为1至10，衡量新闻价值；纯观点、口号、募款、广告、重复转述或没有具体事实的信息不得高于3。
11. verified_level只能为official、trusted_media、other_source或unverified。官方机构对自身行动的直接发布为official；成熟新闻媒体的事实报道可为trusted_media；其余来源不得自行提升为official。
12. 来源模式为review或radar时，除非材料包含可直接核实的官方文件链接且事实完整，否则needs_review必须为true，publishable必须为false。
13. 资料不足、事实矛盾、涉及未成年人身份、死亡细节或无法判断法律状态时，needs_review必须为true，publishable必须为false，并说明原因。
14. enforcement_events只记录来源明确披露的ICE/HSI/ERO抓捕、拘留、遣返或其他执法事件；没有明确事件时返回空数组。
15. people_count只有在来源明确出现阿拉伯数字人数时填写；否则必须为null，禁止推算。
16. occurred_at只有在来源明确披露执法发生时间时填写ISO 8601；只有日期时使用当天00:00:00并把time_precision设为date；没有时间时为null。
17. city、state_code、state_name、location_text只能来自来源明确地点；无法确定时用空字符串。state_code使用美国两位州缩写。
18. 同一人员或同一行动只建立一个event，避免把“被捕后被拘留”等同一事件重复计算。
`;

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "summary", "body_paragraphs", "content_type", "category",
    "importance", "relevance_score", "publishable", "needs_review",
    "review_reason", "confidence", "verified_level", "keywords",
    "enforcement_events"
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    body_paragraphs: {
      type: "array",
      items: { type: "string" }
    },
    content_type: { type: "string", enum: ["brief", "article"] },
    category: { type: "string", enum: ["抓捕与拘留", "遣返", "刑事执法", "政策与机构", "法院与诉讼", "社区反应", "其他"] },
    importance: { type: "integer", minimum: 1, maximum: 10 },
    relevance_score: { type: "integer", minimum: 0, maximum: 100 },
    publishable: { type: "boolean" },
    needs_review: { type: "boolean" },
    review_reason: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    verified_level: { type: "string", enum: ["official", "trusted_media", "other_source", "unverified"] },
    keywords: {
      type: "array",
      items: { type: "string" }
    },
    enforcement_events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "event_type", "people_count", "occurred_at", "time_precision",
          "city", "state_code", "state_name", "location_text",
          "confidence", "source_excerpt"
        ],
        properties: {
          event_type: { type: "string", enum: ["arrest", "detention", "removal", "other"] },
          people_count: { type: ["integer", "null"] },
          occurred_at: { type: ["string", "null"] },
          time_precision: { type: "string", enum: ["second", "minute", "hour", "date", "unknown"] },
          city: { type: "string" },
          state_code: { type: "string" },
          state_name: { type: "string" },
          location_text: { type: "string" },
          confidence: { type: "integer" },
          source_excerpt: { type: "string" }
        }
      }
    }
  }
};

const EVENT_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["enforcement_events"],
  properties: {
    enforcement_events: ARTICLE_SCHEMA.properties.enforcement_events
  }
};

async function main() {
  requireSecrets();
  await ensureStructure();
  await ensureHomeIntegration();

  const state = await readJson(STATE_FILE, {
    last_seen_id: "",
    query_cursors: {},
    last_run_at: "",
    last_success_at: "",
    last_content_at: "",
    last_result: { fetched: 0, published: 0, pending: 0 }
  });
  const news = await readJson(NEWS_FILE, []);
  let pending = await readJson(PENDING_FILE, []);

  // One-time metadata backfill for previously published articles.
  // Items are marked after checking so empty results are not charged repeatedly.
  const metadataBackfilledCount = await backfillRecentNewsEvents(news);

  // 候选池保留更长时间，避免高峰时因每轮处理额度而丢失新闻线索。
  const pendingBeforeExpiry = pending.length;
  pending = pending.filter(entry => entry.post && isWithinHours(entry.post.created_at, CONFIG.pendingRetentionHours));
  const expiredPendingCount = pendingBeforeExpiry - pending.length;

  // Remove same-event pending items before spending API credits.
  const pendingDedupe = dedupePendingByContent(pending, news);
  pending = pendingDedupe.items;

  const publishedIds = new Set(news.map(item => String(item.x_post_id || "")));
  const pendingIds = new Set(pending.map(item => String(item.x_post_id || "")));

  let publishedCount = 0;
  let pendingCount = 0;
  let duplicateSkippedCount = pendingDedupe.skipped;

  // Retry operational failures first. Manual-review entries stay untouched.
  const retryable = pending.filter(item => !item.manual_review && (item.attempts || 0) < CONFIG.maxPendingRetries);
  const untouched = pending.filter(item => item.manual_review || (item.attempts || 0) >= CONFIG.maxPendingRetries);
  const stillPending = [];

  const retryBatch = retryable.slice(0, CONFIG.maxProcessPerRun);
  for (const entry of retryBatch) {
    if (!entry.post || publishedIds.has(String(entry.x_post_id))) continue;
    try {
      const result = await processPost(entry.post, news);
      if (result.status === "published") {
        publishedIds.add(String(entry.x_post_id));
        publishedCount += 1;
      } else {
        stillPending.push(makePendingEntry(entry.post, result.reason, true, (entry.attempts || 0) + 1, result.ai || null));
      }
    } catch (error) {
      stillPending.push(makePendingEntry(entry.post, errorMessage(error), false, (entry.attempts || 0) + 1));
    }
  }
  pending = [...untouched, ...stillPending, ...retryable.slice(retryBatch.length)];

  const fetched = await fetchRecentPosts(state);
  const candidatePosts = fetched.posts.filter(post => {
    const id = String(post.id);
    return !publishedIds.has(id) && !pendingIds.has(id);
  });

  // 同一行动被多个账号转述时只保留一条候选；其余记录为重复线索。
  const references = buildDedupeReferences(news, pending);
  const newPosts = [];
  for (const post of candidatePosts) {
    const duplicate = findLikelyDuplicate(post, references);
    if (duplicate) {
      duplicateSkippedCount += 1;
      console.log(`Skipped duplicate X post ${post.id}; similar to ${duplicate.id}.`);
      continue;
    }
    newPosts.push(post);
    references.push(referenceFromPost(post));
  }

  const remainingBudget = Math.max(0, CONFIG.maxProcessPerRun - retryBatch.length);
  const immediate = newPosts.slice(0, remainingBudget);
  const queued = newPosts.slice(remainingBudget);

  for (const post of immediate) {
    try {
      const result = await processPost(post, news);
      if (result.status === "published") {
        publishedIds.add(String(post.id));
        publishedCount += 1;
      } else {
        pending.push(makePendingEntry(post, result.reason, true, 1, result.ai || null));
        pendingCount += 1;
      }
    } catch (error) {
      console.error(`Post ${post.id} failed:`, error);
      pending.push(makePendingEntry(post, errorMessage(error), false, 1));
      pendingCount += 1;
    }
  }
  for (const post of queued) {
    pending.push(makePendingEntry(post, "已进入候选池，等待下一轮自动处理", false, 0));
    pendingCount += 1;
  }

  news.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  pending = dedupePending(pending, publishedIds);

  const now = new Date().toISOString();
  const maxSeenId = fetched.newestId || maxSnowflake(fetched.posts.map(post => String(post.id)));
  if (maxSeenId) state.last_seen_id = maxSnowflake([state.last_seen_id, maxSeenId]);
  state.query_cursors = fetched.queryCursors;
  state.last_run_at = now;
  state.last_success_at = now;
  if (publishedCount > 0) state.last_content_at = now;
  state.last_result = {
    fetched: fetched.posts.length,
    candidates: candidatePosts.length,
    new_posts: newPosts.length,
    queued: queued.length,
    processed: retryBatch.length + immediate.length,
    duplicate_skipped: duplicateSkippedCount,
    expired_pending: expiredPendingCount,
    metadata_backfilled: metadataBackfilledCount,
    published: publishedCount,
    pending: pendingCount,
    total_published: news.length,
    total_pending: pending.length,
    query_lanes: fetched.laneStats
  };

  const dashboard = buildDashboardData(news, state, now);

  await writeJson(NEWS_FILE, news);
  await writeJson(PENDING_FILE, pending);
  await writeAutomationLog({
    pipeline: "ice-radar-v4",
    fetched: fetched.posts.length,
    processed: immediate.length + retryBatch.length,
    published: publishedCount,
    drafted: pendingCount,
    duplicates: duplicateSkippedCount,
    details: { lane_stats: fetched.laneStats || [], total_news: news.length, total_pending: pending.length }
  });
  await writeJson(STATE_FILE, state);
  await writeJson(DASHBOARD_FILE, dashboard);
  await updateSitemap(news, now);

  console.log(JSON.stringify(state.last_result, null, 2));
}

function requireSecrets() {
  const missing = [];
  if (!CONFIG.xToken) missing.push("X_BEARER_TOKEN");
  if (!CONFIG.openAIKey) missing.push("OPENAI_API_KEY");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function ensureStructure() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(ASSETS_DIR, { recursive: true }),
    fs.mkdir(TOPIC_DIR, { recursive: true }),
    fs.mkdir(NEWS_DIR, { recursive: true })
  ]);
  await ensureJsonFile(NEWS_FILE, []);
  await ensureJsonFile(PENDING_FILE, []);
  await ensureJsonFile(DASHBOARD_FILE, emptyDashboard());
  await ensureJsonFile(STATE_FILE, {
    last_seen_id: "",
    query_cursors: {},
    last_run_at: "",
    last_success_at: "",
    last_content_at: "",
    last_result: { fetched: 0, published: 0, pending: 0 }
  });
}

async function ensureHomeIntegration() {
  try {
    let html = await fs.readFile(HOME_FILE, "utf8");
    const scriptTag = '<script src="/assets/ice-home-widget.js" defer></script>';

    if (!html.includes("/assets/ice-home-widget.js")) {
      html = html.includes("</body>")
        ? html.replace("</body>", `  ${scriptTag}\n</body>`)
        : `${html}\n${scriptTag}\n`;
    }

    // Patch the existing ICE执法 anchor when possible. The widget also has a JS fallback.
    html = html.replace(
      /<a\b([^>]*)>([\s\S]{0,1200}?ICE执法[\s\S]{0,1200}?)<\/a>/i,
      (full, attrs, inner) => {
        let nextAttrs = attrs;
        if (/\bhref\s*=/.test(nextAttrs)) {
          nextAttrs = nextAttrs.replace(/\bhref\s*=\s*(["'])[^"']*\1/i, 'href="/topic/ice/"');
        } else {
          nextAttrs += ' href="/topic/ice/"';
        }
        return `<a${nextAttrs}>${inner}</a>`;
      }
    );

    await fs.writeFile(HOME_FILE, html, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    console.warn("index.html was not found; topic page will still be generated.");
  }
}

export function buildIceQueryLanes() {
  if (CONFIG.queryOverride) {
    return [{ id: "override", label: "自定义搜索", query: validateXQuery(CONFIG.queryOverride) }];
  }

  const lanes = [];
  const officialPrimary = CONFIG.officialAccounts.filter(account => ["icegov", "hsi_hq"].includes(account.toLowerCase()));
  const officialRelated = CONFIG.officialAccounts.filter(account => !officialPrimary.includes(account));
  const agencyTerms = '(ICE OR "Immigration and Customs Enforcement" OR HSI OR ERO OR deportation OR removal OR detained OR arrested OR "immigration enforcement")';
  const primaryPart = officialPrimary.length ? `(${officialPrimary.map(account => `from:${account}`).join(" OR ")})` : "";
  const relatedPart = officialRelated.length
    ? `((${officialRelated.map(account => `from:${account}`).join(" OR ")}) ${agencyTerms})`
    : "";
  const officialParts = [primaryPart, relatedPart].filter(Boolean);
  if (officialParts.length) {
    lanes.push({
      id: "official",
      label: "联邦机构",
      query: validateXQuery(`(${officialParts.join(" OR ")}) -is:retweet lang:en`),
    });
  }

  const mediaTerms = '(ICE OR "ICE agents" OR "immigration agents" OR "immigration raid" OR deportation OR detained OR "Immigration and Customs Enforcement")';
  for (const [index, accounts] of chunkAccountsForQuery(CONFIG.trustedAccounts, mediaTerms, 450).entries()) {
    lanes.push({
      id: `trusted-${index + 1}`,
      label: "主流媒体",
      query: validateXQuery(`((${accounts.map(account => `from:${account}`).join(" OR ")}) ${mediaTerms}) -is:retweet -is:reply lang:en`),
    });
  }

  lanes.push({
    id: "radar",
    label: "全网雷达",
    query: validateXQuery('(\"ICE agents\" OR \"ICE agent\" OR \"ICE raid\" OR \"ICE arrested\" OR \"ICE detained\" OR \"immigration raid\" OR \"immigration agents\" OR \"federal immigration agents\" OR \"deportation operation\" OR \"Immigration and Customs Enforcement\") -is:retweet -is:reply lang:en'),
  });

  lanes.push({
    id: "branches-local",
    label: "地方分支与州县市机构",
    query: validateXQuery('(\"Enforcement and Removal Operations\" OR \"ICE field office\" OR \"ERO officers\" OR \"HSI special agents\" OR \"ICE detainer\" OR \"transferred to ICE custody\" OR ((sheriff OR police OR \"district attorney\" OR prosecutor) (ICE OR HSI OR deportation OR immigration))) -is:retweet -is:reply lang:en'),
  });

  lanes.push({
    id: "radar-es",
    label: "西语社区雷达",
    query: validateXQuery('("agentes de ICE" OR "agente de ICE" OR "redada de ICE" OR "detenido por ICE" OR "arrestado por ICE" OR "operativo de inmigración" OR "deportación de ICE") -is:retweet -is:reply lang:es'),
  });

  return lanes;
}

function validateXQuery(query) {
  const value = String(query || "").trim();
  if (!value) throw new Error("ICE X query is empty.");
  if (value.length > 500) throw new Error(`ICE X query is too long (${value.length} characters).`);
  return value;
}

function chunkAccountsForQuery(accounts, terms, targetLength) {
  const chunks = [];
  let current = [];
  for (const account of accounts) {
    const trial = [...current, account];
    const query = `((${trial.map(value => `from:${value}`).join(" OR ")}) ${terms}) -is:retweet -is:reply lang:en`;
    if (current.length && query.length > targetLength) {
      chunks.push(current);
      current = [account];
    } else {
      current = trial;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function sourceProfileForUsername(username) {
  const value = String(username || "").toLowerCase();
  if (CONFIG.officialAccounts.some(account => account.toLowerCase() === value)) {
    return { mode: "auto", tier: "official", weight: 100 };
  }
  if (CONFIG.trustedAccounts.some(account => account.toLowerCase() === value)) {
    return { mode: "auto", tier: "trusted_media", weight: 88 };
  }
  if (CONFIG.reviewAccounts.some(account => account.toLowerCase() === value)) {
    return { mode: "review", tier: "review_source", weight: 62 };
  }
  return { mode: "radar", tier: "other_source", weight: 45 };
}

export function scoreIceCandidate(post) {
  const text = String(post.text || "");
  const lower = text.toLowerCase();
  const matched = [];
  let score = Math.round(Number(post.source_weight || 0) * 0.38);

  const tests = [
    [/(?:\bICE\b|Immigration and Customs Enforcement)/, 30, "ICE"],
    [/(?:\bHSI\b|Homeland Security Investigations|\bERO\b|Enforcement and Removal Operations)/i, 22, "HSI/ERO"],
    [/(?:arrest(?:ed|s|ing)?|detain(?:ed|s|ing)?|raid(?:ed|s|ing)?|deport(?:ed|s|ing|ation)?|remov(?:ed|al|ing)|custody|operation)/i, 24, "执法行动"],
    [/(?:immigration|migrant|noncitizen|undocumented|federal agents?)/i, 14, "移民语境"],
    [/(?:agentes? de ICE|redada(?:s)?|detenid[oa]s?|arrestad[oa]s?|deportaci[oó]n|operativo de inmigraci[oó]n)/i, 24, "西语执法行动"],
  ];
  for (const [regex, points, label] of tests) {
    if (regex.test(text)) {
      score += points;
      matched.push(label);
    }
  }

  const metrics = post.public_metrics || {};
  const engagement = Number(metrics.like_count || 0) + Number(metrics.retweet_count || 0) * 2 + Number(metrics.reply_count || 0);
  if (engagement >= 1000) score += 8;
  else if (engagement >= 100) score += 5;
  else if (engagement >= 20) score += 2;

  if (post.source_tier === "official" && matched.length) score = Math.max(score, 78);
  if (post.source_tier === "trusted_media" && matched.includes("ICE") && matched.includes("执法行动")) score = Math.max(score, 74);
  if (!lower.trim()) score = 0;

  return { score: Math.max(0, Math.min(100, score)), matched_terms: matched };
}

async function fetchRecentPosts(stateOrSinceId = {}) {
  const state = typeof stateOrSinceId === "string"
    ? { last_seen_id: stateOrSinceId, query_cursors: {} }
    : (stateOrSinceId || {});
  const previousCursors = state.query_cursors && typeof state.query_cursors === "object"
    ? state.query_cursors
    : {};
  const nextCursors = { ...previousCursors };
  const collected = [];
  const laneStats = [];
  let successfulLanes = 0;

  for (const lane of CONFIG.queryLanes) {
    const legacyCursor = lane.id === "official" ? String(state.last_seen_id || "") : "";
    const cursor = String(previousCursors[lane.id] || legacyCursor || "");
    try {
      const result = await fetchIceQueryLane(lane, cursor);
      collected.push(...result.posts);
      if (result.cursor && !result.truncated) nextCursors[lane.id] = result.cursor;
      laneStats.push({ id: lane.id, label: lane.label, fetched: result.posts.length, truncated: result.truncated });
      successfulLanes += 1;
    } catch (error) {
      laneStats.push({ id: lane.id, label: lane.label, fetched: 0, error: errorMessage(error) });
      console.error(`ICE query lane ${lane.id} failed:`, errorMessage(error));
    }
  }

  if (!successfulLanes) {
    const transientOnly = laneStats.length > 0 && laneStats.every(item => /\((429|500|502|503|504)\)|timeout|aborted|fetch failed|ECONNRESET|ENOTFOUND/i.test(String(item.error || "")));
    if (transientOnly) {
      console.warn("All ICE X search lanes are temporarily unavailable; keeping existing data and ending this run successfully.");
      return {
        posts: [],
        queryCursors: nextCursors,
        newestId: "",
        laneStats,
        degraded: true
      };
    }
    throw new Error("All ICE X search lanes failed.");
  }

  let posts = dedupePosts(collected)
    .filter(post => Number(post.candidate_score || 0) >= CONFIG.minCandidateScore);
  // 不在这里截断：全部候选进入pending池，避免高峰时推进X游标后丢失较早帖子。
  posts.sort((a, b) => compareSnowflakes(a.id, b.id));

  return {
    posts,
    queryCursors: nextCursors,
    newestId: maxSnowflake(posts.map(post => post.id)),
    laneStats,
  };
}

async function fetchIceQueryLane(lane, sinceId) {
  const collected = [];
  let nextToken = "";
  let pages = 0;
  let newestId = "";
  let truncated = false;

  do {
    const url = new URL("https://api.x.com/2/tweets/search/recent");
    url.searchParams.set("query", lane.query);
    url.searchParams.set("max_results", String(CONFIG.maxResultsPerQuery));
    url.searchParams.set("sort_order", "recency");
    url.searchParams.set("tweet.fields", "created_at,entities,attachments,lang,possibly_sensitive,public_metrics,author_id");
    url.searchParams.set("expansions", "attachments.media_keys,author_id");
    url.searchParams.set("media.fields", "url,preview_image_url,type,alt_text,width,height");
    url.searchParams.set("user.fields", "username,name,verified,verified_type,public_metrics");
    if (sinceId) {
      url.searchParams.set("since_id", String(sinceId));
    } else {
      url.searchParams.set("start_time", toXApiDateTime(Date.now() - CONFIG.lookbackHours * 60 * 60 * 1000));
    }
    if (nextToken) url.searchParams.set("next_token", nextToken);

    const payload = await fetchXJsonWithRetry(url, {
      headers: { Authorization: `Bearer ${CONFIG.xToken}` }
    }, `X API (${lane.id})`);
    if (!newestId) newestId = String(payload.meta?.newest_id || "");
    const mediaMap = new Map((payload.includes?.media || []).map(item => [item.media_key, item]));
    const userMap = new Map((payload.includes?.users || []).map(user => [String(user.id), user]));

    for (const item of payload.data || []) {
      const media = (item.attachments?.media_keys || [])
        .map(key => mediaMap.get(key))
        .filter(Boolean)
        .map(m => ({
          type: m.type,
          url: m.url || m.preview_image_url || "",
          alt_text: m.alt_text || "",
          width: m.width || 0,
          height: m.height || 0
        }));
      const author = userMap.get(String(item.author_id || "")) || {};
      if (!author.username) continue;
      const profile = sourceProfileForUsername(author.username);
      const post = {
        id: String(item.id),
        text: item.text || "",
        created_at: item.created_at || new Date().toISOString(),
        lang: item.lang || "",
        possibly_sensitive: Boolean(item.possibly_sensitive),
        entities: item.entities || {},
        media,
        public_metrics: item.public_metrics || {},
        author_username: author.username,
        author_name: author.name || author.username,
        author_verified: Boolean(author.verified),
        author_verified_type: String(author.verified_type || ""),
        source_mode: profile.mode,
        source_tier: profile.tier,
        source_weight: profile.weight,
        query_lane: lane.id,
        query_label: lane.label,
        x_url: `https://x.com/${author.username}/status/${item.id}`
      };
      const scored = scoreIceCandidate(post);
      post.candidate_score = scored.score;
      post.matched_terms = scored.matched_terms;
      collected.push(post);
    }

    nextToken = payload.meta?.next_token || "";
    pages += 1;
    if (nextToken && pages >= CONFIG.maxPagesPerQuery) {
      truncated = true;
      break;
    }
  } while (nextToken);

  return { posts: collected, cursor: newestId || maxSnowflake(collected.map(post => post.id)), truncated };
}

function sourceDisplayName(post) {
  const username = String(post.author_username || "").toLowerCase();
  const known = {
    icegov: "美国移民与海关执法局（ICE）",
    dhsgov: "美国国土安全部（DHS）",
    hsi_hq: "美国国土安全调查局（HSI）",
    cbp: "美国海关与边境保护局（CBP）",
    dojcrimdiv: "美国司法部刑事司",
    thejusticedept: "美国司法部",
    reuters: "路透社",
    ap: "美联社",
    foxnews: "Fox News",
    cnn: "CNN",
    nbcnews: "NBC News",
    abc: "ABC News",
    cbsnews: "CBS News",
    axios: "Axios",
    politico: "Politico",
    newsnation: "NewsNation",
    nytimes: "纽约时报",
    washingtonpost: "华盛顿邮报"
  };
  return known[username] || post.author_name || post.author_username || "公开来源";
}

async function processPost(post, news) {
  const enrichment = await fetchIceGovEnrichment(post);
  const sourceText = buildSourceText(post, enrichment);
  const ai = await rewriteWithOpenAI(sourceText, post);
  const validation = validateArticle(ai, sourceText, post, enrichment);

  const enforcementEvents = normalizeEnforcementEvents(ai.enforcement_events, sourceText);
  if (!validation.ok) {
    await syncIceCmsArticle(post, ai, "draft", validation.reason, enforcementEvents);
    return { status: "pending", reason: validation.reason, ai };
  }
  if (["review", "radar"].includes(post.source_mode) && !enrichment.url) {
    const reason = "该线索来自非预设可信来源，已完成编辑并进入后台草稿等待复核";
    await syncIceCmsArticle(post, ai, "draft", reason, enforcementEvents);
    return { status: "pending", reason, ai };
  }

  // 遣返、递解、刑满移交等内容进入“驱逐快报”，不写入 ICE 抓捕新闻流，也不计入抓捕人数。
  if (isDeportationArticle(ai, enforcementEvents)) {
    await syncIceCmsArticle(post, ai, "published", "", enforcementEvents, "驱逐快报");
    return { status: "published", routed_to: "驱逐快报" };
  }

  const dateParts = newYorkDateParts(post.created_at);
  const relativeUrl = `/news/ice/${dateParts.year}/${dateParts.month}/${dateParts.day}/ice-${post.id}.html`;
  const filePath = path.join(
    NEWS_DIR,
    dateParts.year,
    dateParts.month,
    dateParts.day,
    `ice-${post.id}.html`
  );

  const imageUrl = CONFIG.useXMedia ? firstUsableMedia(post.media) : "";
  // 极短内容或无图内容统一作为ICE快讯：纯文字展示，不生成图片占位框。
  const displayType = ai.content_type === "brief" || !imageUrl ? "brief" : "article";
  const itemTitle = displayType === "brief" ? normalizeIceBriefTitle(ai.title) : ai.title.trim();
  const itemSummary = displayType === "brief" ? normalizeIceBriefText(ai.summary, ai.body_paragraphs) : ai.summary.trim();
  const item = {
    id: `ice-${post.id}`,
    x_post_id: post.id,
    title: itemTitle,
    summary: itemSummary,
    content_type: displayType,
    category: ai.category,
    importance: ai.importance,
    relevance_score: ai.relevance_score,
    verified_level: ai.verified_level,
    published_at: post.created_at,
    updated_at: new Date().toISOString(),
    url: relativeUrl,
    source_name: sourceDisplayName(post),
    source_url: post.x_url,
    official_url: enrichment.url || "",
    source_text: post.text.trim().slice(0, 1200),
    dedupe_key: createDedupeKey(post.text, enrichment.url || extractPrimaryIceUrl(post)),
    image_url: imageUrl,
    confidence: ai.confidence,
    source_mode: post.source_mode,
    source_tier: post.source_tier,
    source_weight: post.source_weight,
    candidate_score: post.candidate_score,
    matched_terms: post.matched_terms || [],
    query_lane: post.query_lane || "",
    keywords: ai.keywords,
    enforcement_events: enforcementEvents,
    state_codes: [...new Set(enforcementEvents.map(event => event.state_code).filter(Boolean))],
    event_metadata_checked_at: new Date().toISOString()
  };

  // 只有具备图片和完整事实的article生成站内长文章页。
  // brief直接在ICE动态页以“短标题 + 一行正文”播报，并链接原始来源。
  if (displayType === "article") {
    const html = renderArticle(item, ai.body_paragraphs, dateParts);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, html, "utf8");
  } else {
    item.url = post.x_url;
  }

  const existingIndex = news.findIndex(entry => String(entry.x_post_id) === String(post.id));
  if (existingIndex >= 0) news[existingIndex] = item;
  else news.push(item);

  await syncIceCmsArticle(post, ai, "published", "", enforcementEvents, "ICE执法");
  return { status: "published", item };
}

function isDeportationArticle(ai, events = []) {
  if (String(ai?.category || "") === "遣返") return true;
  const types = events.map(event => event.event_type);
  return types.length > 0 && types.every(type => type === "removal");
}

async function syncIceCmsArticle(post, ai, status, reviewReason, events = [], forcedCategory = "") {
  const primaryEvent = events.find(event => event.event_type === "arrest" || event.event_type === "detention") || events[0] || {};
  const countable = status === "published" && forcedCategory !== "驱逐快报" &&
    ["arrest", "detention"].includes(primaryEvent.event_type) &&
    Number.isInteger(primaryEvent.people_count) && primaryEvent.people_count > 0 &&
    Boolean(primaryEvent.city || primaryEvent.location_text) && Boolean(primaryEvent.occurred_at);
  const categoryName = forcedCategory || (isDeportationArticle(ai, events) ? "驱逐快报" : "ICE执法");
  const articleResult = await upsertAutomatedArticle({
    externalId: `x-ice-${post.id}`,
    automationSource: "ice-radar-v4",
    title: String(ai?.title || "ICE动态").trim(),
    summary: String(ai?.summary || "").trim(),
    bodyParagraphs: Array.isArray(ai?.body_paragraphs) ? ai.body_paragraphs : [],
    categoryName,
    primarySection: categoryName,
    relatedSections: categoryName === "驱逐快报" ? ["ICE执法"] : [],
    coverImage: CONFIG.useXMedia ? firstUsableMedia(post.media) : "",
    sourceUrl: post.x_url,
    sourceName: sourceDisplayName(post),
    sourceAccount: post.author_username || post.author?.username || "",
    sourceLevel: post.source_tier || ai?.verified_level || "",
    confidence: ai?.confidence || 0,
    reviewReason,
    status,
    publishedAt: post.created_at,
    eventDate: primaryEvent.occurred_at || null,
    arrestCount: countable ? primaryEvent.people_count : null,
    city: primaryEvent.city || "",
    state: primaryEvent.state_code || primaryEvent.state_name || "",
    countInIceStats: countable,
    tags: [ai?.category, ...(ai?.keywords || [])].filter(Boolean),
    riskFlags: ai?.needs_review ? ["needs_review"] : [],
  });
  await upsertNewsCandidate({
    externalId: `x-ice-${post.id}`,
    pipeline: "ice-radar-v4",
    sourceUrl: post.x_url,
    sourceAccount: post.author_username || post.author?.username || "",
    sourceName: sourceDisplayName(post),
    sourceLevel: post.source_tier || ai?.verified_level || "",
    rawText: post.text || "",
    rawPayload: { id: post.id, created_at: post.created_at, query_lane: post.query_lane || "", media: post.media || [] },
    aiPayload: ai || {},
    proposedSection: categoryName,
    confidence: ai?.confidence || 0,
    decision: status === "published" ? "published" : "draft",
    decisionReason: reviewReason || "",
    articleId: articleResult.article?.id || null,
    collectedAt: post.created_at || new Date().toISOString(),
    processedAt: new Date().toISOString(),
  });
  return articleResult;
}

async function backfillRecentNewsEvents(news) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const candidates = news
    .filter(item => !item.event_metadata_checked_at)
    .filter(item => Number.isFinite(Date.parse(item.published_at)) && Date.parse(item.published_at) >= cutoff)
    .slice(0, 10);
  let updated = 0;

  for (const item of candidates) {
    const sourceText = [
      item.source_text ? `ICE原始文字：\n${item.source_text}` : "",
      `已发布标题：${item.title || ""}`,
      `已发布摘要：${item.summary || ""}`,
      item.official_url ? `ICE官网链接：${item.official_url}` : "",
      item.source_url ? `ICE官方X链接：${item.source_url}` : ""
    ].filter(Boolean).join("\n\n");

    try {
      const extracted = await extractEventsWithOpenAI(sourceText);
      const events = normalizeEnforcementEvents(extracted.enforcement_events, sourceText);
      item.enforcement_events = events;
      item.state_codes = [...new Set(events.map(event => event.state_code).filter(Boolean))];
      item.event_metadata_checked_at = new Date().toISOString();
      updated += 1;
    } catch (error) {
      console.warn(`Could not backfill ICE event metadata for ${item.id || item.x_post_id}: ${errorMessage(error)}`);
    }
  }

  return updated;
}

async function extractEventsWithOpenAI(sourceText) {
  const payload = {
    model: CONFIG.openAIModel,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: `${SYSTEM_PROMPT.trim()}\n\n这次只提取enforcement_events，不改写文章。`
        }]
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: `从以下材料提取可核实的ICE执法事件。无法明确人数、时间或地点时使用null或空字符串，不得推测。\n\n${sourceText}`
        }]
      }
    ],
    max_output_tokens: 900,
    text: {
      format: {
        type: "json_schema",
        name: "trrb_ice_event_metadata",
        description: "ICE执法事件人数、时间与地点",
        strict: true,
        schema: EVENT_EXTRACTION_SCHEMA
      }
    }
  };

  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.openAIKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, 60000);
  const json = await readResponseJson(response, "OpenAI event metadata API");
  const outputText = extractOpenAIOutputText(json);
  if (!outputText) throw new Error("OpenAI returned no event metadata.");
  return JSON.parse(outputText);
}

async function fetchIceGovEnrichment(post) {
  const candidates = extractExpandedUrls(post);
  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(candidate, {
        redirect: "follow",
        headers: {
          "User-Agent": "TRRB-ICE-NewsBot/1.1 (+https://trrb.net/topic/ice/)"
        }
      }, 20000);

      const finalUrl = response.url || candidate;
      if (!isIceGovUrl(finalUrl) || !response.ok) continue;

      const html = await response.text();
      const title = extractMeta(html, "og:title") || extractTitle(html);
      const description = extractMeta(html, "description") || extractMeta(html, "og:description");
      const articleHtml = firstMatch(html, [
        /<main\b[^>]*>([\s\S]*?)<\/main>/i,
        /<article\b[^>]*>([\s\S]*?)<\/article>/i,
        /<div\b[^>]*class=["'][^"']*(?:field--name-body|node__content|article-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
      ]);
      const body = htmlToText(articleHtml || html).slice(0, 14000);

      return {
        url: finalUrl,
        title: cleanText(title).slice(0, 300),
        description: cleanText(description).slice(0, 800),
        body
      };
    } catch (error) {
      console.warn(`Could not enrich ${candidate}: ${errorMessage(error)}`);
    }
  }
  return { url: "", title: "", description: "", body: "" };
}

async function rewriteWithOpenAI(sourceText, post) {
  const payload = {
    model: CONFIG.openAIModel,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT.trim() }]
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: `来源模式：${post.source_mode}\n来源层级：${post.source_tier}\n来源权重：${post.source_weight}\n候选评分：${post.candidate_score}\n\n请先判断是否确属ICE/HSI/ERO新闻，再根据以下唯一事实来源生成中文新闻稿。不得使用外部知识补充事实。\n\n${sourceText}`
        }]
      }
    ],
    max_output_tokens: 1600,
    text: {
      format: {
        type: "json_schema",
        name: "trrb_ice_article",
        description: "唐人日报ICE执法新闻结构化稿件",
        strict: true,
        schema: ARTICLE_SCHEMA
      }
    }
  };

  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.openAIKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, 60000);

  const json = await readResponseJson(response, "OpenAI API");
  const outputText = extractOpenAIOutputText(json);
  if (!outputText) throw new Error("OpenAI returned no output text.");

  try {
    return JSON.parse(outputText);
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${outputText.slice(0, 300)}`);
  }
}

export function validateArticle(ai, sourceText, post, enrichment) {
  if (!ai || typeof ai !== "object") return fail("AI稿件结构无效");
  if (!ai.publishable || ai.needs_review) return fail(ai.review_reason || "AI标记为需要人工审核");
  if (Number(ai.confidence) < CONFIG.minConfidence) return fail(`可信度低于${CONFIG.minConfidence}`);
  if (!Number.isInteger(ai.relevance_score) || ai.relevance_score < CONFIG.minRelevance) return fail(`ICE相关度低于${CONFIG.minRelevance}`);
  if (!Number.isInteger(ai.importance) || ai.importance < 1 || ai.importance > 10) return fail("新闻重要性评分无效");
  if (!["official", "trusted_media", "other_source", "unverified"].includes(ai.verified_level)) return fail("来源核实级别无效");
  if (post.source_tier === "official" && ai.verified_level === "unverified") return fail("官方来源被模型判定为未核实");

  const title = String(ai.title || "").trim();
  const summary = String(ai.summary || "").trim();
  const paragraphs = Array.isArray(ai.body_paragraphs) ? ai.body_paragraphs.map(String) : [];
  const output = `${title}\n${summary}\n${paragraphs.join("\n")}`;
  const bodyLength = countCjkAndWords(paragraphs.join(""));

  if (title.length < 8 || title.length > 60) return fail("标题长度不合格");
  if (!paragraphs.length) return fail("正文为空");
  if (ai.content_type === "brief" && (bodyLength < 55 || bodyLength > 260)) return fail("快讯正文长度异常");
  if (ai.content_type === "article" && (bodyLength < 150 || bodyLength > 650)) return fail("新闻正文长度异常");

  const subjective = SUBJECTIVE_TERMS.find(term => output.includes(term));
  if (subjective) return fail(`出现主观或煽动性词语：${subjective}`);

  const lowerSource = sourceText.toLowerCase();
  const legalChecks = [
    { zh: ["被定罪", "定罪"], en: ["convicted", "conviction", "found guilty", "pleaded guilty", "pled guilty"] },
    { zh: ["被判刑", "判处"], en: ["sentenced", "sentence of"] },
    { zh: ["被起诉"], en: ["indicted", "indictment", "charged"] },
    { zh: ["被遣返", "遣返回"], en: ["removed", "deported", "repatriated"] },
    { zh: ["被捕", "逮捕"], en: ["arrested", "arrest"] }
  ];
  for (const check of legalChecks) {
    if (check.zh.some(term => output.includes(term)) && !check.en.some(term => lowerSource.includes(term))) {
      return fail(`法律状态“${check.zh[0]}”在来源中没有对应依据`);
    }
  }

  if ((output.includes("罪犯") || output.includes("犯罪分子")) &&
      !["convicted", "found guilty", "pleaded guilty", "pled guilty"].some(term => lowerSource.includes(term))) {
    return fail("在没有定罪依据时使用了罪犯表述");
  }

  // Prevent invented Arabic-number facts. Every generated number must occur in source material.
  const sourceNumbers = new Set((sourceText.match(/\d[\d,.%-]*/g) || []).map(normalizeNumberToken));
  const outputNumbers = [...new Set((output.match(/\d[\d,.%-]*/g) || []).map(normalizeNumberToken))];
  const invented = outputNumbers.filter(number => number && !sourceNumbers.has(number));
  if (invented.length) return fail(`稿件出现来源中不存在的数字：${invented.join(", ")}`);

  if (post.possibly_sensitive) return fail("X将该帖子标记为敏感内容");
  if (!post.text.trim()) return fail("原帖没有可核实文字");

  return { ok: true, reason: "" };
}


const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
]);

function normalizeEnforcementEvents(events, sourceText) {
  if (!Array.isArray(events)) return [];
  const sourceNumbers = new Set((String(sourceText || "").match(/\d[\d,.%-]*/g) || []).map(normalizeNumberToken));
  const seen = new Set();
  const normalized = [];

  for (const raw of events.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const eventType = ["arrest", "detention", "removal", "other"].includes(raw.event_type)
      ? raw.event_type
      : "other";
    let peopleCount = Number.isInteger(raw.people_count) && raw.people_count > 0
      ? raw.people_count
      : null;
    if (peopleCount != null && !sourceNumbers.has(String(peopleCount))) peopleCount = null;

    const parsedTime = raw.occurred_at && Number.isFinite(Date.parse(raw.occurred_at))
      ? new Date(raw.occurred_at).toISOString()
      : null;
    const precision = ["second", "minute", "hour", "date", "unknown"].includes(raw.time_precision)
      ? raw.time_precision
      : (parsedTime ? "second" : "unknown");
    const stateCode = String(raw.state_code || "").trim().toUpperCase();
    const safeStateCode = US_STATE_CODES.has(stateCode) ? stateCode : "";
    const event = {
      event_type: eventType,
      people_count: peopleCount,
      occurred_at: parsedTime,
      time_precision: parsedTime ? precision : "unknown",
      city: cleanText(raw.city || "").slice(0, 100),
      state_code: safeStateCode,
      state_name: cleanText(raw.state_name || "").slice(0, 100),
      location_text: cleanText(raw.location_text || "").slice(0, 180),
      confidence: Math.max(0, Math.min(100, Number.parseInt(raw.confidence || "0", 10) || 0)),
      source_excerpt: cleanText(raw.source_excerpt || "").slice(0, 240)
    };
    const key = [event.event_type, event.people_count ?? "", event.occurred_at || "", event.state_code, event.city, event.location_text].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(event);
  }

  return normalized;
}

function emptyDashboard() {
  return {
    generated_at: "",
    timezone: "America/New_York",
    latest_sync_at: "",
    total_published: 0,
    today: {
      date: "",
      known_people: 0,
      event_count: 0,
      location_count: 0,
      unknown_people_events: 0,
      events: []
    },
    heatmap: {
      "24h": { states: [] },
      "7d": { states: [] },
      "30d": { states: [] }
    }
  };
}

function buildDashboardData(news, state, nowIso) {
  const dashboard = emptyDashboard();
  dashboard.generated_at = nowIso;
  dashboard.latest_sync_at = state.last_run_at || nowIso;
  dashboard.total_published = news.length;
  dashboard.today.date = newYorkDateKey(nowIso);

  const normalizedEvents = [];
  for (const item of news) {
    for (const event of Array.isArray(item.enforcement_events) ? item.enforcement_events : []) {
      if (!["arrest", "detention", "removal", "other"].includes(event.event_type)) continue;
      const basisTime = event.occurred_at || item.published_at;
      if (!basisTime || !Number.isFinite(Date.parse(basisTime))) continue;
      normalizedEvents.push({
        ...event,
        basis_time: new Date(basisTime).toISOString(),
        time_basis: event.occurred_at ? "执法时间" : "官方公开时间",
        article_title: item.title,
        article_url: item.url,
        published_at: item.published_at
      });
    }
  }

  const todayEvents = normalizedEvents
    .filter(event => ["arrest", "detention"].includes(event.event_type))
    .filter(event => newYorkDateKey(event.basis_time) === dashboard.today.date)
    .sort((a, b) => new Date(b.basis_time) - new Date(a.basis_time));

  dashboard.today.known_people = todayEvents.reduce((sum, event) => sum + (event.people_count || 0), 0);
  dashboard.today.event_count = todayEvents.length;
  dashboard.today.location_count = new Set(todayEvents.map(event => event.state_code || event.location_text).filter(Boolean)).size;
  dashboard.today.unknown_people_events = todayEvents.filter(event => event.people_count == null).length;
  dashboard.today.events = todayEvents.slice(0, 20);

  for (const [label, hours] of [["24h", 24], ["7d", 24 * 7], ["30d", 24 * 30]]) {
    const cutoff = Date.parse(nowIso) - hours * 60 * 60 * 1000;
    const map = new Map();
    for (const event of normalizedEvents) {
      if (!event.state_code || Date.parse(event.basis_time) < cutoff) continue;
      const entry = map.get(event.state_code) || {
        code: event.state_code,
        name: event.state_name || event.state_code,
        events: 0,
        people: 0,
        unknown_people_events: 0
      };
      entry.events += 1;
      if (event.people_count == null) entry.unknown_people_events += 1;
      else entry.people += event.people_count;
      map.set(event.state_code, entry);
    }
    dashboard.heatmap[label].states = [...map.values()].sort((a, b) => b.events - a.events || b.people - a.people);
  }

  return dashboard;
}

function newYorkDateKey(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeIceBriefTitle(value) {
  const clean = String(value || "ICE执法动态")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[。！？!?]+$/g, "")
    .replace(/美国移民与海关执法局/g, "ICE")
    .replace(/美国国土安全部/g, "DHS")
    .trim();
  const chars = Array.from(clean);
  if (chars.length <= 18) return clean;
  return chars.slice(0, 18).join("").replace(/[，、：:；;]+$/g, "");
}

function normalizeIceBriefText(summary, paragraphs) {
  const fallback = Array.isArray(paragraphs) ? paragraphs.join(" ") : "";
  const clean = String(summary || fallback || "ICE相关公开信息已更新。")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(clean);
  return chars.length > 72 ? `${chars.slice(0, 72).join("")}…` : clean;
}

function renderArticle(item, paragraphs, dateParts) {
  const articleDate = `${Number(dateParts.month)}月${Number(dateParts.day)}日`;
  const body = paragraphs.map((paragraph, index) => {
    const prefix = index === 0 ? `唐人日报${articleDate}讯：` : "";
    return `<p>${escapeHtml(prefix + paragraph.trim())}</p>`;
  }).join("\n");

  const image = item.image_url
    ? `<figure class="article-image"><img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.title)}" loading="lazy" referrerpolicy="no-referrer"><figcaption>图片来源：${escapeHtml(item.source_name)}公开X内容</figcaption></figure>`
    : "";

  const officialLink = item.official_url
    ? `<a href="${escapeAttr(item.official_url)}" target="_blank" rel="noopener noreferrer">ICE官方网站原始通报</a>`
    : "";
  const sourceLinks = [
    `<a href="${escapeAttr(item.source_url)}" target="_blank" rel="noopener noreferrer">查看X原帖</a>`,
    officialLink
  ].filter(Boolean).join("<span>·</span>");

  const canonical = `${CONFIG.siteUrl}${item.url}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title,
    description: item.summary,
    datePublished: item.published_at,
    dateModified: item.updated_at,
    mainEntityOfPage: canonical,
    publisher: { "@type": "Organization", name: "唐人日报", url: CONFIG.siteUrl },
    author: { "@type": "Organization", name: "唐人日报编辑部" },
    image: item.image_url ? [item.image_url] : undefined
  };

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(item.title)} - 唐人日报</title>
  <meta name="description" content="${escapeAttr(item.summary)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <link rel="stylesheet" href="/assets/ice-topic.css">
  <script type="application/ld+json">${safeJsonForHtml(jsonLd)}</script>
</head>
<body>
  <header class="trrb-header">
    <div class="trrb-header-inner">
      <a class="trrb-brand" href="/">唐人日报</a>
      <a class="trrb-channel" href="/topic/ice/">ICE执法追踪</a>
    </div>
  </header>

  <main class="article-shell">
    <nav class="breadcrumb"><a href="/">首页</a><span>›</span><a href="/topic/ice/">ICE执法</a></nav>
    <article class="news-article">
      <div class="article-kicker">${escapeHtml(item.category || "ICE执法追踪")}</div>
      <h1>${escapeHtml(item.title)}</h1>
      <div class="article-meta">
        <time datetime="${escapeAttr(item.published_at)}">${escapeHtml(formatChineseDateTime(item.published_at))}</time>
        <span>来源：${escapeHtml(item.source_name)}</span>
      </div>
      <p class="article-summary">${escapeHtml(item.summary)}</p>
      ${image}
      <div class="article-body">${body}</div>
      <aside class="source-box">
        <strong>原始信息</strong>
        <div class="source-links">${sourceLinks}</div>
        <p>本文根据公开来源整理。案件中的逮捕、拘留、指控或起诉不等同于法院定罪。</p>
      </aside>
    </article>
    <div class="back-topic"><a href="/topic/ice/">返回ICE执法全部新闻</a></div>
  </main>
</body>
</html>`;
}

async function updateSitemap(news, nowIso) {
  const topicUrl = `${CONFIG.siteUrl}/topic/ice/`;
  const newest = news.slice(0, Math.max(50, CONFIG.maxNewPosts));
  const additions = [
    { loc: topicUrl, lastmod: nowIso.slice(0, 10) },
    ...newest.map(item => ({ loc: `${CONFIG.siteUrl}${item.url}`, lastmod: item.updated_at.slice(0, 10) }))
  ];

  let xml;
  try {
    xml = await fs.readFile(SITEMAP_FILE, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n';
  }

  for (const entry of additions) {
    const escapedLoc = escapeXml(entry.loc);
    const locPattern = new RegExp(`<url>\\s*<loc>${escapeRegExp(escapedLoc)}<\\/loc>[\\s\\S]*?<\\/url>`, "i");
    const block = `  <url>\n    <loc>${escapedLoc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </url>`;
    if (locPattern.test(xml)) xml = xml.replace(locPattern, block);
    else xml = xml.replace(/<\/urlset>/i, `${block}\n</urlset>`);
  }

  await fs.writeFile(SITEMAP_FILE, xml, "utf8");
}

function buildSourceText(post, enrichment) {
  const parts = [
    `X账号：@${post.author_username || "unknown"}`,
    `账号名称：${post.author_name || post.author_username || "公开来源"}`,
    `来源模式：${post.source_mode || "radar"}`,
    `来源层级：${post.source_tier || "other_source"}`,
    `来源权重：${post.source_weight || 0}`,
    `搜索通道：${post.query_label || post.query_lane || "X雷达"}`,
    `候选评分：${post.candidate_score || 0}`,
    `匹配要素：${(post.matched_terms || []).join("、") || "未标注"}`,
    `X帖子ID：${post.id}`,
    `X发布时间（UTC）：${post.created_at}`,
    `X原帖链接：${post.x_url}`,
    `X原文：\n${post.text.trim()}`
  ];
  if (enrichment.url) {
    parts.push(
      `ICE官网链接：${enrichment.url}`,
      `ICE官网标题：${enrichment.title}`,
      `ICE官网摘要：${enrichment.description}`,
      `ICE官网正文摘取：\n${enrichment.body}`
    );
  } else {
    parts.push("未发现或未能读取ICE.gov完整通报。只能依据该X帖子本身写快讯，不得扩写未知事实；非预设可信来源应进入候选池复核。");
  }
  return parts.join("\n\n");
}
function extractExpandedUrls(post) {
  const urls = [];
  for (const item of post.entities?.urls || []) {
    const candidate = item.unwound_url || item.expanded_url || item.url;
    if (candidate) urls.push(candidate);
  }
  const matches = post.text.match(/https?:\/\/[^\s]+/g) || [];
  urls.push(...matches);
  return [...new Set(urls)].filter(url => /^https?:\/\//i.test(url));
}

function isIceGovUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "ice.gov" || hostname.endsWith(".ice.gov");
  } catch {
    return false;
  }
}

function extractOpenAIOutputText(json) {
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text.trim();
  for (const item of json.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text.trim();
    }
  }
  return "";
}

function makePendingEntry(post, reason, manualReview, attempts, ai = null) {
  return {
    id: `pending-${post.id}`,
    x_post_id: String(post.id),
    reason: String(reason || "未知原因").slice(0, 500),
    manual_review: Boolean(manualReview),
    attempts,
    created_at: new Date().toISOString(),
    source_mode: post?.source_mode || "",
    source_tier: post?.source_tier || "",
    source_weight: post?.source_weight || 0,
    candidate_score: post?.candidate_score || 0,
    query_lane: post?.query_lane || "",
    ai,
    post
  };
}

function dedupePending(items, publishedIds) {
  const map = new Map();
  for (const item of items) {
    const id = String(item.x_post_id || "");
    if (!id || publishedIds.has(id)) continue;
    const previous = map.get(id);
    if (!previous || (item.attempts || 0) >= (previous.attempts || 0)) map.set(id, item);
  }
  return [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}


const DEDUPE_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "after", "before",
  "their", "they", "them", "his", "her", "its", "our", "your", "you", "are", "was",
  "were", "has", "have", "had", "will", "would", "could", "should", "about", "against",
  "through", "during", "today", "yesterday", "tomorrow", "new", "more", "most",
  "ice", "icegov", "hsi", "ero", "dhs", "uscis", "official", "officers", "agents",
  "u", "s", "us", "news", "update", "read", "learn", "details", "information"
]);

const GENERIC_NAME_PHRASES = new Set([
  "United States", "Homeland Security", "Immigration Customs Enforcement",
  "U S Immigration", "ICE HSI", "ICE ERO", "Department Homeland Security"
].map(value => value.toLowerCase()));

function isWithinHours(value, hours) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= -5 * 60 * 1000 && age <= hours * 60 * 60 * 1000;
}

function extractPrimaryIceUrl(post) {
  for (const candidate of extractExpandedUrls(post)) {
    try {
      const parsed = new URL(candidate);
      if (parsed.hostname === "ice.gov" || parsed.hostname.endsWith(".ice.gov")) {
        parsed.hash = "";
        parsed.search = "";
        return parsed.toString().replace(/\/+$/, "");
      }
    } catch {}
  }
  return "";
}

function createDedupeKey(text, officialUrl = "") {
  const normalizedUrl = normalizeComparableUrl(officialUrl);
  if (normalizedUrl) return `url:${normalizedUrl}`;
  return `text:${crypto.createHash("sha256").update(normalizeDedupeText(text)).digest("hex").slice(0, 24)}`;
}

function normalizeComparableUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|campaign$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return "";
  }
}

function normalizeDedupeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][\p{L}\p{N}_-]+/gu, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[^\p{L}\p{N}%$'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  const normalized = normalizeDedupeText(value);
  const rawTokens = normalized.match(/[\p{Script=Han}]|[\p{L}\p{N}%$'-]{2,}/gu) || [];
  return new Set(rawTokens.filter(token => !DEDUPE_STOPWORDS.has(token)));
}

function extractNumberSet(value) {
  return new Set((String(value || "").match(/\b\d[\d,.%-]*\b/g) || []).map(normalizeNumberToken));
}

function extractNameSet(value) {
  const matches = String(value || "").match(/\b(?:[A-Z][A-Za-z'’-]{1,})(?:\s+(?:[A-Z][A-Za-z'’-]{1,})){1,3}\b/g) || [];
  return new Set(matches
    .map(name => name.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(name => !GENERIC_NAME_PHRASES.has(name)));
}

function intersectionSize(a, b) {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  const intersection = intersectionSize(a, b);
  return intersection / (a.size + b.size - intersection);
}

function ngramSet(value, size = 3) {
  const normalized = normalizeDedupeText(value).replace(/\s+/g, "");
  const set = new Set();
  if (normalized.length < size) {
    if (normalized) set.add(normalized);
    return set;
  }
  for (let i = 0; i <= normalized.length - size; i += 1) {
    set.add(normalized.slice(i, i + size));
  }
  return set;
}

function diceSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  return (2 * intersectionSize(a, b)) / (a.size + b.size);
}

function referenceFromPost(post) {
  return {
    id: `x:${post.id}`,
    text: post.text || "",
    officialUrl: extractPrimaryIceUrl(post),
    createdAt: post.created_at || ""
  };
}

function referenceFromNews(item) {
  return {
    id: `news:${item.x_post_id || item.id || "unknown"}`,
    text: [
      item.source_text || "",
      item.title || "",
      item.summary || "",
      Array.isArray(item.keywords) ? item.keywords.join(" ") : ""
    ].join(" "),
    officialUrl: item.official_url || "",
    createdAt: item.published_at || item.updated_at || ""
  };
}

function referenceFromPending(item) {
  return item?.post ? {
    id: `pending:${item.x_post_id || item.post.id || "unknown"}`,
    text: item.post.text || "",
    officialUrl: extractPrimaryIceUrl(item.post),
    createdAt: item.post.created_at || item.created_at || ""
  } : null;
}

function buildDedupeReferences(news, pending) {
  const references = [];
  for (const item of news) {
    if (isWithinHours(item.published_at, CONFIG.lookbackHours)) references.push(referenceFromNews(item));
  }
  for (const item of pending) {
    const reference = referenceFromPending(item);
    if (reference && isWithinHours(reference.createdAt, CONFIG.lookbackHours)) references.push(reference);
  }
  return references;
}

function isLikelyDuplicateReference(a, b) {
  const aUrl = normalizeComparableUrl(a.officialUrl);
  const bUrl = normalizeComparableUrl(b.officialUrl);
  if (aUrl && bUrl && aUrl === bUrl) return true;

  const aText = normalizeDedupeText(a.text);
  const bText = normalizeDedupeText(b.text);
  if (!aText || !bText) return false;
  if (aText === bText) return true;

  const tokenScore = jaccardSimilarity(tokenSet(aText), tokenSet(bText));
  const ngramScore = diceSimilarity(ngramSet(aText), ngramSet(bText));
  if (tokenScore >= CONFIG.dedupeThreshold || ngramScore >= 0.84) return true;

  const aNames = extractNameSet(a.text);
  const bNames = extractNameSet(b.text);
  const sharedNames = intersectionSize(aNames, bNames);

  const aNumbers = extractNumberSet(a.text);
  const bNumbers = extractNumberSet(b.text);
  const sharedNumbers = intersectionSize(aNumbers, bNumbers);

  if (sharedNames >= 1 && sharedNumbers >= 1 && tokenScore >= 0.36) return true;
  if (sharedNames >= 2 && tokenScore >= 0.40) return true;
  if (sharedNumbers >= 2 && tokenScore >= 0.50) return true;

  return false;
}

function findLikelyDuplicate(post, references) {
  const candidate = referenceFromPost(post);
  return references.find(reference => isLikelyDuplicateReference(candidate, reference)) || null;
}

function dedupePendingByContent(items, news) {
  const references = news
    .filter(item => isWithinHours(item.published_at, CONFIG.lookbackHours))
    .map(referenceFromNews);
  const kept = [];
  let skipped = 0;

  // Keep the newest pending entry when two pending posts describe the same event.
  const sorted = [...items].sort((a, b) =>
    new Date(b.post?.created_at || b.created_at || 0) - new Date(a.post?.created_at || a.created_at || 0)
  );

  for (const item of sorted) {
    const reference = referenceFromPending(item);
    if (!reference) continue;
    const duplicate = references.find(existing => isLikelyDuplicateReference(reference, existing));
    if (duplicate) {
      skipped += 1;
      console.log(`Removed duplicate pending item ${item.x_post_id}; similar to ${duplicate.id}.`);
      continue;
    }
    kept.push(item);
    references.push(reference);
  }

  return { items: kept, skipped };
}

function dedupePosts(posts) {
  const map = new Map();
  for (const post of posts) map.set(String(post.id), post);
  return [...map.values()];
}

function firstUsableMedia(media = []) {
  const item = media.find(entry => entry.url && ["photo", "video", "animated_gif"].includes(entry.type));
  return item?.url || "";
}

function newYorkDateParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: map.year, month: map.month, day: map.day };
}

function formatChineseDateTime(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${Number(map.year)}/${Number(map.month)}/${Number(map.day)} ${map.hour}:${map.minute}:${map.second}`;
}

function toXApiDateTime(value) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchXJsonWithRetry(url, options = {}, label = "X API") {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, 30000);
      if (response.ok) return await readResponseJson(response, label);

      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader && /^\d+$/.test(retryAfterHeader)
        ? Math.min(Number(retryAfterHeader) * 1000, 60000)
        : 0;
      const retryable = [429, 500, 502, 503, 504].includes(response.status);

      if (!retryable || attempt === maxAttempts) {
        return await readResponseJson(response, label);
      }

      const body = await response.text().catch(() => "");
      const baseDelay = attempt === 1 ? 5000 : 15000;
      const waitMs = Math.max(baseDelay, retryAfterMs) + Math.floor(Math.random() * 1500);
      console.warn(`${label} returned ${response.status}${body ? `: ${body.slice(0, 120)}` : ""}; retrying in ${Math.ceil(waitMs / 1000)}s (${attempt}/${maxAttempts}).`);
      await sleep(waitMs);
    } catch (error) {
      lastError = error;
      const message = errorMessage(error);
      const retryable = /timeout|aborted|fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(message);
      if (!retryable || attempt === maxAttempts) throw error;
      const waitMs = (attempt === 1 ? 5000 : 15000) + Math.floor(Math.random() * 1500);
      console.warn(`${label} network error: ${message}; retrying in ${Math.ceil(waitMs / 1000)}s (${attempt}/${maxAttempts}).`);
      await sleep(waitMs);
    }
  }

  throw lastError || new Error(`${label} failed after retries.`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function readResponseJson(response, label) {
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${label} returned non-JSON response (${response.status}): ${text.slice(0, 300)}`); }
  if (!response.ok) {
    const detail = json?.detail || json?.error?.message || json?.title || text.slice(0, 300);
    throw new Error(`${label} request failed (${response.status}): ${detail}`);
  }
  return json;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    throw new Error(`Cannot read JSON ${file}: ${errorMessage(error)}`);
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temp, file);
}

async function ensureJsonFile(file, fallback) {
  try { await fs.access(file); }
  catch { await writeJson(file, fallback); }
}

function htmlToText(html) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMeta(html, key) {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i")
  ];
  return firstMatch(html, patterns);
}

function extractTitle(html) {
  return firstMatch(html, [/<title\b[^>]*>([\s\S]*?)<\/title>/i]);
}

function firstMatch(value, patterns) {
  for (const pattern of patterns) {
    const match = String(value || "").match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“"
  };
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (full, name) => named[name.toLowerCase()] ?? full);
}

function cleanText(value) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

function normalizeNumberToken(value) {
  return String(value || "").replace(/,/g, "").trim();
}

function countCjkAndWords(value) {
  const text = String(value || "").trim();
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + words;
}

function fail(reason) { return { ok: false, reason }; }

function maxSnowflake(values) {
  const valid = values.filter(value => /^\d+$/.test(String(value || "")));
  if (!valid.length) return "";
  return valid.reduce((max, value) => compareSnowflakes(String(value), String(max)) > 0 ? String(value) : String(max), valid[0]);
}

function compareSnowflakes(a, b) {
  try {
    const aa = BigInt(String(a || "0"));
    const bb = BigInt(String(b || "0"));
    return aa === bb ? 0 : aa > bb ? 1 : -1;
  } catch {
    return String(a).localeCompare(String(b));
  }
}

function firstEnv(...names) {
  for (const name of names) {
    if (process.env[name]?.trim()) return process.env[name].trim();
  }
  return "";
}

function mergeAccounts(...groups) {
  return [...new Set(groups.flat().map(v => String(v || "").replace(/^@/, "").trim()).filter(Boolean))];
}

function parseAccounts(value) {
  return [...new Set(String(value || "")
    .split(/[\s,]+/)
    .map(item => item.trim().replace(/^@/, ""))
    .filter(Boolean))];
}

function intEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function floatEnv(name, fallback, min, max) {
  const value = Number.parseFloat(process.env[name] || "");
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeSiteUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function loadLocalEnv(file) {
  try {
    const raw = requireReadFileSync(file);
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

function requireReadFileSync(file) {
  // Avoid an extra dependency and keep .env loading optional.
  return fsSync.readFileSync(file, "utf8");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function escapeAttr(value) { return escapeHtml(value); }
function escapeXml(value) { return escapeHtml(value); }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function safeJsonForHtml(value) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch(async (error) => {
    const message = errorMessage(error);
    console.error(message);
    try {
      const state = await readJson(STATE_FILE, {
        last_seen_id: "",
        query_cursors: {},
        last_run_at: "",
        last_success_at: "",
        last_content_at: "",
        last_result: {}
      });
      await writeJson(STATE_FILE, { ...state, last_error: message });
    } catch (stateError) {
      console.error(`Could not write ICE failure state: ${errorMessage(stateError)}`);
    }
    process.exitCode = 1;
  });
}
